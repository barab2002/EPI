import {
  cycleTime,
  CYCLE_TIME_VERSION,
  workItemAging,
  WORK_ITEM_AGING_VERSION,
} from './engine/flow';
import {
  mrOpenToFirstReview,
  MR_OPEN_TO_FIRST_REVIEW_VERSION,
  reviewWaitingTime,
  REVIEW_WAITING_TIME_VERSION,
} from './engine/review';
import type { Direction } from './engine/trend';
import type { KpiResult } from './engine/types';
import type { Locale } from '../common/locale';
import { KPI_TEXTS_HE } from './catalog-he';

export interface KpiDefinition {
  code: string;
  version: string;
  title: string;
  question: string;
  unit: 'days' | 'hours';
  direction: Direction;
  scopes: ('developer' | 'team' | 'group' | 'organization')[];
  formula: string;
  population: string;
  source: string;
  exclusions: string[];
  minimumSample: string;
  caveats: string[];
  possibleActions: string[];
  implementation: string;
  /** Reproducible example: input and the engine's own output for it. */
  example: () => { description: string; input: number[]; result: KpiResult };
}

const DAY = 86_400_000;
const HOUR = 3_600_000;
const W = { start: new Date('2026-01-01T00:00:00Z'), end: new Date('2026-04-01T00:00:00Z') };
const policy = { minimumSample: 10, lowConfidenceFloor: 3 };

export const KPI_CATALOG: KpiDefinition[] = [
  {
    code: 'CYCLE_TIME',
    version: CYCLE_TIME_VERSION,
    title: 'Cycle Time',
    question: 'How long does work take once started?',
    unit: 'days',
    direction: 'lower_is_better',
    scopes: ['developer', 'team', 'group', 'organization'],
    formula: 'median((done_at − started_at) / 86400 s) over items completed in the window',
    population:
      'Work items whose final transition is Done within [window start, window end). Team attribution uses the assignee’s team membership at the Done time.',
    source:
      'Jira status changelog mapped to status categories (synthetic in demo). started_at = first entry into In Progress / Blocked / Review / QA; done_at = last entry into Done.',
    exclusions: [
      'Items never started (Done without an active status) — reported as excluded',
      'Negative intervals (data errors) — reported as excluded',
      'Reopened items count once, ending at their final Done',
    ],
    minimumSample:
      '≥10 items: normal confidence; 5–9: low confidence; <5: N/A (no value, no trend)',
    caveats: [
      'Lower is better only if quality and work mix stay comparable.',
      'Compare within the same work type and complexity class; not a productivity score.',
      'Calendar days, including weekends and holidays.',
    ],
    possibleActions: [
      'Open the slowest items and check for blocked or waiting time.',
      'Discuss splitting large items in planning.',
    ],
    implementation: 'apps/api/src/kpi/engine/flow.ts → cycleTime()',
    example: () => {
      const input = [2, 3, 4, 6, 9];
      const start = new Date('2026-02-01T09:00:00Z');
      const items = input.map((d, i) => ({
        key: `EX-${i + 1}`,
        workType: 'story',
        complexity: 'M' as const,
        transitions: [
          { at: start, to: 'IN_PROGRESS' as const },
          { at: new Date(start.getTime() + d * DAY), to: 'DONE' as const },
        ],
      }));
      return {
        description:
          '5 completed items took 2, 3, 4, 6 and 9 days → median 4 days (low confidence: 5 items).',
        input,
        result: cycleTime(items, W),
      };
    },
  },
  {
    code: 'WORK_ITEM_AGING',
    version: WORK_ITEM_AGING_VERSION,
    title: 'Work Item Aging',
    question: 'Which open work is stuck?',
    unit: 'days',
    direction: 'lower_is_better',
    scopes: ['developer', 'team', 'group', 'organization'],
    formula:
      'age_days = (snapshot_time − started_at) / 86400 s for started, not-Done items; report median, P85 and oldest items',
    population:
      'Items started on or before the snapshot and not Done at the snapshot. Team attribution uses the assignee’s membership at the snapshot.',
    source: 'Jira status changelog mapped to status categories (synthetic in demo).',
    exclusions: ['Backlog items never started', 'Items Done at the snapshot time'],
    minimumSample:
      '≥10 open items: normal; 5–9: low; <5: N/A for the median (oldest items still listed to managers)',
    caveats: [
      'P85 uses linear interpolation between closest ranks.',
      'Use a consistent work type/status policy across teams.',
    ],
    possibleActions: ['Review the oldest items in stand-up; check for blockers or unclear scope.'],
    implementation: 'apps/api/src/kpi/engine/flow.ts → workItemAging()',
    example: () => {
      const input = [2, 3, 5, 8, 20];
      const snapshot = new Date('2026-03-31T00:00:00Z');
      const items = input.map((d, i) => ({
        key: `EX-${i + 1}`,
        workType: 'story',
        complexity: 'M' as const,
        transitions: [{ at: new Date(snapshot.getTime() - d * DAY), to: 'IN_PROGRESS' as const }],
      }));
      return {
        description:
          'Open items aged 2, 3, 5, 8 and 20 days → median 5 days, P85 12.8 days; the 20-day item is flagged.',
        input,
        result: workItemAging(items, snapshot),
      };
    },
  },
  {
    code: 'REVIEW_WAITING_TIME',
    version: REVIEW_WAITING_TIME_VERSION,
    title: 'Review Waiting Time',
    question: 'How long does a review request wait?',
    unit: 'hours',
    direction: 'lower_is_better',
    scopes: ['team', 'group', 'organization'],
    formula:
      'median(first meaningful response by the requested reviewer − review request time), per request',
    population:
      'Explicit reviewer requests made within the window on MRs authored by members of the entity (membership at MR creation).',
    source: 'GitLab MR reviewer-request events and discussions (synthetic in demo).',
    exclusions: [
      'Bot notes, system notes and author self-comments',
      'Requests without a response yet (listed separately as excluded)',
    ],
    minimumSample: '≥10 requests: normal; 5–9: low; <5: N/A',
    caveats: [
      'A team-process signal. Never interpret it as the MR author’s productivity.',
      'Calendar hours, including nights and weekends.',
      'If the source does not expose reviewer-request events, EPI shows the separately labeled proxy MR_OPEN_TO_FIRST_REVIEW instead.',
    ],
    possibleActions: ['Agree on a team review-response expectation; balance reviewer load.'],
    implementation: 'apps/api/src/kpi/engine/review.ts → reviewWaitingTime()',
    example: () => {
      const input = [4, 8, 12];
      const at = new Date('2026-02-01T08:00:00Z');
      const mrs = input.map((h, i) => ({
        key: `!${i + 1}`,
        authorId: 'author',
        createdAt: at,
        reviewRequests: [{ reviewerId: 'reviewer', at }],
        notes: [
          {
            authorId: 'reviewer',
            at: new Date(at.getTime() + h * HOUR),
            isBot: false,
            isSystem: false,
          },
        ],
      }));
      return {
        description:
          'Three requests answered after 4, 8 and 12 hours → median 8 hours (example uses a floor of 3 so the tiny sample is computed).',
        input,
        result: reviewWaitingTime(mrs, W, policy),
      };
    },
  },
  {
    code: 'MR_OPEN_TO_FIRST_REVIEW',
    version: MR_OPEN_TO_FIRST_REVIEW_VERSION,
    title: 'MR open to first review (proxy)',
    question: 'How long until an MR gets its first human review?',
    unit: 'hours',
    direction: 'lower_is_better',
    scopes: ['team', 'group', 'organization'],
    formula: 'median(first meaningful human non-author note − MR created_at)',
    population: 'MRs opened within the window by members of the entity.',
    source: 'GitLab MR discussions (synthetic in demo).',
    exclusions: ['Bot notes, system notes and author self-comments', 'MRs without any review yet'],
    minimumSample: '≥10 MRs: normal; 5–9: low; <5: N/A',
    caveats: [
      'PROXY: does not measure request-to-review time. Includes time before a reviewer was requested.',
    ],
    possibleActions: [
      'Request reviewers when opening the MR; enable reviewer-request events if possible.',
    ],
    implementation: 'apps/api/src/kpi/engine/review.ts → mrOpenToFirstReview()',
    example: () => {
      const input = [4, 8, 12];
      const at = new Date('2026-02-01T08:00:00Z');
      const mrs = input.map((h, i) => ({
        key: `!${i + 1}`,
        authorId: 'author',
        createdAt: at,
        reviewRequests: [],
        notes: [
          {
            authorId: 'reviewer',
            at: new Date(at.getTime() + h * HOUR),
            isBot: false,
            isSystem: false,
          },
        ],
      }));
      return {
        description: 'Three MRs first reviewed 4, 8 and 12 hours after opening → median 8 hours.',
        input,
        result: mrOpenToFirstReview(mrs, W, policy),
      };
    },
  },
];

export function findKpi(code: string): KpiDefinition | undefined {
  return KPI_CATALOG.find((k) => k.code === code);
}

/** The definition's texts in the requested language (English when no translation exists). */
export function localizedKpi(k: KpiDefinition, locale: Locale) {
  const { example, ...rest } = k;
  const he = locale === 'he' ? KPI_TEXTS_HE[k.code] : undefined;
  const run = () => {
    const e = example();
    return he ? { ...e, description: he.exampleDescription } : e;
  };
  if (!he) return { ...rest, example: run };
  return {
    ...rest,
    title: he.title,
    question: he.question,
    formula: he.formula,
    population: he.population,
    source: he.source,
    exclusions: he.exclusions,
    minimumSample: he.minimumSample,
    caveats: he.caveats,
    possibleActions: he.possibleActions,
    example: run,
  };
}
