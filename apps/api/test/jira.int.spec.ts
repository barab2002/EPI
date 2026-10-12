import { randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import { JiraSync } from '../src/ingestion/jira/jira.sync';
import { KpiService } from '../src/kpi/kpi.service';
import type { Scope } from '../src/org/scope.service';
import { FakeJira } from './fake-jira';
import { freshDatabase, testConfig } from './helpers';

/** EPI-006: Jira DC collector against a fake Jira (synthetic data) and real PostgreSQL. */
jest.setTimeout(120_000);

const policy = { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 5, timeoutMs: 5_000 };
const NOW = new Date('2026-10-01T12:00:00Z');

describe('Jira collector (integration)', () => {
  let ds: DataSource;
  let jira: FakeJira;
  let clock: Date;
  const token = randomBytes(16).toString('hex');
  const env = { EPI_JIRA_TOKEN: token };
  const sync = (extra: Partial<{ env: NodeJS.ProcessEnv }> = {}) =>
    new JiraSync(ds, { policy, env, now: () => clock, sleep: async () => undefined, ...extra });

  const count = async (table: string) =>
    (await ds.query(`SELECT count(*)::int AS n FROM ${table}`))[0].n as number;

  beforeAll(async () => {
    ds = await freshDatabase(false);
    clock = NOW;
    jira = new FakeJira(token, () => clock);
    // 20 synthetic issues in ENG, 2 in OPS (not configured), 1 epic (excluded), 1 old (outside backfill).
    for (let n = 1; n <= 20; n++) {
      const done = n % 4 !== 0;
      jira.addIssue(`ENG-${n}`, {
        assignee: `JIRAUSER${(n % 3) + 1}`,
        storyPoints: n % 5 === 0 ? null : (n % 3) + 1,
        type: n % 7 === 0 ? 'Bug' : 'Story',
        createdDaysAgo: 40 + n,
        transitions: [
          ['3', 30 + n * 0.5],
          ['10010', 28 + n * 0.25],
          ...(done ? ([['6', 25]] as [string, number][]) : []),
        ],
      });
    }
    jira.addIssue('OPS-1', { project: 'OPS', createdDaysAgo: 10, transitions: [['3', 5]] });
    jira.addIssue('ENG-EPIC', { type: 'Epic', createdDaysAgo: 10, transitions: [['3', 5]] });
    jira.addIssue('ENG-OLD', {
      createdDaysAgo: 400,
      transitions: [
        ['3', 390],
        ['6', 380],
      ],
    });
    jira.truncateChangelogFor.add('ENG-5');
    await jira.start();
    await ds.query(
      `INSERT INTO integration_connections(kind, name, endpoint, config_json, secret_ref)
       VALUES ('jira', 'jira-main', $1, $2, 'EPI_JIRA_TOKEN')`,
      [jira.url, JSON.stringify({ projectKeys: ['ENG'], pageSize: 7, backfillMonths: 6 })],
    );
  });

  afterAll(async () => {
    await jira.stop();
    await ds.destroy();
  });

  it('backfills issues with full status history, paging and discovered mappings', async () => {
    const r = await sync().run('jira-main');
    expect(r.status).toBe('succeeded');
    expect(r.jiraVersion).toBe('9.12.0');
    expect(r.counts).toMatchObject({
      issuesSeen: 20,
      itemsInserted: 20,
      itemsUpdated: 0,
      changelogRefetched: 1,
      skippedIssues: 0,
      unmappedAssignees: 3,
      unknownStatuses: [],
    });
    expect(jira.searchCalls()).toBe(3); // 20 issues / page size 7
    expect(await count('work_items')).toBe(20);
    // created + 2 or 3 transitions each: 15 done (4 events) + 5 open (3 events)
    expect(await count('work_events')).toBe(15 * 4 + 5 * 3);
    const eng5 = await ds.query(
      `SELECT count(*)::int AS n FROM work_events e JOIN work_items w ON w.id = e.work_item_id WHERE w.external_key = 'ENG-5'`,
    );
    expect(eng5[0].n).toBe(4); // full history despite truncated search changelog

    const mappings = await ds.query(
      `SELECT source_status_id, category, origin FROM status_mappings ORDER BY source_status_id`,
    );
    expect(mappings).toEqual([
      { source_status_id: '1', category: 'TODO', origin: 'inferred' },
      { source_status_id: '10010', category: 'IN_PROGRESS', origin: 'inferred' },
      { source_status_id: '3', category: 'IN_PROGRESS', origin: 'inferred' },
      { source_status_id: '6', category: 'DONE', origin: 'inferred' },
    ]);
    const [eng1] = await ds.query(
      `SELECT story_points, work_type, title, raw_json, started_at, done_at FROM work_items WHERE external_key = 'ENG-1'`,
    );
    expect(Number(eng1.story_points)).toBe(2);
    expect(eng1.title).toBeNull(); // metadata only
    expect(eng1.raw_json).toBeNull();
    expect(eng1.started_at).not.toBeNull();
    expect(eng1.done_at).not.toBeNull();

    const [run] = await ds.query(
      `SELECT status, counts_json FROM sync_runs ORDER BY started_at DESC LIMIT 1`,
    );
    expect(run.status).toBe('succeeded');
    expect(run.counts_json.storyPointsField).toBe('customfield_10002');
    const [cursor] = await ds.query(`SELECT last_success_at FROM sync_cursors`);
    expect(new Date(cursor.last_success_at).toISOString()).toBe(NOW.toISOString());
  });

  it('is idempotent: an identical second run changes nothing', async () => {
    const before = { items: await count('work_items'), events: await count('work_events') };
    const r = await sync().run('jira-main', { fullBackfill: true });
    expect(r.status).toBe('succeeded');
    expect(r.counts).toMatchObject({
      itemsInserted: 0,
      itemsUpdated: 0,
      itemsUnchanged: 20,
      eventsWritten: 0,
    });
    expect({ items: await count('work_items'), events: await count('work_events') }).toEqual(
      before,
    );
  });

  it('syncs incrementally with relative-time JQL and 48 h overlap', async () => {
    clock = new Date(NOW.getTime() + 2 * 3_600_000); // two hours later
    jira.transition('ENG-4', '6', new Date(clock.getTime() - 3_600_000));
    jira.requests.length = 0;
    const r = await sync().run('jira-main');
    expect(r.status).toBe('succeeded');
    const jql = (
      jira.requests.find((q) => q.path === '/rest/api/2/search')?.body as { jql: string }
    ).jql;
    expect(jql).toBe(
      'project in ("ENG") AND issuetype not in ("Epic") AND updated >= "-3000m" ORDER BY updated ASC, key ASC',
    );
    expect(r.counts.issuesSeen).toBe(1);
    expect(r.counts).toMatchObject({ itemsUpdated: 1, eventsWritten: 1 });
    const [eng4] = await ds.query(
      `SELECT done_at, status FROM work_items WHERE external_key = 'ENG-4'`,
    );
    expect(eng4.status).toBe('Done');
    expect(eng4.done_at).not.toBeNull();
  });

  it('keeps admin status mappings and recategorizes history on the next run', async () => {
    await ds.query(
      `UPDATE status_mappings SET category = 'REVIEW', origin = 'admin' WHERE source_status_id = '10010'`,
    );
    const r = await sync().run('jira-main', { fullBackfill: true });
    expect(r.status).toBe('succeeded');
    expect(r.counts.eventsWritten).toBe(20); // every "In Review" transition re-mapped
    const [m] = await ds.query(
      `SELECT category, origin FROM status_mappings WHERE source_status_id = '10010'`,
    );
    expect(m).toEqual({ category: 'REVIEW', origin: 'admin' });
  });

  it('attributes items to EPI users through verified external identities', async () => {
    const [u] = await ds.query(
      `INSERT INTO users(display_name) VALUES ('Mapped Person') RETURNING id`,
    );
    await ds.query(
      `INSERT INTO external_identities(user_id, source, external_id, verified) VALUES ($1, 'jira', 'JIRAUSER2', true)`,
      [u.id],
    );
    const r = await sync().run('jira-main', { fullBackfill: true });
    expect(r.counts.unmappedAssignees).toBe(2);
    const [row] = await ds.query(
      `SELECT count(*)::int AS n FROM work_items WHERE assignee_user_id = $1`,
      [u.id],
    );
    expect(row.n).toBe(7); // ENG-1,4,7,10,13,16,19

    // End to end: the KPI engine computes from synced events.
    const kpis = new KpiService(ds, testConfig());
    const scope = { visibleUserIds: new Set([u.id]) } as unknown as Scope;
    const cards = await kpis.cards(scope, 'developer', u.id, '90d', clock);
    const ct = cards.find((c) => c.code === 'CYCLE_TIME');
    expect(ct?.sampleSize).toBe(6); // ENG-4 done today + 5 done 25 days ago (ENG-16 still open)
    expect(ct?.synthetic).toBe(false);
  });

  it('retries transient 429/503 responses and still succeeds', async () => {
    jira.injectFault({ pathPrefix: '/rest/api/2/search', status: 429, times: 1, retryAfter: '0' });
    jira.injectFault({ pathPrefix: '/rest/api/2/serverInfo', status: 503, times: 1 });
    const r = await sync().run('jira-main');
    expect(r.status).toBe('succeeded');
    jira.clearFaults();
  });

  it('does not advance the cursor when a run fails mid-pagination', async () => {
    const [before] = await ds.query(`SELECT last_success_at FROM sync_cursors`);
    jira.injectFault({ pathPrefix: '/rest/api/2/search', status: 500, times: 10, afterCalls: 1 });
    clock = new Date(clock.getTime() + 3_600_000);
    const r = await sync().run('jira-main', { fullBackfill: true });
    jira.clearFaults();
    expect(r.status).toBe('failed');
    expect(r.error).toBe(`${jira.url}/rest/api/2/search: HTTP 500`);
    const [after] = await ds.query(`SELECT last_success_at FROM sync_cursors`);
    expect(after.last_success_at).toEqual(before.last_success_at);
    const [run] = await ds.query(
      `SELECT status, error_summary FROM sync_runs ORDER BY started_at DESC LIMIT 1`,
    );
    expect(run.status).toBe('failed');
    expect(run.error_summary).not.toContain(token);
  });

  it('fails fast with a clear error on bad credentials and never records the token', async () => {
    jira.requests.length = 0;
    const wrong = randomBytes(16).toString('hex');
    const r = await sync({ env: { EPI_JIRA_TOKEN: wrong } }).run('jira-main');
    expect(r.status).toBe('failed');
    expect(r.error).toContain('HTTP 401');
    expect(jira.requests).toHaveLength(1); // no retries on 401
    const runs = await ds.query(`SELECT error_summary, counts_json::text AS c FROM sync_runs`);
    for (const x of runs) {
      expect(`${x.error_summary} ${x.c}`).not.toContain(wrong);
      expect(`${x.error_summary} ${x.c}`).not.toContain(token);
    }
  });

  it('refuses overlapping runs for the same connection but expires abandoned ones', async () => {
    const [conn] = await ds.query(
      `SELECT id FROM integration_connections WHERE name = 'jira-main'`,
    );
    await ds.query(
      `INSERT INTO sync_runs(connection_id, started_at, status) VALUES ($1, now() - interval '5 minutes', 'running')`,
      [conn.id],
    );
    await expect(sync().run('jira-main')).rejects.toThrow('already running');
    await ds.query(
      `UPDATE sync_runs SET started_at = now() - interval '3 hours' WHERE status = 'running'`,
    );
    const r = await sync().run('jira-main');
    expect(r.status).toBe('succeeded');
    const [abandoned] = await ds.query(
      `SELECT count(*)::int AS n FROM sync_runs WHERE error_summary = 'abandoned (no finish recorded)'`,
    );
    expect(abandoned.n).toBe(1);
  });

  it('reports a missing secret without contacting Jira', async () => {
    jira.requests.length = 0;
    const r = await sync({ env: {} }).run('jira-main');
    expect(r.status).toBe('failed');
    expect(r.error).toBe(
      'Secret EPI_JIRA_TOKEN is not provided (set EPI_JIRA_TOKEN_FILE to a root-only file)',
    );
    expect(jira.requests).toHaveLength(0);
  });
});
