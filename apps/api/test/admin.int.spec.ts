import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import { FakeJira } from './fake-jira';
import { freshDatabase, login, Session, startApp } from './helpers';

/** Admin integration endpoints: role enforcement, background sync, status-mapping overrides. */
jest.setTimeout(120_000);

describe('Admin integration API (integration)', () => {
  let ds: DataSource;
  let app: INestApplication;
  let jira: FakeJira;
  let admin: Session;
  const token = randomBytes(16).toString('hex');

  beforeAll(async () => {
    process.env.EPI_JIRA_TOKEN = token;
    ds = await freshDatabase();
    jira = new FakeJira(token, () => new Date());
    for (let n = 1; n <= 5; n++) {
      jira.addIssue(`ENG-${n}`, {
        createdDaysAgo: 20,
        transitions: [
          ['3', 10],
          ['10010', 8],
          ['6', 5],
        ],
      });
    }
    await jira.start();
    await ds.query(
      `INSERT INTO integration_connections(kind, name, endpoint, config_json, secret_ref)
       VALUES ('jira', 'jira-main', $1, '{"projectKeys":["ENG"]}', 'EPI_JIRA_TOKEN')`,
      [jira.url],
    );
    app = await startApp(ds);
    admin = await login(app, ds, 'Avery Admin');
  });

  afterAll(async () => {
    delete process.env.EPI_JIRA_TOKEN;
    await app.close();
    await jira.stop();
    await ds.destroy();
  });

  it('forbids non-admins on every admin route', async () => {
    const lead = await login(app, ds, 'Taylor Lead');
    await lead.get('/api/v1/admin/integrations').expect(403);
    await lead.get('/api/v1/admin/sync-runs').expect(403);
    await lead.get('/api/v1/admin/status-mappings').expect(403);
    await lead.post('/api/v1/admin/sync', { connection: 'jira-main' }).expect(403);
  });

  it('lists connections with the secret reference name only', async () => {
    const res = await admin.get('/api/v1/admin/integrations').expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      name: 'jira-main',
      kind: 'jira',
      secret_ref: 'EPI_JIRA_TOKEN',
    });
    expect(JSON.stringify(res.body)).not.toContain(token);
  });

  it('starts a background sync, which completes and is audited', async () => {
    const res = await admin.post('/api/v1/admin/sync', { connection: 'jira-main' }).expect(202);
    expect(res.body.runId).toBeTruthy();
    let status = 'running';
    for (let i = 0; i < 50 && status === 'running'; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const runs = await admin.get('/api/v1/admin/sync-runs?connection=jira-main').expect(200);
      status = runs.body.find((r: { id: string }) => r.id === res.body.runId)?.status;
    }
    expect(status).toBe('succeeded');
    const [a] = await ds.query(
      `SELECT count(*)::int AS n FROM audit_events WHERE action = 'sync.start'`,
    );
    expect(a.n).toBe(1);
  });

  it('rejects a second sync while one is running and unknown connections', async () => {
    const [c] = await ds.query(`SELECT id FROM integration_connections WHERE name = 'jira-main'`);
    await ds.query(
      `INSERT INTO sync_runs(connection_id, started_at, status) VALUES ($1, now(), 'running')`,
      [c.id],
    );
    await admin.post('/api/v1/admin/sync', { connection: 'jira-main' }).expect(409);
    await ds.query(`DELETE FROM sync_runs WHERE status = 'running'`);
    await admin.post('/api/v1/admin/sync', { connection: 'nope' }).expect(404);
    await admin
      .post('/api/v1/admin/sync', { connection: 'jira-main' }, { csrf: false })
      .expect(403);
  });

  it('lets an admin override a status mapping (validated, audited)', async () => {
    const list = await admin.get('/api/v1/admin/status-mappings?connection=jira-main').expect(200);
    expect(
      list.body.find((m: { source_status_id: string }) => m.source_status_id === '10010'),
    ).toMatchObject({
      category: 'IN_PROGRESS',
      origin: 'inferred',
    });
    const server = app.getHttpServer();
    const res = await supertest(server)
      .put('/api/v1/admin/status-mappings/jira-main/10010')
      .set('Cookie', admin.cookie)
      .set('x-csrf-token', admin.csrf)
      .send({ category: 'REVIEW' })
      .expect(200);
    expect(res.body).toMatchObject({
      statusName: 'In Review',
      category: 'REVIEW',
      origin: 'admin',
    });
    await supertest(server)
      .put('/api/v1/admin/status-mappings/jira-main/10010')
      .set('Cookie', admin.cookie)
      .set('x-csrf-token', admin.csrf)
      .send({ category: 'SOMETHING' })
      .expect(400);
    await supertest(server)
      .put('/api/v1/admin/status-mappings/jira-main/10010')
      .set('Cookie', admin.cookie)
      .set('x-csrf-token', admin.csrf)
      .send({})
      .expect(400);
    await supertest(server)
      .put('/api/v1/admin/status-mappings/jira-main/9999')
      .set('Cookie', admin.cookie)
      .set('x-csrf-token', admin.csrf)
      .send({ category: 'QA' })
      .expect(404);
    const [a] = await ds.query(
      `SELECT count(*)::int AS n FROM audit_events WHERE action = 'status_mapping.update'`,
    );
    expect(a.n).toBe(1);
  });
});
