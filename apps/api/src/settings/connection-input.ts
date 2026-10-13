export type ConnectionKind = 'jira' | 'gitlab';

export interface ConnectionInput {
  kind: ConnectionKind;
  name: string;
  url: string;
  projects: string[];
  secretRef?: string;
}

export interface NormalizedConnection {
  kind: ConnectionKind;
  name: string;
  endpoint: string;
  projects: string[];
  secretRef: string;
}

export interface ConnectionRules {
  /** http:// accepted (demo mode / local test servers only). */
  allowHttp: boolean;
  /** EPI_SOURCE_HOSTS: when set, only these host[:port] values may receive a token. */
  allowedHosts: string[] | null;
}

/** Default secret reference names (names of server-side token files, never values). */
const DEFAULT_SECRET_REF: Record<ConnectionKind, string> = {
  jira: 'EPI_JIRA_TOKEN',
  gitlab: 'EPI_GITLAB_TOKEN',
};

const fail = (msg: string): never => {
  throw new Error(msg);
};

/** EPI_SOURCE_HOSTS ("jira.corp.example, gitlab.corp.example:8443") → lower-case host[:port]. */
export function parseSourceHosts(raw: string | undefined): string[] | null {
  const list = (raw ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  for (const h of list) {
    if (!/^[a-z0-9.-]+(:\d{1,5})?$/.test(h)) {
      fail(`Config: EPI_SOURCE_HOSTS entries are host names with an optional port, got "${h}"`);
    }
  }
  return list.length ? list : null;
}

/**
 * Validates a Jira/GitLab connection entered in the UI (ADR-033). EPI sends the source token to
 * this address, so: https only (unless the server allows http), no credentials or query in the
 * URL, and — when the server sets EPI_SOURCE_HOSTS — only allow-listed hosts.
 */
export function normalizeConnection(
  i: ConnectionInput,
  rules: ConnectionRules,
): NormalizedConnection {
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(i.name ?? '')) {
    fail('Name: 2–40 lower-case letters, digits or dashes (e.g. jira-main)');
  }
  let url: URL;
  try {
    url = new URL(i.url.trim());
  } catch {
    return fail('Enter a valid address, e.g. https://jira.corp.example');
  }
  const httpOk = rules.allowHttp && url.protocol === 'http:';
  if (url.protocol !== 'https:' && !httpOk) fail('The address must start with https://');
  if (url.username || url.password) {
    fail('Do not put a user name or password in the address; the token is a file on the server');
  }
  if (url.search || url.hash) fail('Remove the query (?…) or fragment (#…) from the address');
  const host = url.host.toLowerCase();
  if (rules.allowedHosts && !rules.allowedHosts.includes(host)) {
    fail(`${host} is not in this server's allowed source hosts (EPI_SOURCE_HOSTS)`);
  }
  const endpoint = `${url.protocol}//${host}${url.pathname.replace(/\/+$/, '')}`;

  const projects = (i.projects ?? []).map((p) => p.trim()).filter(Boolean);
  if (!projects.length) fail('Add at least one project');
  let normalized: string[];
  if (i.kind === 'jira') {
    normalized = projects.map((p) => p.toUpperCase());
    for (const p of normalized) {
      if (!/^[A-Z][A-Z0-9_]{1,19}$/.test(p)) fail(`"${p}" is not a Jira project key (e.g. PAY)`);
    }
  } else if (i.kind === 'gitlab') {
    if (projects.some((p) => !/^\d{1,12}$/.test(p))) {
      fail('GitLab projects are numeric project IDs (Project › Settings › General)');
    }
    normalized = projects;
  } else {
    return fail('Kind must be jira or gitlab');
  }
  const secretRef = i.secretRef?.trim() || DEFAULT_SECRET_REF[i.kind];
  if (!/^[A-Z][A-Z0-9_]{2,63}$/.test(secretRef)) {
    fail('The token secret name is upper-case letters, digits and _ (e.g. EPI_JIRA_TOKEN)');
  }
  return { kind: i.kind, name: i.name, endpoint, projects: [...new Set(normalized)], secretRef };
}
