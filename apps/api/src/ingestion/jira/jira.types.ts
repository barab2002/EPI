/** Subset of Jira Data Center REST API v2 response shapes used by EPI (metadata only). */

export interface JiraStatusRef {
  id: string;
  name: string;
  statusCategory?: { key: 'new' | 'indeterminate' | 'done' | string };
}

export interface JiraUserRef {
  key?: string;
  name?: string;
  displayName?: string;
}

export interface JiraChangeItem {
  field: string;
  fieldtype?: string;
  from: string | null;
  fromString: string | null;
  to: string | null;
  toString: string | null;
}

export interface JiraHistory {
  id: string;
  created: string;
  items: JiraChangeItem[];
}

export interface JiraChangelog {
  startAt: number;
  maxResults: number;
  total: number;
  histories: JiraHistory[];
}

export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    issuetype: { name: string; subtask?: boolean };
    status: JiraStatusRef;
    assignee: JiraUserRef | null;
    project: { key: string };
    created: string;
    updated: string;
    [customField: string]: unknown;
  };
  changelog?: JiraChangelog;
}

export interface JiraSearchResponse {
  startAt: number;
  maxResults: number;
  total: number;
  issues: JiraIssue[];
}

export interface JiraField {
  id: string;
  name: string;
  custom: boolean;
  schema?: { type?: string; custom?: string };
}

export interface JiraServerInfo {
  baseUrl: string;
  version: string;
  versionNumbers?: number[];
  deploymentType?: string;
}
