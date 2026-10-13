import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { setupAdmin } from '../src/admin/setup-admin';
import { AuditService } from '../src/audit/audit.service';
import { freshDatabase, login, startApp } from './helpers';

/** First setup of an empty installation: `setup-admin`, then the structure built in the UI. */
jest.setTimeout(120_000);

describe('First setup (integration)', () => {
  let ds: DataSource;
  let app: INestApplication;
  let audit: AuditService;
  const ada = { name: 'Ada Admin', email: 'Ada.Admin@corp.example', organization: 'Example Corp' };

  /** Demo sign-in accepts synthetic people only; these test people stand in for AD sign-in. */
  const signIn = async (name: string) => {
    await ds.query(`UPDATE users SET is_synthetic = true WHERE display_name = $1`, [name]);
    return login(app, ds, name);
  };

  beforeAll(async () => {
    ds = await freshDatabase(false); // empty: no people, no organization
    audit = new AuditService(ds);
    app = await startApp(ds);
  });
  afterAll(async () => {
    await app?.close();
    await ds?.destroy();
  });

  it('refuses incomplete input and needs an organization name on an empty installation', async () => {
    await expect(setupAdmin(ds, audit, { ...ada, email: 'not-an-email' })).rejects.toThrow(
      /valid e-mail/,
    );
    await expect(setupAdmin(ds, audit, { ...ada, name: ' ' })).rejects.toThrow(/--name/);
    await expect(setupAdmin(ds, audit, { ...ada, organization: undefined })).rejects.toThrow(
      /--org/,
    );
    expect((await ds.query(`SELECT count(*)::int AS n FROM users`))[0].n).toBe(0);
  });

  it('creates the organization and the first administrator, audited, and is repeatable', async () => {
    const r = await setupAdmin(ds, audit, ada);
    expect(r).toMatchObject({ organizationCreated: true, userCreated: true, roleGranted: true });
    const [u] = await ds.query(`SELECT display_name, email, active, is_synthetic FROM users`);
    expect(u).toEqual({
      display_name: 'Ada Admin',
      email: 'ada.admin@corp.example',
      active: true,
      is_synthetic: false,
    });
    const [role] = await ds.query(
      `SELECT role, scope_type, effective_to FROM role_assignments WHERE user_id = $1`,
      [r.userId],
    );
    expect(role).toEqual({ role: 'ADMIN', scope_type: 'SYSTEM', effective_to: null });
    const [a] = await ds.query(
      `SELECT actor_user_id, metadata_json FROM audit_events WHERE action = 'admin.bootstrap'`,
    );
    expect(a.actor_user_id).toBeNull();
    expect(a.metadata_json).toMatchObject({ organizationCreated: true, userCreated: true });

    const again = await setupAdmin(ds, audit, { ...ada, organization: undefined });
    expect(again).toMatchObject({
      userId: r.userId,
      organizationCreated: false,
      userCreated: false,
      roleGranted: false,
    });
    expect((await ds.query(`SELECT count(*)::int AS n FROM organizations`))[0].n).toBe(1);
    expect((await ds.query(`SELECT count(*)::int AS n FROM role_assignments`))[0].n).toBe(1);
  });

  it('makes an existing person (same e-mail) an administrator instead of creating a duplicate', async () => {
    await ds.query(
      `INSERT INTO users(display_name, email) VALUES ('Bo Lead', 'bo.lead@corp.example')`,
    );
    const r = await setupAdmin(ds, audit, { name: 'Bo', email: 'BO.LEAD@corp.example' });
    expect(r).toMatchObject({ userCreated: false, roleGranted: true });
    const [u] = await ds.query(`SELECT display_name FROM users WHERE id = $1`, [r.userId]);
    expect(u.display_name).toBe('Bo Lead'); // name kept
  });

  it('refuses a deactivated person', async () => {
    await ds.query(
      `INSERT INTO users(display_name, email, active) VALUES ('Cy Gone', 'cy@corp.example', false)`,
    );
    await expect(
      setupAdmin(ds, audit, { name: 'Cy Gone', email: 'cy@corp.example' }),
    ).rejects.toThrow(/deactivated/);
  });

  it('the administrator then builds the structure in the UI: empty organization and groups are listed', async () => {
    const admin = await signIn('Ada Admin');
    const tree = (await admin.get('/api/v1/organization/tree').expect(200)).body;
    expect(tree).toEqual([
      { id: expect.any(String), name: 'Example Corp', access: null, groups: [] },
    ]);
    const g = await admin
      .post('/api/v1/admin/groups', { organizationId: tree[0].id, name: 'Platform' })
      .expect(201);
    const withGroup = (await admin.get('/api/v1/organization/tree').expect(200)).body;
    expect(withGroup[0].groups).toEqual([
      { id: g.body.id, name: 'Platform', access: null, teams: [] },
    ]);
    await admin.post('/api/v1/admin/teams', { groupId: g.body.id, name: 'Payments' }).expect(201);
    const withTeam = (await admin.get('/api/v1/organization/tree').expect(200)).body;
    expect(withTeam[0].groups[0].teams).toEqual([
      { id: expect.any(String), name: 'Payments', access: 'structure', memberCount: 0 },
    ]);
  });

  it('people without a role still see nothing of the structure', async () => {
    await ds.query(`INSERT INTO users(display_name, email) VALUES ('Di Dev', 'di@corp.example')`);
    const di = await signIn('Di Dev');
    expect((await di.get('/api/v1/organization/tree').expect(200)).body).toEqual([]);
  });
});
