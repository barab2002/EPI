import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type {
  GitLabMergeRequest,
  GitLabNote,
  GitLabUser,
} from '../src/ingestion/gitlab/gitlab.types';

/**
 * In-process fake of the GitLab REST v4 endpoints EPI uses, with SYNTHETIC merge requests.
 * Supports `updated_after`, `X-Next-Page` pagination, PRIVATE-TOKEN auth and fault injection.
 */
interface Fault {
  pathIncludes: string;
  status: number;
  times: number;
  retryAfter?: string;
}

export class FakeGitLab {
  readonly mrs = new Map<string, GitLabMergeRequest & { notes: GitLabNote[] }>();
  readonly requests: string[] = [];
  readonly projects = new Set<number>();
  private faults: Fault[] = [];
  private noteSeq = 1;
  private server: Server | null = null;
  url = '';

  constructor(readonly token: string) {}

  addMergeRequest(
    projectId: number,
    iid: number,
    opts: {
      author: GitLabUser;
      createdAt: Date;
      branch?: string;
      title?: string;
      reviewers?: GitLabUser[];
      mergedAt?: Date | null;
    },
  ): void {
    this.projects.add(projectId);
    this.mrs.set(`${projectId}!${iid}`, {
      id: projectId * 1000 + iid,
      iid,
      project_id: projectId,
      title: opts.title ?? `Synthetic change ${iid}`,
      description: null,
      source_branch: opts.branch ?? `feature/change-${iid}`,
      state: opts.mergedAt ? 'merged' : 'opened',
      created_at: opts.createdAt.toISOString(),
      updated_at: opts.createdAt.toISOString(),
      merged_at: opts.mergedAt ? opts.mergedAt.toISOString() : null,
      author: opts.author,
      reviewers: opts.reviewers ?? [],
      notes: [],
    });
  }

  addNote(
    projectId: number,
    iid: number,
    author: GitLabUser,
    at: Date,
    body: string,
    system = false,
  ) {
    const mr = this.mrs.get(`${projectId}!${iid}`)!;
    mr.notes.push({ id: this.noteSeq++, author, created_at: at.toISOString(), body, system });
    if (at.toISOString() > mr.updated_at) mr.updated_at = at.toISOString();
  }

  injectFault(f: Fault): void {
    this.faults.push(f);
  }

  clearFaults(): void {
    this.faults = [];
  }

  async start(): Promise<void> {
    this.server = createServer((req, res) => this.handle(req, res));
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

  private page<T>(res: ServerResponse, items: T[], url: URL) {
    const perPage = Number(url.searchParams.get('per_page') ?? 20);
    const page = Number(url.searchParams.get('page') ?? 1);
    const slice = items.slice((page - 1) * perPage, page * perPage);
    const next = page * perPage < items.length ? String(page + 1) : '';
    this.send(res, 200, slice, { 'x-next-page': next, 'x-total': String(items.length) });
  }

  private handle(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? '/', this.url);
    this.requests.push(url.pathname + url.search);
    const fault = this.faults.find((f) => url.pathname.includes(f.pathIncludes) && f.times > 0);
    if (fault) {
      fault.times--;
      return this.send(
        res,
        fault.status,
        { message: 'injected' },
        fault.retryAfter ? { 'retry-after': fault.retryAfter } : {},
      );
    }
    if (req.headers['private-token'] !== this.token)
      return this.send(res, 401, { message: '401 Unauthorized' });

    if (url.pathname === '/api/v4/version')
      return this.send(res, 200, { version: '18.2.1-ee', revision: 'abc', enterprise: true });
    let m = /^\/api\/v4\/projects\/(\d+)$/.exec(url.pathname);
    if (m) {
      const id = Number(m[1]);
      return this.projects.has(id)
        ? this.send(res, 200, { id, path_with_namespace: `synthetic/project-${id}` })
        : this.send(res, 404, { message: '404 Project Not Found' });
    }
    m = /^\/api\/v4\/projects\/(\d+)\/merge_requests$/.exec(url.pathname);
    if (m) {
      const pid = Number(m[1]);
      const after = url.searchParams.get('updated_after');
      const items = [...this.mrs.values()]
        .filter((x) => x.project_id === pid && (!after || x.updated_at > after))
        .sort((a, b) => a.updated_at.localeCompare(b.updated_at) || a.iid - b.iid)
        .map(({ notes: _notes, ...mr }) => mr);
      return this.page(res, items, url);
    }
    m = /^\/api\/v4\/projects\/(\d+)\/merge_requests\/(\d+)\/notes$/.exec(url.pathname);
    if (m) {
      const mr = this.mrs.get(`${m[1]}!${m[2]}`);
      if (!mr) return this.send(res, 404, { message: '404 Not found' });
      return this.page(
        res,
        [...mr.notes].sort((a, b) => a.created_at.localeCompare(b.created_at)),
        url,
      );
    }
    return this.send(res, 404, { message: '404 Not Found' });
  }
}
