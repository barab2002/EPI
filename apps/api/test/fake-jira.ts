import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { JiraHistory, JiraIssue } from '../src/ingestion/jira/jira.types';

/**
 * In-process fake of the Jira Data Center REST v2 endpoints EPI uses, with SYNTHETIC issues.
 * Response shapes follow the documented DC API (dates with +hhmm offsets, changelog in search
 * results, statusCategory keys). Supports paging, relative-time JQL, changelog truncation and
 * fault injection.
 */

export const STATUSES = [
  { id: '1', name: 'Open', statusCategory: { key: 'new' } },
  { id: '3', name: 'In Progress', statusCategory: { key: 'indeterminate' } },
  { id: '10010', name: 'In Review', statusCategory: { key: 'indeterminate' } },
  { id: '6', name: 'Done', statusCategory: { key: 'done' } },
];
const byId = new Map(STATUSES.map((s) => [s.id, s]));

/** Jira DC timestamp format, rendered in +0300 to exercise offset parsing. */
export function jiraDate(d: Date): string {
  const local = new Date(d.getTime() + 3 * 3_600_000).toISOString().replace('Z', '');
  return `${local}+0300`;
}

interface Fault {
  pathPrefix: string;
  status: number;
  times: number;
  retryAfter?: string;
  afterCalls?: number;
}

export class FakeJira {
  readonly issues = new Map<string, JiraIssue>();
  readonly requests: { method: string; path: string; body?: unknown }[] = [];
  readonly truncateChangelogFor = new Set<string>();
  private faults: Fault[] = [];
  private server: Server | null = null;
  private historySeq = 1000;
  url = '';

  constructor(
    readonly token: string,
    private readonly now: () => Date,
  ) {}

  /** Adds a synthetic issue that went Open → (transitions...) at the given day offsets. */
  addIssue(
    key: string,
    opts: {
      project?: string;
      type?: string;
      assignee?: string | null;
      assigneeName?: string;
      storyPoints?: number | null;
      createdDaysAgo: number;
      transitions: [statusId: string, daysAgo: number][];
    },
  ): void {
    const created = new Date(this.now().getTime() - opts.createdDaysAgo * 86_400_000);
    const issue: JiraIssue = {
      id: String(10000 + this.issues.size),
      key,
      fields: {
        issuetype: { name: opts.type ?? 'Story' },
        status: byId.get('1')!,
        assignee:
          opts.assignee === null
            ? null
            : {
                key: opts.assignee ?? 'JIRAUSER1',
                name: 'synthetic',
                displayName: opts.assigneeName ?? 'Synthetic',
              },
        project: { key: opts.project ?? 'ENG' },
        created: jiraDate(created),
        updated: jiraDate(created),
        customfield_10002: opts.storyPoints ?? null,
      },
      changelog: { startAt: 0, maxResults: 100, total: 0, histories: [] },
    };
    this.issues.set(key, issue);
    for (const [statusId, daysAgo] of opts.transitions) {
      this.transition(key, statusId, new Date(this.now().getTime() - daysAgo * 86_400_000));
    }
  }

  transition(key: string, toStatusId: string, at: Date): void {
    const issue = this.issues.get(key)!;
    const from = issue.fields.status;
    const to = byId.get(toStatusId)!;
    const h: JiraHistory = {
      id: String(this.historySeq++),
      created: jiraDate(at),
      items: [
        {
          field: 'status',
          fieldtype: 'jira',
          from: from.id,
          fromString: from.name,
          to: to.id,
          toString: to.name,
        },
      ],
    };
    issue.changelog!.histories.push(h);
    issue.changelog!.total = issue.changelog!.histories.length;
    issue.fields.status = to;
    issue.fields.updated = jiraDate(at);
  }

  injectFault(f: Fault): void {
    this.faults.push(f);
  }

  clearFaults(): void {
    this.faults = [];
  }

  searchCalls(): number {
    return this.requests.filter((r) => r.path.startsWith('/rest/api/2/search')).length;
  }

  async start(): Promise<void> {
    this.server = createServer((req, res) => void this.handle(req, res));
    await new Promise<void>((r) => this.server!.listen(0, '127.0.0.1', () => r()));
    this.url = `http://127.0.0.1:${(this.server!.address() as AddressInfo).port}`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((r) => this.server?.close(() => r()));
  }

  private send(
    res: ServerResponse,
    status: number,
    body: unknown,
    headers: Record<string, string> = {},
  ) {
    res.writeHead(status, { 'content-type': 'application/json', ...headers });
    res.end(JSON.stringify(body));
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks).toString();
    const body = raw ? JSON.parse(raw) : undefined;
    const url = new URL(req.url ?? '/', this.url);
    this.requests.push({ method: req.method ?? 'GET', path: url.pathname + url.search, body });

    const fault = this.faults.find((f) => url.pathname.startsWith(f.pathPrefix) && f.times > 0);
    if (fault) {
      const calls = this.requests.filter((r) => r.path.startsWith(fault.pathPrefix)).length;
      if (!fault.afterCalls || calls > fault.afterCalls) {
        fault.times--;
        return this.send(
          res,
          fault.status,
          { errorMessages: ['injected'] },
          fault.retryAfter ? { 'retry-after': fault.retryAfter } : {},
        );
      }
    }
    if (req.headers.authorization !== `Bearer ${this.token}`) {
      return this.send(res, 401, { errorMessages: ['You are not authenticated'] });
    }

    if (url.pathname === '/rest/api/2/serverInfo') {
      return this.send(res, 200, {
        baseUrl: this.url,
        version: '9.12.0',
        versionNumbers: [9, 12, 0],
        deploymentType: 'Server',
      });
    }
    if (url.pathname === '/rest/api/2/status') return this.send(res, 200, STATUSES);
    if (url.pathname === '/rest/api/2/field') {
      return this.send(res, 200, [
        { id: 'summary', name: 'Summary', custom: false },
        {
          id: 'customfield_10002',
          name: 'Story Points',
          custom: true,
          schema: {
            type: 'number',
            custom: 'com.atlassian.jira.plugin.system.customfieldtypes:float',
          },
        },
      ]);
    }
    if (url.pathname === '/rest/api/2/search' && req.method === 'POST') {
      return this.send(res, 200, this.search(body));
    }
    const issueMatch = /^\/rest\/api\/2\/issue\/([^/]+)$/.exec(url.pathname);
    if (issueMatch) {
      const issue = this.issues.get(decodeURIComponent(issueMatch[1]));
      if (!issue) return this.send(res, 404, { errorMessages: ['Issue does not exist'] });
      return this.send(res, 200, structuredClone(issue));
    }
    return this.send(res, 404, { errorMessages: ['not found'] });
  }

  private search(body: { jql: string; startAt: number; maxResults: number }) {
    const projects =
      /project in \(([^)]*)\)/
        .exec(body.jql)?.[1]
        .split(',')
        .map((p) => p.trim().replace(/"/g, '')) ?? [];
    const minutes = /updated >= "-(\d+)m"/.exec(body.jql)?.[1];
    const since = minutes ? this.now().getTime() - Number(minutes) * 60_000 : -Infinity;
    const toMs = (s: string) => new Date(s.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')).getTime();
    const matching = [...this.issues.values()]
      .filter((i) => projects.includes(i.fields.project.key) && i.fields.issuetype.name !== 'Epic')
      .filter((i) => toMs(i.fields.updated) >= since)
      .sort(
        (a, b) => toMs(a.fields.updated) - toMs(b.fields.updated) || a.key.localeCompare(b.key),
      );
    const maxResults = Math.min(body.maxResults, 50); // DC caps page size
    const page = matching.slice(body.startAt, body.startAt + maxResults).map((i) => {
      const copy = structuredClone(i);
      if (this.truncateChangelogFor.has(i.key)) {
        copy.changelog = {
          ...copy.changelog!,
          maxResults: 1,
          histories: copy.changelog!.histories.slice(0, 1),
        };
      }
      return copy;
    });
    return { startAt: body.startAt, maxResults, total: matching.length, issues: page };
  }
}
