import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { rows } from '../db/rows';

export interface SetupAdminInput {
  name: string;
  email: string;
  /** Needed only while the installation has no organization yet. */
  organization?: string;
}

/**
 * First setup of an empty installation (CLI `setup-admin`): creates the organization if there is
 * none and makes one person an administrator, so they can sign in (linked by verified e-mail) and
 * build the rest in Administration. Repeatable; an existing person with the same e-mail is reused.
 * Runs on the server only (no API), audited with no actor.
 */
export async function setupAdmin(ds: DataSource, audit: AuditService, input: SetupAdminInput) {
  const name = input.name?.trim();
  const email = input.email?.trim().toLowerCase();
  const orgName = input.organization?.trim();
  if (!name) throw new Error('setup-admin: --name is required (the person’s display name)');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('setup-admin: --email must be a valid e-mail (the same as in the directory)');
  }
  return ds.transaction(async (m) => {
    await m.query(`SELECT pg_advisory_xact_lock(4004010)`);
    let organizationCreated = false;
    const orgs = await rows<{ id: string; name: string }>(
      m,
      `SELECT id, name FROM organizations ORDER BY name`,
    );
    if (orgs.length === 0) {
      if (!orgName) {
        throw new Error(
          'setup-admin: --org is required: this installation has no organization yet',
        );
      }
      const [o] = await rows<{ id: string }>(
        m,
        `INSERT INTO organizations(name) VALUES ($1) RETURNING id`,
        [orgName],
      );
      orgs.push({ id: o.id, name: orgName });
      organizationCreated = true;
    }

    const found = await rows<{ id: string; active: boolean }>(
      m,
      `SELECT id, active FROM users WHERE lower(email) = $1`,
      [email],
    );
    if (found.length > 1) {
      throw new Error(`setup-admin: several people have the e-mail ${email}; fix that first`);
    }
    if (found[0] && !found[0].active) {
      throw new Error(
        `setup-admin: the person with ${email} is deactivated; reactivate them first`,
      );
    }
    let userId = found[0]?.id;
    const userCreated = !userId;
    if (!userId) {
      [{ id: userId }] = await rows<{ id: string }>(
        m,
        `INSERT INTO users(display_name, email) VALUES ($1, $2) RETURNING id`,
        [name, email],
      );
    }

    const granted = await rows(
      m,
      `INSERT INTO role_assignments(user_id, role, scope_type)
       SELECT $1, 'ADMIN', 'SYSTEM'
        WHERE NOT EXISTS (SELECT 1 FROM role_assignments WHERE user_id = $1 AND role = 'ADMIN'
                            AND effective_from <= now() AND (effective_to IS NULL OR effective_to > now()))
       RETURNING id`,
      [userId],
    );
    const result = {
      userId,
      organization: orgs[0].name,
      organizationCreated,
      userCreated,
      roleGranted: granted.length > 0,
    };
    if (organizationCreated || userCreated || result.roleGranted) {
      await audit.record(null, 'admin.bootstrap', 'user', userId, { ...result, email }, m);
    }
    return result;
  });
}
