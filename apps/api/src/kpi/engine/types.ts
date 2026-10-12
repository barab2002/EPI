import type { Confidence } from './stats';

/** Admin-mapped status category (spec §7 Jira). Source status names are mapped to these. */
export type StatusCategory = 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'REVIEW' | 'QA' | 'DONE';

export const ACTIVE_CATEGORIES: ReadonlySet<StatusCategory> = new Set([
  'IN_PROGRESS',
  'BLOCKED',
  'REVIEW',
  'QA',
]);

export interface StatusTransition {
  at: Date;
  to: StatusCategory;
}

export interface WorkItemObservation {
  key: string;
  workType: string;
  complexity: 'S' | 'M' | 'L' | 'UNKNOWN';
  /** Status history in any order; the engine sorts by time. */
  transitions: StatusTransition[];
}

export interface Exclusion {
  key: string;
  reason: string;
}

/** Common result shape returned by every KPI calculation. */
export interface KpiResult {
  kpiCode: string;
  formulaVersion: string;
  unit: 'days' | 'hours';
  /** null = N/A (no or insufficient data). Never 0 as a stand-in for missing. */
  value: number | null;
  sampleSize: number;
  confidence: Confidence;
  window: { start: Date; end: Date };
  exclusions: Exclusion[];
  /** Raw per-item observations used (for drill-down evidence and trend). */
  observations: { key: string; value: number }[];
  extra?: Record<string, unknown>;
}

export interface Note {
  authorId: string;
  at: Date;
  isBot: boolean;
  /** GitLab system notes (e.g. "added 1 commit") are non-substantive. */
  isSystem: boolean;
}

export interface ReviewRequest {
  reviewerId: string;
  at: Date;
}

export interface MergeRequestObservation {
  key: string;
  authorId: string;
  createdAt: Date;
  /** Explicit reviewer-request events; empty when the source does not expose them. */
  reviewRequests: ReviewRequest[];
  /** Human/bot/system notes, review approvals, review comments. */
  notes: Note[];
}
