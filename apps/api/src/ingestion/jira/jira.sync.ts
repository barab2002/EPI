import { DataSource, EntityManager } from 'typeorm';
import { rows } from '../../db/rows';
import type { StatusCategory } from '../../kpi/engine/types';
import { FetchDeps } from '../http';
import { resolveSecret } from '../secrets';
import { BASE_FIELDS, buildJql, JiraClient } from './jira.client';
import { categoryForJiraStatusCategory, discoverStoryPointsField, mapIssue } from './jira.mapper';
import type { JiraIssue } from './jira.types';

export interface JiraConnectionConfig {
  projectKeys: string[];
  excludeIssueTypes?: string[];
  /** 'auto' = discover; a field ID = admin-confirmed; null = do not read story points. */
  storyPointsField?: string | null;
  backfillMonths?: number;
  overlapHours?: number;
  pageSize?: number;
}

export interface SyncCounts {
  issuesSeen: number;
  itemsInserted: number;
  itemsUpdated: number;
  itemsUnchanged: number;
  eventsWritten: number;
  unmappedAssignees: number;
  unknownStatuses: string[];
  changelogRefetched: number;
  skippedIssues: number;
}

export interface SyncResult {
  runId: string;
  status: 'succeeded' | 'failed';
  counts: SyncCounts;
  jiraVersion?: string;
  error?: string;
}

const RESOURCE = 'issues';

export class SyncAlreadyRunningError extends Error {
  constructor(connectionName: string) {
    super(`A sync for "${connectionName}" is already running`);
  }
}

/**
 * Read-only Jira DC → EPI ingestion (spec §7): idempotent upserts keyed by external IDs,
 * pagination, bounded retries (in the HTTP layer), incremental cursor with overlap, and a
 * cursor that only advances after a fully successful run.
 */
export class JiraSync {
  constructor(
    private readonly ds: DataSource,
    private readonly deps: FetchDeps & { env?: NodeJS.ProcessEnv; now?: () => Date } = {},
  ) {}

  async run(
    connectionName: string,
    opts: { fullBackfill?: boolean; onStarted?: (runId: string) => void } = {},
  ): Promise<SyncResult> {
    const now = this.deps.now?.() ?? new Date();
    const [conn] = await this.ds.query(
      `SELECT id, endpoint, enabled, config_json, secret_ref FROM integration_connections
       WHERE name = $1 AND kind = 'jira'`,
      [connectionName],
    );
    if (!conn) throw new Error(`No Jira connection named "${connectionName}"`);
    if (!conn.enabled) throw new Error(`Jira connection "${connectionName}" is disabled`);
    const config = conn.config_json as JiraConnectionConfig;

    const counts: SyncCounts = {
      issuesSeen: 0,
      itemsInserted: 0,
      itemsUpdated: 0,
      itemsUnchanged: 0,
      eventsWritten: 0,
      unmappedAssignees: 0,
      unknownStatuses: [],
      changelogRefetched: 0,
      skippedIssues: 0,
    };
    // Runs left 'running' by a crash for over 2 h are expired so they cannot block forever.
    await this.ds.query(
      `UPDATE sync_runs SET status = 'failed', finished_at = now(), error_summary = 'abandoned (no finish recorded)'
       WHERE connection_id = $1 AND status = 'running' AND started_at < now() - interval '2 hours'`,
      [conn.id],
    );
    let run: { id: string };
    try {
      [run] = await this.ds.query(
        `INSERT INTO sync_runs(connection_id, started_at, status) VALUES ($1, $2, 'running') RETURNING id`,
        [conn.id, now],
      );
    } catch (e) {
      if ((e as { code?: string }).code === '23505') {
        throw new SyncAlreadyRunningError(connectionName);
      }
      throw e;
    }
    opts.onStarted?.(run.id);

    try {
      const token = resolveSecret(conn.secret_ref ?? '', this.deps.env);
      const client = new JiraClient(conn.endpoint, token, this.deps);
      const info = await client.serverInfo();

      // Status mappings: insert/refresh inferred defaults, never touch admin rows.
      const statuses = await client.statuses();
      for (const s of statuses) {
        await this.ds.query(
          `INSERT INTO status_mappings(connection_id, source_status_id, source_status_name, category, origin)
           VALUES ($1, $2, $3, $4, 'inferred')
           ON CONFLICT (connection_id, source_status_id) DO UPDATE
             SET source_status_name = EXCLUDED.source_status_name,
                 category = CASE WHEN status_mappings.origin = 'admin' THEN status_mappings.category
                                 ELSE EXCLUDED.category END,
                 updated_at = now()`,
          [conn.id, s.id, s.name, categoryForJiraStatusCategory(s.statusCategory?.key)],
        );
      }
      const mappingRows: { source_status_id: string; category: StatusCategory | null }[] =
        await this.ds.query(
          `SELECT source_status_id, category FROM status_mappings WHERE connection_id = $1`,
          [conn.id],
        );
      const categories = new Map(mappingRows.map((r) => [r.source_status_id, r.category]));

      // Story points field: confirmed ID, or auto-discovery only when unambiguous.
      let storyPointsField: string | null = null;
      if (config.storyPointsField === undefined || config.storyPointsField === 'auto') {
        storyPointsField = discoverStoryPointsField(await client.fields()).fieldId;
      } else {
        storyPointsField = config.storyPointsField;
      }
      const fields = storyPointsField ? [...BASE_FIELDS, storyPointsField] : BASE_FIELDS;

      // Window: since last success minus overlap, or the backfill horizon.
      const [cursor] = await this.ds.query(
        `SELECT last_success_at FROM sync_cursors WHERE connection_id = $1 AND resource = $2`,
        [conn.id, RESOURCE],
      );
      const overlapMs = (config.overlapHours ?? 48) * 3_600_000;
      const sinceMs =
        cursor?.last_success_at && !opts.fullBackfill
          ? new Date(cursor.last_success_at).getTime() - overlapMs
          : now.getTime() - (config.backfillMonths ?? 6) * 30 * 86_400_000;
      const jql = buildJql({
        projectKeys: config.projectKeys,
        excludeIssueTypes: config.excludeIssueTypes ?? ['Epic'],
        updatedWithinMinutes: (now.getTime() - sinceMs) / 60_000,
      });

      const identities = new Map<string, string>(
        (
          await this.ds.query(
            `SELECT external_id, user_id FROM external_identities WHERE source = 'jira'`,
          )
        ).map((r: { external_id: string; user_id: string }) => [r.external_id, r.user_id]),
      );
      const unmapped = new Set<string>();
      const unknownStatuses = new Set<string>();
      const pageSize = config.pageSize ?? 100;

      for (let startAt = 0; ; ) {
        const page = await client.search(jql, startAt, pageSize, fields);
        const issues: JiraIssue[] = [];
        for (const issue of page.issues) {
          const cl = issue.changelog;
          if (cl && cl.total > cl.histories.length) {
            counts.changelogRefetched++;
            issues.push(await client.issueWithChangelog(issue.key, fields));
          } else {
            issues.push(issue);
          }
        }
        await this.ds.transaction(async (m) => {
          for (const issue of issues) {
            counts.issuesSeen++;
            let mapped;
            try {
              mapped = mapIssue(issue, {
                storyPointsField,
                categoryForStatus: (id) => (id ? (categories.get(id) ?? null) : null),
              });
            } catch {
              counts.skippedIssues++; // e.g. changelog still truncated: never store partial history
              continue;
            }
            mapped.unknownStatuses.forEach((s) => unknownStatuses.add(s));
            const ext = mapped.item.assigneeExternalId;
            const assignee = ext ? (identities.get(ext) ?? null) : null;
            if (ext && !assignee) unmapped.add(ext);
            await this.upsert(m, conn.id, mapped, assignee, counts);
          }
        });
        startAt += page.issues.length;
        if (page.issues.length === 0 || startAt >= page.total) break;
      }

      counts.unmappedAssignees = unmapped.size;
      counts.unknownStatuses = [...unknownStatuses].sort();
      await this.ds.transaction(async (m) => {
        await m.query(
          `INSERT INTO sync_cursors(connection_id, resource, cursor, last_success_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (connection_id, resource) DO UPDATE
             SET cursor = EXCLUDED.cursor, last_success_at = EXCLUDED.last_success_at`,
          [conn.id, RESOURCE, now.toISOString(), now],
        );
        await m.query(
          `UPDATE sync_runs SET status = 'succeeded', finished_at = now(), counts_json = $2 WHERE id = $1`,
          [run.id, JSON.stringify({ ...counts, jiraVersion: info.version, storyPointsField })],
        );
      });
      return { runId: run.id, status: 'succeeded', counts, jiraVersion: info.version };
    } catch (e) {
      // Messages from our HTTP layer never include credentials or query strings.
      const error = (e instanceof Error ? e.message : 'unknown error').slice(0, 500);
      await this.ds.query(
        `UPDATE sync_runs SET status = 'failed', finished_at = now(), counts_json = $2, error_summary = $3
         WHERE id = $1`,
        [run.id, JSON.stringify(counts), error],
      );
      return { runId: run.id, status: 'failed', counts, error };
    }
  }

  private async upsert(
    m: EntityManager,
    connectionId: string,
    mapped: ReturnType<typeof mapIssue>,
    assignee: string | null,
    counts: SyncCounts,
  ): Promise<void> {
    const i = mapped.item;
    const written = await rows<{ id: string; inserted: boolean }>(
      m,
      `INSERT INTO work_items(connection_id, external_key, project_key, issue_type, work_type,
         assignee_user_id, story_points, status, created_at, started_at, done_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (connection_id, external_key) DO UPDATE SET
         project_key = EXCLUDED.project_key, issue_type = EXCLUDED.issue_type,
         work_type = EXCLUDED.work_type, assignee_user_id = EXCLUDED.assignee_user_id,
         story_points = EXCLUDED.story_points, status = EXCLUDED.status,
         started_at = EXCLUDED.started_at, done_at = EXCLUDED.done_at, updated_at = EXCLUDED.updated_at
       WHERE (work_items.project_key, work_items.issue_type, work_items.work_type,
              work_items.assignee_user_id, work_items.story_points, work_items.status,
              work_items.started_at, work_items.done_at, work_items.updated_at)
         IS DISTINCT FROM
             (EXCLUDED.project_key, EXCLUDED.issue_type, EXCLUDED.work_type,
              EXCLUDED.assignee_user_id, EXCLUDED.story_points, EXCLUDED.status,
              EXCLUDED.started_at, EXCLUDED.done_at, EXCLUDED.updated_at)
       RETURNING id, (xmax = 0) AS inserted`,
      [
        connectionId,
        i.externalKey,
        i.projectKey,
        i.issueType,
        i.workType,
        assignee,
        i.storyPoints,
        i.status,
        i.createdAt,
        i.startedAt,
        i.doneAt,
        i.updatedAt,
      ],
    );
    let itemId: string;
    if (written[0]) {
      itemId = written[0].id;
      if (written[0].inserted) counts.itemsInserted++;
      else counts.itemsUpdated++;
    } else {
      counts.itemsUnchanged++;
      const [existing] = await m.query(
        `SELECT id FROM work_items WHERE connection_id = $1 AND external_key = $2`,
        [connectionId, i.externalKey],
      );
      itemId = existing.id;
    }
    for (const e of mapped.events) {
      const ev = await rows(
        m,
        `INSERT INTO work_events(work_item_id, external_event_id, field_name, old_value, new_value,
           status_category, event_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (work_item_id, external_event_id, field_name) DO UPDATE
           SET status_category = EXCLUDED.status_category, new_value = EXCLUDED.new_value,
               old_value = EXCLUDED.old_value, event_at = EXCLUDED.event_at
         WHERE (work_events.status_category, work_events.new_value, work_events.old_value, work_events.event_at)
           IS DISTINCT FROM (EXCLUDED.status_category, EXCLUDED.new_value, EXCLUDED.old_value, EXCLUDED.event_at)
         RETURNING id`,
        [
          itemId,
          e.externalEventId,
          e.fieldName,
          e.oldValue,
          e.newValue,
          e.statusCategory,
          e.eventAt,
        ],
      );
      counts.eventsWritten += ev.length;
    }
  }
}

/** Read-only connectivity/permission check for `epi jira-check` and readiness reports. */
export async function checkJiraConnection(
  ds: DataSource,
  connectionName: string,
  deps: FetchDeps & { env?: NodeJS.ProcessEnv } = {},
): Promise<{
  version: string;
  deploymentType?: string;
  statuses: number;
  storyPoints: { fieldId: string | null; candidates: string[] };
  matchingIssues: number;
}> {
  const [conn] = await ds.query(
    `SELECT endpoint, config_json, secret_ref FROM integration_connections WHERE name = $1 AND kind = 'jira'`,
    [connectionName],
  );
  if (!conn) throw new Error(`No Jira connection named "${connectionName}"`);
  const config = conn.config_json as JiraConnectionConfig;
  const client = new JiraClient(
    conn.endpoint,
    resolveSecret(conn.secret_ref ?? '', deps.env),
    deps,
  );
  const info = await client.serverInfo();
  const statuses = await client.statuses();
  const storyPoints = discoverStoryPointsField(await client.fields());
  const jql = buildJql({
    projectKeys: config.projectKeys,
    excludeIssueTypes: config.excludeIssueTypes ?? ['Epic'],
    updatedWithinMinutes: (config.backfillMonths ?? 6) * 30 * 24 * 60,
  });
  const page = await client.search(jql, 0, 1, ['status']);
  return {
    version: info.version,
    deploymentType: info.deploymentType,
    statuses: statuses.length,
    storyPoints,
    matchingIssues: page.total,
  };
}
