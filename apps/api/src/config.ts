/** Runtime configuration from environment variables. Secrets are never logged. */
export type EpiMode = 'demo' | 'production';

export interface EpiConfig {
  mode: EpiMode;
  port: number;
  databaseUrl: string;
  webDist: string | null;
  cookieSecure: boolean;
  sessionIdleMinutes: number;
  minimumAggregateSize: number;
  kpiMinimumSample: number;
  kpiLowConfidenceFloor: number;
  trendThresholdPct: number;
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
  const databaseUrl = env.DATABASE_URL ?? '';
  if (!databaseUrl) throw new Error('Config: DATABASE_URL is required');
  return {
    mode,
    port: int(env, 'PORT', 8080),
    databaseUrl,
    webDist: env.EPI_WEB_DIST || null,
    cookieSecure: (env.EPI_COOKIE_SECURE ?? (mode === 'production' ? 'true' : 'false')) === 'true',
    sessionIdleMinutes: int(env, 'EPI_SESSION_IDLE_MINUTES', 30),
    minimumAggregateSize: int(env, 'EPI_MIN_AGGREGATE_SIZE', 5),
    kpiMinimumSample: int(env, 'EPI_KPI_MIN_SAMPLE', 10),
    kpiLowConfidenceFloor: int(env, 'EPI_KPI_LOW_CONFIDENCE_FLOOR', 5),
    trendThresholdPct: int(env, 'EPI_TREND_THRESHOLD_PCT', 8),
  };
}

export const EPI_CONFIG = Symbol('EPI_CONFIG');
