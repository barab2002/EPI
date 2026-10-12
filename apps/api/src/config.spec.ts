import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from './config';

describe('loadConfig', () => {
  it('defaults to production mode with secure cookies and spec defaults', () => {
    const c = loadConfig({ DATABASE_URL: 'postgres://x' });
    expect(c.mode).toBe('production');
    expect(c.cookieSecure).toBe(true);
    expect(c.minimumAggregateSize).toBe(5);
    expect(c.kpiMinimumSample).toBe(10);
    expect(c.trendThresholdPct).toBe(8);
  });

  it('rejects an unknown mode and invalid numbers', () => {
    expect(() => loadConfig({ DATABASE_URL: 'x', EPI_MODE: 'dev' })).toThrow('EPI_MODE');
    expect(() => loadConfig({ DATABASE_URL: 'x', EPI_MIN_AGGREGATE_SIZE: '-1' })).toThrow(
      'EPI_MIN_AGGREGATE_SIZE',
    );
  });

  it('builds the database URL from a password file and URL-encodes it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'epi-'));
    const file = join(dir, 'pw');
    writeFileSync(file, 'p@ss/word\n');
    const c = loadConfig({ EPI_DB_HOST: 'postgres', EPI_DB_PASSWORD_FILE: file });
    expect(c.databaseUrl).toBe('postgres://epi:p%40ss%2Fword@postgres:5432/epi');
  });

  it('fails with an actionable message when no database is configured', () => {
    expect(() => loadConfig({})).toThrow('DATABASE_URL');
  });

  it('never includes the password in error messages', () => {
    expect(() =>
      loadConfig({ EPI_DB_HOST: 'h', EPI_DB_PASSWORD_FILE: '/nonexistent/secret' }),
    ).toThrow('not readable');
  });
});
