import { randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import { GitLabSync } from '../src/ingestion/gitlab/gitlab.sync';
import { KpiService } from '../src/kpi/kpi.service';
import type { Scope } from '../src/org/scope.service';
import { FakeGitLab } from './fake-gitlab';
import { freshDatabase, testConfig } from './helpers';

/** EPI-007: GitLab collector against a fake GitLab (synthetic data) and real PostgreSQL. */
jest.setTimeout(120_000);

const H = 3_600_000;
const policy = { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 5, timeoutMs: 5_000 };
const NOW = new Date('2026-10-01T12:00:00Z');
const dana = { id: 101, username: 'dana' };
const alice = { id: 102, username: 'alice' };
const bob = { id: 103, username: 'bob' };
const outsider = { id: 104, username: 'outsider' };
const ciBot = { id: 900, username: 'project_42_bot', bot: true };

describe('GitLab collector (integration)', () => {
  let ds: DataSource;
  let gl: FakeGitLab;
  let clock: Date;
  let teamId: string;
  const token = randomBytes(16).toString('hex');
  const sync = (env: NodeJS.ProcessEnv = { EPI_GITLAB_TOKEN: token }) =>
    new GitLabSync(ds, { policy, env, now: () => clock, sleep: async () => undefined });
  const count = async (table: string) =>
    (await ds.query(`SELECT count(*)::int AS n FROM ${table}`))[0].n as number;

  beforeAll(async () => {
    ds = await freshDatabase(false);
    clock = NOW;
    // Minimal org: one team with Dana (author), Alice and Bob (reviewers). Outsider unmapped.
    const [org] = await ds.query(`INSERT INTO organizations(name) VALUES ('Org') RETURNING id`);
    const [grp] = await ds.query(
      `INSERT INTO org_groups(organization_id, name) VALUES ($1, 'G') RETURNING id`,
      [org.id],
    );
    const [team] = await ds.query(
      `INSERT INTO teams(group_id, name) VALUES ($1, 'T') RETURNING id`,
      [grp.id],
    );
    teamId = team.id;
    for (const u of [dana, alice, bob]) {
      const [row] = await ds.query(`INSERT INTO users(display_name) VALUES ($1) RETURNING id`, [
        u.username,
      ]);
      await ds.query(
        `INSERT INTO team_memberships(user_id, team_id, effective_from) VALUES ($1, $2, '2026-01-01')`,
        [row.id, teamId],
      );
      await ds.query(
        `INSERT INTO external_identities(user_id, source, external_id, verified) VALUES ($1, 'gitlab', $2, true)`,
        [row.id, String(u.id)],
      );
    }
    // A Jira work item to link to.
    const [jc] = await ds.query(
      `INSERT INTO integration_connections(kind, name, config_json) VALUES ('jira', 'jira-x', '{}') RETURNING id`,
    );
    await ds.query(
      `INSERT INTO work_items(connection_id, external_key, project_key, issue_type, work_type, status, created_at, updated_at)
       VALUES ($1, 'ENG-12', 'ENG', 'Story', 'story', 'Done', now(), now())`,
      [jc.id],
    );

    gl = new FakeGitLab(token);
    // 12 MRs by Dana: review requested from Alice at creation, Alice answers after i hours.
    for (let i = 1; i <= 12; i++) {
      const created = new Date(NOW.getTime() - (20 + i) * 24 * H);
      gl.addMergeRequest(42, i, {
        author: dana,
        createdAt: created,
        branch: i === 1 ? 'feature/eng-12-retries' : undefined,
        reviewers: [alice],
        mergedAt: new Date(created.getTime() + 30 * H),
      });
      gl.addNote(42, i, dana, created, 'requested review from @alice', true);
      gl.addNote(
        42,
        i,
        ciBot,
        new Date(created.getTime() + 0.1 * H),
        'Pipeline passed: secret-ish build log',
      );
      gl.addNote(
        42,
        i,
        dana,
        new Date(created.getTime() + 0.2 * H),
        'Ready for review (self note)',
      );
      gl.addNote(42, i, dana, new Date(created.getTime() + 0.3 * H), 'added 1 commit', true);
      gl.addNote(42, i, alice, new Date(created.getTime() + i * H), `Looks good ${i}`);
      gl.addNote(
        42,
        i,
        alice,
        new Date(created.getTime() + (i + 1) * H),
        'approved this merge request',
        true,
      );
    }
    // MR 13: only a bot and the author respond -> no human response yet.
    const c13 = new Date(NOW.getTime() - 5 * 24 * H);
    gl.addMergeRequest(42, 13, { author: dana, createdAt: c13, reviewers: [bob] });
    gl.addNote(42, 13, dana, c13, 'requested review from @bob and @outsider', true);
    gl.addNote(42, 13, ciBot, new Date(c13.getTime() + H), 'Pipeline failed');
    gl.addNote(42, 13, dana, new Date(c13.getTime() + 2 * H), 'ping');
    gl.addNote(42, 13, outsider, new Date(c13.getTime() + 3 * H), 'drive-by comment');
    // MR 14 has many notes (exercises notes pagination).
    const c14 = new Date(NOW.getTime() - 3 * 24 * H);
    gl.addMergeRequest(42, 14, { author: dana, createdAt: c14, reviewers: [bob] });
    gl.addNote(42, 14, dana, c14, 'requested review from @bob', true);
    for (let k = 1; k <= 11; k++)
      gl.addNote(42, 14, bob, new Date(c14.getTime() + k * H), `comment ${k}`);
    // Very old MR outside the backfill window.
    gl.addMergeRequest(42, 99, { author: dana, createdAt: new Date('2025-01-01T00:00:00Z') });
    await gl.start();
    await ds.query(
      `INSERT INTO integration_connections(kind, name, endpoint, config_json, secret_ref)
       VALUES ('gitlab', 'gitlab-main', $1, $2, 'EPI_GITLAB_TOKEN')`,
      [gl.url, JSON.stringify({ projectIds: ['42'], perPage: 5 })],
    );
  });

  afterAll(async () => {
    await gl.stop();
    await ds.destroy();
  });

  it('backfills MRs and review events with paging, identity mapping and Jira links', async () => {
    const r = await sync().run('gitlab-main');
    expect(r.status).toBe('succeeded');
    expect(r.gitlabVersion).toBe('18.2.1-ee');
    expect(r.counts).toMatchObject({
      mrsSeen: 14,
      mrsInserted: 14,
      reviewRequests: 12 + 2 + 1,
      linkedToWorkItems: 1,
      unmappedUsers: 1, // outsider (bots are not counted)
    });
    // MR pages of 5 -> 3 list calls; MR 14 notes (12) -> 3 note pages.
    expect(gl.requests.filter((q) => /merge_requests\?/.test(q))).toHaveLength(3);
    expect(gl.requests.filter((q) => q.includes('/merge_requests/14/notes'))).toHaveLength(3);
    expect(await count('merge_requests')).toBe(14);
    // per MR 1-12: request, bot note, self note, alice note, approval = 5 (commit note dropped)
    expect(await count('review_events')).toBe(12 * 5 + (2 + 3) + (1 + 11));
    const [linked] = await ds.query(
      `SELECT m.link_confidence, w.external_key FROM merge_requests m JOIN work_items w ON w.id = m.linked_work_item_id`,
    );
    expect(linked).toEqual({ link_confidence: 'branch', external_key: 'ENG-12' });
  });

  it('stores no titles, descriptions or note bodies', async () => {
    const dump = JSON.stringify([
      await ds.query(`SELECT * FROM merge_requests`),
      await ds.query(`SELECT * FROM review_events`),
    ]);
    for (const text of ['Looks good', 'Synthetic change', 'secret-ish', 'requested review']) {
      expect(dump).not.toContain(text);
    }
  });

  it('is idempotent', async () => {
    const before = await count('review_events');
    const r = await sync().run('gitlab-main', { fullBackfill: true });
    expect(r.counts).toMatchObject({
      mrsInserted: 0,
      mrsUpdated: 0,
      mrsUnchanged: 14,
      eventsWritten: 0,
    });
    expect(await count('review_events')).toBe(before);
  });

  it('computes Review Waiting Time end to end from synced events (bots/self excluded)', async () => {
    const kpis = new KpiService(ds, testConfig());
    const scope = {
      managedTeamIds: new Set([teamId]),
      aggregateTeamIds: new Set([teamId]),
    } as unknown as Scope;
    const cards = await kpis.cards(scope, 'team', teamId, '180d', clock);
    const rwt = cards.find((c) => c.code === 'REVIEW_WAITING_TIME');
    expect(rwt?.proxy).toBe(false);
    // 12 answered requests (1..12 h) + MR 14 (bob, 1 h) + MR 13 (unmapped outsider, 3 h — counted
    // via the source identity). Bot and author notes never count as responses.
    expect(rwt?.sampleSize).toBe(14);
    expect(rwt?.value).toBe(5.5); // median of [1,1,2,3,3,4,5,6,7,8,9,10,11,12]
    const excluded = rwt?.evidence?.exclusions ?? [];
    expect(excluded).toHaveLength(1); // Bob's request on MR 13 is still unanswered
    expect(excluded[0]).toMatchObject({
      key: expect.stringMatching(/^42!13#/),
      reason: 'no_response_yet',
    });
  });

  it('syncs incrementally with updated_after and overlap', async () => {
    clock = new Date(NOW.getTime() + 2 * H);
    gl.addNote(42, 13, bob, new Date(clock.getTime() - H), 'reviewed');
    gl.requests.length = 0;
    const r = await sync().run('gitlab-main');
    expect(r.status).toBe('succeeded');
    const list = gl.requests.find((q) => /merge_requests\?/.test(q)) ?? '';
    expect(new URL(list, gl.url).searchParams.get('updated_after')).toBe(
      new Date(NOW.getTime() - 48 * H).toISOString(),
    );
    expect(r.counts).toMatchObject({ mrsSeen: 1, eventsWritten: 1 });
  });

  it('retries transient errors and keeps the cursor on failure', async () => {
    gl.injectFault({ pathIncludes: '/notes', status: 429, times: 1, retryAfter: '0' });
    expect((await sync().run('gitlab-main')).status).toBe('succeeded');
    gl.clearFaults();
    const [before] = await ds.query(
      `SELECT last_success_at FROM sync_cursors WHERE resource = 'merge_requests'`,
    );
    gl.injectFault({ pathIncludes: '/merge_requests', status: 500, times: 10 });
    clock = new Date(clock.getTime() + H);
    const failed = await sync().run('gitlab-main');
    gl.clearFaults();
    expect(failed.status).toBe('failed');
    expect(failed.error).toContain('HTTP 500');
    const [after] = await ds.query(
      `SELECT last_success_at FROM sync_cursors WHERE resource = 'merge_requests'`,
    );
    expect(after.last_success_at).toEqual(before.last_success_at);
  });

  it('fails clearly on bad credentials and inaccessible projects, never recording the token', async () => {
    const wrong = randomBytes(16).toString('hex');
    const r = await sync({ EPI_GITLAB_TOKEN: wrong }).run('gitlab-main');
    expect(r.status).toBe('failed');
    expect(r.error).toContain('HTTP 401');
    await ds.query(
      `UPDATE integration_connections SET config_json = '{"projectIds":["777"]}' WHERE name = 'gitlab-main'`,
    );
    const p = await sync().run('gitlab-main');
    expect(p.error).toMatch(/GitLab project 777 is not accessible/);
    const runs = JSON.stringify(await ds.query(`SELECT error_summary, counts_json FROM sync_runs`));
    expect(runs).not.toContain(token);
    expect(runs).not.toContain(wrong);
  });
});
