import { DataSource, EntityManager } from 'typeorm';
import type { StatusCategory } from '../kpi/engine/types';

/**
 * Deterministic SYNTHETIC demo data. Every person, work item and MR is flagged is_synthetic and
 * named obviously fictionally. Never used in production mode (enforced by the CLI).
 */

const DAY = 86_400_000;
const HOUR = 3_600_000;

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface PersonSpec {
  name: string;
  grade: 'JUNIOR' | 'MID' | 'SENIOR' | 'TECH_LEAD';
  /** Relative speed: <1 faster, >1 slower. Only shapes synthetic data. */
  pace: number;
}

interface TeamSpec {
  name: string;
  lead: PersonSpec;
  members: PersonSpec[];
}

interface GroupSpec {
  name: string;
  manager: string;
  teams: TeamSpec[];
}

const p = (name: string, grade: PersonSpec['grade'], pace = 1): PersonSpec => ({
  name,
  grade,
  pace,
});

export const DEMO_ORG: {
  name: string;
  engineeringManager: string;
  admin: string;
  groups: GroupSpec[];
} = {
  name: 'Demo Org (synthetic)',
  engineeringManager: 'Morgan Example',
  admin: 'Avery Admin',
  groups: [
    {
      name: 'Platform',
      manager: 'Gal Groupman',
      teams: [
        {
          name: 'Payments',
          lead: p('Taylor Lead', 'TECH_LEAD'),
          members: [
            p('Dana Dev', 'SENIOR', 0.8),
            p('Eli Engineer', 'MID'),
            p('Fran Coder', 'MID', 1.1),
            p('Gil Builder', 'JUNIOR', 1.4),
            p('Hila Hacker', 'SENIOR', 0.9),
            p('Ido Integrator', 'MID', 1.2),
          ],
        },
        {
          name: 'Identity',
          lead: p('Uri Lead', 'TECH_LEAD'),
          members: [p('Jo Small', 'MID'), p('Kai Small', 'JUNIOR', 1.3)],
        },
      ],
    },
    {
      name: 'Product',
      manager: 'Noa Groupwoman',
      teams: [
        {
          name: 'Mobile',
          lead: p('Rae Lead', 'TECH_LEAD'),
          members: [
            p('Lior Mobile', 'SENIOR', 0.9),
            p('Maya Mobile', 'MID'),
            p('Nir Mobile', 'MID', 1.1),
            p('Omer Mobile', 'JUNIOR', 1.5),
            p('Peri Mobile', 'MID', 1.0),
            p('Quinn Mover', 'MID', 1.0),
          ],
        },
        {
          name: 'Web',
          lead: p('Sky Lead', 'TECH_LEAD'),
          members: [
            p('Tal Web', 'SENIOR', 0.85),
            p('Yael Web', 'MID'),
            p('Zohar Web', 'MID', 1.2),
            p('Adi Web', 'JUNIOR', 1.3),
          ],
        },
      ],
    },
  ],
};

/** Quinn moves Mobile -> Web 45 days before `now` to demonstrate historical attribution. */
export const TRANSFER = { name: 'Quinn Mover', from: 'Mobile', to: 'Web', daysAgo: 45 };

/** Synthetic e-mail used by the seed and the demo Keycloak realm (e.g. taylor.lead@example.invalid). */
export function demoEmail(displayName: string): string {
  return `${displayName.toLowerCase().replace(/\s+/g, '.')}@example.invalid`;
}

export interface SeedSummary {
  users: number;
  teams: number;
  workItems: number;
  mergeRequests: number;
}

export async function hasDemoData(ds: DataSource): Promise<boolean> {
  const rows = await ds.query(`SELECT 1 FROM users WHERE is_synthetic LIMIT 1`);
  return rows.length > 0;
}

export async function seedDemo(ds: DataSource, now: Date, seed = 20261012): Promise<SeedSummary> {
  return ds.transaction((m) => seedInTx(m, now, seed));
}

async function seedInTx(m: EntityManager, now: Date, seed: number): Promise<SeedSummary> {
  const rnd = mulberry32(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
  const historyStart = new Date(now.getTime() - 200 * DAY);
  const one = async (sql: string, params: unknown[]): Promise<string> =>
    (await m.query(sql, params))[0].id as string;

  const grades: Record<string, string> = {};
  for (const [i, [code, label]] of [
    ['JUNIOR', 'Junior'],
    ['MID', 'Mid'],
    ['SENIOR', 'Senior'],
    ['TECH_LEAD', 'Tech Lead'],
  ].entries()) {
    grades[code] = await one(
      `INSERT INTO professional_grades(code,label,ordinal) VALUES ($1,$2,$3)
       ON CONFLICT (code) DO UPDATE SET label = EXCLUDED.label RETURNING id`,
      [code, label, i + 1],
    );
  }

  const createUser = async (name: string, grade?: string): Promise<string> => {
    const id = await one(
      // keycloak_sub stays NULL: the demo Keycloak users link on first sign-in by verified e-mail.
      `INSERT INTO users(display_name,email,is_synthetic) VALUES ($1,$2,true) RETURNING id`,
      [name, demoEmail(name)],
    );
    if (grade) {
      await m.query(
        `INSERT INTO grade_history(user_id,grade_id,effective_from,experience_months_at_start)
         VALUES ($1,$2,$3,$4)`,
        [id, grades[grade], historyStart, Math.floor(rnd() * 96) + 6],
      );
    }
    return id;
  };
  const assign = (userId: string, role: string, scopeType: string, scopeId: string | null) =>
    m.query(
      `INSERT INTO role_assignments(user_id,role,scope_type,scope_id,effective_from) VALUES ($1,$2,$3,$4,$5)`,
      [userId, role, scopeType, scopeId, historyStart],
    );

  const orgId = await one(`INSERT INTO organizations(name) VALUES ($1) RETURNING id`, [
    DEMO_ORG.name,
  ]);
  const adminId = await createUser(DEMO_ORG.admin);
  await assign(adminId, 'ADMIN', 'SYSTEM', null);
  const emId = await createUser(DEMO_ORG.engineeringManager);
  await assign(emId, 'ENGINEERING_MANAGER', 'ORGANIZATION', orgId);

  const conn = await one(
    `INSERT INTO integration_connections(kind,name,enabled) VALUES ('synthetic','Synthetic demo source',true) RETURNING id`,
    [],
  );

  const teamIds: Record<string, string> = {};
  const people: { id: string; name: string; pace: number; teamName: string }[] = [];
  const teamMembers: Record<string, string[]> = {};
  let users = 2;

  for (const g of DEMO_ORG.groups) {
    const groupId = await one(
      `INSERT INTO org_groups(organization_id,name) VALUES ($1,$2) RETURNING id`,
      [orgId, g.name],
    );
    const gmId = await createUser(g.manager);
    users++;
    await assign(gmId, 'GROUP_MANAGER', 'GROUP', groupId);
    for (const t of g.teams) {
      const teamId = await one(`INSERT INTO teams(group_id,name) VALUES ($1,$2) RETURNING id`, [
        groupId,
        t.name,
      ]);
      teamIds[t.name] = teamId;
      teamMembers[t.name] = [];
      const leadId = await createUser(t.lead.name, t.lead.grade);
      users++;
      await assign(leadId, 'TEAM_LEAD', 'TEAM', teamId);
      for (const person of [t.lead, ...t.members]) {
        const id = person === t.lead ? leadId : await createUser(person.name, person.grade);
        if (person !== t.lead) users++;
        people.push({ id, name: person.name, pace: person.pace, teamName: t.name });
        teamMembers[t.name].push(id);
      }
    }
  }

  // Effective-dated memberships, including one transfer.
  const transferAt = new Date(now.getTime() - TRANSFER.daysAgo * DAY);
  for (const person of people) {
    if (person.name === TRANSFER.name) {
      await m.query(
        `INSERT INTO team_memberships(user_id,team_id,effective_from,effective_to) VALUES ($1,$2,$3,$4),($1,$5,$4,NULL)`,
        [person.id, teamIds[TRANSFER.from], historyStart, transferAt, teamIds[TRANSFER.to]],
      );
      person.teamName = TRANSFER.to;
    } else {
      await m.query(
        `INSERT INTO team_memberships(user_id,team_id,effective_from) VALUES ($1,$2,$3)`,
        [person.id, teamIds[person.teamName], historyStart],
      );
    }
  }

  // Work items with status history and linked MRs.
  let workItems = 0;
  let mergeRequests = 0;
  const complexityDays = { S: 1.5, M: 4, L: 9 } as const;
  const teamAt = (personName: string, at: Date, current: string) =>
    personName === TRANSFER.name && at.getTime() < transferAt.getTime() ? TRANSFER.from : current;

  for (const person of people) {
    let cursor = historyStart.getTime() + rnd() * 5 * DAY;
    let n = 0;
    while (cursor < now.getTime() - DAY) {
      n++;
      workItems++;
      const key = `DEMO-${workItems}`;
      const complexity = pick(['S', 'S', 'M', 'M', 'M', 'L'] as const);
      const workType = pick(['story', 'story', 'story', 'bug', 'task'] as const);
      const created = new Date(cursor - rnd() * 10 * DAY);
      const start = new Date(cursor);
      const durationDays =
        complexityDays[complexity] * person.pace * (0.5 + rnd() * 1.2) * (rnd() < 0.08 ? 3 : 1);
      const reviewAt = new Date(start.getTime() + durationDays * 0.7 * DAY);
      let doneAt: Date | null = new Date(start.getTime() + durationDays * DAY);
      const reopen = rnd() < 0.07;
      const transitions: [Date, StatusCategory, string][] = [
        [created, 'TODO', 'To Do'],
        [start, 'IN_PROGRESS', 'In Progress'],
        [reviewAt, 'REVIEW', 'In Review'],
      ];
      if (doneAt.getTime() > now.getTime()) {
        doneAt = null; // still open
      } else {
        transitions.push([doneAt, 'DONE', 'Done']);
        if (reopen) {
          const reopenAt = new Date(doneAt.getTime() + 1.5 * DAY);
          const reDone = new Date(reopenAt.getTime() + 2 * DAY);
          if (reDone.getTime() < now.getTime()) {
            transitions.push([reopenAt, 'IN_PROGRESS', 'In Progress'], [reDone, 'DONE', 'Done']);
            doneAt = reDone;
          }
        }
      }
      const visible = transitions.filter(([at]) => at.getTime() <= now.getTime());
      const last = visible[visible.length - 1];
      const itemId = await one(
        `INSERT INTO work_items(connection_id,external_key,project_key,title,issue_type,work_type,
           assignee_user_id,complexity_class,status,created_at,started_at,done_at,updated_at,is_synthetic)
         VALUES ($1,$2,'DEMO',$3,$4,$4,$5,$6,$7,$8,$9,$10,$11,true) RETURNING id`,
        [
          conn,
          key,
          `Synthetic ${workType} #${n} for ${teamAt(person.name, start, person.teamName)}`,
          workType,
          person.id,
          complexity,
          last[2],
          created,
          start,
          doneAt,
          last[0],
        ],
      );
      for (const [i, [at, category, name]] of visible.entries()) {
        await m.query(
          `INSERT INTO work_events(work_item_id,external_event_id,field_name,old_value,new_value,status_category,event_at)
           VALUES ($1,$2,'status',$3,$4,$5,$6)`,
          [itemId, `${key}-h${i}`, i === 0 ? null : visible[i - 1][2], name, category, at],
        );
      }

      // ~75% of items have an MR; created when moving to review.
      if (rnd() < 0.75 && reviewAt.getTime() < now.getTime()) {
        mergeRequests++;
        const iid = String(mergeRequests);
        const team = teamAt(person.name, reviewAt, person.teamName);
        const peers = teamMembers[team].filter((id) => id !== person.id);
        const reviewer = pick(peers);
        const mrId = await one(
          `INSERT INTO merge_requests(connection_id,project_external_id,mr_iid,title,author_user_id,
             linked_work_item_id,link_confidence,created_at,merged_at,state,is_synthetic)
           VALUES ($1,'demo/app',$2,$3,$4,$5,'branch_key',$6,$7,$8,true) RETURNING id`,
          [
            conn,
            iid,
            `${key}: synthetic change`,
            person.id,
            itemId,
            reviewAt,
            doneAt,
            doneAt ? 'merged' : 'opened',
          ],
        );
        const waitHours = (team === 'Mobile' ? 10 : 5) * (0.2 + rnd() * 2);
        const events: [string, string, string | null, boolean, Date][] = [
          ['review_requested', 'rq', reviewer, false, reviewAt],
          ['note', 'bot', null, true, new Date(reviewAt.getTime() + 0.1 * HOUR)],
          ['note', 'self', person.id, false, new Date(reviewAt.getTime() + 0.5 * HOUR)],
        ];
        const responseAt = new Date(reviewAt.getTime() + waitHours * HOUR);
        if (responseAt.getTime() < now.getTime()) {
          events.push(['note', 'rv', reviewer, false, responseAt]);
        }
        for (const [type, suffix, actor, isBot, at] of events) {
          await m.query(
            `INSERT INTO review_events(merge_request_id,external_event_id,event_type,actor_user_id,actor_external_id,is_bot,event_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [mrId, `${iid}-${suffix}`, type, actor, isBot ? 'ci-bot' : null, isBot, at],
          );
        }
      }
      cursor += (2 + rnd() * 6) * DAY * person.pace;
    }
  }

  // One open review cycle for the current month.
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  await m.query(
    `INSERT INTO review_cycles(period_start,period_end,status) VALUES ($1,$2,'open') ON CONFLICT DO NOTHING`,
    [monthStart, monthEnd],
  );

  await m.query(
    `INSERT INTO audit_events(action,resource_type,metadata_json) VALUES ('seed.demo','system',$1)`,
    [JSON.stringify({ users, workItems, mergeRequests })],
  );

  return { users, teams: Object.keys(teamIds).length, workItems, mergeRequests };
}
