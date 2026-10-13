import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { EPI_CONFIG, EpiConfig } from '../config';
import { DATA_SOURCE } from '../db/data-source';
import { rows } from '../db/rows';
import { DirectoryGroup } from './directory.client';
import { EpiState, ImportPlan, planHash, planImport } from './import-plan';

/** Reads the configured team groups; injected so tests can use the synthetic directory. */
export interface DirectoryReader {
  readTeamGroups(): Promise<DirectoryGroup[]>;
}
export const DIRECTORY_READER = Symbol('DIRECTORY_READER');

export interface DirectoryPreview {
  readAt: string;
  hash: string;
  plan: ImportPlan;
  /** Group DN → name and member count as read, for the mapping screen. */
  groups: { dn: string; name: string | null; memberCount: number }[];
  teamNames: Record<string, string>;
}

/** Serializes imports (pg advisory lock key, arbitrary constant). */
const IMPORT_LOCK = 4_004_003;

/**
 * AD team import (EPI-004c): administrators map configured directory team groups to EPI teams,
 * preview the resulting plan, then apply exactly that plan. Read-only towards the directory;
 * every change is audited with `source: 'directory'`.
 */
@Injectable()
export class DirectoryService {
  constructor(
    @Inject(DATA_SOURCE) private readonly ds: DataSource,
    @Inject(EPI_CONFIG) private readonly config: EpiConfig,
    @Inject(DIRECTORY_READER) private readonly reader: DirectoryReader | null,
    private readonly audit: AuditService,
  ) {}

  private requireConfigured(): { teamGroups: string[]; reader: DirectoryReader } {
    if (!this.config.directory || !this.reader) {
      throw new NotFoundException(
        'The directory import is not configured on this server (EPI_LDAP_* settings).',
      );
    }
    return { teamGroups: this.config.directory.teamGroups, reader: this.reader };
  }

  /** Configuration and mappings only; does not contact the directory. */
  async status() {
    if (!this.config.directory) return { configured: false, groups: [] };
    const mapped = await rows<{
      group_dn: string;
      team_id: string | null;
      team_name: string | null;
    }>(
      this.ds,
      `SELECT d.group_dn, d.team_id, t.name AS team_name
         FROM directory_team_mappings d LEFT JOIN teams t ON t.id = d.team_id`,
    );
    const byDn = new Map(mapped.map((m) => [m.group_dn, m]));
    const [last] = await rows<{ at: Date; metadata_json: Record<string, unknown> }>(
      this.ds,
      `SELECT at, metadata_json FROM audit_events WHERE action = 'directory.import'
        ORDER BY at DESC LIMIT 1`,
    );
    return {
      configured: true,
      groups: this.config.directory.teamGroups.map((dn) => ({
        dn,
        teamId: byDn.get(dn)?.team_id ?? null,
        teamName: byDn.get(dn)?.team_name ?? null,
      })),
      lastImport: last ? { at: last.at, counts: last.metadata_json } : null,
    };
  }

  async setMapping(actor: string, groupDn: string, teamId: string | null) {
    const { teamGroups } = this.requireConfigured();
    if (!teamGroups.includes(groupDn)) {
      throw new BadRequestException(
        'Only the team groups configured in EPI_LDAP_TEAM_GROUPS can be mapped',
      );
    }
    return this.ds.transaction(async (m) => {
      if (teamId) {
        const [team] = await rows<{ active: boolean }>(
          m,
          `SELECT active FROM teams WHERE id = $1`,
          [teamId],
        );
        if (!team) throw new NotFoundException('Team not found');
        if (!team.active) throw new ConflictException('Team is inactive');
      }
      const [prev] = await rows<{ team_id: string | null }>(
        m,
        `SELECT team_id FROM directory_team_mappings WHERE group_dn = $1`,
        [groupDn],
      );
      await m.query(
        `INSERT INTO directory_team_mappings(group_dn, team_id, updated_at, updated_by)
         VALUES ($1, $2, now(), $3)
         ON CONFLICT (group_dn) DO UPDATE SET team_id = $2, updated_at = now(), updated_by = $3`,
        [groupDn, teamId, actor],
      );
      await this.audit.record(
        actor,
        'directory.mapping',
        'directory_group',
        null,
        { groupDn, from: prev?.team_id ?? null, to: teamId },
        m,
      );
      return { groupDn, teamId };
    });
  }

  private async state(m: EntityManager | DataSource, now: Date): Promise<EpiState> {
    const mappings = await rows<{ group_dn: string; team_id: string | null }>(
      m,
      `SELECT group_dn, team_id FROM directory_team_mappings`,
    );
    const teams = await rows<{ id: string; name: string }>(m, `SELECT id, name FROM teams`);
    const people = await rows<{
      id: string;
      display_name: string;
      email: string | null;
      active: boolean;
      directory_id: string | null;
    }>(
      m,
      `SELECT u.id, u.display_name, u.email, u.active, x.external_id AS directory_id
         FROM users u
         LEFT JOIN external_identities x ON x.user_id = u.id AND x.source = 'directory'
        ORDER BY u.id`,
    );
    const memberships = await rows<{ id: string; user_id: string; team_id: string }>(
      m,
      `SELECT id, user_id, team_id FROM team_memberships
        WHERE effective_to IS NULL AND effective_from <= $1 ORDER BY id`,
      [now],
    );
    return {
      mappings: Object.fromEntries(mappings.map((x) => [x.group_dn, x.team_id])),
      teams: Object.fromEntries(teams.map((t) => [t.id, t.name])),
      people: people.map((p) => ({
        id: p.id,
        displayName: p.display_name,
        email: p.email,
        active: p.active,
        directoryId: p.directory_id,
      })),
      memberships: memberships.map((x) => ({ id: x.id, userId: x.user_id, teamId: x.team_id })),
    };
  }

  /** Reads the directory and returns the plan with its fingerprint. Changes nothing. */
  async preview(): Promise<DirectoryPreview> {
    const { reader } = this.requireConfigured();
    const groups = await reader.readTeamGroups();
    const now = new Date();
    const state = await this.state(this.ds, now);
    const plan = planImport(groups, state);
    return {
      readAt: now.toISOString(),
      hash: planHash(plan),
      plan,
      groups: groups.map((g) => ({ dn: g.dn, name: g.name, memberCount: g.members.length })),
      teamNames: state.teams,
    };
  }

  /**
   * Re-reads the directory and re-plans inside one transaction; applies only when the plan is
   * exactly the one previewed (same hash), otherwise nothing changes and the admin previews again.
   */
  async apply(actor: string, hash: string) {
    const { reader } = this.requireConfigured();
    const groups = await reader.readTeamGroups();
    return this.ds.transaction(async (m) => {
      await m.query(`SELECT pg_advisory_xact_lock($1)`, [IMPORT_LOCK]);
      const now = new Date();
      const plan = planImport(groups, await this.state(m, now));
      if (planHash(plan) !== hash) {
        throw new ConflictException(
          'The directory or EPI changed since the preview. Preview again before applying.',
        );
      }
      const meta = { source: 'directory' };
      for (const c of plan.creates) {
        const [u] = await rows<{ id: string }>(
          m,
          `INSERT INTO users(display_name, email) VALUES ($1, $2) RETURNING id`,
          [c.displayName, c.email],
        );
        await m.query(
          `INSERT INTO external_identities(user_id, source, external_id, verified)
           VALUES ($1, 'directory', $2, true)`,
          [u.id, c.externalId],
        );
        await this.audit.record(actor, 'person.create', 'user', u.id, meta, m);
        await this.addMembership(m, actor, u.id, c.teamId, now);
      }
      for (const l of plan.links) {
        await m.query(
          `INSERT INTO external_identities(user_id, source, external_id, verified)
           VALUES ($1, 'directory', $2, true)`,
          [l.userId, l.externalId],
        );
        await this.audit.record(actor, 'directory.link', 'user', l.userId, meta, m);
      }
      for (const u of plan.updates) {
        await m.query(`UPDATE users SET display_name = $2, email = $3 WHERE id = $1`, [
          u.userId,
          u.to.displayName,
          u.to.email,
        ]);
        const changed = (['displayName', 'email'] as const).filter((k) => u.from[k] !== u.to[k]);
        await this.audit.record(actor, 'person.update', 'user', u.userId, { ...meta, changed }, m);
      }
      for (const a of plan.adds) {
        for (const id of a.endMembershipIds) await this.endMembership(m, actor, id, now);
        await this.addMembership(m, actor, a.userId, a.teamId, now);
      }
      for (const e of plan.ends) await this.endMembership(m, actor, e.membershipId, now);
      const counts = {
        created: plan.creates.length,
        linked: plan.links.length,
        updated: plan.updates.length,
        added: plan.adds.length,
        ended: plan.ends.length,
        conflicts: plan.conflicts.length,
      };
      await this.audit.record(actor, 'directory.import', 'directory', null, counts, m);
      return { appliedAt: now.toISOString(), ...counts };
    });
  }

  private async addMembership(
    m: EntityManager,
    actor: string,
    userId: string,
    teamId: string,
    at: Date,
  ) {
    const [row] = await rows<{ id: string }>(
      m,
      `INSERT INTO team_memberships(user_id, team_id, effective_from) VALUES ($1, $2, $3) RETURNING id`,
      [userId, teamId, at],
    );
    await this.audit.record(
      actor,
      'membership.add',
      'team_membership',
      row.id,
      { source: 'directory', userId, teamId, effectiveFrom: at.toISOString() },
      m,
    );
  }

  private async endMembership(m: EntityManager, actor: string, id: string, at: Date) {
    const [row] = await rows<{ user_id: string; team_id: string }>(
      m,
      `UPDATE team_memberships SET effective_to = $2
        WHERE id = $1 AND effective_to IS NULL AND effective_from < $2
        RETURNING user_id, team_id`,
      [id, at],
    );
    if (!row) throw new ConflictException('A membership changed during the import; preview again.');
    await this.audit.record(
      actor,
      'membership.end',
      'team_membership',
      id,
      {
        source: 'directory',
        userId: row.user_id,
        teamId: row.team_id,
        effectiveTo: at.toISOString(),
      },
      m,
    );
  }
}
