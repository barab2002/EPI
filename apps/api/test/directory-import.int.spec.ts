import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { entityId, freshDatabase, login, Session, startApp, userId } from './helpers';
import { directoryConfig, requireLdapOrSkip, TEAM_PAYMENTS, TEAM_PLATFORM } from './ldap';

/** AD team import API (EPI-004c) against the synthetic LDAPS directory and the demo seed. */
jest.setTimeout(120_000);
const run = requireLdapOrSkip() ? describe : describe.skip;

run('Directory import (integration)', () => {
  let ds: DataSource;
  let app: INestApplication;
  let admin: Session;
  let payments: string;
  let identity: string;

  const put = (s: Session, body: object) =>
    request(app.getHttpServer())
      .put('/api/v1/admin/directory/mappings')
      .set('Cookie', s.cookie)
      .set('x-csrf-token', s.csrf)
      .send(body);
  const openMembers = async (teamId: string) =>
    (
      await ds.query(
        `SELECT u.display_name FROM team_memberships m JOIN users u ON u.id = m.user_id
          WHERE m.team_id = $1 AND m.effective_to IS NULL ORDER BY 1`,
        [teamId],
      )
    ).map((r: { display_name: string }) => r.display_name);

  beforeAll(async () => {
    ds = await freshDatabase();
    app = await startApp(ds, { directory: directoryConfig() });
    admin = await login(app, ds, 'Avery Admin');
    payments = await entityId(ds, 'teams', 'Payments');
    identity = await entityId(ds, 'teams', 'Identity');
  });
  afterAll(async () => {
    await app?.close();
    await ds?.destroy();
  });

  it('is admin-only', async () => {
    const lead = await login(app, ds, 'Taylor Lead');
    await lead.get('/api/v1/admin/directory').expect(403);
    await lead.post('/api/v1/admin/directory/preview').expect(403);
    await request(app.getHttpServer()).get('/api/v1/admin/directory').expect(401);
  });

  it('lists the configured groups, unmapped, without contacting the directory', async () => {
    const res = await admin.get('/api/v1/admin/directory').expect(200);
    expect(res.body).toEqual({
      configured: true,
      groups: [
        { dn: TEAM_PAYMENTS, teamId: null, teamName: null },
        { dn: TEAM_PLATFORM, teamId: null, teamName: null },
      ],
      lastImport: null,
    });
  });

  it('maps only configured groups to active teams, audited', async () => {
    await put(admin, { groupDn: 'cn=Other,ou=Groups,dc=corp,dc=example', teamId: payments }).expect(
      400,
    );
    await put(admin, {
      groupDn: TEAM_PAYMENTS,
      teamId: '00000000-0000-4000-8000-000000000000',
    }).expect(404);
    await put(admin, { groupDn: TEAM_PAYMENTS, teamId: payments }).expect(200);
    const res = await admin.get('/api/v1/admin/directory').expect(200);
    expect(res.body.groups[0]).toEqual({
      dn: TEAM_PAYMENTS,
      teamId: payments,
      teamName: 'Payments',
    });
    const [a] = await ds.query(
      `SELECT metadata_json FROM audit_events WHERE action = 'directory.mapping' ORDER BY at DESC LIMIT 1`,
    );
    expect(a.metadata_json).toEqual({ groupDn: TEAM_PAYMENTS, from: null, to: payments });
  });

  it('previews without changing anything: links by e-mail, ends members not in the group', async () => {
    const before = await openMembers(payments);
    const res = await admin.post('/api/v1/admin/directory/preview').expect(200);
    const { plan, hash, groups } = res.body;
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(groups).toEqual([
      { dn: TEAM_PAYMENTS, name: 'Team-Payments', memberCount: 2 },
      { dn: TEAM_PLATFORM, name: 'Team-Platform', memberCount: 1 },
    ]);
    expect(plan.creates).toEqual([]);
    expect(plan.links.map((l: { userId: string }) => l.userId).sort()).toEqual(
      [await userId(ds, 'Eli Engineer'), await userId(ds, 'Taylor Lead')].sort(),
    );
    expect(plan.adds).toEqual([]);
    expect(plan.ends.map((e: { displayName: string }) => e.displayName)).toEqual([
      'Dana Dev',
      'Fran Coder',
      'Gil Builder',
      'Hila Hacker',
      'Ido Integrator',
    ]);
    expect(plan.warnings).toEqual([
      `Group ${TEAM_PLATFORM} is not mapped to a team; its 1 member(s) are not imported.`,
    ]);
    expect(await openMembers(payments)).toEqual(before);
  });

  it('refuses a plan that is not the previewed one', async () => {
    await admin.post('/api/v1/admin/directory/apply', { hash: 'a'.repeat(64) }).expect(409);
    await admin.post('/api/v1/admin/directory/apply', { hash: 'nope' }).expect(400);
    await admin
      .post('/api/v1/admin/directory/apply', { hash: 'a'.repeat(64) }, { csrf: false })
      .expect(403);
  });

  it('refuses to apply when EPI changed after the preview', async () => {
    const { hash } = (await admin.post('/api/v1/admin/directory/preview').expect(200)).body;
    const [m] = await ds.query(
      `SELECT m.id FROM team_memberships m JOIN users u ON u.id = m.user_id
        WHERE u.display_name = 'Dana Dev' AND m.effective_to IS NULL`,
    );
    await ds.query(`UPDATE team_memberships SET effective_to = now() WHERE id = $1`, [m.id]);
    const res = await admin.post('/api/v1/admin/directory/apply', { hash }).expect(409);
    expect(res.body.message).toMatch(/Preview again/);
  });

  it('applies exactly the previewed plan, audited, and is idempotent afterwards', async () => {
    const { hash, plan } = (await admin.post('/api/v1/admin/directory/preview').expect(200)).body;
    const res = await admin.post('/api/v1/admin/directory/apply', { hash }).expect(200);
    expect(res.body).toMatchObject({
      created: 0,
      linked: 2,
      updated: 0,
      added: 0,
      ended: plan.ends.length,
    });
    expect(await openMembers(payments)).toEqual(['Eli Engineer', 'Taylor Lead']);
    const ids = await ds.query(
      `SELECT count(*)::int AS n FROM external_identities WHERE source = 'directory' AND verified`,
    );
    expect(ids[0].n).toBe(2);
    const audit = await ds.query(
      `SELECT action, count(*)::int AS n FROM audit_events
        WHERE metadata_json->>'source' = 'directory' GROUP BY action ORDER BY action`,
    );
    expect(audit).toEqual([
      { action: 'directory.link', n: 2 },
      { action: 'membership.end', n: plan.ends.length },
    ]);
    const again = (await admin.post('/api/v1/admin/directory/preview').expect(200)).body;
    expect(again.plan.total).toBe(0);
    const status = (await admin.get('/api/v1/admin/directory').expect(200)).body;
    expect(status.lastImport.counts).toMatchObject({ linked: 2 });
  });

  it('a second mapped group adds its member to that team', async () => {
    await put(admin, { groupDn: TEAM_PLATFORM, teamId: identity }).expect(200);
    const before = await openMembers(identity);
    const { hash, plan } = (await admin.post('/api/v1/admin/directory/preview').expect(200)).body;
    expect(plan.adds.map((a: { displayName: string }) => a.displayName)).toEqual(['Gal Groupman']);
    await admin.post('/api/v1/admin/directory/apply', { hash }).expect(200);
    const after = await openMembers(identity);
    expect(after).toContain('Gal Groupman');
    // Identity's own members are not in the directory group, so they leave Identity.
    expect(after).toEqual(['Gal Groupman']);
    expect(before).not.toContain('Gal Groupman');
  });

  it('reports "not configured" when the server has no directory settings', async () => {
    const plain = await startApp(ds, { directory: null });
    try {
      const s = await login(plain, ds, 'Avery Admin');
      expect((await s.get('/api/v1/admin/directory').expect(200)).body).toEqual({
        configured: false,
        groups: [],
      });
      const res = await s.post('/api/v1/admin/directory/preview').expect(404);
      expect(res.body.message).toMatch(/not configured/);
    } finally {
      await plain.close();
    }
  });
});
