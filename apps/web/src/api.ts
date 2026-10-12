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
