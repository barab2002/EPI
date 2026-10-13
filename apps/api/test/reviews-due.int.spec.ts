import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { freshDatabase, login, startApp, userId } from './helpers';

/** "Assessments due" for the home page: scoped, open cycle only, submitted ones drop off. */
jest.setTimeout(120_000);

interface Due {
  cycle: { periodStart: string; periodEnd: string } | null;
  people: { userId: string; displayName: string; teamName: string | null; status: string }[];
}

describe('Assessments due (integration)', () => {
  let ds: DataSource;
  let app: INestApplication;
  const evidence = 'Led the incident follow-up and paired with two juniors on testing.';

  beforeAll(async () => {
    ds = await freshDatabase();
    app = await startApp(ds);
  });
  afterAll(async () => {
    await app.close();
    await ds.destroy();
  });

  const due = async (name: string) =>
    (await (await login(app, ds, name)).get('/api/v1/reviews/due').expect(200)).body as Due;

  it('lists only people the team lead may assess, alphabetically, never themself', async () => {
    const d = await due('Taylor Lead');
    expect(d.cycle).not.toBeNull();
    const names = d.people.map((p) => p.displayName);
    expect(names).not.toContain('Taylor Lead');
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(names.length).toBeGreaterThan(0);
    // Everyone listed is in Taylor's team (Payments), nobody from other teams.
    expect(new Set(d.people.map((p) => p.teamName))).toEqual(new Set(['Payments']));
    // Already-submitted assessments by Taylor in this cycle are not "due".
    const [submitted] = await ds.query(
      `SELECT count(*)::int AS n FROM assessments a JOIN review_cycles c ON c.id = a.cycle_id
       WHERE c.status = 'open' AND a.reviewer_user_id = $1 AND a.status = 'submitted'
         AND a.subject_user_id = ANY($2::uuid[])`,
      [await userId(ds, 'Taylor Lead'), d.people.map((p) => p.userId)],
    );
    expect(submitted.n).toBe(0);
  });

  it('moves a person from not started to draft to done', async () => {
    const lead = await login(app, ds, 'Taylor Lead');
    const before = (await lead.get('/api/v1/reviews/due').expect(200)).body as Due;
    const target = before.people.find((p) => p.status === 'not_started')!;
    expect(target).toBeTruthy();
    await lead
      .post('/api/v1/reviews', {
        subjectUserId: target.userId,
        independence: 3,
        growth: 3,
        evidence,
      })
      .expect(201);
    let d = (await lead.get('/api/v1/reviews/due').expect(200)).body as Due;
    expect(d.people.find((p) => p.userId === target.userId)?.status).toBe('draft');
    await lead
      .post('/api/v1/reviews', {
        subjectUserId: target.userId,
        independence: 3,
        growth: 3,
        evidence,
        submit: true,
      })
      .expect(201);
    d = (await lead.get('/api/v1/reviews/due').expect(200)).body as Due;
    expect(d.people.find((p) => p.userId === target.userId)).toBeUndefined();
  });

  it('is empty for developers and administrators', async () => {
    expect((await due('Eli Engineer')).people).toEqual([]);
    expect((await due('Avery Admin')).people).toEqual([]);
  });

  it('a group manager sees only their own group', async () => {
    const d = await due('Gal Groupman');
    const [other] = await ds.query(
      `SELECT count(*)::int AS n FROM team_memberships m JOIN teams t ON t.id = m.team_id
       JOIN org_groups g ON g.id = t.group_id
       WHERE g.name <> 'Platform' AND m.effective_to IS NULL AND m.user_id = ANY($1::uuid[])`,
      [d.people.map((p) => p.userId)],
    );
    expect(d.people.length).toBeGreaterThan(0);
    expect(other.n).toBe(0);
  });

  it('requires a session', async () => {
    const res = await (await import('supertest'))
      .default(app.getHttpServer())
      .get('/api/v1/reviews/due');
    expect(res.status).toBe(401);
  });
});
