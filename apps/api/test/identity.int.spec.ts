import type { INestApplication } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import supertest from 'supertest';
import { DataSource } from 'typeorm';
import { GitLabSync } from '../src/ingestion/gitlab/gitlab.sync';
import { JiraSync } from '../src/ingestion/jira/jira.sync';
import { FakeGitLab } from './fake-gitlab';
import { FakeJira } from './fake-jira';
import { freshDatabase, login, Session, startApp } from './helpers';

/** EPI-008: identity mapping + data quality, end to end through both collectors and the API. */
jest.setTimeout(120_000);

const policy = { maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 2, timeoutMs: 5_000 };
const H = 3_600_000;

describe('Identity mapping & data quality (integration)', () => {
  let ds: DataSource;
  let app: INestApplication;
  let admin: Session;
  let jira: FakeJira;
  let gl: FakeGitLab;
  const ids: Record<string, string> = {};
  const token = randomBytes(16).toString('hex');
  const now = new Date();

  const put = (path: string, body: object, s: Session = admin) =>
    supertest(app.getHttpServer())
      .put(path)
      .set('Cookie', s.cookie)
      .set('x-csrf-token', s.csrf)
      .send(body);
  const del = (path: string, s: Session = admin) =>
    supertest(app.getHttpServer()).delete(path).set('Cookie', s.cookie).set('x-csrf-token', s.csrf);

  beforeAll(async () => {
    ds = await freshDatabase(false);
    const mk = async (name: string) =>
      (
        await ds.query(
          `INSERT INTO users(display_name, is_synthetic) VALUES ($1, true) RETURNING id`,
          [name],
        )
      )[0].id as string;
    ids.admin = await mk('Ada Admin');
    ids.dana = await mk('Dana Person');
    ids.lee = await mk('Lee Person');
    ids.plain = await mk('Plain Developer');
    await ds.query(
      `INSERT INTO role_assignments(user_id, role, scope_type) VALUES ($1, 'ADMIN', 'SYSTEM')`,
      [ids.admin],
    );

    jira = new FakeJira(token, () => now);
    for (let n = 1; n <= 6; n++) {
      jira.addIssue(`ENG-${n}`, {
        assignee: n <= 4 ? 'JIRAUSER1' : 'JIRAUSER2',
        createdDaysAgo: 20,
        transitions: [
          ['3', 10],
          ['6', 5],
        ],
      });
    }
    await jira.start();
    gl = new FakeGitLab(token);
    const dana = { id: 501, username: 'dana', name: 'Dana P' };
    const lee = { id: 502, username: 'lee', name: 'Lee P' };
    const bot = { id: 900, username: 'project_1_bot', bot: true };
    for (let i = 1; i <= 3; i++) {
      const c = new Date(now.getTime() - (5 + i) * 24 * H);
      gl.addMergeRequest(1, i, { author: dana, createdAt: c, branch: `eng-${i}-x` });
      gl.addNote(1, i, dana, c, 'requested review from @lee', true);
      gl.addNote(1, i, bot, new Date(c.getTime() + H), 'pipeline');
      gl.addNote(1, i, lee, new Date(c.getTime() + 2 * H), 'review');
    }
    await gl.start();
    await ds.query(
      `INSERT INTO integration_connections(kind, name, endpoint, config_json, secret_ref) VALUES
       ('jira', 'jira-main', $1, '{"projectKeys":["ENG"]}', 'EPI_JIRA_TOKEN'),
       ('gitlab', 'gitlab-main', $2, '{"projectIds":["1"]}', 'EPI_GITLAB_TOKEN')`,
      [jira.url, gl.url],
    );
    const env = { EPI_JIRA_TOKEN: token, EPI_GITLAB_TOKEN: token };
    expect((await new JiraSync(ds, { policy, env }).run('jira-main')).status).toBe('succeeded');
    expect((await new GitLabSync(ds, { policy, env }).run('gitlab-main')).status).toBe('succeeded');
    app = await startApp(ds);
    admin = await login(app, ds, 'Ada Admin');
  });

  afterAll(async () => {
    await app.close();
    await jira.stop();
    await gl.stop();
    await ds.destroy();
  });

  it('restricts every identity route to administrators', async () => {
    const dev = await login(app, ds, 'Plain Developer');
    await dev.get('/api/v1/admin/accounts').expect(403);
    await dev.get('/api/v1/admin/users').expect(403);
    await dev.get('/api/v1/admin/data-quality').expect(403);
    await put('/api/v1/admin/accounts/jira/JIRAUSER1/mapping', { userId: ids.dana }, dev).expect(
      403,
    );
    await del('/api/v1/admin/accounts/jira/JIRAUSER1/mapping', dev).expect(403);
  });

  it('lists unmapped accounts seen in syncs with activity, hiding bots by default', async () => {
    const res = await admin.get('/api/v1/admin/accounts').expect(200);
    const byId = Object.fromEntries(
      res.body.map((a: { source: string; external_id: string }) => [
        `${a.source}:${a.external_id}`,
        a,
      ]),
    );
    expect(Object.keys(byId).sort()).toEqual([
      'gitlab:501',
      'gitlab:502',
      'jira:JIRAUSER1',
      'jira:JIRAUSER2',
    ]);
    expect(byId['jira:JIRAUSER1']).toMatchObject({
      activity: 4,
      display_name: 'Synthetic',
      user_id: null,
    });
    expect(byId['gitlab:501']).toMatchObject({ display_name: 'Dana P (@dana)', activity: 3 });
    // Lee: 3 reviewer requests addressed to them + 3 review notes
    expect(byId['gitlab:502']).toMatchObject({ display_name: 'Lee P (@lee)', activity: 6 });
    const withBots = await admin.get('/api/v1/admin/accounts?include_bots=true').expect(200);
    expect(
      withBots.body.some(
        (a: { external_id: string; is_bot: boolean }) => a.external_id === '900' && a.is_bot,
      ),
    ).toBe(true);
  });

  it('reports data quality before mapping', async () => {
    const dq = (await admin.get('/api/v1/admin/data-quality').expect(200)).body;
    expect(dq.connections.map((c: { name: string; stale: boolean }) => [c.name, c.stale])).toEqual([
      ['gitlab-main', false],
      ['jira-main', false],
    ]);
    expect(dq.jira).toMatchObject({
      workItems: 6,
      withAssignee: 6,
      mappedAssignees: 0,
      assigneeCoveragePct: 0,
      unmappedAccounts: 2,
    });
    expect(dq.gitlab).toMatchObject({
      mergeRequests: 3,
      mappedAuthors: 0,
      authorCoveragePct: 0,
      linkedToJira: 3,
      jiraLinkPct: 100,
      unmappedAccounts: 2,
    });
  });

  it('maps accounts, re-attributes existing data and audits the change', async () => {
    const j = await put('/api/v1/admin/accounts/jira/JIRAUSER1/mapping', {
      userId: ids.dana,
    }).expect(200);
    expect(j.body).toMatchObject({ reattributed: 4 });
    const g = await put('/api/v1/admin/accounts/gitlab/501/mapping', { userId: ids.dana }).expect(
      200,
    );
    expect(g.body.reattributed).toBe(3); // 3 MRs authored (requests belong to the reviewer)
    const l = await put('/api/v1/admin/accounts/gitlab/502/mapping', { userId: ids.lee }).expect(
      200,
    );
    expect(l.body.reattributed).toBe(6);
    const [items] = await ds.query(
      `SELECT count(*)::int AS n FROM work_items WHERE assignee_user_id = $1`,
      [ids.dana],
    );
    expect(items.n).toBe(4);
    const [mrs] = await ds.query(
      `SELECT count(*)::int AS n FROM merge_requests WHERE author_user_id = $1`,
      [ids.dana],
    );
    expect(mrs.n).toBe(3);
    const audit = await ds.query(
      `SELECT action, actor_user_id FROM audit_events WHERE action = 'identity.map'`,
    );
    expect(audit).toHaveLength(3);
    expect(audit.every((a: { actor_user_id: string }) => a.actor_user_id === ids.admin)).toBe(true);

    const dq = (await admin.get('/api/v1/admin/data-quality').expect(200)).body;
    expect(dq.jira).toMatchObject({
      mappedAssignees: 4,
      assigneeCoveragePct: 66.7,
      unmappedAccounts: 1,
    });
    expect(dq.gitlab).toMatchObject({ authorCoveragePct: 100, unmappedAccounts: 0 });
  });

  it('keeps future syncs attributed through the mapping', async () => {
    jira.addIssue('ENG-7', { assignee: 'JIRAUSER1', createdDaysAgo: 3, transitions: [['3', 2]] });
    const r = await new JiraSync(ds, { policy, env: { EPI_JIRA_TOKEN: token } }).run('jira-main');
    expect(r.counts.issuesSeen).toBe(1); // incremental: only the new issue
    expect(r.counts.unmappedAssignees).toBe(0);
    const [row] = await ds.query(
      `SELECT assignee_user_id FROM work_items WHERE external_key = 'ENG-7'`,
    );
    expect(row.assignee_user_id).toBe(ids.dana);
  });

  it('rejects invalid mappings', async () => {
    // one Jira account per person
    await put('/api/v1/admin/accounts/jira/JIRAUSER2/mapping', { userId: ids.dana }).expect(409);
    // bots are never people
    await put('/api/v1/admin/accounts/gitlab/900/mapping', { userId: ids.plain }).expect(409);
    await put('/api/v1/admin/accounts/jira/NOPE/mapping', { userId: ids.plain }).expect(404);
    await put('/api/v1/admin/accounts/svn/1/mapping', { userId: ids.plain }).expect(404);
    await put('/api/v1/admin/accounts/jira/JIRAUSER2/mapping', { userId: 'not-a-uuid' }).expect(
      400,
    );
    await put(
      '/api/v1/admin/accounts/jira/JIRAUSER2/mapping',
      { userId: ids.lee },
      { ...admin, csrf: 'wrong' },
    ).expect(403);
  });

  it('unmaps, clearing attribution, and audits it', async () => {
    const res = await del('/api/v1/admin/accounts/jira/JIRAUSER1/mapping').expect(200);
    expect(res.body.reattributed).toBe(5);
    const [items] = await ds.query(
      `SELECT count(*)::int AS n FROM work_items WHERE assignee_user_id IS NOT NULL`,
    );
    expect(items.n).toBe(0);
    await del('/api/v1/admin/accounts/jira/JIRAUSER1/mapping').expect(404);
    const [a] = await ds.query(
      `SELECT count(*)::int AS n FROM audit_events WHERE action = 'identity.unmap'`,
    );
    expect(a.n).toBe(1);
  });

  it('searches people for the mapping picker, showing their existing identities', async () => {
    const res = await admin.get('/api/v1/admin/users?q=person').expect(200);
    expect(res.body.map((u: { display_name: string }) => u.display_name)).toEqual([
      'Dana Person',
      'Lee Person',
    ]);
    expect(res.body[0].identities).toEqual([{ source: 'gitlab', external_id: '501' }]);
  });
});
