/** Typed client for the EPI API. Same-origin; the session lives in an HttpOnly cookie. */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly correlationId?: string,
  ) {
    super(message);
  }
}

let csrfToken: string | null = null;
export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && csrfToken) headers['x-csrf-token'] = csrfToken;
  const res = await fetch(url, {
    method,
    headers,
    credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = Array.isArray(data.message)
      ? data.message.join('; ')
      : (data.message ?? res.statusText);
    throw new ApiError(res.status, String(msg), data.correlationId);
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => call<T>('GET', url),
  post: <T>(url: string, body?: unknown) => call<T>('POST', url, body ?? {}),
  put: <T>(url: string, body?: unknown) => call<T>('PUT', url, body ?? {}),
  patch: <T>(url: string, body?: unknown) => call<T>('PATCH', url, body ?? {}),
  delete: <T>(url: string) => call<T>('DELETE', url),
};

export type Access = 'managed' | 'aggregate' | 'structure';

export interface Me {
  user: { id: string; display_name: string; is_synthetic: boolean };
  roles: string[];
  csrfToken: string;
  teams: { id: string; name: string }[];
  managedOrganizationIds: string[];
  managedGroupIds: string[];
  managedTeamIds: string[];
  canReview: boolean;
  mode: 'demo' | 'production';
}

export interface TeamNode {
  id: string;
  name: string;
  access: Access;
  memberCount: number | null;
}
export interface GroupNode {
  id: string;
  name: string;
  access: Access | null;
  teams: TeamNode[];
}
export interface OrgNode {
  id: string;
  name: string;
  access: Access | null;
  groups: GroupNode[];
}

export type TrendStatus =
  | 'improved'
  | 'deteriorated'
  | 'stable'
  | 'insufficient_data'
  | 'no_baseline';

export interface KpiCard {
  code: string;
  title: string;
  unit: 'days' | 'hours';
  direction: string;
  formulaVersion: string;
  value: number | null;
  sampleSize: number;
  confidence: 'none' | 'insufficient' | 'low' | 'normal' | 'suppressed';
  window: { start: string; end: string };
  trend: {
    recent: number | null;
    previous: number | null;
    changePct: number | null;
    status: TrendStatus;
    note: string;
  } | null;
  proxy: boolean;
  suppressed: boolean;
  synthetic: boolean;
  lastDataAt: string | null;
  evidence?: {
    observations: { key: string; value: number }[];
    exclusions: { key: string; reason: string }[];
    extra?: { p85?: number | null; oldest?: { key: string; value: number }[] };
  };
}

export interface KpiExplanation {
  code: string;
  version: string;
  title: string;
  question: string;
  unit: string;
  direction: string;
  formula: string;
  population: string;
  source: string;
  exclusions: string[];
  minimumSample: string;
  caveats: string[];
  possibleActions: string[];
  implementation: string;
  example: {
    description: string;
    input: number[];
    result: { value: number | null; sampleSize: number; confidence: string };
  };
}

export interface Assessment {
  id: string;
  subject_user_id: string;
  subject_name: string;
  reviewer_user_id: string;
  reviewer_name: string;
  independence: number;
  growth: number;
  evidence: string;
  status: 'draft' | 'submitted';
  submitted_at: string | null;
  updated_at: string;
  period_start: string;
  period_end: string;
}

export interface DemoUser {
  id: string;
  display_name: string;
  roles: string;
  team: string | null;
}

export interface SourceAccount {
  source: 'jira' | 'gitlab';
  external_id: string;
  display_name: string | null;
  is_bot: boolean;
  last_seen_at: string;
  user_id: string | null;
  user_name: string | null;
  activity: number;
}

export interface PersonOption {
  id: string;
  display_name: string;
  email: string | null;
  identities: { source: string; external_id: string }[] | null;
}

export interface AuditEvent {
  id: string;
  at: string;
  action: string;
  actor: { id: string; name: string } | null;
  resourceType: string;
  resourceId: string | null;
  resourceLabel: string | null;
  metadata: Record<string, unknown>;
}

export interface AuditPage {
  items: AuditEvent[];
  nextCursor: string | null;
}

export interface SyncScheduleInfo {
  enabled: boolean;
  hourLocal: number;
  timezone: string;
  lastRunDate: string | null;
  lastRunStartedAt: string | null;
  schedulerActive: boolean;
  nextRunAt: string | null;
}

export interface Integration {
  id: string;
  kind: 'jira' | 'gitlab';
  name: string;
  endpoint: string;
  enabled: boolean;
  secret_ref: string | null;
  last_success_at: string | null;
  last_run: {
    status: string;
    started_at: string;
    finished_at: string | null;
    error_summary: string | null;
  } | null;
}

export interface SyncRun {
  id: string;
  connection: string;
  status: 'running' | 'succeeded' | 'failed';
  started_at: string;
  finished_at: string | null;
  counts: Record<string, unknown>;
  error_summary: string | null;
}

export interface StatusMapping {
  connection: string;
  source_status_id: string;
  source_status_name: string;
  category: string | null;
  origin: 'inferred' | 'admin';
}

export interface DataQuality {
  generatedAt: string;
  staleAfterHours: number;
  connections: {
    name: string;
    kind: string;
    enabled: boolean;
    lastSuccessAt: string | null;
    stale: boolean;
    lastRun: { status: string; error_summary: string | null } | null;
  }[];
  jira: {
    workItems: number;
    withAssignee: number;
    mappedAssignees: number;
    assigneeCoveragePct: number | null;
    unmappedAccounts: number;
    statusesWithoutCategory: { connection: string; status: string }[];
  };
  gitlab: {
    mergeRequests: number;
    mappedAuthors: number;
    authorCoveragePct: number | null;
    linkedToJira: number;
    jiraLinkPct: number | null;
    unmappedAccounts: number;
  };
}

/** Data retention (ADR-032). */
export interface RetentionInfo {
  months: number | null;
  automatic: boolean;
  cutoff: string | null;
  due: Record<string, number> | null;
  categories: { key: string; label: string }[];
  lastRun: { at: string; cutoff: string; counts: Record<string, number> } | null;
}

/** AD team import (EPI-004c). */
export interface DirectoryStatus {
  configured: boolean;
  groups: { dn: string; teamId: string | null; teamName: string | null }[];
  lastImport?: { at: string; counts: Record<string, number> } | null;
}

export interface ImportPlan {
  creates: { externalId: string; displayName: string; email: string | null; teamId: string }[];
  links: { userId: string; externalId: string; displayName: string }[];
  updates: {
    userId: string;
    from: { displayName: string; email: string | null };
    to: { displayName: string; email: string | null };
  }[];
  adds: { userId: string; displayName: string; teamId: string; endMembershipIds: string[] }[];
  ends: { membershipId: string; userId: string; displayName: string; teamId: string }[];
  conflicts: { externalId: string; displayName: string; reason: string }[];
  warnings: string[];
  total: number;
}

export interface DirectoryPreview {
  readAt: string;
  hash: string;
  plan: ImportPlan;
  groups: { dn: string; name: string | null; memberCount: number }[];
  teamNames: Record<string, string>;
}

export interface Membership {
  id: string;
  user_id: string;
  display_name: string;
  active: boolean;
  effective_from: string;
  effective_to: string | null;
}

export interface PersonDetail {
  id: string;
  display_name: string;
  email: string | null;
  active: boolean;
  memberships: {
    id: string;
    team_id: string;
    team_name: string;
    group_name: string;
    effective_from: string;
    effective_to: string | null;
  }[];
  roles: {
    id: string;
    role: string;
    scope_type: string;
    scope_id: string | null;
    scope_name: string | null;
    effective_from: string;
    effective_to: string | null;
  }[];
  grades: {
    id: string;
    code: string;
    label: string;
    effective_from: string;
    effective_to: string | null;
  }[];
}
