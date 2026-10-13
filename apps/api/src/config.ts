import { readFileSync } from 'node:fs';

/** Runtime configuration from environment variables. Secrets are never logged. */
export type EpiMode = 'demo' | 'production';

export interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** Allow http:// issuer. Only for local test realms; refused in production mode. */
  allowHttp: boolean;
  /**
   * Optional server-side base URL for the provider (split horizon, e.g. `http://keycloak:8080`
   * inside Compose). Only EPI's back-channel calls are routed there; the issuer is unchanged.
   */
  internalUrl: string | null;
  /** Link a first-time login to an existing EPI user by verified e-mail (security-owner decision). */
  linkByVerifiedEmail: boolean;
}

export interface EpiConfig {
  mode: EpiMode;
  /** External base URL users reach EPI at; used for the OIDC redirect URI. */
  publicUrl: string;
  oidc: OidcConfig | null;
  port: number;
  databaseUrl: string;
  webDist: string | null;
  cookieSecure: boolean;
  sessionIdleMinutes: number;
  minimumAggregateSize: number;
  kpiMinimumSample: number;
  kpiLowConfidenceFloor: number;
  trendThresholdPct: number;
  /** Run the in-process daily sync scheduler (EPI_SYNC_SCHEDULER=off disables it). */
  syncScheduler: boolean;
}

function int(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0)
    throw new Error(`Config: ${name} must be a non-negative integer`);
  return n;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): EpiConfig {
  const mode = (env.EPI_MODE ?? 'production') as EpiMode;
  if (mode !== 'demo' && mode !== 'production') {
    throw new Error(`Config: EPI_MODE must be "demo" or "production"`);
  }
  const databaseUrl = resolveDatabaseUrl(env);
  const port = int(env, 'PORT', 8080);
  const publicUrl = (env.EPI_PUBLIC_URL || `http://127.0.0.1:${port}`).replace(/\/+$/, '');
  const oidc = resolveOidc(env);
  if (mode === 'production') {
    if (!oidc) {
      throw new Error(
        'Config: production mode requires OIDC (EPI_OIDC_ISSUER, EPI_OIDC_CLIENT_ID, EPI_OIDC_CLIENT_SECRET_FILE)',
      );
    }
    if (oidc.allowHttp)
      throw new Error('Config: EPI_OIDC_ALLOW_HTTP is not allowed in production mode');
    if (!publicUrl.startsWith('https://')) {
      throw new Error('Config: EPI_PUBLIC_URL must be https:// in production mode');
    }
  }
  return {
    mode,
    publicUrl,
    oidc,
    port,
    databaseUrl,
    webDist: env.EPI_WEB_DIST || null,
    cookieSecure: (env.EPI_COOKIE_SECURE ?? (mode === 'production' ? 'true' : 'false')) === 'true',
    sessionIdleMinutes: int(env, 'EPI_SESSION_IDLE_MINUTES', 30),
    minimumAggregateSize: int(env, 'EPI_MIN_AGGREGATE_SIZE', 5),
    kpiMinimumSample: int(env, 'EPI_KPI_MIN_SAMPLE', 10),
    kpiLowConfidenceFloor: int(env, 'EPI_KPI_LOW_CONFIDENCE_FLOOR', 5),
    trendThresholdPct: int(env, 'EPI_TREND_THRESHOLD_PCT', 8),
    syncScheduler: syncSchedulerFlag(env.EPI_SYNC_SCHEDULER),
  };
}

function syncSchedulerFlag(raw: string | undefined): boolean {
  if (raw === undefined || raw === '' || raw === 'on') return true;
  if (raw === 'off') return false;
  throw new Error('Config: EPI_SYNC_SCHEDULER must be "on" or "off"');
}

function readSecretFile(name: string, path: string): string {
  let value: string;
  try {
    value = readFileSync(path, 'utf8').trim();
  } catch {
    throw new Error(`Config: ${name} is not readable`);
  }
  if (!value) throw new Error(`Config: ${name} is empty`);
  return value;
}

function resolveOidc(env: NodeJS.ProcessEnv): OidcConfig | null {
  const issuer = env.EPI_OIDC_ISSUER;
  const clientId = env.EPI_OIDC_CLIENT_ID;
  const secretFile = env.EPI_OIDC_CLIENT_SECRET_FILE;
  if (!issuer && !clientId && !secretFile) return null;
  if (!issuer || !clientId || !secretFile) {
    throw new Error(
      'Config: OIDC needs all of EPI_OIDC_ISSUER, EPI_OIDC_CLIENT_ID and EPI_OIDC_CLIENT_SECRET_FILE',
    );
  }
  let url: URL;
  try {
    url = new URL(issuer);
  } catch {
    throw new Error('Config: EPI_OIDC_ISSUER is not a valid URL');
  }
  const allowHttp = env.EPI_OIDC_ALLOW_HTTP === 'true';
  if (url.protocol !== 'https:' && !allowHttp) {
    throw new Error(
      'Config: EPI_OIDC_ISSUER must use https (EPI_OIDC_ALLOW_HTTP=true only for local test realms)',
    );
  }
  let internalUrl: string | null = null;
  if (env.EPI_OIDC_INTERNAL_URL) {
    try {
      internalUrl = new URL(env.EPI_OIDC_INTERNAL_URL).origin;
    } catch {
      throw new Error('Config: EPI_OIDC_INTERNAL_URL is not a valid URL');
    }
  }
  return {
    issuer: issuer.replace(/\/+$/, ''),
    internalUrl,
    clientId,
    clientSecret: readSecretFile('EPI_OIDC_CLIENT_SECRET_FILE', secretFile),
    allowHttp,
    linkByVerifiedEmail: env.EPI_OIDC_LINK_BY_VERIFIED_EMAIL === 'true',
  };
}

/**
 * DATABASE_URL, or assembled from EPI_DB_HOST + a password read from EPI_DB_PASSWORD_FILE
 * (Docker/Compose secrets) so the password never appears in environment listings.
 */
function resolveDatabaseUrl(env: NodeJS.ProcessEnv): string {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  if (env.EPI_DB_HOST && env.EPI_DB_PASSWORD_FILE) {
    const password = readSecretFile('EPI_DB_PASSWORD_FILE', env.EPI_DB_PASSWORD_FILE);
    const user = encodeURIComponent(env.EPI_DB_USER ?? 'epi');
    const db = encodeURIComponent(env.EPI_DB_NAME ?? 'epi');
    const port = int(env, 'EPI_DB_PORT', 5432);
    return `postgres://${user}:${encodeURIComponent(password)}@${env.EPI_DB_HOST}:${port}/${db}`;
  }
  throw new Error('Config: set DATABASE_URL, or EPI_DB_HOST and EPI_DB_PASSWORD_FILE');
}

export const EPI_CONFIG = Symbol('EPI_CONFIG');
