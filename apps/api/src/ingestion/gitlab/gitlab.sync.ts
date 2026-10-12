import { DataSource, EntityManager } from 'typeorm';
import { rows } from '../../db/rows';
import { FetchDeps } from '../http';
import { resolveSecret } from '../secrets';
import { failRun, lastSuccess, startRun, succeedRun } from '../sync-runs';
import { GitLabClient } from './gitlab.client';
import { DEFAULT_ISSUE_KEY_PATTERN, mapMergeRequest, MappedMergeRequest } from './gitlab.mapper';

export interface GitLabConnectionConfig {
  projectIds: string[];
  botUsernames?: string[];
  issueKeyPattern?: string;
  backfillMonths?: number;
  overlapHours?: number;
  perPage?: number;
}

export interface GitLabSyncCounts {
  mrsSeen: number;
  mrsInserted: number;
  mrsUpdated: number;
  mrsUnchanged: number;
  eventsWritten: number;
  reviewRequests: number;
  linkedToWorkItems: number;
  unmappedUsers: number;
}

export interface GitLabSyncResult {
  runId: string;
  status: 'succeeded' | 'failed';
  counts: GitLabSyncCounts;
  gitlabVersion?: string;
  error?: string;
}

const RESOURCE = 'merge_requests';

/**
 * Read-only GitLab → EPI ingestion of merge requests and review activity (metadata only):
 * incremental `updated_after` with overlap, header pagination, idempotent upserts, verified
 * identity mapping and Jira-key links with their source as confidence.
 */
export class GitLabSync {
  constructor(
    private readonly ds: DataSource,
    private readonly deps: FetchDeps & { env?: NodeJS.ProcessEnv; now?: () => Date } = {},
  ) {}

  async run(
    connectionName: string,
    opts: { fullBackfill?: boolean; onStarted?: (runId: string) => void } = {},
  ): Promise<GitLabSyncResult> {
    const now = this.deps.now?.() ?? new Date();
    const [conn] = await this.ds.query(
      `SELECT id, endpoint, enabled, config_json, secret_ref FROM integration_connections
       WHERE name = $1 AND kind = 'gitlab'`,
      [connectionName],
    );
    if (!conn) throw new Error(`No GitLab connection named "${connectionName}"`);
    if (!conn.enabled) throw new Error(`GitLab connection "${connectionName}" is disabled`);
    const config = conn.config_json as GitLabConnectionConfig;
    const counts: GitLabSyncCounts = {
      mrsSeen: 0,
      mrsInserted: 0,
      mrsUpdated: 0,
      mrsUnchanged: 0,
      eventsWritten: 0,
      reviewRequests: 0,
      linkedToWorkItems: 0,
      unmappedUsers: 0,
    };
    const runId = await startRun(this.ds, conn.id, connectionName, now);
    opts.onStarted?.(runId);

    try {
      const token = resolveSecret(conn.secret_ref ?? '', this.deps.env);
      const client = new GitLabClient(conn.endpoint, token, this.deps);
      const version = await client.version();
      const last = await lastSuccess(this.ds, conn.id, RESOURCE);
      const overlapMs = (config.overlapHours ?? 48) * 3_600_000;
      const since =
        last && !opts.fullBackfill
          ? new Date(last.getTime() - overlapMs)
          : new Date(now.getTime() - (config.backfillMonths ?? 6) * 30 * 86_400_000);
      const perPage = config.perPage ?? 100;
      const ctx = {
        botUsernames: config.botUsernames ?? [],
        issueKeyPattern: config.issueKeyPattern ?? DEFAULT_ISSUE_KEY_PATTERN,
      };
      const identities = new Map<string, string>(
        (
          await this.ds.query(
            `SELECT external_id, user_id FROM external_identities WHERE source = 'gitlab'`,
          )
        ).map((r: { external_id: string; user_id: string }) => [r.external_id, r.user_id]),
      );
      const unmapped = new Set<string>();
      const resolve = (externalId: string, isBot: boolean): string | null => {
        const id = identities.get(externalId) ?? null;
        if (!id && !isBot) unmapped.add(externalId);
        return id;
      };

      for (const projectId of config.projectIds) {
        try {
          await client.project(projectId);
        } catch (e) {
          throw new Error(
            `GitLab project ${projectId} is not accessible with this token (${e instanceof Error ? e.message : 'error'})`,
          );
        }
        for (let page: number | null = 1; page; ) {
          const res = await client.mergeRequests(projectId, since, page, perPage);
          const mapped: MappedMergeRequest[] = [];
          for (const mr of res.items) {
            mapped.push(mapMergeRequest(mr, await client.notes(projectId, mr.iid, perPage), ctx));
          }
          await this.ds.transaction(async (m) => {
            for (const x of mapped) await this.upsert(m, conn.id, x, resolve, counts);
          });
          page = res.nextPage;
        }
      }
      counts.unmappedUsers = unmapped.size;
      await succeedRun(this.ds, runId, conn.id, RESOURCE, now, {
        ...counts,
        gitlabVersion: version.version,
      });
      return { runId, status: 'succeeded', counts, gitlabVersion: version.version };
    } catch (e) {
      const error = await failRun(this.ds, runId, counts, e);
      return { runId, status: 'failed', counts, error };
    }
  }

  private async upsert(
    m: EntityManager,
    connectionId: string,
    x: MappedMergeRequest,
    resolve: (externalId: string, isBot: boolean) => string | null,
    counts: GitLabSyncCounts,
  ): Promise<void> {
    counts.mrsSeen++;
    const mr = x.mr;
    let linkedId: string | null = null;
    if (mr.linkedIssueKey) {
      const [wi] = await m.query(
        `SELECT w.id FROM work_items w JOIN integration_connections c ON c.id = w.connection_id
         WHERE c.kind = 'jira' AND w.external_key = $1 LIMIT 1`,
        [mr.linkedIssueKey],
      );
      linkedId = wi?.id ?? null;
      if (linkedId) counts.linkedToWorkItems++;
    }
    const written = await rows<{ id: string; inserted: boolean }>(
      m,
      `INSERT INTO merge_requests(connection_id, project_external_id, mr_iid, author_user_id,
         linked_work_item_id, link_confidence, created_at, merged_at, state)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (connection_id, project_external_id, mr_iid) DO UPDATE SET
         author_user_id = EXCLUDED.author_user_id, linked_work_item_id = EXCLUDED.linked_work_item_id,
         link_confidence = EXCLUDED.link_confidence, merged_at = EXCLUDED.merged_at, state = EXCLUDED.state
       WHERE (merge_requests.author_user_id, merge_requests.linked_work_item_id,
              merge_requests.link_confidence, merge_requests.merged_at, merge_requests.state)
         IS DISTINCT FROM
             (EXCLUDED.author_user_id, EXCLUDED.linked_work_item_id, EXCLUDED.link_confidence,
              EXCLUDED.merged_at, EXCLUDED.state)
       RETURNING id, (xmax = 0) AS inserted`,
      [
        connectionId,
        mr.projectExternalId,
        mr.iid,
        resolve(mr.authorExternalId, false),
        linkedId,
        linkedId ? mr.linkSource : null,
        mr.createdAt,
        mr.mergedAt,
        mr.state,
      ],
    );
    let mrId: string;
    if (written[0]) {
      mrId = written[0].id;
      if (written[0].inserted) counts.mrsInserted++;
      else counts.mrsUpdated++;
    } else {
      counts.mrsUnchanged++;
      const [existing] = await m.query(
        `SELECT id FROM merge_requests WHERE connection_id = $1 AND project_external_id = $2 AND mr_iid = $3`,
        [connectionId, mr.projectExternalId, mr.iid],
      );
      mrId = existing.id;
    }
    for (const e of x.events) {
      if (e.type === 'review_requested') counts.reviewRequests++;
      const ev = await rows(
        m,
        `INSERT INTO review_events(merge_request_id, external_event_id, event_type, actor_user_id,
           actor_external_id, is_bot, event_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (merge_request_id, external_event_id) DO UPDATE SET
           event_type = EXCLUDED.event_type, actor_user_id = EXCLUDED.actor_user_id,
           actor_external_id = EXCLUDED.actor_external_id, is_bot = EXCLUDED.is_bot,
           event_at = EXCLUDED.event_at
         WHERE (review_events.event_type, review_events.actor_user_id, review_events.actor_external_id,
                review_events.is_bot, review_events.event_at)
           IS DISTINCT FROM (EXCLUDED.event_type, EXCLUDED.actor_user_id, EXCLUDED.actor_external_id,
                EXCLUDED.is_bot, EXCLUDED.event_at)
         RETURNING id`,
        [
          mrId,
          e.externalEventId,
          e.type,
          resolve(e.actorExternalId, e.isBot),
          e.actorExternalId,
          e.isBot,
          e.eventAt,
        ],
      );
      counts.eventsWritten += ev.length;
    }
  }
}

/** Read-only connectivity/permission check for `gitlab-check`. */
export async function checkGitLabConnection(
  ds: DataSource,
  connectionName: string,
  deps: FetchDeps & { env?: NodeJS.ProcessEnv } = {},
): Promise<{
  version: string;
  projects: { id: string; path: string; recentMergeRequests: number }[];
}> {
  const [conn] = await ds.query(
    `SELECT endpoint, config_json, secret_ref FROM integration_connections WHERE name = $1 AND kind = 'gitlab'`,
    [connectionName],
  );
  if (!conn) throw new Error(`No GitLab connection named "${connectionName}"`);
  const config = conn.config_json as GitLabConnectionConfig;
  const client = new GitLabClient(
    conn.endpoint,
    resolveSecret(conn.secret_ref ?? '', deps.env),
    deps,
  );
  const version = await client.version();
  const since = new Date(Date.now() - 30 * 86_400_000);
  const projects = [];
  for (const id of config.projectIds) {
    const p = await client.project(id);
    const page = await client.mergeRequests(id, since, 1, 100);
    projects.push({ id, path: p.path_with_namespace, recentMergeRequests: page.items.length });
  }
  return { version: version.version, projects };
}
