import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { EPI_CONFIG, EpiConfig } from '../config';
import { DATA_SOURCE } from '../db/data-source';
import { rows } from '../db/rows';
import { retentionCutoff } from './retention';

export const RETENTION_KEY = 'retention.lastRun';

/**
 * What retention removes. Assessments, review cycles, people, memberships, roles and grades are
 * kept: deleting them is an HR decision (ADR-032). Expired sessions and sign-in requests go
 * regardless of age.
 */
const CATEGORIES = [
  {
    key: 'mergeRequests',
    label: 'Merge requests (with their review events) last active before the cutoff',
    tables: [['merge_requests', 'coalesce(merged_at, created_at) < $1', 'cutoff']],
  },
  {
    key: 'workItems',
    label: 'Jira work items (with their status history) last updated before the cutoff',
    tables: [['work_items', 'updated_at < $1', 'cutoff']],
    before: `UPDATE merge_requests SET linked_work_item_id = NULL
              WHERE linked_work_item_id IN (SELECT id FROM work_items WHERE updated_at < $1)`,
  },
  {
    key: 'syncRuns',
    label: 'Sync run history',
    tables: [['sync_runs', 'started_at < $1', 'cutoff']],
  },
  {
    key: 'kpiSnapshots',
    label: 'Stored KPI snapshots',
    tables: [['kpi_snapshots', 'period_end < $1', 'cutoff']],
  },
  {
    key: 'sourceAccounts',
    label: 'Jira/GitLab accounts not seen since the cutoff (mappings are kept)',
    tables: [['source_accounts', 'last_seen_at < $1', 'cutoff']],
  },
  {
    key: 'auditEvents',
    label: 'Audit log entries',
    tables: [['audit_events', 'at < $1', 'cutoff']],
  },
  {
    key: 'expiredSessions',
    label: 'Expired sessions and sign-in requests (any age)',
    tables: [
      ['sessions', 'expires_at < $1', 'now'],
      ['oidc_login_requests', 'expires_at < $1', 'now'],
    ],
  },
] as const;

export type RetentionCounts = Record<(typeof CATEGORIES)[number]['key'], number>;

/**
 * Deletes data older than the retention window (EPI_RETENTION_MONTHS, default 24) once a day,
 * in one transaction, and records the counts in the audit log. Also runnable from the CLI.
 */
@Injectable()
export class RetentionService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger('Retention');
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(DATA_SOURCE) private readonly ds: DataSource,
    @Inject(EPI_CONFIG) private readonly config: EpiConfig,
    private readonly audit: AuditService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.syncScheduler || this.config.retentionMonths === null) return;
    this.timer = setInterval(() => void this.tick(), 60 * 60_000);
    this.timer.unref();
    setTimeout(() => void this.tick(), 5 * 60_000).unref(); // first run soon after start
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private cutoff(now: Date): Date | null {
    return this.config.retentionMonths === null
      ? null
      : retentionCutoff(now, this.config.retentionMonths);
  }

  private async counts(
    m: DataSource | EntityManager,
    cutoff: Date,
    now: Date,
    mode: 'count' | 'delete',
  ): Promise<RetentionCounts> {
    const out = {} as RetentionCounts;
    for (const c of CATEGORIES) {
      if (mode === 'delete' && 'before' in c) await m.query(c.before, [cutoff]);
      let n = 0;
      for (const [table, where, at] of c.tables) {
        // Table names and conditions are constants above; only the dates are parameters.
        const sql =
          mode === 'count'
            ? `SELECT count(*)::int AS n FROM ${table} WHERE ${where}`
            : `WITH d AS (DELETE FROM ${table} WHERE ${where} RETURNING 1) SELECT count(*)::int AS n FROM d`;
        const [row] = await rows<{ n: number }>(m, sql, [at === 'now' ? now : cutoff]);
        n += row.n;
      }
      out[c.key] = n;
    }
    return out;
  }

  /** Settings, what would be deleted now, and the last run (admin view, CLI --dry-run). */
  async describe(now = new Date()) {
    const cutoff = this.cutoff(now);
    const [last] = await rows<{ value: { at: string; counts: RetentionCounts } }>(
      this.ds,
      `SELECT value FROM app_settings WHERE key = $1`,
      [RETENTION_KEY],
    );
    return {
      months: this.config.retentionMonths,
      automatic: this.config.syncScheduler && cutoff !== null,
      cutoff: cutoff?.toISOString() ?? null,
      due: cutoff ? await this.counts(this.ds, cutoff, now, 'count') : null,
      categories: CATEGORIES.map((c) => ({ key: c.key, label: c.label })),
      lastRun: last?.value ?? null,
    };
  }

  /** Deletes everything older than the cutoff in one transaction; audited with the counts. */
  async run(actorUserId: string | null, now = new Date()) {
    const cutoff = this.cutoff(now);
    if (!cutoff) throw new Error('Retention is switched off (EPI_RETENTION_MONTHS=off)');
    return this.ds.transaction(async (m) => {
      const counts = await this.counts(m, cutoff, now, 'delete');
      const value = { at: now.toISOString(), cutoff: cutoff.toISOString(), counts };
      await m.query(
        `INSERT INTO app_settings(key, value, updated_at, updated_by) VALUES ($1, $2, now(), $3)
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now(), updated_by = $3`,
        [RETENTION_KEY, JSON.stringify(value), actorUserId],
      );
      await this.audit.record(
        actorUserId,
        'retention.run',
        'retention',
        null,
        { cutoff: cutoff.toISOString(), months: this.config.retentionMonths, ...counts },
        m,
      );
      return value;
    });
  }

  /** Daily run, claimed by UTC date so several EPI processes run it once. */
  async tick(now = new Date()) {
    try {
      const day = now.toISOString().slice(0, 10);
      const claimed = await rows(
        this.ds,
        `INSERT INTO app_settings(key, value) VALUES ($1, jsonb_build_object('day', $2::text))
         ON CONFLICT (key) DO UPDATE SET value = app_settings.value || jsonb_build_object('day', $2::text)
           WHERE coalesce(app_settings.value->>'day', '') < $2
         RETURNING key`,
        [`${RETENTION_KEY}.claim`, day],
      );
      if (claimed.length === 0) return null;
      const r = await this.run(null, now);
      const total = Object.values(r.counts).reduce((a, b) => a + b, 0);
      this.log.log(`Retention: ${total} row(s) older than ${r.cutoff} deleted`);
      return r;
    } catch (e) {
      this.log.error(`Retention failed: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }
}
