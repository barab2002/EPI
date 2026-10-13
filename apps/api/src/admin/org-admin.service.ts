import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { DATA_SOURCE } from '../db/data-source';
import { rows } from '../db/rows';
import type { Role } from '../org/scope.service';

/** Which scope each role may be assigned on (spec §5). */
export const ROLE_SCOPES: Record<Role, ('ORGANIZATION' | 'GROUP' | 'TEAM' | 'SYSTEM')[]> = {
  DEVELOPER: [], // implicit for everyone; never assigned explicitly
  TEAM_LEAD: ['TEAM'],
  GROUP_MANAGER: ['GROUP'],
  ENGINEERING_MANAGER: ['ORGANIZATION', 'GROUP'],
  ADMIN: ['SYSTEM'],
  HR_PARTNER: ['ORGANIZATION', 'GROUP'],
};

const SCOPE_TABLE = { ORGANIZATION: 'organizations', GROUP: 'org_groups', TEAM: 'teams' } as const;

/**
 * Organization administration (EPI-004b): structure, people, effective-dated memberships, roles
 * and grades. History is preserved (end dates, never hard deletes) and every change is audited.
 * Admins cannot change their own roles, and the last active administrator cannot be removed.
 */
@Injectable()
export class OrgAdminService {
  constructor(
    @Inject(DATA_SOURCE) private readonly ds: DataSource,
    private readonly audit: AuditService,
  ) {}

  private async one<T>(
    m: EntityManager | DataSource,
    sql: string,
    params: unknown[],
    what: string,
  ): Promise<T> {
    const [row] = await rows<T>(m, sql, params);
    if (!row) throw new NotFoundException(`${what} not found`);
    return row;
  }

  // ---------- structure ----------

  async createGroup(actor: string, organizationId: string, name: string) {
    return this.ds.transaction(async (m) => {
      await this.one(
        m,
        `SELECT id FROM organizations WHERE id = $1`,
        [organizationId],
        'Organization',
      );
      const g = await this.one<{ id: string }>(
        m,
        `INSERT INTO org_groups(organization_id, name) VALUES ($1, $2) RETURNING id`,
        [organizationId, name.trim()],
        'Group',
      );
      await this.audit.record(actor, 'group.create', 'group', g.id, { name: name.trim() }, m);
      return { id: g.id, name: name.trim(), organizationId };
    });
  }

  async renameGroup(actor: string, id: string, name: string) {
    return this.ds.transaction(async (m) => {
      const prev = await this.one<{ name: string }>(
        m,
        `SELECT name FROM org_groups WHERE id = $1`,
        [id],
        'Group',
      );
      await m.query(`UPDATE org_groups SET name = $2 WHERE id = $1`, [id, name.trim()]);
      await this.audit.record(
        actor,
        'group.rename',
        'group',
        id,
        { from: prev.name, to: name.trim() },
        m,
      );
      return { id, name: name.trim() };
    });
  }

  async createTeam(actor: string, groupId: string, name: string) {
    return this.ds.transaction(async (m) => {
      await this.one(m, `SELECT id FROM org_groups WHERE id = $1`, [groupId], 'Group');
      const t = await this.one<{ id: string }>(
        m,
        `INSERT INTO teams(group_id, name) VALUES ($1, $2) RETURNING id`,
        [groupId, name.trim()],
        'Team',
      );
      await this.audit.record(
        actor,
        'team.create',
        'team',
        t.id,
        { groupId, name: name.trim() },
        m,
      );
      return { id: t.id, name: name.trim(), groupId, active: true };
    });
  }

  /** Rename, move to another group (changes who manages it) or (de)activate a team. */
  async updateTeam(
    actor: string,
    id: string,
    patch: { name?: string; groupId?: string; active?: boolean },
  ) {
    return this.ds.transaction(async (m) => {
      const prev = await this.one<{ name: string; group_id: string; active: boolean }>(
        m,
        `SELECT name, group_id, active FROM teams WHERE id = $1 FOR UPDATE`,
        [id],
        'Team',
      );
      if (patch.groupId) {
        const [from] = await m.query(`SELECT organization_id FROM org_groups WHERE id = $1`, [
          prev.group_id,
        ]);
        const to = await this.one<{ organization_id: string }>(
          m,
          `SELECT organization_id FROM org_groups WHERE id = $1`,
          [patch.groupId],
          'Group',
        );
        if (from.organization_id !== to.organization_id) {
          throw new BadRequestException(
            'Teams can only move between groups of the same organization',
          );
        }
      }
      if (patch.active === false) {
        const [open] = await m.query(
          `SELECT count(*)::int AS n FROM team_memberships WHERE team_id = $1 AND effective_to IS NULL`,
          [id],
        );
        if (open.n > 0) {
          throw new ConflictException(
            `End the ${open.n} current membership(s) before deactivating the team`,
          );
        }
      }
      const next = {
        name: patch.name?.trim() ?? prev.name,
        group_id: patch.groupId ?? prev.group_id,
        active: patch.active ?? prev.active,
      };
      await m.query(`UPDATE teams SET name = $2, group_id = $3, active = $4 WHERE id = $1`, [
        id,
        next.name,
        next.group_id,
        next.active,
      ]);
      await this.audit.record(actor, 'team.update', 'team', id, { from: prev, to: next }, m);
      return { id, name: next.name, groupId: next.group_id, active: next.active };
    });
  }

  // ---------- people ----------

  async createPerson(actor: string, displayName: string, email: string | null) {
    return this.ds.transaction(async (m) => {
      const p = await this.one<{ id: string }>(
        m,
        `INSERT INTO users(display_name, email) VALUES ($1, $2) RETURNING id`,
        [displayName.trim(), email?.trim().toLowerCase() || null],
        'Person',
      );
      await this.audit.record(actor, 'person.create', 'user', p.id, {}, m);
      return {
        id: p.id,
        displayName: displayName.trim(),
        email: email?.trim().toLowerCase() || null,
        active: true,
      };
    });
  }

  /** Deactivation ends sessions (they are refused for inactive users) and keeps history. */
  async updatePerson(
    actor: string,
    id: string,
    patch: { displayName?: string; email?: string | null; active?: boolean },
  ) {
    return this.ds.transaction(async (m) => {
      const prev = await this.one<{ display_name: string; email: string | null; active: boolean }>(
        m,
        `SELECT display_name, email, active FROM users WHERE id = $1 FOR UPDATE`,
        [id],
        'Person',
      );
      if (patch.active === false) {
        if (id === actor) throw new ForbiddenException('You cannot deactivate yourself');
        await this.assertNotLastAdmin(m, id);
      }
      const next = {
        display_name: patch.displayName?.trim() ?? prev.display_name,
        email: patch.email === undefined ? prev.email : patch.email?.trim().toLowerCase() || null,
        active: patch.active ?? prev.active,
      };
      await m.query(`UPDATE users SET display_name = $2, email = $3, active = $4 WHERE id = $1`, [
        id,
        next.display_name,
        next.email,
        next.active,
      ]);
      if (!next.active) await m.query(`DELETE FROM sessions WHERE user_id = $1`, [id]);
      // Never log personal data values in the audit trail; only which fields changed.
      const changed = Object.keys(next).filter(
        (k) => next[k as keyof typeof next] !== prev[k as keyof typeof prev],
      );
      await this.audit.record(actor, 'person.update', 'user', id, { changed }, m);
      return { id, displayName: next.display_name, email: next.email, active: next.active };
    });
  }

  async person(id: string) {
    const p = await this.one<Record<string, unknown>>(
      this.ds,
      `SELECT id, display_name, email, active FROM users WHERE id = $1`,
      [id],
      'Person',
    );
    const [memberships, roles, grades] = await Promise.all([
      this.ds.query(
        `SELECT m.id, m.team_id, t.name AS team_name, g.name AS group_name, m.effective_from, m.effective_to
         FROM team_memberships m JOIN teams t ON t.id = m.team_id JOIN org_groups g ON g.id = t.group_id
         WHERE m.user_id = $1 ORDER BY m.effective_from DESC`,
        [id],
      ),
      this.ds.query(
        `SELECT ra.id, ra.role, ra.scope_type, ra.scope_id, ra.effective_from, ra.effective_to,
                COALESCE(o.name, g.name, t.name) AS scope_name
         FROM role_assignments ra
         LEFT JOIN organizations o ON ra.scope_type = 'ORGANIZATION' AND o.id = ra.scope_id
         LEFT JOIN org_groups g ON ra.scope_type = 'GROUP' AND g.id = ra.scope_id
         LEFT JOIN teams t ON ra.scope_type = 'TEAM' AND t.id = ra.scope_id
         WHERE ra.user_id = $1 ORDER BY ra.effective_to NULLS FIRST, ra.effective_from DESC`,
        [id],
      ),
      this.ds.query(
        `SELECT gh.id, pg.code, pg.label, gh.effective_from, gh.effective_to
         FROM grade_history gh JOIN professional_grades pg ON pg.id = gh.grade_id
         WHERE gh.user_id = $1 ORDER BY gh.effective_from DESC`,
        [id],
      ),
    ]);
    return { ...p, memberships, roles, grades };
  }

  // ---------- memberships ----------

  async teamMembers(teamId: string) {
    await this.one(this.ds, `SELECT id FROM teams WHERE id = $1`, [teamId], 'Team');
    return this.ds.query(
      `SELECT m.id, m.user_id, u.display_name, u.active, m.effective_from, m.effective_to
       FROM team_memberships m JOIN users u ON u.id = m.user_id
       WHERE m.team_id = $1 ORDER BY (m.effective_to IS NULL) DESC, u.display_name, m.effective_from DESC`,
      [teamId],
    );
  }

  /**
   * Adds a person to a team from `effectiveFrom`. With `transfer` (default), any other open
   * membership is ended at the same instant, so history attributes earlier work to the old team.
   */
  async addMembership(
    actor: string,
    userId: string,
    teamId: string,
    effectiveFrom: Date,
    transfer = true,
  ) {
    return this.ds.transaction(async (m) => {
      await this.one(
        m,
        `SELECT id FROM users WHERE id = $1 AND active FOR UPDATE`,
        [userId],
        'Active person',
      );
      const team = await this.one<{ active: boolean }>(
        m,
        `SELECT active FROM teams WHERE id = $1`,
        [teamId],
        'Team',
      );
      if (!team.active) throw new ConflictException('Team is inactive');
      const [overlap] = await m.query(
        `SELECT id FROM team_memberships WHERE user_id = $1 AND team_id = $2
           AND (effective_to IS NULL OR effective_to > $3)`,
        [userId, teamId, effectiveFrom],
      );
      if (overlap) throw new ConflictException('Person already belongs to this team at that date');
      const ended: string[] = [];
      if (transfer) {
        const open: { id: string; team_id: string; effective_from: Date }[] = await m.query(
          `SELECT id, team_id, effective_from FROM team_memberships WHERE user_id = $1 AND effective_to IS NULL`,
          [userId],
        );
        for (const o of open) {
          if (new Date(o.effective_from).getTime() >= effectiveFrom.getTime()) {
            throw new BadRequestException(
              'Transfer date must be after the start of the current membership',
            );
          }
          await m.query(`UPDATE team_memberships SET effective_to = $2 WHERE id = $1`, [
            o.id,
            effectiveFrom,
          ]);
          ended.push(o.team_id);
        }
      }
      const row = await this.one<{ id: string }>(
        m,
        `INSERT INTO team_memberships(user_id, team_id, effective_from) VALUES ($1, $2, $3) RETURNING id`,
        [userId, teamId, effectiveFrom],
        'Membership',
      );
      await this.audit.record(
        actor,
        ended.length ? 'membership.transfer' : 'membership.add',
        'team_membership',
        row.id,
        { userId, teamId, effectiveFrom: effectiveFrom.toISOString(), endedTeams: ended },
        m,
      );
      return {
        id: row.id,
        userId,
        teamId,
        effectiveFrom: effectiveFrom.toISOString(),
        endedTeams: ended,
      };
    });
  }

  async endMembership(actor: string, id: string, effectiveTo: Date) {
    return this.ds.transaction(async (m) => {
      const mem = await this.one<{
        effective_from: Date;
        effective_to: Date | null;
        user_id: string;
        team_id: string;
      }>(
        m,
        `SELECT effective_from, effective_to, user_id, team_id FROM team_memberships WHERE id = $1 FOR UPDATE`,
        [id],
        'Membership',
      );
      if (mem.effective_to) throw new ConflictException('Membership already ended');
      if (effectiveTo.getTime() <= new Date(mem.effective_from).getTime()) {
        throw new BadRequestException('End date must be after the start date');
      }
      await m.query(`UPDATE team_memberships SET effective_to = $2 WHERE id = $1`, [
        id,
        effectiveTo,
      ]);
      await this.audit.record(
        actor,
        'membership.end',
        'team_membership',
        id,
        { userId: mem.user_id, teamId: mem.team_id, effectiveTo: effectiveTo.toISOString() },
        m,
      );
      return { id, effectiveTo: effectiveTo.toISOString() };
    });
  }

  // ---------- roles ----------

  private async assertNotLastAdmin(m: EntityManager, userId: string, excludingAssignment?: string) {
    const [isAdmin] = await m.query(
      `SELECT 1 FROM role_assignments WHERE user_id = $1 AND role = 'ADMIN' AND effective_to IS NULL`,
      [userId],
    );
    if (!isAdmin) return;
    const [others] = await m.query(
      `SELECT count(DISTINCT ra.user_id)::int AS n FROM role_assignments ra JOIN users u ON u.id = ra.user_id
       WHERE ra.role = 'ADMIN' AND ra.effective_to IS NULL AND u.active AND ra.user_id <> $1
         AND ($2::uuid IS NULL OR ra.id <> $2)`,
      [userId, excludingAssignment ?? null],
    );
    if (others.n === 0)
      throw new ConflictException('EPI must keep at least one active administrator');
  }

  async assignRole(
    actor: string,
    input: {
      userId: string;
      role: Role;
      scopeType: 'ORGANIZATION' | 'GROUP' | 'TEAM' | 'SYSTEM';
      scopeId: string | null;
      effectiveFrom: Date;
    },
  ) {
    if (input.userId === actor) {
      throw new ForbiddenException(
        'Administrators cannot change their own roles (ask another administrator)',
      );
    }
    const allowed = ROLE_SCOPES[input.role];
    if (!allowed?.length)
      throw new BadRequestException(`${input.role} is implicit and cannot be assigned`);
    if (!allowed.includes(input.scopeType)) {
      throw new BadRequestException(`${input.role} can only be assigned on: ${allowed.join(', ')}`);
    }
    if ((input.scopeType === 'SYSTEM') !== (input.scopeId === null)) {
      throw new BadRequestException(
        'scopeId is required for organization/group/team roles and forbidden for SYSTEM',
      );
    }
    return this.ds.transaction(async (m) => {
      await this.one(
        m,
        `SELECT id FROM users WHERE id = $1 AND active`,
        [input.userId],
        'Active person',
      );
      if (input.scopeType !== 'SYSTEM') {
        await this.one(
          m,
          `SELECT id FROM ${SCOPE_TABLE[input.scopeType]} WHERE id = $1`,
          [input.scopeId],
          'Scope',
        );
      }
      const [dup] = await m.query(
        `SELECT id FROM role_assignments WHERE user_id = $1 AND role = $2 AND scope_type = $3
           AND scope_id IS NOT DISTINCT FROM $4 AND effective_to IS NULL`,
        [input.userId, input.role, input.scopeType, input.scopeId],
      );
      if (dup) throw new ConflictException('This role is already assigned on that scope');
      const row = await this.one<{ id: string }>(
        m,
        `INSERT INTO role_assignments(user_id, role, scope_type, scope_id, effective_from)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [input.userId, input.role, input.scopeType, input.scopeId, input.effectiveFrom],
        'Role assignment',
      );
      await this.audit.record(
        actor,
        'role.assign',
        'role_assignment',
        row.id,
        {
          userId: input.userId,
          role: input.role,
          scopeType: input.scopeType,
          scopeId: input.scopeId,
        },
        m,
      );
      return { id: row.id, ...input, effectiveFrom: input.effectiveFrom.toISOString() };
    });
  }

  async endRole(actor: string, id: string, effectiveTo: Date) {
    return this.ds.transaction(async (m) => {
      const ra = await this.one<{
        user_id: string;
        role: Role;
        effective_from: Date;
        effective_to: Date | null;
      }>(
        m,
        `SELECT user_id, role, effective_from, effective_to FROM role_assignments WHERE id = $1 FOR UPDATE`,
        [id],
        'Role assignment',
      );
      if (ra.user_id === actor) {
        throw new ForbiddenException(
          'Administrators cannot change their own roles (ask another administrator)',
        );
      }
      if (ra.effective_to) throw new ConflictException('Role assignment already ended');
      if (effectiveTo.getTime() <= new Date(ra.effective_from).getTime()) {
        throw new BadRequestException('End date must be after the start date');
      }
      if (ra.role === 'ADMIN') await this.assertNotLastAdmin(m, ra.user_id, id);
      await m.query(`UPDATE role_assignments SET effective_to = $2 WHERE id = $1`, [
        id,
        effectiveTo,
      ]);
      await this.audit.record(
        actor,
        'role.end',
        'role_assignment',
        id,
        { userId: ra.user_id, role: ra.role },
        m,
      );
      return { id, effectiveTo: effectiveTo.toISOString() };
    });
  }

  // ---------- grades ----------

  grades() {
    return this.ds.query(`SELECT code, label, ordinal FROM professional_grades ORDER BY ordinal`);
  }

  async setGrade(actor: string, userId: string, gradeCode: string, effectiveFrom: Date) {
    return this.ds.transaction(async (m) => {
      await this.one(m, `SELECT id FROM users WHERE id = $1 FOR UPDATE`, [userId], 'Person');
      const grade = await this.one<{ id: string }>(
        m,
        `SELECT id FROM professional_grades WHERE code = $1`,
        [gradeCode],
        'Grade',
      );
      const [current] = await m.query(
        `SELECT id, grade_id, effective_from FROM grade_history WHERE user_id = $1 AND effective_to IS NULL`,
        [userId],
      );
      if (current) {
        if (current.grade_id === grade.id)
          throw new ConflictException('Person already has this grade');
        if (new Date(current.effective_from).getTime() >= effectiveFrom.getTime()) {
          throw new BadRequestException('New grade must start after the current grade started');
        }
        await m.query(`UPDATE grade_history SET effective_to = $2 WHERE id = $1`, [
          current.id,
          effectiveFrom,
        ]);
      }
      await m.query(
        `INSERT INTO grade_history(user_id, grade_id, effective_from) VALUES ($1, $2, $3)`,
        [userId, grade.id, effectiveFrom],
      );
      await this.audit.record(
        actor,
        'grade.set',
        'user',
        userId,
        { grade: gradeCode, effectiveFrom: effectiveFrom.toISOString() },
        m,
      );
      return { userId, grade: gradeCode, effectiveFrom: effectiveFrom.toISOString() };
    });
  }
}
