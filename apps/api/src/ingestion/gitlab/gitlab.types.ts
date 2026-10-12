/** Subset of GitLab REST API v4 shapes used by EPI (metadata only). */

export interface GitLabUser {
  id: number;
  username: string;
  name?: string;
  bot?: boolean;
}

export interface GitLabMergeRequest {
  id: number;
  iid: number;
  project_id: number;
  title: string;
  description: string | null;
  source_branch: string;
  state: 'opened' | 'closed' | 'merged' | 'locked' | string;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  author: GitLabUser;
  reviewers?: GitLabUser[];
  draft?: boolean;
}

export interface GitLabNote {
  id: number;
  body: string;
  author: GitLabUser;
  created_at: string;
  system: boolean;
}

export interface GitLabVersion {
  version: string;
  revision?: string;
  enterprise?: boolean;
}
