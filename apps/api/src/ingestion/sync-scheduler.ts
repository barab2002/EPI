import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { EPI_CONFIG, EpiConfig } from '../config';
import { DATA_SOURCE } from '../db/data-source';
import { rows } from '../db/rows';
import { GitLabSync } from './gitlab/gitlab.sync';
import { JiraSync } from './jira/jira.sync';
import { DEFAULT_SCHEDULE, dueDate, nextRun, SyncSchedule } from './schedule';
import { SyncAlreadyRunningError } from './sync-runs';

export const SCHEDULE_KEY = 'sync.schedule';

export interface StoredSchedule extends SyncSchedule {
  /** Local date (in the schedule's zone) of the last claimed daily run. */
  lastRunDate: string | null;
  lastRunStartedAt: string | null;
}

export interface ScheduledRunOutcome {
  connection: string;
  status: 'succeeded' | 'failed' | 'skipped';
  error?: string;
}

/**
 * Runs every enabled Jira/GitLab connection once a day at the configured local hour.
 *
 * Several EPI processes may share one database: the daily run is claimed with a conditional
 * UPDATE keyed by local date, so only one process runs it. Connections run one after another
 * (read-only sources, gentle on rate limits); a connection already syncing is skipped, and a
 * failure never stops the others or advances that connection's cursor.
 */
@Injectable()
export class SyncScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger('SyncScheduler');
  private timer: NodeJS.Timeout | null = null;
  private busy = false;

  constructor(
    @Inject(DATA_SOURCE) private readonly ds: DataSource,
    @Inject(EPI_CONFIG) private readonly config: EpiConfig,
    private readonly audit: AuditService,
    private readonly jira: JiraSync,
    private readonly gitlab: GitLabSync,
  ) {}

  get active(): boolean {
    return this.config.syncScheduler;
  }

  onApplicationBootstrap(): void {
    if (!this.config.syncScheduler) return;
    this.timer = setInterval(() => void this.tick(), 60_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async read(): Promise<StoredSchedule> {
    const [row] = await this.ds.query(`SELECT value FROM app_settings WHERE key = $1`, [
      SCHEDULE_KEY,
    ]);
    const v = (row?.value ?? {}) as Partial<StoredSchedule>;
    return {
      enabled: v.enabled ?? DEFAULT_SCHEDULE.enabled,
      hourLocal: v.hourLocal ?? DEFAULT_SCHEDULE.hourLocal,
      timezone: v.timezone ?? DEFAULT_SCHEDULE.timezone,
      lastRunDate: v.lastRunDate ?? null,
      lastRunStartedAt: v.lastRunStartedAt ?? null,
    };
  }

  async describe(now = new Date()) {
    const s = await this.read();
    return {
      ...s,
      schedulerActive: this.active,
      nextRunAt: this.active ? (nextRun(now, s, s.lastRunDate)?.toISOString() ?? null) : null,
    };
  }

  /** Saves the schedule; keeps the last-run claim so a change never causes a second run today. */
  async update(schedule: SyncSchedule, actorUserId: string): Promise<void> {
    await this.ds.query(
      `INSERT INTO app_settings(key, value, updated_at, updated_by) VALUES ($1, $2, now(), $3)
       ON CONFLICT (key) DO UPDATE
         SET value = app_settings.value || EXCLUDED.value, updated_at = now(), updated_by = $3`,
      [SCHEDULE_KEY, JSON.stringify(schedule), actorUserId],
    );
  }

  /** One scheduler step; returns null when nothing was due (or another tick/process has it). */
  async tick(now = new Date()): Promise<ScheduledRunOutcome[] | null> {
    if (this.busy) return null;
    this.busy = true;
    try {
      const s = await this.read();
      const date = dueDate(now, s, s.lastRunDate);
      if (!date) return null;
      const claimed = await rows(
        this.ds,
        `UPDATE app_settings
           SET value = value || jsonb_build_object('lastRunDate', $2::text, 'lastRunStartedAt', $3::text)
         WHERE key = $1 AND coalesce(value->>'lastRunDate', '') < $2
         RETURNING key`,
        [SCHEDULE_KEY, date, now.toISOString()],
      );
      if (claimed.length === 0) return null;
      return await this.runAll(date);
    } catch (e) {
      this.log.error(`Scheduled sync failed: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    } finally {
      this.busy = false;
    }
  }

  private async runAll(date: string): Promise<ScheduledRunOutcome[]> {
    const conns: { name: string; kind: 'jira' | 'gitlab' }[] = await this.ds.query(
      `SELECT name, kind FROM integration_connections
       WHERE enabled AND kind IN ('jira','gitlab') ORDER BY kind, name`,
    );
    const outcomes: ScheduledRunOutcome[] = [];
    for (const c of conns) {
      const collector = c.kind === 'jira' ? this.jira : this.gitlab;
      try {
        const r = await collector.run(c.name);
        outcomes.push({ connection: c.name, status: r.status, error: r.error });
      } catch (e) {
        outcomes.push({
          connection: c.name,
          status: e instanceof SyncAlreadyRunningError ? 'skipped' : 'failed',
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    await this.audit.record(null, 'sync.scheduled', 'app_setting', SCHEDULE_KEY, {
      date,
      connections: outcomes.length,
      succeeded: outcomes.filter((o) => o.status === 'succeeded').length,
      failed: outcomes.filter((o) => o.status === 'failed').length,
      skipped: outcomes.filter((o) => o.status === 'skipped').length,
    });
    const failed = outcomes.filter((o) => o.status !== 'succeeded');
    if (failed.length) {
      this.log.warn(
        `Scheduled sync ${date}: ${failed.map((o) => `${o.connection} ${o.status}`).join(', ')}`,
      );
    } else {
      this.log.log(`Scheduled sync ${date}: ${outcomes.length} connection(s) succeeded`);
    }
    return outcomes;
  }
}
