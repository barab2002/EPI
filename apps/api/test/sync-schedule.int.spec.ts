import type { INestApplication } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AuditService } from '../src/audit/audit.service';
import { EPI_CONFIG } from '../src/config';
import { GitLabSync } from '../src/ingestion/gitlab/gitlab.sync';
import { JiraSync } from '../src/ingestion/jira/jira.sync';
import { SyncScheduler } from '../src/ingestion/sync-scheduler';
import { FakeGitLab } from './fake-gitlab';
import { FakeJira } from './fake-jira';
import { freshDatabase, login, Session, startApp } from './helpers';

/** Daily scheduled sync: admin API, once-per-day claim, failure isolation, audit. */
jest.setTimeout(120_000);

describe('Scheduled sync (integration)', () => {
  let ds: DataSource;
  let app: INestApplication;
  let jira: FakeJira;
  let gl: FakeGitLab;
  let admin: Session;
  let scheduler: SyncScheduler;
  const jiraCred = randomBytes(16).toString('hex');
  const glCred = randomBytes(16).toString('hex');

  const put = (s: Session, body: object, csrf = true) => {
    const r = request(app.getHttpServer())
      .put('/api/v1/admin/sync-schedule')
      .set('Cookie', s.cookie);
    if (csrf) r.set('x-csrf-token', s.csrf);
    return r.send(body);
  };
  const runCount = async (name: string) => {
    const [r] = await ds.query(
      `SELECT count(*)::int AS n FROM sync_runs r JOIN integration_connections c ON c.id = r.connection_id
       WHERE c.name = $1`,
      [name],
    );
    return r.n as number;
  };

  beforeAll(async () => {
    process.env.EPI_JIRA_TOKEN = jiraCred;
    process.env.EPI_GITLAB_TOKEN = glCred;
    ds = await freshDatabase();
    jira = new FakeJira(jiraCred, () => new Date());
    jira.addIssue('ENG-1', { createdDaysAgo: 5, transitions: [['3', 3]] });
    await jira.start();
    gl = new FakeGitLab(glCred);
    gl.addMergeRequest(42, 1, {
      author: { id: 7, username: 'dana' },
      createdAt: new Date(Date.now() - 2 * 86_400_000),
    });
    await gl.start();
    await ds.query(
      `INSERT INTO integration_connections(kind, name, endpoint, config_json, secret_ref, enabled) VALUES
         ('jira', 'jira-main', $1, '{"projectKeys":["ENG"]}', 'EPI_JIRA_TOKEN', true),
         ('gitlab', 'gitlab-main', $2, '{"projectIds":["42"]}', 'EPI_GITLAB_TOKEN', true),
         ('jira', 'jira-broken', $1, '{"projectKeys":["ENG"]}', 'EPI_MISSING_TOKEN', true),
         ('jira', 'jira-off', $1, '{"projectKeys":["ENG"]}', 'EPI_JIRA_TOKEN', false)`,
      [jira.url, gl.url],
    );
    app = await startApp(ds);
    admin = await login(app, ds, 'Avery Admin');
    scheduler = app.get(SyncScheduler);
  });

  afterAll(async () => {
    delete process.env.EPI_JIRA_TOKEN;
    delete process.env.EPI_GITLAB_TOKEN;
    await app.close();
    await jira.stop();
    await gl.stop();
    await ds.destroy();
  });

  it('is admin-only', async () => {
    const lead = await login(app, ds, 'Taylor Lead');
    await lead.get('/api/v1/admin/sync-schedule').expect(403);
    await put(lead, { enabled: true, hourLocal: 2, timezone: 'UTC' }).expect(403);
  });

  it('starts disabled, and reports that the scheduler is off in this process', async () => {
    const res = await admin.get('/api/v1/admin/sync-schedule').expect(200);
    expect(res.body).toMatchObject({
      enabled: false,
      hourLocal: 2,
      timezone: 'UTC',
      lastRunDate: null,
      schedulerActive: false,
      nextRunAt: null,
    });
    expect(await scheduler.tick(new Date('2026-10-13T05:00:00Z'))).toBeNull();
  });

  it('validates input and requires the CSRF header', async () => {
    await put(admin, { enabled: true, hourLocal: 24, timezone: 'UTC' }).expect(400);
    await put(admin, { enabled: true, hourLocal: 1.5, timezone: 'UTC' }).expect(400);
    await put(admin, { enabled: 'yes', hourLocal: 2, timezone: 'UTC' }).expect(400);
    await put(admin, { enabled: true, hourLocal: 2, timezone: 'Mars/Olympus' }).expect(400);
    await put(admin, { enabled: true, hourLocal: 2, timezone: 'UTC' }, false).expect(403);
    const [a] = await ds.query(
      `SELECT count(*)::int AS n FROM audit_events WHERE action = 'sync_schedule.update'`,
    );
    expect(a.n).toBe(0);
  });

  it('saves a valid schedule and audits it', async () => {
    const res = await put(admin, {
      enabled: true,
      hourLocal: 3,
      timezone: 'Asia/Jerusalem',
    }).expect(200);
    expect(res.body).toMatchObject({ enabled: true, hourLocal: 3, timezone: 'Asia/Jerusalem' });
    const [a] = await ds.query(
      `SELECT actor_user_id, metadata_json FROM audit_events WHERE action = 'sync_schedule.update'`,
    );
    expect(a.metadata_json).toEqual({ enabled: true, hourLocal: 3, timezone: 'Asia/Jerusalem' });
    expect(a.actor_user_id).toBeTruthy();
  });

  it('does nothing before the local hour', async () => {
    // 23:59Z on the 12th = 02:59 on the 13th in Jerusalem (UTC+3).
    expect(await scheduler.tick(new Date('2026-10-12T23:59:00Z'))).toBeNull();
    expect(await runCount('jira-main')).toBe(0);
  });

  it('runs every enabled connection once, isolating failures', async () => {
    const outcomes = await scheduler.tick(new Date('2026-10-13T00:00:00Z'));
    expect(outcomes).toEqual([
      { connection: 'gitlab-main', status: 'succeeded' },
      expect.objectContaining({ connection: 'jira-broken', status: 'failed' }),
      { connection: 'jira-main', status: 'succeeded' },
    ]);
    expect(await runCount('jira-off')).toBe(0);
    const [cursor] = await ds.query(
      `SELECT count(*)::int AS n FROM sync_cursors s JOIN integration_connections c ON c.id = s.connection_id
       WHERE c.name = 'jira-broken'`,
    );
    expect(cursor.n).toBe(0);
    const [a] = await ds.query(
      `SELECT actor_user_id, metadata_json FROM audit_events WHERE action = 'sync.scheduled'`,
    );
    expect(a.actor_user_id).toBeNull();
    expect(a.metadata_json).toMatchObject({
      date: '2026-10-13',
      connections: 3,
      succeeded: 2,
      failed: 1,
    });
    expect(JSON.stringify(a.metadata_json)).not.toContain(jiraCred);
  });

  it('does not run twice on the same local day, even after the schedule is edited', async () => {
    expect(await scheduler.tick(new Date('2026-10-13T10:00:00Z'))).toBeNull();
    await put(admin, { enabled: true, hourLocal: 1, timezone: 'Asia/Jerusalem' }).expect(200);
    expect(await scheduler.tick(new Date('2026-10-13T11:00:00Z'))).toBeNull();
    const res = await admin.get('/api/v1/admin/sync-schedule').expect(200);
    expect(res.body.lastRunDate).toBe('2026-10-13');
    expect(await runCount('jira-main')).toBe(1);
  });

  it('lets only one of two processes claim a day', async () => {
    const other = new SyncScheduler(
      ds,
      app.get(EPI_CONFIG),
      app.get(AuditService),
      app.get(JiraSync),
      app.get(GitLabSync),
    );
    const now = new Date('2026-10-14T00:00:00Z');
    const [a, b] = await Promise.all([scheduler.tick(now), other.tick(now)]);
    expect([a, b].filter((r) => r !== null)).toHaveLength(1);
    expect(await runCount('jira-main')).toBe(2);
  });

  it('skips a connection that is already syncing', async () => {
    const [c] = await ds.query(`SELECT id FROM integration_connections WHERE name = 'jira-main'`);
    await ds.query(
      `INSERT INTO sync_runs(connection_id, started_at, status) VALUES ($1, now(), 'running')`,
      [c.id],
    );
    const outcomes = await scheduler.tick(new Date('2026-10-15T00:00:00Z'));
    expect(outcomes).toContainEqual(
      expect.objectContaining({ connection: 'jira-main', status: 'skipped' }),
    );
    expect(outcomes).toContainEqual({ connection: 'gitlab-main', status: 'succeeded' });
  });

  it('stops when disabled', async () => {
    await put(admin, { enabled: false, hourLocal: 1, timezone: 'Asia/Jerusalem' }).expect(200);
    expect(await scheduler.tick(new Date('2026-10-16T00:00:00Z'))).toBeNull();
  });
});
