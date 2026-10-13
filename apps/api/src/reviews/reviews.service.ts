import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { DATA_SOURCE } from '../db/data-source';
import { rows } from '../db/rows';
import type { Scope } from '../org/scope.service';

export interface AssessmentInput {
  subjectUserId: string;
  independence: number;
  growth: number;
  evidence: string;
  submit: boolean;
}

const COLUMNS = `a.id, a.subject_user_id, su.display_name AS subject_name, a.reviewer_user_id,
  ru.display_name AS reviewer_name, a.independence_1to5 AS independence, a.growth_1to5 AS growth,
  a.evidence, a.status, a.submitted_at, a.updated_at, c.period_start, c.period_end`;
const FROM = `FROM assessments a JOIN review_cycles c ON c.id = a.cycle_id
  JOIN users su ON su.id = a.subject_user_id JOIN users ru ON ru.id = a.reviewer_user_id`;

/**
 * Monthly manager assessment (KPI-07 Independence, KPI-08 Growth): human judgment with evidence.
 * Read: subject (submitted only), the reviewer, or a current manager of the subject.
 * Admin role alone grants nothing here.
 */
@Injectable()
export class ReviewsService {
  constructor(
    @Inject(DATA_SOURCE) private readonly ds: DataSource,
    private readonly audit: AuditService,
  ) {}

  async list(scope: Scope, subjectUserId?: string) {
    if (subjectUserId && !scope.visibleUserIds.has(subjectUserId)) {
      throw new NotFoundException('Not found');
    }
    const managed = [...scope.reviewableUserIds];
    return this.ds.query(
      `SELECT ${COLUMNS} ${FROM}
       WHERE ($2::uuid IS NULL OR a.subject_user_id = $2)
         AND ( a.reviewer_user_id = $1
            OR (a.subject_user_id = $1 AND a.status = 'submitted')
            OR (a.subject_user_id = ANY($3::uuid[]) AND a.status = 'submitted') )
       ORDER BY c.period_start DESC, a.updated_at DESC LIMIT 100`,
      [scope.userId, subjectUserId ?? null, managed],
    );
  }

  /**
   * People the caller may assess who have no submitted assessment from the caller in the open
   * monthly cycle (home page "Assessments due"). Alphabetical by team then name — a to-do list,
   * not a ranking. Scope comes only from `reviewableUserIds` (server-side RBAC).
   */
  async due(scope: Scope) {
    const [cycle] = await this.ds.query(
      `SELECT id, period_start, period_end FROM review_cycles
       WHERE status = 'open' AND review_type = 'monthly' ORDER BY period_start DESC LIMIT 1`,
    );
    const ids = [...scope.reviewableUserIds];
    if (!cycle || ids.length === 0)
      return { cycle: cycle ? this.cycleOut(cycle) : null, people: [] };
    const people: {
      user_id: string;
      display_name: string;
      team_name: string | null;
      status: string | null;
    }[] = await this.ds.query(
      `SELECT u.id AS user_id, u.display_name,
                (SELECT t.name FROM team_memberships m JOIN teams t ON t.id = m.team_id
                  WHERE m.user_id = u.id AND m.effective_to IS NULL
                  ORDER BY m.effective_from DESC LIMIT 1) AS team_name,
                a.status
         FROM users u
         LEFT JOIN assessments a
           ON a.subject_user_id = u.id AND a.reviewer_user_id = $2 AND a.cycle_id = $3
         WHERE u.id = ANY($1::uuid[]) AND u.active
           AND (a.status IS NULL OR a.status <> 'submitted')
         ORDER BY team_name NULLS LAST, u.display_name`,
      [ids, scope.userId, cycle.id],
    );
    return {
      cycle: this.cycleOut(cycle),
      people: people.map((p) => ({
        userId: p.user_id,
        displayName: p.display_name,
        teamName: p.team_name,
        status: p.status === 'draft' ? 'draft' : 'not_started',
      })),
    };
  }

  private cycleOut(c: { period_start: Date | string; period_end: Date | string }) {
    return {
      periodStart: new Date(c.period_start).toISOString(),
      periodEnd: new Date(c.period_end).toISOString(),
    };
  }

  private async openCycleId(): Promise<string> {
    const [c] = await this.ds.query(
      `SELECT id FROM review_cycles WHERE status = 'open' AND review_type = 'monthly'
       ORDER BY period_start DESC LIMIT 1`,
    );
    if (!c) throw new UnprocessableEntityException('No open monthly review cycle');
    return c.id;
  }

  /** Create or update the caller's assessment of a subject in the open cycle. */
  async upsert(scope: Scope, input: AssessmentInput) {
    if (!scope.reviewableUserIds.has(input.subjectUserId)) throw new NotFoundException('Not found');
    const cycleId = await this.openCycleId();
    return this.ds.transaction(async (m) => {
      const [existing] = await m.query(
        `SELECT id, status FROM assessments WHERE cycle_id = $1 AND subject_user_id = $2 AND reviewer_user_id = $3 FOR UPDATE`,
        [cycleId, input.subjectUserId, scope.userId],
      );
      if (existing?.status === 'submitted') {
        throw new ConflictException('Assessment already submitted for this cycle');
      }
      const status = input.submit ? 'submitted' : 'draft';
      const [row] = existing
        ? await rows<{ id: string; status: string }>(
            m,
            `UPDATE assessments SET independence_1to5=$2, growth_1to5=$3, evidence=$4, status=$5,
               submitted_at = CASE WHEN $5 = 'submitted' THEN now() ELSE NULL END, updated_at = now()
             WHERE id = $1 RETURNING id, status`,
            [existing.id, input.independence, input.growth, input.evidence, status],
          )
        : await rows<{ id: string; status: string }>(
            m,
            `INSERT INTO assessments(cycle_id,subject_user_id,reviewer_user_id,independence_1to5,growth_1to5,
               evidence,status,submitted_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7, CASE WHEN $7 = 'submitted' THEN now() END) RETURNING id, status`,
            [
              cycleId,
              input.subjectUserId,
              scope.userId,
              input.independence,
              input.growth,
              input.evidence,
              status,
            ],
          );
      await this.audit.record(
        scope.userId,
        existing ? 'assessment.update' : 'assessment.create',
        'assessment',
        row.id,
        { subjectUserId: input.subjectUserId, status },
        m,
      );
      if (!row) throw new Error('assessment write returned no row');
      return row;
    });
  }
}
