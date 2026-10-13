import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { DataSource } from 'typeorm';
import { OrgAdminService } from '../src/admin/org-admin.service';
import { entityId, freshDatabase, login, Session, startApp, userId } from './helpers';

/** EPI-004b: organization administration through the API, incl. scope effects and guards. */
jest.setTimeout(120_000);

describe('Organization administration (integration)', () => {
  let ds: DataSource;
  let app: INestApplication;
  let admin: Session;
  const ids: Record<string, string> = {};

  const send = (method: 'post' | 'patch', path: string, body: object, s: Session = admin) => {
    const agent = supertest(app.getHttpServer());
    return (method === 'post' ? agent.post(path) : agent.patch(path))
      .set('Cookie', s.cookie)
      .set('x-csrf-token', s.csrf)
      .send(body);
  };
  const teamNames = async (s: Session) => {
    const tree = (await s.get('/api/v1/organization/tree').expect(200)).body;
    return tree
      .flatMap((o: { groups: { teams: { name: string }[] }[] }) =>
        o.groups.flatMap((g) => g.teams.map((t) => t.name)),
      )
      .sort();
  };

  beforeAll(async () => {
    ds = await freshDatabase();
    app = await startApp(ds);
    admin = await login(app, ds, 'Avery Admin');
    ids.avery = await userId(ds, 'Avery Admin');
    ids.eli = await userId(ds, 'Eli Engineer');
    ids.platform = await entityId(ds, 'org_groups', 'Platform');
    ids.product = await entityId(ds, 'org_groups', 'Product');
    ids.payments = await entityId(ds, 'teams', 'Payments');
    ids.mobile = await entityId(ds, 'teams', 'Mobile');
    const [org] = await ds.query(`SELECT id FROM organizations LIMIT 1`);
    ids.org = org.id;
  });

  afterAll(async () => {
    await app.close();
    await ds.destroy();
  });

  it('forbids non-admins on every organization admin route', async () => {
    const lead = await login(app, ds, 'Taylor Lead');
    await send('post', '/api/v1/admin/groups', { organizationId: ids.org, name: 'X' }, lead).expect(
      403,
    );
    await send('post', '/api/v1/admin/teams', { groupId: ids.platform, name: 'X' }, lead).expect(
      403,
    );
    await send('patch', `/api/v1/admin/teams/${ids.payments}`, { name: 'X' }, lead).expect(403);
    await send('post', '/api/v1/admin/people', { displayName: 'X' }, lead).expect(403);
    await send(
      'post',
      '/api/v1/admin/memberships',
      { userId: ids.eli, teamId: ids.mobile },
      lead,
    ).expect(403);
    await send(
      'post',
      '/api/v1/admin/role-assignments',
      { userId: ids.eli, role: 'TEAM_LEAD', scopeType: 'TEAM', scopeId: ids.mobile },
      lead,
    ).expect(403);
    await lead.get(`/api/v1/admin/people/${ids.eli}`).expect(403);
  });

  it('creates and renames groups and teams; managers see them in their scope', async () => {
    const g = await send('post', '/api/v1/admin/groups', {
      organizationId: ids.org,
      name: 'Data',
    }).expect(201);
    await send('patch', `/api/v1/admin/groups/${g.body.id}`, { name: 'Data & ML' }).expect(200);
    const t = await send('post', '/api/v1/admin/teams', {
      groupId: g.body.id,
      name: 'Pipelines',
    }).expect(201);
    ids.pipelines = t.body.id;
    const morgan = await login(app, ds, 'Morgan Example'); // engineering manager of the org
    expect(await teamNames(morgan)).toContain('Pipelines');
    const [audit] = await ds.query(
      `SELECT metadata_json FROM audit_events WHERE action = 'group.rename' AND resource_id = $1`,
      [g.body.id],
    );
    expect(audit.metadata_json).toEqual({ from: 'Data', to: 'Data & ML' });
  });

  it('moving a team between groups changes which group manager sees it', async () => {
    const t = await send('post', '/api/v1/admin/teams', {
      groupId: ids.platform,
      name: 'Edge',
    }).expect(201);
    const gal = await login(app, ds, 'Gal Groupman');
    const noa = await login(app, ds, 'Noa Groupwoman');
    expect(await teamNames(gal)).toContain('Edge');
    await send('patch', `/api/v1/admin/teams/${t.body.id}`, { groupId: ids.product }).expect(200);
    expect(await teamNames(gal)).not.toContain('Edge');
    expect(await teamNames(noa)).toContain('Edge');
  });

  it('onboards a person: create, add to team, make team lead, set grade', async () => {
    const p = await send('post', '/api/v1/admin/people', {
      displayName: 'New Lead',
      email: 'New.Lead@Example.invalid',
    }).expect(201);
    expect(p.body.email).toBe('new.lead@example.invalid');
    ids.newLead = p.body.id;
    await send('post', '/api/v1/admin/memberships', {
      userId: ids.newLead,
      teamId: ids.pipelines,
    }).expect(201);
    const r = await send('post', '/api/v1/admin/role-assignments', {
      userId: ids.newLead,
      role: 'TEAM_LEAD',
      scopeType: 'TEAM',
      scopeId: ids.pipelines,
    }).expect(201);
    ids.newLeadRole = r.body.id;
    await send('post', `/api/v1/admin/people/${ids.newLead}/grade`, { gradeCode: 'SENIOR' }).expect(
      201,
    );
    const detail = (await admin.get(`/api/v1/admin/people/${ids.newLead}`).expect(200)).body;
    expect(detail.memberships).toHaveLength(1);
    expect(detail.roles[0]).toMatchObject({ role: 'TEAM_LEAD', scope_name: 'Pipelines' });
    expect(detail.grades[0]).toMatchObject({ code: 'SENIOR', effective_to: null });
    const team = (await admin.get(`/api/v1/admin/teams/${ids.pipelines}/memberships`).expect(200))
      .body;
    expect(team.map((m: { display_name: string }) => m.display_name)).toEqual(['New Lead']);
  });

  it('transfers a person: old membership ends at the transfer date, scopes follow', async () => {
    const taylor = await login(app, ds, 'Taylor Lead');
    await taylor.get(`/api/v1/developers/${ids.eli}`).expect(200);
    const at = new Date(Date.now() - 60_000);
    const res = await send('post', '/api/v1/admin/memberships', {
      userId: ids.eli,
      teamId: ids.mobile,
      effectiveFrom: at.toISOString(),
    }).expect(201);
    expect(res.body.endedTeams).toEqual([ids.payments]);
    const rows = await ds.query(
      `SELECT team_id, effective_to FROM team_memberships WHERE user_id = $1 ORDER BY effective_from`,
      [ids.eli],
    );
    expect(rows.map((r: { team_id: string }) => r.team_id)).toEqual([ids.payments, ids.mobile]);
    expect(new Date(rows[0].effective_to).toISOString()).toBe(at.toISOString());
    expect(rows[1].effective_to).toBeNull();
    await (await login(app, ds, 'Taylor Lead')).get(`/api/v1/developers/${ids.eli}`).expect(404);
    await (await login(app, ds, 'Rae Lead')).get(`/api/v1/developers/${ids.eli}`).expect(200);
    const [a] = await ds.query(
      `SELECT count(*)::int AS n FROM audit_events WHERE action = 'membership.transfer'`,
    );
    expect(a.n).toBe(1);
  });

  it('prevents administrators from changing their own roles', async () => {
    await send('post', '/api/v1/admin/role-assignments', {
      userId: ids.avery,
      role: 'GROUP_MANAGER',
      scopeType: 'GROUP',
      scopeId: ids.platform,
    }).expect(403);
    const [own] = await ds.query(
      `SELECT id FROM role_assignments WHERE user_id = $1 AND role = 'ADMIN'`,
      [ids.avery],
    );
    await send('post', `/api/v1/admin/role-assignments/${own.id}/end`, {}).expect(403);
    await send('patch', `/api/v1/admin/people/${ids.avery}`, { active: false }).expect(403);
  });

  it('keeps at least one active administrator', async () => {
    const [own] = await ds.query(
      `SELECT id FROM role_assignments WHERE user_id = $1 AND role = 'ADMIN'`,
      [ids.avery],
    );
    // Defence in depth below the API's self-change rule: no actor may end the last admin role.
    const svc = app.get(OrgAdminService);
    await expect(svc.endRole(ids.eli, own.id, new Date())).rejects.toThrow(
      'at least one active administrator',
    );
    // With a second admin, the first can be removed by them.
    const second = await send('post', '/api/v1/admin/role-assignments', {
      userId: ids.newLead,
      role: 'ADMIN',
      scopeType: 'SYSTEM',
    }).expect(201);
    expect(second.body.scopeId).toBeNull();
    await svc.endRole(ids.newLead, own.id, new Date());
    const [still] = await ds.query(
      `SELECT count(*)::int AS n FROM role_assignments WHERE role = 'ADMIN' AND effective_to IS NULL`,
    );
    expect(still.n).toBe(1);
  });

  it('deactivating a person ends their sessions immediately', async () => {
    const jo = await login(app, ds, 'Jo Small');
    await jo.get('/api/v1/me').expect(200);
    const admin2 = await (async () => {
      await ds.query(`UPDATE users SET is_synthetic = true WHERE id = $1`, [ids.newLead]);
      return login(app, ds, 'New Lead'); // now the remaining administrator
    })();
    const joId = await userId(ds, 'Jo Small');
    const res = await send(
      'patch',
      `/api/v1/admin/people/${joId}`,
      { active: false },
      admin2,
    ).expect(200);
    expect(res.body.active).toBe(false);
    await jo.get('/api/v1/me').expect(401);
    const [a] = await ds.query(
      `SELECT metadata_json FROM audit_events WHERE action = 'person.update' AND resource_id = $1`,
      [joId],
    );
    expect(a.metadata_json).toEqual({ changed: ['active'] }); // no personal values in the audit trail
  });

  it('validates roles, memberships, grades and team deactivation', async () => {
    const s = admin; // Avery is no longer an admin after the previous test
    await s.get(`/api/v1/admin/people/${ids.eli}`).expect(403);
    const a2 = await login(app, ds, 'New Lead');
    const post = (path: string, body: object) => send('post', path, body, a2);
    await post('/api/v1/admin/role-assignments', {
      userId: ids.eli,
      role: 'TEAM_LEAD',
      scopeType: 'GROUP',
      scopeId: ids.product,
    }).expect(400);
    await post('/api/v1/admin/role-assignments', {
      userId: ids.eli,
      role: 'DEVELOPER',
      scopeType: 'TEAM',
      scopeId: ids.mobile,
    }).expect(400);
    await post('/api/v1/admin/role-assignments', {
      userId: ids.eli,
      role: 'TEAM_LEAD',
      scopeType: 'TEAM',
    }).expect(400);
    await post('/api/v1/admin/role-assignments', {
      userId: ids.eli,
      role: 'TEAM_LEAD',
      scopeType: 'TEAM',
      scopeId: '00000000-0000-0000-0000-000000000000',
    }).expect(404);
    await post('/api/v1/admin/role-assignments', {
      userId: ids.eli,
      role: 'TEAM_LEAD',
      scopeType: 'TEAM',
      scopeId: ids.mobile,
    }).expect(201);
    await post('/api/v1/admin/role-assignments', {
      userId: ids.eli,
      role: 'TEAM_LEAD',
      scopeType: 'TEAM',
      scopeId: ids.mobile,
    }).expect(409);
    await post('/api/v1/admin/memberships', { userId: ids.eli, teamId: ids.mobile }).expect(409); // already a member
    const [m] = await ds.query(
      `SELECT id FROM team_memberships WHERE user_id = $1 AND effective_to IS NULL`,
      [ids.eli],
    );
    await post(`/api/v1/admin/memberships/${m.id}/end`, {
      effectiveTo: '2000-01-01T00:00:00Z',
    }).expect(400);
    await post(`/api/v1/admin/people/${ids.eli}/grade`, { gradeCode: 'PRINCIPAL' }).expect(404);
    await send('patch', `/api/v1/admin/teams/${ids.mobile}`, { active: false }, a2).expect(409);
    await post('/api/v1/admin/people', { displayName: 'Bad', email: 'not-an-email' }).expect(400);
    await post('/api/v1/admin/groups', { organizationId: ids.org, name: '' }).expect(400);
  });
});
