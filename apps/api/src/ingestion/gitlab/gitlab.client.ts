import { fetchJson, fetchJsonWithHeaders, FetchDeps } from '../http';
import type { GitLabMergeRequest, GitLabNote, GitLabVersion } from './gitlab.types';

/** Read-only GitLab REST v4 client (token needs only `read_api`). */
export class GitLabClient {
  private readonly base: string;

  constructor(
    baseUrl: string,
    private readonly token: string,
    private readonly deps: FetchDeps = {},
  ) {
    this.base = `${baseUrl.replace(/\/+$/, '')}/api/v4`;
  }

  private headers() {
    return { 'PRIVATE-TOKEN': this.token, Accept: 'application/json' };
  }

  version(): Promise<GitLabVersion> {
    return fetchJson(`${this.base}/version`, { headers: this.headers() }, this.deps);
  }

  project(id: string): Promise<{ id: number; path_with_namespace: string }> {
    return fetchJson(
      `${this.base}/projects/${encodeURIComponent(id)}`,
      { headers: this.headers() },
      this.deps,
    );
  }

  /** One page of MRs updated after `updatedAfter`, oldest update first. */
  async mergeRequests(
    projectId: string,
    updatedAfter: Date | null,
    page: number,
    perPage: number,
  ): Promise<{ items: GitLabMergeRequest[]; nextPage: number | null }> {
    const q = new URLSearchParams({
      state: 'all',
      order_by: 'updated_at',
      sort: 'asc',
      per_page: String(perPage),
      page: String(page),
    });
    if (updatedAfter) q.set('updated_after', updatedAfter.toISOString());
    const { data, headers } = await fetchJsonWithHeaders<GitLabMergeRequest[]>(
      `${this.base}/projects/${encodeURIComponent(projectId)}/merge_requests?${q}`,
      { headers: this.headers() },
      this.deps,
    );
    const next = headers.get('x-next-page');
    return { items: data, nextPage: next ? Number(next) : null };
  }

  /** All notes of an MR (system and human), oldest first, following pagination. */
  async notes(projectId: string, iid: number, perPage: number): Promise<GitLabNote[]> {
    const all: GitLabNote[] = [];
    for (let page = 1; page; ) {
      const q = new URLSearchParams({
        sort: 'asc',
        order_by: 'created_at',
        per_page: String(perPage),
        page: String(page),
      });
      const { data, headers } = await fetchJsonWithHeaders<GitLabNote[]>(
        `${this.base}/projects/${encodeURIComponent(projectId)}/merge_requests/${iid}/notes?${q}`,
        { headers: this.headers() },
        this.deps,
      );
      all.push(...data);
      const next = headers.get('x-next-page');
      page = next ? Number(next) : 0;
    }
    return all;
  }
}
