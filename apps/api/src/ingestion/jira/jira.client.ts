import { fetchJson, FetchDeps } from '../http';
import type {
  JiraField,
  JiraIssue,
  JiraSearchResponse,
  JiraServerInfo,
  JiraStatusRef,
} from './jira.types';

/** Fields requested from Jira: metadata only (no summary, description, comments). */
export const BASE_FIELDS = ['issuetype', 'status', 'assignee', 'project', 'created', 'updated'];

const PROJECT_KEY = /^[A-Z][A-Z0-9_]{0,49}$/;

function quote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Incremental JQL. Uses a relative time (`-Nm`) so the result does not depend on the Jira
 * service account's time zone. Project keys are validated to rule out JQL injection.
 */
export function buildJql(opts: {
  projectKeys: string[];
  excludeIssueTypes?: string[];
  updatedWithinMinutes: number | null;
}): string {
  if (opts.projectKeys.length === 0) throw new Error('Jira connection has no project keys');
  for (const k of opts.projectKeys) {
    if (!PROJECT_KEY.test(k)) throw new Error(`Invalid Jira project key: ${k}`);
  }
  const parts = [`project in (${opts.projectKeys.map(quote).join(', ')})`];
  if (opts.excludeIssueTypes?.length) {
    parts.push(`issuetype not in (${opts.excludeIssueTypes.map(quote).join(', ')})`);
  }
  if (opts.updatedWithinMinutes !== null) {
    parts.push(`updated >= "-${Math.ceil(Math.max(1, opts.updatedWithinMinutes))}m"`);
  }
  return `${parts.join(' AND ')} ORDER BY updated ASC, key ASC`;
}

/** Read-only Jira Data Center REST v2 client (personal access token, Bearer). */
export class JiraClient {
  private readonly base: string;

  constructor(
    baseUrl: string,
    private readonly token: string,
    private readonly deps: FetchDeps = {},
  ) {
    this.base = baseUrl.replace(/\/+$/, '');
  }

  private get<T>(path: string): Promise<T> {
    return fetchJson<T>(
      `${this.base}${path}`,
      { headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' } },
      this.deps,
    );
  }

  serverInfo(): Promise<JiraServerInfo> {
    return this.get('/rest/api/2/serverInfo');
  }

  fields(): Promise<JiraField[]> {
    return this.get('/rest/api/2/field');
  }

  statuses(): Promise<JiraStatusRef[]> {
    return this.get('/rest/api/2/status');
  }

  search(
    jql: string,
    startAt: number,
    maxResults: number,
    fields: string[],
  ): Promise<JiraSearchResponse> {
    return fetchJson<JiraSearchResponse>(
      `${this.base}/rest/api/2/search`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ jql, startAt, maxResults, fields, expand: ['changelog'] }),
      },
      this.deps,
    );
  }

  /** Full issue changelog (used when the search response truncated it). */
  issueWithChangelog(key: string, fields: string[]): Promise<JiraIssue> {
    return this.get(
      `/rest/api/2/issue/${encodeURIComponent(key)}?expand=changelog&fields=${fields.join(',')}`,
    );
  }
}
