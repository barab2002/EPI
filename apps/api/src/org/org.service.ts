import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DATA_SOURCE } from '../db/data-source';
import type { Scope } from './scope.service';

export type Access = 'managed' | 'aggregate' | 'structure';

export interface TeamNode {
  id: string;
  name: string;
  access: Access;
  memberCount: number | null;
}
export interface GroupNode {
  id: string;
  name: string;
  access: Access | null;
  teams: TeamNode[];
}
export interface OrgNode {
  id: string;
  name: string;
  access: Access | null;
  groups: GroupNode[];
}

@Injectable()
export class OrgService {
  constructor(@Inject(DATA_SOURCE) private readonly ds: DataSource) {}

  private teamAccess(scope: Scope, teamId: string): Access | null {
    if (scope.managedTeamIds.has(teamId)) return 'managed';
    if (scope.aggregateTeamIds.has(teamId)) return 'aggregate';
    if (scope.isAdmin) return 'structure';
    return null;
  }

  /** Organization tree pruned to what the caller may see. Admins see structure (names) only. */
  async tree(scope: Scope): Promise<OrgNode[]> {
    const rows: {
      org_id: string;
      org_name: string;
      group_id: string | null;
      group_name: string;
      team_id: string | null;
      team_name: string;
      member_count: number;
    }[] = await this.ds.query(
      `SELECT o.id AS org_id, o.name AS org_name, g.id AS group_id, g.name AS group_name,
              t.id AS team_id, t.name AS team_name,
              (SELECT count(DISTINCT m.user_id)::int FROM team_memberships m WHERE m.team_id = t.id
                 AND m.effective_from <= now() AND (m.effective_to IS NULL OR m.effective_to > now())) AS member_count
       FROM organizations o LEFT JOIN org_groups g ON g.organization_id = o.id
       LEFT JOIN teams t ON t.group_id = g.id AND t.active
       WHERE t.id IS NOT NULL OR $1::boolean ORDER BY o.name, g.name, t.name`,
      [scope.isAdmin], // administrators also see empty organizations and groups, to build them
    );
    const orgs = new Map<string, OrgNode>();
    for (const r of rows) {
      const access = r.team_id ? this.teamAccess(scope, r.team_id) : null;
      if (!access && !(scope.isAdmin && !r.team_id)) continue;
      let org = orgs.get(r.org_id);
      if (!org) {
        org = {
          id: r.org_id,
          name: r.org_name,
          access: scope.managedOrganizationIds.has(r.org_id) ? 'managed' : null,
          groups: [],
        };
        orgs.set(r.org_id, org);
      }
      if (!r.group_id) continue;
      let group = org.groups.find((g) => g.id === r.group_id);
      if (!group) {
        group = {
          id: r.group_id,
          name: r.group_name,
          access: scope.managedGroupIds.has(r.group_id) ? 'managed' : null,
          teams: [],
        };
        org.groups.push(group);
      }
      if (!r.team_id || !access) continue;
      group.teams.push({
        id: r.team_id,
        name: r.team_name,
        access,
        memberCount: access === 'aggregate' ? null : r.member_count,
      });
    }
    return [...orgs.values()];
  }

  async group(scope: Scope, id: string) {
    if (!scope.managedGroupIds.has(id) && !scope.isAdmin) throw new NotFoundException('Not found');
    const [g] = await this.ds.query(
      `SELECT g.id, g.name, o.id AS organization_id, o.name AS organization_name
       FROM org_groups g JOIN organizations o ON o.id = g.organization_id WHERE g.id = $1`,
      [id],
    );
    if (!g) throw new NotFoundException('Not found');
    const tree = await this.tree(scope);
    const teams = tree.flatMap((o) => o.groups).find((x) => x.id === id)?.teams ?? [];
    return { ...g, access: scope.managedGroupIds.has(id) ? 'managed' : 'structure', teams };
  }

  async team(scope: Scope, id: string) {
    const access = this.teamAccess(scope, id);
    if (!access) throw new NotFoundException('Not found');
    const [t] = await this.ds.query(
      `SELECT t.id, t.name, g.id AS group_id, g.name AS group_name, o.id AS organization_id,
              o.name AS organization_name
       FROM teams t JOIN org_groups g ON g.id = t.group_id JOIN organizations o ON o.id = g.organization_id
       WHERE t.id = $1`,
      [id],
    );
    if (!t) throw new NotFoundException('Not found');
    // Member list only for managers and admins (admins: names for administration, no metrics).
    const members =
      access === 'aggregate'
        ? null
        : await this.ds.query(
            `SELECT u.id, u.display_name, pg.label AS grade,
                    EXISTS (SELECT 1 FROM role_assignments ra WHERE ra.user_id = u.id
                            AND ra.role = 'TEAM_LEAD' AND ra.scope_id = $1
                            AND (ra.effective_to IS NULL OR ra.effective_to > now())) AS is_lead
             FROM team_memberships m JOIN users u ON u.id = m.user_id
             LEFT JOIN grade_history gh ON gh.user_id = u.id AND gh.effective_from <= now()
                  AND (gh.effective_to IS NULL OR gh.effective_to > now())
             LEFT JOIN professional_grades pg ON pg.id = gh.grade_id
             WHERE m.team_id = $1 AND m.effective_from <= now()
                   AND (m.effective_to IS NULL OR m.effective_to > now())
             ORDER BY is_lead DESC, u.display_name`,
            [id],
          );
    return { ...t, access, members };
  }

  async developer(scope: Scope, id: string) {
    if (!scope.visibleUserIds.has(id)) throw new NotFoundException('Not found');
    const [u] = await this.ds.query(
      `SELECT u.id, u.display_name, u.is_synthetic, pg.label AS grade, gh.effective_from AS grade_since,
              gh.experience_months_at_start
       FROM users u
       LEFT JOIN grade_history gh ON gh.user_id = u.id AND gh.effective_from <= now()
            AND (gh.effective_to IS NULL OR gh.effective_to > now())
       LEFT JOIN professional_grades pg ON pg.id = gh.grade_id
       WHERE u.id = $1`,
      [id],
    );
    if (!u) throw new NotFoundException('Not found');
    const teams = await this.ds.query(
      `SELECT t.id, t.name, g.id AS group_id, g.name AS group_name, m.effective_from, m.effective_to
       FROM team_memberships m JOIN teams t ON t.id = m.team_id JOIN org_groups g ON g.id = t.group_id
       WHERE m.user_id = $1 ORDER BY m.effective_from DESC`,
      [id],
    );
    return { ...u, teams, isSelf: id === scope.userId };
  }
}
