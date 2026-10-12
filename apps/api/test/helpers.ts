import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createApp } from '../src/bootstrap';
import { EpiConfig, loadConfig } from '../src/config';
import { createDataSource } from '../src/db/data-source';
import { seedDemo } from '../src/seed/demo-seed';

/** Fixed clock for deterministic synthetic data. */
export const SEED_NOW = new Date('2026-10-01T12:00:00Z');

export function testDatabaseUrl(): string {
  const url = process.env.EPI_TEST_DATABASE_URL;
  if (!url) throw new Error('EPI_TEST_DATABASE_URL not set — run via scripts/test-db.sh');
  return url;
}

/** Drops and recreates the public schema, runs migrations and optionally seeds demo data. */
export async function freshDatabase(seed = true): Promise<DataSource> {
  const ds = await createDataSource(testDatabaseUrl()).initialize();
  await ds.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await ds.runMigrations({ transaction: 'each' });
  if (seed) await seedDemo(ds, SEED_NOW);
  return ds;
}

export function testConfig(overrides: Partial<EpiConfig> = {}): EpiConfig {
  return {
    ...loadConfig({ DATABASE_URL: testDatabaseUrl(), EPI_MODE: 'demo' }),
    ...overrides,
  };
}

export async function startApp(ds: DataSource, overrides: Partial<EpiConfig> = {}) {
  const app = await createApp(testConfig(overrides), ds, { logger: false });
  await app.init();
  return app;
}

export async function userId(ds: DataSource, displayName: string): Promise<string> {
  const [row] = await ds.query(`SELECT id FROM users WHERE display_name = $1`, [displayName]);
  if (!row) throw new Error(`no user ${displayName}`);
  return row.id;
}

export async function entityId(ds: DataSource, table: 'teams' | 'org_groups', name: string) {
  const [row] = await ds.query(`SELECT id FROM ${table} WHERE name = $1`, [name]);
  if (!row) throw new Error(`no ${table} ${name}`);
  return row.id as string;
}

export interface Session {
  cookie: string;
  csrf: string;
  get: (url: string) => request.Test;
  post: (url: string, body?: object, opts?: { csrf?: boolean }) => request.Test;
}

/** Signs in through the demo endpoint and returns a helper bound to that session. */
export async function login(app: INestApplication, ds: DataSource, name: string): Promise<Session> {
  const id = await userId(ds, name);
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/demo-login')
    .send({ userId: id })
    .expect(204);
  const setCookie = res.headers['set-cookie'] as unknown as string[];
  const cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
  const me = await request(app.getHttpServer()).get('/api/v1/me').set('Cookie', cookie).expect(200);
  const csrf = me.body.csrfToken as string;
  const server = app.getHttpServer();
  return {
    cookie,
    csrf,
    get: (url) => request(server).get(url).set('Cookie', cookie),
    post: (url, body = {}, opts = {}) => {
      const r = request(server).post(url).set('Cookie', cookie);
      if (opts.csrf !== false) r.set('x-csrf-token', csrf);
      return r.send(body);
    },
  };
}
