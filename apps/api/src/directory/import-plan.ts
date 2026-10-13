import { createHash } from 'node:crypto';
import type { DirectoryGroup } from './directory.client';

/** What EPI holds today, as far as the import is concerned. */
export interface EpiState {
  /** Configured group DN → EPI team id (null = known but not mapped). */
  mappings: Record<string, string | null>;
  /** Team id → name, for messages. */
  teams: Record<string, string>;
  people: {
    id: string;
    displayName: string;
    email: string | null;
    active: boolean;
    /** external_identities(source='directory').external_id, if linked. */
    directoryId: string | null;
  }[];
  /** Open (effective_to IS NULL) memberships. */
  memberships: { id: string; userId: string; teamId: string }[];
}

export interface ImportPlan {
  creates: { externalId: string; displayName: string; email: string | null; teamId: string }[];
  links: { userId: string; externalId: string }[];
  updates: {
    userId: string;
    from: { displayName: string; email: string | null };
    to: { displayName: string; email: string | null };
  }[];
  /** New membership for an existing person; `endMembershipIds` are ended by the transfer. */
  adds: { userId: string; displayName: string; teamId: string; endMembershipIds: string[] }[];
  ends: { membershipId: string; userId: string; displayName: string; teamId: string }[];
  conflicts: { externalId: string; displayName: string; reason: string }[];
  warnings: string[];
  /** Number of changes (creates + links + updates + adds + ends). */
  total: number;
}

const lower = (e: string | null) => (e ? e.trim().toLowerCase() : null);

/**
 * Pure import planner (EPI-004c). Directory team groups are the source of truth for membership of
 * the teams they are mapped to, and only those: manually managed teams are never touched. People
 * are matched by directory ID, then by e-mail; nothing is ever deactivated or reactivated and
 * roles are not imported. Ambiguous cases become conflicts that skip the person.
 */
export function planImport(groups: DirectoryGroup[], s: EpiState): ImportPlan {
  const warnings: string[] = [];
  const mappedTeams = new Set(Object.values(s.mappings).filter((t): t is string => Boolean(t)));
  // Teams whose groups were all read: only those may lose members (a missing group ends nothing).
  const unreadable = new Set<string>();

  // Directory person → the teams their groups map to (first-seen order).
  const wanted = new Map<string, { p: DirectoryGroup['members'][number]; teams: string[] }>();
  for (const g of groups) {
    const teamId = s.mappings[g.dn] ?? null;
    if (g.name === null) {
      warnings.push(`Group ${g.dn} was not found in the directory.`);
      if (teamId) unreadable.add(teamId);
      continue;
    }
    if (!teamId) {
      warnings.push(
        `Group ${g.dn} is not mapped to a team; its ${g.members.length} member(s) are not imported.`,
      );
      continue;
    }
    for (const p of g.members) {
      const w = wanted.get(p.externalId) ?? { p, teams: [] };
      if (!w.teams.includes(teamId)) w.teams.push(teamId);
      wanted.set(p.externalId, w);
    }
  }

  const byDirectoryId = new Map(
    s.people.filter((p) => p.directoryId).map((p) => [p.directoryId!, p]),
  );
  const byEmail = new Map<string, EpiState['people']>();
  for (const p of s.people) {
    const e = lower(p.email);
    if (e) byEmail.set(e, [...(byEmail.get(e) ?? []), p]);
  }
  const openOf = (userId: string) => s.memberships.filter((m) => m.userId === userId);

  const plan: ImportPlan = {
    creates: [],
    links: [],
    updates: [],
    adds: [],
    ends: [],
    conflicts: [],
    warnings: warnings.sort(),
    total: 0,
  };
  const conflict = (p: { externalId: string; displayName: string }, reason: string) =>
    plan.conflicts.push({ externalId: p.externalId, displayName: p.displayName, reason });

  /** EPI user id → the one mapped team the directory places them in (skipped people excluded). */
  const placed = new Map<string, string>();
  const skipped = new Set<string>();

  for (const { p, teams } of wanted.values()) {
    if (teams.length > 1) {
      const names = teams.map((t) => s.teams[t] ?? t).sort();
      conflict(
        p,
        `In groups of ${teams.length} teams (${names.join(', ')}); add them to one team only.`,
      );
      const known = byDirectoryId.get(p.externalId);
      if (known) skipped.add(known.id);
      continue;
    }
    const teamId = teams[0];
    const email = lower(p.email);
    let user = byDirectoryId.get(p.externalId) ?? null;
    if (!user && email) {
      const matches = byEmail.get(email) ?? [];
      if (matches.length > 1) {
        conflict(p, `Several EPI people have the e-mail ${email}.`);
        continue;
      }
      if (matches[0]?.directoryId) {
        conflict(p, `The EPI person with ${email} is linked to another directory account.`);
        skipped.add(matches[0].id);
        continue;
      }
      if (matches[0]) {
        user = matches[0];
        plan.links.push({ userId: user.id, externalId: p.externalId });
      }
    }
    if (!user) {
      plan.creates.push({ externalId: p.externalId, displayName: p.displayName, email, teamId });
      continue;
    }
    if (!user.active) {
      conflict(p, 'Deactivated in EPI; reactivate them under People first.');
      skipped.add(user.id);
      continue;
    }
    const from = { displayName: user.displayName, email: lower(user.email) };
    const to = { displayName: p.displayName, email: email ?? from.email };
    if (from.displayName !== to.displayName || from.email !== to.email) {
      plan.updates.push({ userId: user.id, from, to });
    }
    placed.set(user.id, teamId);
    const open = openOf(user.id);
    if (!open.some((m) => m.teamId === teamId)) {
      plan.adds.push({
        userId: user.id,
        displayName: p.displayName,
        teamId,
        endMembershipIds: open.filter((m) => mappedTeams.has(m.teamId)).map((m) => m.id),
      });
    }
  }

  // Memberships of mapped teams that the directory no longer supports.
  const endedByTransfer = new Set(plan.adds.flatMap((a) => a.endMembershipIds));
  const names = new Map(s.people.map((p) => [p.id, p.displayName]));
  for (const m of s.memberships) {
    if (!mappedTeams.has(m.teamId) || unreadable.has(m.teamId)) continue;
    if (skipped.has(m.userId) || endedByTransfer.has(m.id)) continue;
    if (placed.get(m.userId) === m.teamId) continue;
    plan.ends.push({
      membershipId: m.id,
      userId: m.userId,
      displayName: names.get(m.userId) ?? m.userId,
      teamId: m.teamId,
    });
  }
  plan.ends.sort(
    (a, b) => a.displayName.localeCompare(b.displayName) || a.teamId.localeCompare(b.teamId),
  );
  plan.total =
    plan.creates.length +
    plan.links.length +
    plan.updates.length +
    plan.adds.length +
    plan.ends.length;
  return plan;
}

/** Fingerprint of a plan: apply only runs the exact plan the administrator previewed. */
export function planHash(plan: ImportPlan): string {
  return createHash('sha256').update(JSON.stringify(plan)).digest('hex');
}
