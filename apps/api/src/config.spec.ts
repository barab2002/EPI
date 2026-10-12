import { randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from './config';

function secretFile(value: string): string {
  const file = join(mkdtempSync(join(tmpdir(), 'epi-')), 'secret');
  writeFileSync(file, value);
  return file;
}

const clientSecretValue = randomBytes(12).toString('hex');

const oidcEnv = () => ({
  EPI_OIDC_ISSUER: 'https://sso.internal.example/realms/epi',
  EPI_OIDC_CLIENT_ID: 'epi-web',
  EPI_OIDC_CLIENT_SECRET_FILE: secretFile(`${clientSecretValue}\n`),
});

describe('loadConfig', () => {
  it('applies spec defaults (demo mode, no OIDC)', () => {
    const c = loadConfig({ DATABASE_URL: 'postgres://x', EPI_MODE: 'demo' });
    expect(c.cookieSecure).toBe(false);
    expect(c.oidc).toBeNull();
    expect(c.publicUrl).toBe('http://127.0.0.1:8080');
    expect(c.minimumAggregateSize).toBe(5);
    expect(c.kpiMinimumSample).toBe(10);
    expect(c.trendThresholdPct).toBe(8);
  });

  it('defaults to production mode, which requires OIDC', () => {
    expect(() => loadConfig({ DATABASE_URL: 'x' })).toThrow('production mode requires OIDC');
  });

  it('accepts a complete production configuration with secure cookies', () => {
    const c = loadConfig({
      DATABASE_URL: 'x',
      EPI_PUBLIC_URL: 'https://epi.internal.example/',
      ...oidcEnv(),
    });
    expect(c.mode).toBe('production');
    expect(c.cookieSecure).toBe(true);
    expect(c.publicUrl).toBe('https://epi.internal.example');
    expect(c.oidc).toMatchObject({ clientId: 'epi-web', clientSecret: clientSecretValue });
    expect(c.oidc?.linkByVerifiedEmail).toBe(false);
  });

  it('refuses http public URLs and http issuers in production', () => {
    expect(() =>
      loadConfig({ DATABASE_URL: 'x', EPI_PUBLIC_URL: 'http://epi', ...oidcEnv() }),
    ).toThrow('EPI_PUBLIC_URL must be https');
    expect(() =>
      loadConfig({
        DATABASE_URL: 'x',
        EPI_PUBLIC_URL: 'https://epi',
        ...oidcEnv(),
        EPI_OIDC_ISSUER: 'http://kc/realms/epi',
        EPI_OIDC_ALLOW_HTTP: 'true',
      }),
    ).toThrow('EPI_OIDC_ALLOW_HTTP is not allowed');
  });

  it('requires https issuers unless explicitly allowed for a local test realm', () => {
    const env = { DATABASE_URL: 'x', EPI_MODE: 'demo', ...oidcEnv(), EPI_OIDC_ISSUER: 'http://kc' };
    expect(() => loadConfig(env)).toThrow('must use https');
    expect(loadConfig({ ...env, EPI_OIDC_ALLOW_HTTP: 'true' }).oidc?.allowHttp).toBe(true);
  });

  it('rejects partial OIDC configuration', () => {
    expect(() =>
      loadConfig({ DATABASE_URL: 'x', EPI_MODE: 'demo', EPI_OIDC_ISSUER: 'https://kc' }),
    ).toThrow('OIDC needs all of');
  });

  it('rejects an unknown mode and invalid numbers', () => {
    expect(() => loadConfig({ DATABASE_URL: 'x', EPI_MODE: 'dev' })).toThrow('EPI_MODE');
    expect(() =>
      loadConfig({ DATABASE_URL: 'x', EPI_MODE: 'demo', EPI_MIN_AGGREGATE_SIZE: '-1' }),
    ).toThrow('EPI_MIN_AGGREGATE_SIZE');
  });

  it('builds the database URL from a password file and URL-encodes it', () => {
    const c = loadConfig({
      EPI_MODE: 'demo',
      EPI_DB_HOST: 'postgres',
      EPI_DB_PASSWORD_FILE: secretFile('p@ss/word\n'),
    });
    expect(c.databaseUrl).toBe('postgres://epi:p%40ss%2Fword@postgres:5432/epi');
  });

  it('fails with an actionable message when no database is configured', () => {
    expect(() => loadConfig({})).toThrow('DATABASE_URL');
  });

  it('never includes secret values or paths contents in error messages', () => {
    expect(() =>
      loadConfig({ EPI_DB_HOST: 'h', EPI_DB_PASSWORD_FILE: '/nonexistent/secret' }),
    ).toThrow('EPI_DB_PASSWORD_FILE is not readable');
  });
});
