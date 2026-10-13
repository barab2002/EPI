import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { RetentionService } from '../src/retention/retention.service';
import { freshDatabase, login, startApp, userId } from './helpers';

/** Data retention (ADR-032): what goes, what stays, audit, once-a-day claim, admin view. */
jest.setTimeout(120_000);

const NOW = new Date('2026-10-13T12:00:00Z'); // cutoff 2024-10-13T12:00Z
const OLD = '2024-01-15T00:00:00Z';

describe('Retention (integration)', () => {
  let ds: DataSource;
  let app: INestApplication;
  let svc: RetentionService;
  /** First row of a statement; UPDATE … RETURNING comes back from TypeORM as [rows, count]. */
  const one = async (sql: string, p: unknown[] = []) => {
    const r = await ds.query(sql, p);
    return Array.isArray(r[0]) ? r[0][0] : r[0];
  };
  const count = async (sql: string, p: unknown[] = []) =>
    Number((await ds.query(sql, p))[0].n as string);

  beforeAll(async () => {
    ds = await freshDatabase();
    app = await startApp(ds);
    svc = app.get(RetentionService);
  });
  afterAll(async () => {
    await app?.close();
    await ds?.destroy();
  });

  it('deletes only data older than the window, keeps people and assessments, and audits it', async () => {
    // Age some synthetic rows past the cutoff.
    const oldItem = await one(
      `UPDATE work_items SET updated_at = $1, created_at = $1, done_at = NULL
        WHERE id = (SELECT id FROM work_items ORDER BY id LIMIT 1) RETURNING id`,
      [OLD],
    );
    const keptMr = await one(
      `UPDATE merge_requests SET linked_work_item_id = $1
        WHERE id = (SELECT id FROM merge_requests WHERE coalesce(merged_at, created_at) > $2 ORDER BY id LIMIT 1)
        RETURNING id`,
      [oldItem.id, NOW.toISOString().slice(0, 4) + '-01-01'],
    );
    const oldMr = await one(
      `UPDATE merge_requests SET created_at = $1, merged_at = $1
        WHERE id = (SELECT id FROM merge_requests WHERE id <> $2 ORDER BY id LIMIT 1) RETURNING id`,
      [OLD, keptMr.id],
    );
    expect(oldItem?.id && keptMr?.id && oldMr?.id).toBeTruthy();
    const [conn] = await ds.query(`SELECT id FROM integration_connections LIMIT 1`);
    await ds.query(
      `INSERT INTO sync_runs(connection_id, started_at, status) VALUES ($1, $2, 'succeeded'), ($1, $3, 'succeeded')`,
      [conn.id, OLD, NOW],
    );
    await ds.query(
      `INSERT INTO kpi_snapshots(entity_type, entity_id, period_start, period_end, kpi_code,
         formula_version, unit, sample_size, confidence)
       VALUES ('team', gen_random_uuid(), $1, $1, 'CYCLE_TIME', '1', 'days', 0, 'insufficient')`,
      [OLD],
    );
    await ds.query(
      `INSERT INTO source_accounts(source, external_id, last_seen_at) VALUES ('jira', 'OLDUSER', $1)`,
      [OLD],
    );
    await ds.query(
      `INSERT INTO audit_events(action, resource_type, at) VALUES ('test.old', 'test', $1)`,
      [OLD],
    );
    const dana = await userId(ds, 'Dana Dev');
    await ds.query(
      `INSERT INTO sessions(token_hash, user_id, csrf_token, expires_at)
       VALUES ('expired-test', $1, 'x', $2), ('live-test', $1, 'y', $3)`,
      [dana, OLD, '2026-10-14T00:00:00Z'],
    );
    const [cycle] = await ds.query(
      `INSERT INTO review_cycles(period_start, period_end, status) VALUES ('2023-01-01', '2023-01-31', 'closed') RETURNING id`,
    );
    await ds.query(
      `INSERT INTO assessments(cycle_id, subject_user_id, reviewer_user_id, independence_1to5,
         growth_1to5, evidence, status, submitted_at, created_at, updated_at)
       VALUES ($1, $2, $3, 3, 3, 'An old assessment that must be kept.', 'submitted', $4, $4, $4)`,
      [cycle.id, dana, await userId(ds, 'Taylor Lead'), OLD],
    );
    const before = {
      workItems: await count(`SELECT count(*) AS n FROM work_items`),
      mrs: await count(`SELECT count(*) AS n FROM merge_requests`),
      users: await count(`SELECT count(*) AS n FROM users`),
      memberships: await count(`SELECT count(*) AS n FROM team_memberships`),
    };

    const preview = await svc.describe(NOW);
    expect(preview.cutoff).toBe('2024-10-13T12:00:00.000Z');
    expect(preview.due).toEqual({
      mergeRequests: 1,
      workItems: 1,
      syncRuns: 1,
      kpiSnapshots: 1,
      sourceAccounts: 1,
      auditEvents: 1,
      expiredSessions: 1,
    });
    expect(await count(`SELECT count(*) AS n FROM work_items`)).toBe(before.workItems); // dry

    const r = await svc.run(null, NOW);
    expect(r.counts).toEqual(preview.due);
    expect(await count(`SELECT count(*) AS n FROM work_items`)).toBe(before.workItems - 1);
    expect(await count(`SELECT count(*) AS n FROM merge_requests`)).toBe(before.mrs - 1);
    expect(
      await count(`SELECT count(*) AS n FROM review_events WHERE merge_request_id = $1`, [
        oldMr.id,
      ]),
    ).toBe(0);
    const [mr] = await ds.query(`SELECT linked_work_item_id FROM merge_requests WHERE id = $1`, [
      keptMr.id,
    ]);
    expect(mr.linked_work_item_id).toBeNull(); // recent MR kept, link to the deleted item cleared
    expect(await count(`SELECT count(*) AS n FROM sessions WHERE token_hash = 'live-test'`)).toBe(
      1,
    );
    expect(await count(`SELECT count(*) AS n FROM assessments WHERE created_at = $1`, [OLD])).toBe(
      1,
    );
    expect(await count(`SELECT count(*) AS n FROM users`)).toBe(before.users);
    expect(await count(`SELECT count(*) AS n FROM team_memberships`)).toBe(before.memberships);
    const [audit] = await ds.query(
      `SELECT metadata_json FROM audit_events WHERE action = 'retention.run'`,
    );
    expect(audit.metadata_json).toMatchObject({ months: 24, workItems: 1, auditEvents: 1 });

    // Nothing left to do.
    expect(Object.values((await svc.describe(NOW)).due!).every((n) => n === 0)).toBe(true);
  });

  it('runs at most once per UTC day, even with two callers', async () => {
    const day = new Date('2026-10-14T03:00:00Z');
    const [a, b] = await Promise.all([svc.tick(day), svc.tick(day)]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(await svc.tick(new Date('2026-10-14T23:00:00Z'))).toBeNull();
    expect(await svc.tick(new Date('2026-10-15T00:30:00Z'))).not.toBeNull();
  });

  it('shows the window and last run to administrators only', async () => {
    const admin = await login(app, ds, 'Avery Admin');
    const res = await admin.get('/api/v1/admin/retention').expect(200);
    expect(res.body).toMatchObject({ months: 24, automatic: false });
    expect(res.body.lastRun.counts).toBeDefined();
    expect(res.body.categories.map((c: { key: string }) => c.key)).toContain('auditEvents');
    const lead = await login(app, ds, 'Taylor Lead');
    await lead.get('/api/v1/admin/retention').expect(403);
    await request(app.getHttpServer()).get('/api/v1/admin/retention').expect(401);
  });

  it('is off when EPI_RETENTION_MONTHS=off', async () => {
    const off = await startApp(ds, { retentionMonths: null });
    try {
      const s = off.get(RetentionService);
      expect((await s.describe(NOW)).due).toBeNull();
      await expect(s.run(null, NOW)).rejects.toThrow(/switched off/);
    } finally {
      await off.close();
    }
  });
});
