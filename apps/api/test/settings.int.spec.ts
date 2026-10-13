import type { INestApplication } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { FakeJira } from './fake-jira';
import { freshDatabase, login, Session, startApp } from './helpers';

/** Administration › Settings (ADR-033): connections edited in the UI, tokens never exposed. */
jest.setTimeout(120_000);

describe('Settings (integration)', () => {
  let ds: DataSource;
  let app: INestApplication;
  let admin: Session;
  let jira: FakeJira;
  const cred = randomBytes(16).toString('hex');

  const put = (s: Session, url: string, body: object) =>
    request(app.getHttpServer())
      .put(url)
      .set('Cookie', s.cookie)
      .set('x-csrf-token', s.csrf)
      .send(body);
  const lastAudit = async (action: string) =>
    (
      await ds.query(
        `SELECT metadata_json FROM audit_events WHERE action = $1 ORDER BY at DESC LIMIT 1`,
        [action],
      )
    )[0]?.metadata_json;

  beforeAll(async () => {
    process.env.EPI_JIRA_TOKEN = cred;
    ds = await freshDatabase();
    jira = new FakeJira(cred, () => new Date());
    jira.addIssue('ENG-1', { createdDaysAgo: 5, transitions: [['3', 3]] });
    await jira.start();
    app = await startApp(ds);
    admin = await login(app, ds, 'Avery Admin');
  });
  afterAll(async () => {
    delete process.env.EPI_JIRA_TOKEN;
    await app?.close();
    await jira?.stop();
    await ds?.destroy();
  });

  it('is admin-only and CSRF-protected', async () => {
    const lead = await login(app, ds, 'Taylor Lead');
    await lead.get('/api/v1/admin/settings').expect(403);
    await request(app.getHttpServer()).get('/api/v1/admin/settings').expect(401);
    await admin
      .post('/api/v1/admin/settings/connections', { kind: 'jira' }, { csrf: false })
      .expect(403);
  });

  it('shows read-only server settings, including the minimum group size of 3', async () => {
    const res = await admin.get('/api/v1/admin/settings').expect(200);
    expect(res.body.server).toMatchObject({
      mode: 'demo',
      minimumGroupSize: 3,
      retentionMonths: 24,
      signIn: null,
      directory: null,
    });
    expect(res.body.rules).toEqual({ httpAllowed: true, allowedHosts: null });
  });

  let id: string;
  it('adds a Jira connection; the token stays on the server and is only reported as present', async () => {
    const res = await admin
      .post('/api/v1/admin/settings/connections', {
        kind: 'jira',
        name: 'jira-main',
        url: `${jira.url}/`,
        projects: ['eng'],
      })
      .expect(201);
    id = res.body.id;
    const list = (await admin.get('/api/v1/admin/settings').expect(200)).body.connections;
    expect(list).toEqual([
      {
        id,
        kind: 'jira',
        name: 'jira-main',
        url: jira.url,
        enabled: true,
        projects: ['ENG'],
        secretRef: 'EPI_JIRA_TOKEN',
        tokenPresent: true,
      },
    ]);
    expect(JSON.stringify(list)).not.toContain(cred);
    expect(await lastAudit('integration.create')).toMatchObject({
      name: 'jira-main',
      projects: ['ENG'],
    });
    // The sync uses it like a CLI-created connection.
    await admin.post('/api/v1/admin/sync', { connection: 'jira-main' }).expect(202);
  });

  it('tests the connection with the server-side token', async () => {
    const ok = await admin.post(`/api/v1/admin/settings/connections/${id}/test`).expect(200);
    expect(ok.body.ok).toBe(true);
    expect(ok.body.summary).toMatch(/^Jira .*token accepted/);
  });

  it('refuses bad input with a readable message and duplicates', async () => {
    const bad = await admin
      .post('/api/v1/admin/settings/connections', {
        kind: 'jira',
        name: 'jira-2',
        url: 'https://user:pw@jira.corp.example',
        projects: ['ENG'],
      })
      .expect(400);
    expect(bad.body.message).toMatch(/user name or password/);
    await admin
      .post('/api/v1/admin/settings/connections', {
        kind: 'jira',
        name: 'jira-main',
        url: 'https://jira.corp.example',
        projects: ['ENG'],
      })
      .expect(409);
  });

  it('edits address, projects and on/off; host changes are audited; missing token is reported', async () => {
    await put(admin, `/api/v1/admin/settings/connections/${id}`, {
      url: 'https://jira.corp.example/jira',
      projects: ['ENG', 'pay'],
      enabled: false,
      secretRef: 'EPI_JIRA_TOKEN_NEW',
    }).expect(200);
    const [c] = (await admin.get('/api/v1/admin/settings').expect(200)).body.connections;
    expect(c).toMatchObject({
      url: 'https://jira.corp.example/jira',
      projects: ['ENG', 'PAY'],
      enabled: false,
      tokenPresent: false,
    });
    const [{ config_json }] = await ds.query(
      `SELECT config_json FROM integration_connections WHERE id = $1`,
      [id],
    );
    expect(config_json).toMatchObject({ storyPointsField: 'auto', backfillMonths: 6 }); // kept
    expect(await lastAudit('integration.update')).toMatchObject({
      name: 'jira-main',
      host: { from: new URL(jira.url).host, to: 'jira.corp.example' },
      enabled: false,
      secretRef: 'EPI_JIRA_TOKEN_NEW',
    });
    const res = await admin.post(`/api/v1/admin/settings/connections/${id}/test`).expect(200);
    expect(res.body).toEqual({
      ok: false,
      summary: expect.stringMatching(/EPI_JIRA_TOKEN_NEW is not provided/),
    });
  });

  it('only allows the hosts the server lists in EPI_SOURCE_HOSTS', async () => {
    const strict = await startApp(ds, { sourceHosts: ['jira.corp.example'] });
    try {
      const s = await login(strict, ds, 'Avery Admin');
      const r = await request(strict.getHttpServer())
        .put(`/api/v1/admin/settings/connections/${id}`)
        .set('Cookie', s.cookie)
        .set('x-csrf-token', s.csrf)
        .send({ url: 'https://attacker.example', projects: ['ENG'], enabled: true })
        .expect(400);
      expect(r.body.message).toMatch(/EPI_SOURCE_HOSTS/);
      const [{ endpoint }] = await ds.query(
        `SELECT endpoint FROM integration_connections WHERE id = $1`,
        [id],
      );
      expect(endpoint).toBe('https://jira.corp.example/jira'); // unchanged
    } finally {
      await strict.close();
    }
  });
});
