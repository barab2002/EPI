import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { DATA_SOURCE } from '../db/data-source';
import { rows } from '../db/rows';

export type Source = 'jira' | 'gitlab';
export type AccountStatus = 'unmapped' | 'mapped' | 'all';

const STALE_HOURS = 26;
const pct = (num: number, den: number) => (den === 0 ? null : Math.round((num / den) * 1000) / 10);

/**
 * Identity mapping (EPI-008): links source accounts (Jira user keys, GitLab user IDs) to EPI
 * users and re-attributes already synced data. Mapping decisions are audited.
 */
@Injectable()
export class IdentityService {
  constructor(
    @Inject(DATA_SOURCE) private readonly ds: DataSource,
    private readonly audit: AuditService,
  ) {}

  accounts(source: Source | undefined, status: AccountStatus, includeBots: boolean) {
    return this.ds.query(
      `SELECT a.source, a.external_id, a.display_name, a.is_bot, a.last_seen_at,
              u.id AS user_id, u.display_name AS user_name,
              CASE a.source
                WHEN 'jira' THEN (SELECT count(*)::int FROM work_items w WHERE w.assignee_external_id = a.external_id)
                ELSE (SELECT count(*)::int FROM merge_requests m WHERE m.author_external_id = a.external_id)
                   + (SELECT count(*)::int FROM review_events r WHERE r.actor_external_id = a.external_id)
              END AS activity
       FROM source_accounts a
       LEFT JOIN external_identities ei ON ei.source = a.source AND ei.external_id = a.external_id
       LEFT JOIN users u ON u.id = ei.user_id
       WHERE ($1::text IS NULL OR a.source = $1)
         AND ($2 = 'all' OR ($2 = 'mapped') = (ei.id IS NOT NULL))
         AND ($3 OR NOT a.is_bot)
       ORDER BY (ei.id IS NOT NULL), activity DESC, a.display_name
       LIMIT 500`,
      [source ?? null, status, includeBots],
    );
  }

  users(q: string | undefined) {
    return this.ds.query(
      `SELECT u.id, u.display_name, u.email,
              (SELECT json_agg(json_build_object('source', ei.source, 'external_id', ei.external_id))
                 FROM external_identities ei WHERE ei.user_id = u.id) AS identities
       FROM users u
       WHERE u.active AND ($1::text IS NULL OR u.display_name ILIKE '%' || $1 || '%' OR u.email ILIKE '%' || $1 || '%')
       ORDER BY u.display_name LIMIT 20`,
      [q?.trim() || null],
    );
  }

  private async reattribute(
    m: { query: DataSource['query'] },
    source: Source,
    externalId: string,
    userId: string | null,
  ): Promise<number> {
    let changed = 0;
    if (source === 'jira') {
      const r = await m.query(
        `UPDATE work_items SET assignee_user_id = $2
         WHERE assignee_external_id = $1 AND assignee_user_id IS DISTINCT FROM $2
           AND connection_id IN (SELECT id FROM integration_connections WHERE kind = 'jira')`,
        [externalId, userId],
      );
      changed += r[1] ?? 0;
    } else {
      const a = await m.query(
        `UPDATE merge_requests SET author_user_id = $2
         WHERE author_external_id = $1 AND author_user_id IS DISTINCT FROM $2`,
        [externalId, userId],
      );
      const b = await m.query(
        `UPDATE review_events SET actor_user_id = $2
         WHERE actor_external_id = $1 AND actor_user_id IS DISTINCT FROM $2`,
        [externalId, userId],
      );
      changed += (a[1] ?? 0) + (b[1] ?? 0);
    }
    return changed;
  }

  async map(actorId: string, source: Source, externalId: string, userId: string) {
    return this.ds.transaction(async (m) => {
      const [account] = await m.query(
        `SELECT is_bot FROM source_accounts WHERE source = $1 AND external_id = $2`,
        [source, externalId],
      );
      if (!account) throw new NotFoundException('Unknown source account');
      if (account.is_bot) throw new ConflictException('Bot accounts cannot be mapped to people');
      const [user] = await m.query(`SELECT id FROM users WHERE id = $1 AND active`, [userId]);
      if (!user) throw new NotFoundException('Unknown or inactive user');
      const [other] = await m.query(
        `SELECT external_id FROM external_identities WHERE user_id = $1 AND source = $2 AND external_id <> $3`,
        [userId, source, externalId],
      );
      if (other) {
        throw new ConflictException(
          `This person is already mapped to another ${source} account (${other.external_id}); unmap it first`,
        );
      }
      const [previous] = await m.query(
        `SELECT user_id FROM external_identities WHERE source = $1 AND external_id = $2`,
        [source, externalId],
      );
      await m.query(
        `INSERT INTO external_identities(user_id, source, external_id, verified)
         VALUES ($1, $2, $3, true)
         ON CONFLICT (source, external_id) DO UPDATE SET user_id = EXCLUDED.user_id, verified = true`,
        [userId, source, externalId],
      );
      const reattributed = await this.reattribute(m, source, externalId, userId);
      await this.audit.record(
        actorId,
        'identity.map',
        'external_identity',
        `${source}:${externalId}`,
        { userId, previousUserId: previous?.user_id ?? null, reattributed },
        m,
      );
      return { source, externalId, userId, reattributed };
    });
  }

  async unmap(actorId: string, source: Source, externalId: string) {
    return this.ds.transaction(async (m) => {
      const [row] = await rows<{ user_id: string }>(
        m,
        `DELETE FROM external_identities WHERE source = $1 AND external_id = $2 RETURNING user_id`,
        [source, externalId],
      );
      if (!row) throw new NotFoundException('Account is not mapped');
      const reattributed = await this.reattribute(m, source, externalId, null);
      await this.audit.record(
        actorId,
        'identity.unmap',
        'external_identity',
        `${source}:${externalId}`,
        { previousUserId: row.user_id, reattributed },
        m,
      );
      return { source, externalId, userId: null, reattributed };
    });
  }

  async dataQuality(now = new Date()) {
    const connections: {
      name: string;
      kind: string;
      enabled: boolean;
      last_success_at: Date | null;
      last_run: {
        status: string;
        started_at: string;
        error_summary: string | null;
        counts: Record<string, unknown>;
      } | null;
    }[] = await this.ds.query(
      `SELECT c.name, c.kind, c.enabled,
              (SELECT max(last_success_at) FROM sync_cursors WHERE connection_id = c.id) AS last_success_at,
              (SELECT row_to_json(r) FROM (SELECT status, started_at, error_summary, counts_json AS counts
                 FROM sync_runs WHERE connection_id = c.id ORDER BY started_at DESC LIMIT 1) r) AS last_run
       FROM integration_connections c WHERE c.kind IN ('jira','gitlab') ORDER BY c.name`,
    );
    const [jira] = await this.ds.query(
      `SELECT count(*)::int AS items,
              count(*) FILTER (WHERE w.assignee_external_id IS NOT NULL)::int AS with_assignee,
              count(*) FILTER (WHERE w.assignee_external_id IS NOT NULL AND w.assignee_user_id IS NOT NULL)::int AS mapped
       FROM work_items w JOIN integration_connections c ON c.id = w.connection_id WHERE c.kind = 'jira'`,
    );
    const [gitlab] = await this.ds.query(
      `SELECT count(*)::int AS mrs,
              count(*) FILTER (WHERE m.author_user_id IS NOT NULL)::int AS mapped_authors,
              count(*) FILTER (WHERE m.linked_work_item_id IS NOT NULL)::int AS linked
       FROM merge_requests m JOIN integration_connections c ON c.id = m.connection_id WHERE c.kind = 'gitlab'`,
    );
    const unmapped: { source: Source; n: number }[] = await this.ds.query(
      `SELECT a.source, count(*)::int AS n FROM source_accounts a
       LEFT JOIN external_identities ei ON ei.source = a.source AND ei.external_id = a.external_id
       WHERE ei.id IS NULL AND NOT a.is_bot GROUP BY a.source`,
    );
    const unmappedStatuses: { connection: string; status: string }[] = await this.ds.query(
      `SELECT c.name AS connection, m.source_status_name AS status
       FROM status_mappings m JOIN integration_connections c ON c.id = m.connection_id
       WHERE m.category IS NULL ORDER BY c.name, m.source_status_name`,
    );
    const unmappedCount = (s: Source) => unmapped.find((u) => u.source === s)?.n ?? 0;
    return {
      generatedAt: now.toISOString(),
      staleAfterHours: STALE_HOURS,
      connections: connections.map((c) => {
        const last = c.last_success_at ? new Date(c.last_success_at) : null;
        return {
          name: c.name,
          kind: c.kind,
          enabled: c.enabled,
          lastSuccessAt: last?.toISOString() ?? null,
          stale: !last || now.getTime() - last.getTime() > STALE_HOURS * 3_600_000,
          lastRun: c.last_run,
        };
      }),
      jira: {
        workItems: jira.items,
        withAssignee: jira.with_assignee,
        mappedAssignees: jira.mapped,
        assigneeCoveragePct: pct(jira.mapped, jira.with_assignee),
        unmappedAccounts: unmappedCount('jira'),
        statusesWithoutCategory: unmappedStatuses,
      },
      gitlab: {
        mergeRequests: gitlab.mrs,
        mappedAuthors: gitlab.mapped_authors,
        authorCoveragePct: pct(gitlab.mapped_authors, gitlab.mrs),
        linkedToJira: gitlab.linked,
        jiraLinkPct: pct(gitlab.linked, gitlab.mrs),
        unmappedAccounts: unmappedCount('gitlab'),
      },
    };
  }
}
