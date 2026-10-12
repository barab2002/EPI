import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DATA_SOURCE } from '../db/data-source';

export type Role =
  | 'DEVELOPER'
  | 'TEAM_LEAD'
  | 'GROUP_MANAGER'
  | 'ENGINEERING_MANAGER'
  | 'ADMIN'
  | 'HR_PARTNER';

/**
 * The caller's effective permissions at a point in time. Built only from EPI's own
 * role_assignments/team_memberships (never from IdP claims or request parameters).
 */
export interface Scope {
  userId: string;
  roles: Role[];
  isAdmin: boolean;
  /** Teams whose members, member KPIs and private reviews the caller manages. */
  managedTeamIds: Set<string>;
  /** Organizations fully inside the caller's management scope. */
  managedOrganizationIds: Set<string>;
  /** Groups fully inside the caller's management scope. */
  managedGroupIds: Set<string>;
  /** Teams the caller may see as an aggregate only (own team for developers). */
  aggregateTeamIds: Set<string>;
  /** People whose individual data the caller may read: self + current members of managed teams. */
  visibleUserIds: Set<string>;
  /** People the caller may write monthly assessments for (managed members, never self). */
  reviewableUserIds: Set<string>;
}

@Injectable()
export class ScopeService {
  constructor(@Inject(DATA_SOURCE) private readonly ds: DataSource) {}

  async resolve(userId: string, at: Date = new Date()): Promise<Scope> {
    const assignments: { role: Role; scope_type: string; scope_id: string | null }[] =
      await this.ds.query(
        `SELECT role, scope_type, scope_id FROM role_assignments
         WHERE user_id = $1 AND effective_from <= $2 AND (effective_to IS NULL OR effective_to > $2)`,
        [userId, at],
      );
    const roles = [...new Set<Role>(['DEVELOPER', ...assignments.map((a) => a.role)])];

    const orgIds = assignments
      .filter((a) => a.role === 'ENGINEERING_MANAGER' && a.scope_type === 'ORGANIZATION')
      .map((a) => a.scope_id as string);
    const groupIds = assignments
      .filter(
        (a) =>
          (a.role === 'GROUP_MANAGER' || a.role === 'ENGINEERING_MANAGER') &&
          a.scope_type === 'GROUP',
      )
      .map((a) => a.scope_id as string);
    const teamIds = assignments
      .filter((a) => a.role === 'TEAM_LEAD' && a.scope_type === 'TEAM')
      .map((a) => a.scope_id as string);

    const managed: { team_id: string; group_id: string; whole_group: boolean }[] =
      await this.ds.query(
        `SELECT t.id AS team_id, t.group_id,
                (g.organization_id = ANY($1::uuid[]) OR g.id = ANY($2::uuid[])) AS whole_group
         FROM teams t JOIN org_groups g ON g.id = t.group_id
         WHERE g.organization_id = ANY($1::uuid[]) OR g.id = ANY($2::uuid[]) OR t.id = ANY($3::uuid[])`,
        [orgIds, groupIds, teamIds],
      );
    const managedTeamIds = new Set(managed.map((r) => r.team_id));
    const managedGroupIds = new Set(managed.filter((r) => r.whole_group).map((r) => r.group_id));

    const members: { user_id: string }[] = managedTeamIds.size
      ? await this.ds.query(
          `SELECT DISTINCT user_id FROM team_memberships
           WHERE team_id = ANY($1::uuid[]) AND effective_from <= $2
             AND (effective_to IS NULL OR effective_to > $2)`,
          [[...managedTeamIds], at],
        )
      : [];
    const reviewableUserIds = new Set(members.map((r) => r.user_id).filter((id) => id !== userId));

    const ownTeams: { team_id: string }[] = await this.ds.query(
      `SELECT team_id FROM team_memberships
       WHERE user_id = $1 AND effective_from <= $2 AND (effective_to IS NULL OR effective_to > $2)`,
      [userId, at],
    );
    const aggregateTeamIds = new Set([...managedTeamIds, ...ownTeams.map((r) => r.team_id)]);

    return {
      userId,
      roles,
      isAdmin: roles.includes('ADMIN'),
      managedOrganizationIds: new Set(orgIds),
      managedTeamIds,
      managedGroupIds,
      aggregateTeamIds,
      visibleUserIds: new Set([userId, ...reviewableUserIds]),
      reviewableUserIds,
    };
  }
}
