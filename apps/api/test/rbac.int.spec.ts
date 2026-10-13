import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { KpiService } from '../src/kpi/kpi.service';
import { ScopeService } from '../src/org/scope.service';
import { entityId, freshDatabase, login, SEED_NOW, startApp, userId } from './helpers';

/**
 * Security-negative and scope tests (spec §5 minimum security tests, §14 Security).
 * Synthetic org: Platform{Payments(7), Identity(3)} and Product{Mobile(6 after transfer), Web(6)}.
 */
jest.setTimeout(120_000);

describe('RBAC & data isolation (integration)', () => {
  let ds: DataSource;
  let app: INestApplication;
  let ids: Record<string, string>;
  const evidence = 'Delivered the retry feature independently with clear design notes.';

  beforeAll(async () => {
    ds = await freshDatabase();
    // Suppression tests below use a threshold above Identity's 3 members (default is 3, ADR-034).
    app = await startApp(ds, { minimumAggregateSize: 5 });
    ids = {
      dana: await userId(ds, 'Dana Dev'),
      eli: await userId(ds, 'Eli Engineer'),
      lior: await userId(ds, 'Lior Mobile'),
      taylor: await userId(ds, 'Taylor Lead'),
      payments: await entityId(ds, 'teams', 'Payments'),
      identity: await entityId(ds, 'teams', 'Identity'),
      mobile: await entityId(ds, 'teams', 'Mobile'),
      web: await entityId(ds, 'teams', 'Web'),
      platform: await entityId(ds, 'org_groups', 'Platform'),
      product: await entityId(ds, 'org_groups', 'Product'),
    };
  });

  afterAll(async () => {
    await app.close();
    await ds.destroy();
  });

  describe('authentication', () => {
    it('serves liveness/readiness without a session', async () => {
      await request(app.getHttpServer()).get('/health/live').expect(200);
      const ready = await request(app.getHttpServer()).get('/health/ready').expect(200);
      expect(ready.body.migrations).toBe('up-to-date');
    });

    it('rejects data routes without a session', async () => {
      await request(app.getHttpServer()).get('/api/v1/me').expect(401);
      await request(app.getHttpServer()).get('/api/v1/organization/tree').expect(401);
    });

    it('rejects a forged session cookie', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Cookie', 'epi_session=forged-token-value')
        .expect(401);
    });

    it('refuses demo login for non-synthetic users', async () => {
      const [real] = await ds.query(
        `INSERT INTO users(display_name,is_synthetic) VALUES ('Real Person', false) RETURNING id`,
      );
      await request(app.getHttpServer())
        .post('/api/v1/auth/demo-login')
        .send({ userId: real.id })
        .expect(404);
    });

    it('invalidates the session on logout', async () => {
      const s = await login(app, ds, 'Eli Engineer');
      await s.post('/api/v1/auth/logout').expect(200);
      await s.get('/api/v1/me').expect(401);
    });

    it('sets an HttpOnly SameSite session cookie', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/demo-login')
        .send({ userId: ids.eli })
        .expect(204);
      const cookie = (res.headers['set-cookie'] as unknown as string[])[0];
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
    });
  });

  describe('developer', () => {
    it('can read own profile but not a peer (404, no existence leak)', async () => {
      const eli = await login(app, ds, 'Eli Engineer');
      await eli.get(`/api/v1/developers/${ids.eli}`).expect(200);
      await eli.get(`/api/v1/developers/${ids.dana}`).expect(404);
      await eli.get(`/api/v1/kpis?entity_type=developer&entity_id=${ids.dana}`).expect(404);
    });

    it('sees own team as an aggregate without member list or item evidence', async () => {
      const eli = await login(app, ds, 'Eli Engineer');
      const team = await eli.get(`/api/v1/teams/${ids.payments}`).expect(200);
      expect(team.body.access).toBe('aggregate');
      expect(team.body.members).toBeNull();
      const kpis = await eli
        .get(`/api/v1/kpis?entity_type=team&entity_id=${ids.payments}`)
        .expect(200);
      const ct = kpis.body.find((k: { code: string }) => k.code === 'CYCLE_TIME');
      expect(ct.suppressed).toBe(false);
      expect(ct.value).not.toBeNull();
      expect(ct.evidence).toBeUndefined();
    });

    it('cannot see another team or group (guessed IDs / filter tampering)', async () => {
      const eli = await login(app, ds, 'Eli Engineer');
      await eli.get(`/api/v1/teams/${ids.mobile}`).expect(404);
      await eli.get(`/api/v1/kpis?entity_type=team&entity_id=${ids.mobile}`).expect(404);
      await eli.get(`/api/v1/kpis?entity_type=group&entity_id=${ids.platform}`).expect(404);
      await eli.get(`/api/v1/groups/${ids.platform}`).expect(404);
      const tree = await eli.get('/api/v1/organization/tree').expect(200);
      const teams = tree.body.flatMap((o: { groups: { teams: { name: string }[] }[] }) =>
        o.groups.flatMap((g) => g.teams.map((t) => t.name)),
      );
      expect(teams).toEqual(['Payments']);
    });

    it('rejects unknown query parameters instead of ignoring them', async () => {
      const eli = await login(app, ds, 'Eli Engineer');
      await eli
        .get(`/api/v1/kpis?entity_type=team&entity_id=${ids.payments}&scope=all`)
        .expect(400);
    });

    it('cannot write assessments (not a manager)', async () => {
      const eli = await login(app, ds, 'Eli Engineer');
      await eli
        .post('/api/v1/reviews', { subjectUserId: ids.dana, independence: 3, growth: 3, evidence })
        .expect(404);
    });
  });

  describe('small-group suppression', () => {
    it('suppresses aggregates of a team below the minimum size for aggregate-only viewers', async () => {
      const jo = await login(app, ds, 'Jo Small');
      const kpis = await jo
        .get(`/api/v1/kpis?entity_type=team&entity_id=${ids.identity}`)
        .expect(200);
      for (const k of kpis.body) {
        expect(k.suppressed).toBe(true);
        expect(k.value).toBeNull();
        expect(k.sampleSize).toBe(0);
        expect(k.trend).toBeNull();
        expect(k.evidence).toBeUndefined();
      }
    });

    it('does not suppress for the team lead who manages those members', async () => {
      const uri = await login(app, ds, 'Uri Lead');
      const kpis = await uri
        .get(`/api/v1/kpis?entity_type=team&entity_id=${ids.identity}`)
        .expect(200);
      expect(kpis.body.every((k: { suppressed: boolean }) => !k.suppressed)).toBe(true);
    });
  });

  describe('team lead', () => {
    it('reads assigned team members and their KPIs with evidence', async () => {
      const t = await login(app, ds, 'Taylor Lead');
      const team = await t.get(`/api/v1/teams/${ids.payments}`).expect(200);
      expect(team.body.access).toBe('managed');
      expect(team.body.members.length).toBe(7);
      const kpis = await t
        .get(`/api/v1/kpis?entity_type=developer&entity_id=${ids.dana}`)
        .expect(200);
      expect(kpis.body[0].evidence).toBeDefined();
    });

    it('cannot read another team, its members or KPIs', async () => {
      const t = await login(app, ds, 'Taylor Lead');
      await t.get(`/api/v1/teams/${ids.mobile}`).expect(404);
      await t.get(`/api/v1/developers/${ids.lior}`).expect(404);
      await t.get(`/api/v1/kpis?entity_type=team&entity_id=${ids.mobile}`).expect(404);
    });

    it('cannot assess someone outside the team (IDOR) or themself', async () => {
      const t = await login(app, ds, 'Taylor Lead');
      await t
        .post('/api/v1/reviews', { subjectUserId: ids.lior, independence: 3, growth: 3, evidence })
        .expect(404);
      await t
        .post('/api/v1/reviews', {
          subjectUserId: ids.taylor,
          independence: 5,
          growth: 5,
          evidence,
        })
        .expect(404);
    });

    it('requires a CSRF token for mutations', async () => {
      const t = await login(app, ds, 'Taylor Lead');
      await t
        .post(
          '/api/v1/reviews',
          { subjectUserId: ids.dana, independence: 3, growth: 3, evidence },
          { csrf: false },
        )
        .expect(403);
    });

    it('validates rubric range and evidence length', async () => {
      const t = await login(app, ds, 'Taylor Lead');
      await t
        .post('/api/v1/reviews', { subjectUserId: ids.dana, independence: 6, growth: 3, evidence })
        .expect(400);
      await t
        .post('/api/v1/reviews', {
          subjectUserId: ids.dana,
          independence: 3,
          growth: 3,
          evidence: 'short',
        })
        .expect(400);
    });
  });

  describe('assessments lifecycle and privacy', () => {
    it('draft → submit, then locks, is audited without review text, and is visible per policy', async () => {
      const t = await login(app, ds, 'Taylor Lead');
      const draft = await t
        .post('/api/v1/reviews', { subjectUserId: ids.dana, independence: 4, growth: 3, evidence })
        .expect(201);
      expect(draft.body.status).toBe('draft');

      // Subject cannot see a draft.
      const danaBefore = await login(app, ds, 'Dana Dev');
      expect((await danaBefore.get('/api/v1/reviews').expect(200)).body).toHaveLength(0);

      const sub = await t
        .post('/api/v1/reviews', {
          subjectUserId: ids.dana,
          independence: 4,
          growth: 4,
          evidence,
          submit: true,
        })
        .expect(201);
      expect(sub.body.id).toBe(draft.body.id);
      expect(sub.body.status).toBe('submitted');
      await t
        .post('/api/v1/reviews', { subjectUserId: ids.dana, independence: 1, growth: 1, evidence })
        .expect(409);

      // Subject sees own submitted review.
      const dana = await login(app, ds, 'Dana Dev');
      const own = await dana.get('/api/v1/reviews').expect(200);
      expect(own.body).toHaveLength(1);
      expect(own.body[0].evidence).toBe(evidence);

      // Peer cannot read it, even by filtering on the subject.
      const eli = await login(app, ds, 'Eli Engineer');
      await eli.get(`/api/v1/reviews?subject_user_id=${ids.dana}`).expect(404);
      expect((await eli.get('/api/v1/reviews').expect(200)).body).toHaveLength(0);

      // Group manager of the subject can read it; the other group manager cannot.
      const gal = await login(app, ds, 'Gal Groupman');
      expect(
        (await gal.get(`/api/v1/reviews?subject_user_id=${ids.dana}`).expect(200)).body,
      ).toHaveLength(1);
      const noa = await login(app, ds, 'Noa Groupwoman');
      await noa.get(`/api/v1/reviews?subject_user_id=${ids.dana}`).expect(404);

      // Admin without review privilege cannot read private reviews.
      const admin = await login(app, ds, 'Avery Admin');
      expect((await admin.get('/api/v1/reviews').expect(200)).body).toHaveLength(0);
      await admin.get(`/api/v1/reviews?subject_user_id=${ids.dana}`).expect(404);

      // Audited, and the audit trail never stores review text.
      const audit = await ds.query(
        `SELECT action, metadata_json::text AS meta FROM audit_events WHERE resource_type = 'assessment' ORDER BY at`,
      );
      expect(audit.map((a: { action: string }) => a.action)).toEqual([
        'assessment.create',
        'assessment.update',
      ]);
      for (const a of audit) expect(a.meta).not.toContain('retry feature');
    });
  });

  describe('group manager and admin', () => {
    it('group manager reads own group but not the other group', async () => {
      const gal = await login(app, ds, 'Gal Groupman');
      await gal.get(`/api/v1/groups/${ids.platform}`).expect(200);
      await gal.get(`/api/v1/kpis?entity_type=group&entity_id=${ids.platform}`).expect(200);
      await gal.get(`/api/v1/groups/${ids.product}`).expect(404);
      await gal.get(`/api/v1/kpis?entity_type=group&entity_id=${ids.product}`).expect(404);
      await gal.get(`/api/v1/teams/${ids.web}`).expect(404);
    });

    it('admin sees structure but no individual or team KPIs', async () => {
      const admin = await login(app, ds, 'Avery Admin');
      const tree = await admin.get('/api/v1/organization/tree').expect(200);
      const access = tree.body.flatMap((o: { groups: { teams: { access: string }[] }[] }) =>
        o.groups.flatMap((g) => g.teams.map((t) => t.access)),
      );
      expect(new Set(access)).toEqual(new Set(['structure']));
      await admin.get(`/api/v1/kpis?entity_type=team&entity_id=${ids.payments}`).expect(404);
      await admin.get(`/api/v1/kpis?entity_type=developer&entity_id=${ids.dana}`).expect(404);
      await admin.get(`/api/v1/developers/${ids.dana}`).expect(404);
    });
  });

  describe('historical attribution', () => {
    it('attributes completed work to the team the assignee belonged to at completion time', async () => {
      const scopes = app.get(ScopeService);
      const kpis = app.get(KpiService);
      const sky = await scopes.resolve(await userId(ds, 'Sky Lead'), SEED_NOW);
      const windowStart = new Date(SEED_NOW.getTime() - 90 * 86_400_000);
      const [expected] = await ds.query(
        `SELECT count(*)::int AS n FROM work_items wi
         WHERE wi.done_at >= $2 AND wi.done_at < $3 AND EXISTS (
           SELECT 1 FROM team_memberships m WHERE m.team_id = $1 AND m.user_id = wi.assignee_user_id
             AND m.effective_from <= wi.done_at AND (m.effective_to IS NULL OR m.effective_to > wi.done_at))`,
        [ids.web, windowStart, SEED_NOW],
      );
      const [quinnBefore] = await ds.query(
        `SELECT count(*)::int AS n FROM work_items wi JOIN users u ON u.id = wi.assignee_user_id
         JOIN team_memberships m ON m.user_id = u.id AND m.team_id = $1 AND m.effective_to IS NOT NULL
         WHERE u.display_name = 'Quinn Mover' AND wi.done_at >= $2 AND wi.done_at < m.effective_to`,
        [ids.mobile, windowStart],
      );
      expect(quinnBefore.n).toBeGreaterThan(0); // the scenario really exercises a transfer
      const cards = await kpis.cards(sky, 'team', ids.web, '90d', SEED_NOW);
      const ct = cards.find((c) => c.code === 'CYCLE_TIME');
      expect(ct?.sampleSize).toBe(expected.n);
    });
  });

  describe('production mode', () => {
    it('hides demo login endpoints entirely', async () => {
      const prod = await startApp(ds, { mode: 'production' });
      try {
        await request(prod.getHttpServer()).get('/api/v1/auth/demo-users').expect(404);
        await request(prod.getHttpServer())
          .post('/api/v1/auth/demo-login')
          .send({ userId: ids.eli })
          .expect(404);
      } finally {
        await prod.close();
      }
    });
  });
});
