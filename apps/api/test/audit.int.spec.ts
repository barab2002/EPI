import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { freshDatabase, login, Session, startApp, userId } from './helpers';

/** Audit-log viewer: admin-only, filters, keyset pagination, no review content or subject. */
jest.setTimeout(120_000);

interface Item {
  id: string;
  at: string;
  action: string;
  actor: { id: string; name: string } | null;
  resourceType: string;
  resourceId: string | null;
  resourceLabel: string | null;
  metadata: Record<string, unknown>;
}

describe('Audit log (integration)', () => {
  let ds: DataSource;
  let app: INestApplication;
  let admin: Session;
  let lead: Session;
  const evidence = 'Unique-evidence-marker: led the incident review and wrote the follow-up plan.';

  beforeAll(async () => {
    ds = await freshDatabase();
    app = await startApp(ds);
    admin = await login(app, ds, 'Avery Admin');
    lead = await login(app, ds, 'Taylor Lead');
    const dana = await userId(ds, 'Dana Dev');
    await lead
      .post('/api/v1/reviews', { subjectUserId: dana, independence: 4, growth: 3, evidence })
      .expect(201);
    // Synthetic history spread over time so pagination crosses identical timestamps too.
    await ds.query(
      `INSERT INTO audit_events(action, resource_type, at, metadata_json)
       SELECT 'test.bulk', 'system', timestamptz '2026-09-01T00:00:00Z' + (g / 3) * interval '1 minute',
              jsonb_build_object('n', g)
       FROM generate_series(1, 120) g`,
    );
  });

  afterAll(async () => {
    await app.close();
    await ds.destroy();
  });

  it('is admin-only', async () => {
    await lead.get('/api/v1/admin/audit-events').expect(403);
    await lead.get('/api/v1/admin/audit-actions').expect(403);
  });

  it('lists newest first with actor names', async () => {
    const res = await admin.get('/api/v1/admin/audit-events?limit=100').expect(200);
    const items = res.body.items as Item[];
    const ats = items.map((i) => i.at);
    expect([...ats].sort().reverse()).toEqual(ats);
    const login = items.find((i) => i.action === 'auth.login' && i.actor?.name === 'Avery Admin');
    expect(login).toBeTruthy();
  });

  it('never exposes review text or the review subject to administrators', async () => {
    const res = await admin.get('/api/v1/admin/audit-events?action=assessment.').expect(200);
    const items = res.body.items as Item[];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      action: 'assessment.create',
      actor: { name: 'Taylor Lead' },
      resourceId: null,
      resourceLabel: null,
      metadata: { status: 'draft' },
    });
    const all = await admin.get('/api/v1/admin/audit-events?limit=100').expect(200);
    const body = JSON.stringify(all.body);
    expect(body).not.toContain('Unique-evidence-marker');
    expect(body).not.toContain(await userId(ds, 'Dana Dev'));
  });

  it('filters by exact action, prefix, actor and time window', async () => {
    const exact = await admin.get('/api/v1/admin/audit-events?action=auth.login').expect(200);
    expect((exact.body.items as Item[]).every((i) => i.action === 'auth.login')).toBe(true);
    expect(exact.body.items.length).toBeGreaterThanOrEqual(2);

    const prefix = await admin.get('/api/v1/admin/audit-events?action=auth.').expect(200);
    expect((prefix.body.items as Item[]).every((i) => i.action.startsWith('auth.'))).toBe(true);

    const taylor = await userId(ds, 'Taylor Lead');
    const byActor = await admin.get(`/api/v1/admin/audit-events?actorId=${taylor}`).expect(200);
    expect((byActor.body.items as Item[]).map((i) => i.action).sort()).toEqual([
      'assessment.create',
      'auth.login',
    ]);

    const window = await admin
      .get(
        '/api/v1/admin/audit-events?action=test.bulk&from=2026-09-01T00:10:00Z&to=2026-09-01T00:20:00Z',
      )
      .expect(200);
    // Minutes 10..19, three events each (g/3 groups), except g=120 → minute 40 is outside.
    expect(window.body.items).toHaveLength(30);
  });

  it('pages through events without gaps or duplicates, even with equal timestamps', async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const url: string = `/api/v1/admin/audit-events?action=test.bulk&limit=7${cursor ? `&cursor=${cursor}` : ''}`;
      const res = await admin.get(url).expect(200);
      seen.push(...(res.body.items as Item[]).map((i) => String(i.metadata.n)));
      cursor = res.body.nextCursor;
      pages++;
    } while (cursor && pages < 50);
    expect(seen).toHaveLength(120);
    expect(new Set(seen).size).toBe(120);
    expect(pages).toBe(Math.ceil(120 / 7));
  });

  it('validates parameters', async () => {
    await admin.get('/api/v1/admin/audit-events?limit=0').expect(400);
    await admin.get('/api/v1/admin/audit-events?limit=101').expect(400);
    await admin.get('/api/v1/admin/audit-events?actorId=not-a-uuid').expect(400);
    await admin.get('/api/v1/admin/audit-events?from=yesterday').expect(400);
    await admin.get("/api/v1/admin/audit-events?action=a';drop").expect(400);
    await admin.get('/api/v1/admin/audit-events?cursor=Zm9v').expect(400);
    await admin.get('/api/v1/admin/audit-events?unknown=1').expect(400);
  });

  it('lists distinct actions for filters', async () => {
    const res = await admin.get('/api/v1/admin/audit-actions').expect(200);
    expect(res.body).toEqual(
      expect.arrayContaining(['assessment.create', 'auth.login', 'seed.demo']),
    );
    expect([...res.body].sort()).toEqual(res.body);
  });
});
