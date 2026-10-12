import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { EPI_CONFIG, EpiConfig } from '../config';
import { DATA_SOURCE } from '../db/data-source';
import type { Scope } from '../org/scope.service';
import { findKpi } from './catalog';
import { cycleTime, deriveWorkTimes, workItemAging } from './engine/flow';
import { mrOpenToFirstReview, reviewWaitingTime } from './engine/review';
import type { SamplePolicy } from './engine/stats';
import { compareWindows, previousWindow, TrendResult } from './engine/trend';
import type {
  KpiResult,
  MergeRequestObservation,
  StatusCategory,
  WorkItemObservation,
} from './engine/types';

export type EntityType = 'developer' | 'team' | 'group' | 'organization';
export const WINDOWS = { '30d': 30, '90d': 90, '180d': 180 } as const;
export type WindowKey = keyof typeof WINDOWS;

export interface KpiCard {
  code: string;
  title: string;
  unit: string;
  direction: string;
  formulaVersion: string;
  value: number | null;
  sampleSize: number;
  confidence: string;
  window: { start: string; end: string };
  trend: TrendResult | null;
  proxy: boolean;
  suppressed: boolean;
  synthetic: boolean;
  lastDataAt: string | null;
  /** Only for callers allowed to see individual items (managers, self). */
  evidence?: {
    observations: { key: string; value: number }[];
    exclusions: { key: string; reason: string }[];
    extra?: Record<string, unknown>;
  };
}

interface Membership {
  user_id: string;
  effective_from: Date;
  effective_to: Date | null;
}

const DAY = 86_400_000;

@Injectable()
export class KpiService {
  constructor(
    @Inject(DATA_SOURCE) private readonly ds: DataSource,
    @Inject(EPI_CONFIG) private readonly config: EpiConfig,
  ) {}

  private get policy(): SamplePolicy {
    return {
      minimumSample: this.config.kpiMinimumSample,
      lowConfidenceFloor: this.config.kpiLowConfidenceFloor,
    };
  }

  /** Authorization for an entity. Out-of-scope and unknown IDs both yield 404 (no existence leak). */
  private async authorize(
    scope: Scope,
    type: EntityType,
    id: string,
  ): Promise<{ detail: boolean; suppressed: boolean }> {
    switch (type) {
      case 'developer':
        if (scope.visibleUserIds.has(id)) return { detail: true, suppressed: false };
        break;
      case 'team':
        if (scope.managedTeamIds.has(id)) return { detail: true, suppressed: false };
        if (scope.aggregateTeamIds.has(id)) {
          const size = await this.currentTeamSize(id);
          return { detail: false, suppressed: size < this.config.minimumAggregateSize };
        }
        break;
      case 'group':
        if (scope.managedGroupIds.has(id)) return { detail: true, suppressed: false };
        break;
      case 'organization':
        if (scope.managedOrganizationIds.has(id)) return { detail: true, suppressed: false };
        break;
    }
    throw new NotFoundException('Not found');
  }

  async currentTeamSize(teamId: string): Promise<number> {
    const [row] = await this.ds.query(
      `SELECT count(DISTINCT user_id)::int AS n FROM team_memberships
       WHERE team_id = $1 AND effective_from <= now() AND (effective_to IS NULL OR effective_to > now())`,
      [teamId],
    );
    return row.n;
  }

  private async teamIdsFor(type: EntityType, id: string): Promise<string[]> {
    if (type === 'team') return [id];
    if (type === 'group') {
      return (await this.ds.query(`SELECT id FROM teams WHERE group_id = $1`, [id])).map(
        (r: { id: string }) => r.id,
      );
    }
    if (type === 'organization') {
      return (
        await this.ds.query(
          `SELECT t.id FROM teams t JOIN org_groups g ON g.id = t.group_id WHERE g.organization_id = $1`,
          [id],
        )
      ).map((r: { id: string }) => r.id);
    }
    return [];
  }

  async cards(
    scope: Scope,
    type: EntityType,
    id: string,
    windowKey: WindowKey,
    now: Date = new Date(),
  ): Promise<KpiCard[]> {
    const access = await this.authorize(scope, type, id);
    const window = { start: new Date(now.getTime() - WINDOWS[windowKey] * DAY), end: now };
    const prev = previousWindow(window);

    // Population: who counts as "in the entity" at a given time.
    let memberships: Membership[] = [];
    let userIds: string[];
    if (type === 'developer') {
      userIds = [id];
    } else {
      const teamIds = await this.teamIdsFor(type, id);
      memberships = await this.ds.query(
        `SELECT user_id, effective_from, effective_to FROM team_memberships WHERE team_id = ANY($1::uuid[])`,
        [teamIds],
      );
      userIds = [...new Set(memberships.map((m) => m.user_id))];
    }
    const inEntityAt = (userId: string | null, at: Date): boolean => {
      if (!userId) return false;
      if (type === 'developer') return userId === id;
      return memberships.some(
        (m) =>
          m.user_id === userId &&
          m.effective_from.getTime() <= at.getTime() &&
          (m.effective_to === null || m.effective_to.getTime() > at.getTime()),
      );
    };

    const {
      items,
      lastDataAt: itemsLast,
      synthetic: itemsSynthetic,
    } = await this.loadWorkItems(userIds, prev.start);
    const doneIn = (start: Date, end: Date) =>
      items.filter((i) => {
        const t = deriveWorkTimes(i.obs, end);
        return t.doneAt !== null && inEntityAt(i.assignee, t.doneAt) && t.doneAt >= start;
      });
    const openNow = items.filter((i) => inEntityAt(i.assignee, now));

    const results: { result: KpiResult; previous: KpiResult | null; proxy: boolean }[] = [];
    results.push({
      result: cycleTime(
        doneIn(window.start, window.end).map((i) => i.obs),
        window,
        this.policy,
      ),
      previous: cycleTime(
        doneIn(prev.start, prev.end).map((i) => i.obs),
        prev,
        this.policy,
      ),
      proxy: false,
    });
    results.push({
      result: workItemAging(
        openNow.map((i) => i.obs),
        now,
        this.policy,
      ),
      previous: null,
      proxy: false,
    });

    let reviewLast: Date | null = null;
    let reviewSynthetic = false;
    if (type !== 'developer') {
      const mrs = await this.loadMergeRequests(userIds, prev.start);
      reviewLast = mrs.lastDataAt;
      reviewSynthetic = mrs.synthetic;
      const own = mrs.items
        .filter((m) => inEntityAt(m.obs.authorId, m.obs.createdAt))
        .map((m) => m.obs);
      const preferred = reviewWaitingTime(own, window, this.policy);
      if (preferred.extra?.requestEventsAvailable) {
        results.push({
          result: preferred,
          previous: reviewWaitingTime(own, prev, this.policy),
          proxy: false,
        });
      } else {
        results.push({
          result: mrOpenToFirstReview(own, window, this.policy),
          previous: mrOpenToFirstReview(own, prev, this.policy),
          proxy: true,
        });
      }
    }

    const lastDataAt = [itemsLast, reviewLast]
      .filter((d): d is Date => d !== null)
      .sort((a, b) => b.getTime() - a.getTime())[0];

    return results.map(({ result, previous, proxy }) => {
      const def = findKpi(result.kpiCode);
      if (!def) throw new Error(`KPI ${result.kpiCode} missing from catalog`);
      const suppressed = access.suppressed;
      const card: KpiCard = {
        code: def.code,
        title: def.title,
        unit: def.unit,
        direction: def.direction,
        formulaVersion: result.formulaVersion,
        value: suppressed ? null : result.value,
        sampleSize: suppressed ? 0 : result.sampleSize,
        confidence: suppressed ? 'suppressed' : result.confidence,
        window: { start: result.window.start.toISOString(), end: result.window.end.toISOString() },
        trend:
          suppressed || !previous
            ? null
            : compareWindows(
                result.observations,
                previous.observations,
                def.direction,
                this.config.trendThresholdPct,
                this.policy,
              ),
        proxy,
        suppressed,
        synthetic: itemsSynthetic || reviewSynthetic,
        lastDataAt: lastDataAt ? lastDataAt.toISOString() : null,
      };
      if (access.detail && !suppressed) {
        card.evidence = {
          observations: [...result.observations].sort((a, b) => b.value - a.value).slice(0, 10),
          exclusions: result.exclusions.slice(0, 20),
          extra: result.extra,
        };
      }
      return card;
    });
  }

  private async loadWorkItems(userIds: string[], since: Date) {
    if (userIds.length === 0) return { items: [], lastDataAt: null, synthetic: false };
    const rows: {
      external_key: string;
      work_type: string;
      complexity_class: WorkItemObservation['complexity'];
      assignee_user_id: string | null;
      updated_at: Date;
      is_synthetic: boolean;
      events: { at: string; to: StatusCategory }[];
    }[] = await this.ds.query(
      `SELECT wi.external_key, wi.work_type, wi.complexity_class, wi.assignee_user_id, wi.updated_at,
              wi.is_synthetic,
              COALESCE(json_agg(json_build_object('at', we.event_at, 'to', we.status_category)
                         ORDER BY we.event_at) FILTER (WHERE we.status_category IS NOT NULL), '[]') AS events
       FROM work_items wi LEFT JOIN work_events we ON we.work_item_id = wi.id
       WHERE wi.assignee_user_id = ANY($1::uuid[]) AND (wi.done_at IS NULL OR wi.done_at >= $2)
       GROUP BY wi.id`,
      [userIds, since],
    );
    return {
      items: rows.map((r) => ({
        assignee: r.assignee_user_id,
        obs: {
          key: r.external_key,
          workType: r.work_type,
          complexity: r.complexity_class,
          transitions: r.events.map((e) => ({ at: new Date(e.at), to: e.to })),
        } satisfies WorkItemObservation,
      })),
      lastDataAt: rows.reduce<Date | null>(
        (max, r) => (!max || r.updated_at > max ? r.updated_at : max),
        null,
      ),
      synthetic: rows.some((r) => r.is_synthetic),
    };
  }

  private async loadMergeRequests(userIds: string[], since: Date) {
    if (userIds.length === 0) return { items: [], lastDataAt: null, synthetic: false };
    const rows: {
      project_external_id: string;
      mr_iid: string;
      author_user_id: string;
      created_at: Date;
      is_synthetic: boolean;
      events: {
        type: string;
        actor: string | null;
        external: string | null;
        bot: boolean;
        at: string;
      }[];
    }[] = await this.ds.query(
      `SELECT mr.project_external_id, mr.mr_iid, mr.author_user_id, mr.created_at, mr.is_synthetic,
              COALESCE(json_agg(json_build_object('type', re.event_type, 'actor', re.actor_user_id,
                'external', re.actor_external_id, 'bot', re.is_bot, 'at', re.event_at))
                FILTER (WHERE re.id IS NOT NULL), '[]') AS events
       FROM merge_requests mr LEFT JOIN review_events re ON re.merge_request_id = mr.id
       WHERE mr.author_user_id = ANY($1::uuid[]) AND mr.created_at >= $2
       GROUP BY mr.id`,
      [userIds, since],
    );
    let lastDataAt: Date | null = null;
    const items = rows.map((r) => {
      const actorOf = (e: { actor: string | null; external: string | null }) =>
        e.actor ?? `external:${e.external ?? 'unknown'}`;
      for (const e of r.events) {
        const at = new Date(e.at);
        if (!lastDataAt || at > lastDataAt) lastDataAt = at;
      }
      return {
        obs: {
          key: `${r.project_external_id}!${r.mr_iid}`,
          authorId: r.author_user_id,
          createdAt: r.created_at,
          // Requested reviewers may not be mapped to EPI users yet; the same source identity is
          // used for their notes (actorOf), so waits are still measured for the author's team.
          reviewRequests: r.events
            .filter((e) => e.type === 'review_requested' && (e.actor || e.external))
            .map((e) => ({ reviewerId: actorOf(e), at: new Date(e.at) })),
          notes: r.events
            .filter((e) => e.type === 'note' || e.type === 'approval' || e.type === 'system_note')
            .map((e) => ({
              authorId: actorOf(e),
              at: new Date(e.at),
              isBot: e.bot,
              isSystem: e.type === 'system_note',
            })),
        } satisfies MergeRequestObservation,
      };
    });
    return {
      items,
      lastDataAt: lastDataAt as Date | null,
      synthetic: rows.some((r) => r.is_synthetic),
    };
  }
}
