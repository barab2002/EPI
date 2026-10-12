import {
  classifyConfidence,
  DEFAULT_SAMPLE_POLICY,
  median,
  MS_PER_DAY,
  percentile,
  SamplePolicy,
} from './stats';
import { ACTIVE_CATEGORIES, Exclusion, KpiResult, WorkItemObservation } from './types';

export const CYCLE_TIME_CODE = 'CYCLE_TIME';
export const CYCLE_TIME_VERSION = '1.0.0';
export const WORK_ITEM_AGING_CODE = 'WORK_ITEM_AGING';
export const WORK_ITEM_AGING_VERSION = '1.0.0';

export interface WorkTimes {
  startedAt: Date | null;
  doneAt: Date | null;
  reopened: boolean;
}

/**
 * startedAt = first entry into an active category (In Progress/Blocked/Review/QA).
 * doneAt    = last entry into DONE, only if the item is still Done at the end of history.
 * Only transitions at or before `asOf` are considered.
 */
export function deriveWorkTimes(item: WorkItemObservation, asOf?: Date): WorkTimes {
  const history = item.transitions
    .filter((t) => !asOf || t.at.getTime() <= asOf.getTime())
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  let startedAt: Date | null = null;
  let lastDone: Date | null = null;
  let doneCount = 0;
  for (const t of history) {
    if (!startedAt && ACTIVE_CATEGORIES.has(t.to)) startedAt = t.at;
    if (t.to === 'DONE') {
      lastDone = t.at;
      doneCount++;
    }
  }
  const last = history[history.length - 1];
  const isDone = last?.to === 'DONE';
  return { startedAt, doneAt: isDone ? lastDone : null, reopened: doneCount > 1 };
}

function result(
  code: string,
  version: string,
  window: { start: Date; end: Date },
  observations: { key: string; value: number }[],
  exclusions: Exclusion[],
  policy: SamplePolicy,
): KpiResult {
  const confidence = classifyConfidence(observations.length, policy);
  const values = observations.map((o) => o.value);
  const value = confidence === 'low' || confidence === 'normal' ? median(values) : null;
  return {
    kpiCode: code,
    formulaVersion: version,
    unit: 'days',
    value,
    sampleSize: observations.length,
    confidence,
    window,
    exclusions,
    observations,
  };
}

/** KPI-01: median days from first active transition to final Done, for items done in [start, end). */
export function cycleTime(
  items: readonly WorkItemObservation[],
  window: { start: Date; end: Date },
  policy: SamplePolicy = DEFAULT_SAMPLE_POLICY,
): KpiResult {
  const observations: { key: string; value: number }[] = [];
  const exclusions: Exclusion[] = [];
  for (const item of items) {
    const { startedAt, doneAt } = deriveWorkTimes(item, window.end);
    if (!doneAt) continue;
    const done = doneAt.getTime();
    if (done < window.start.getTime() || done >= window.end.getTime()) continue;
    if (!startedAt) {
      exclusions.push({ key: item.key, reason: 'never_started' });
      continue;
    }
    const days = (done - startedAt.getTime()) / MS_PER_DAY;
    if (days < 0) {
      exclusions.push({ key: item.key, reason: 'negative_interval' });
      continue;
    }
    observations.push({ key: item.key, value: days });
  }
  return result(CYCLE_TIME_CODE, CYCLE_TIME_VERSION, window, observations, exclusions, policy);
}

/** KPI-02: age in days since first active transition for started, not-done items at `snapshotAt`. */
export function workItemAging(
  items: readonly WorkItemObservation[],
  snapshotAt: Date,
  policy: SamplePolicy = DEFAULT_SAMPLE_POLICY,
  oldestLimit = 5,
): KpiResult {
  const observations: { key: string; value: number }[] = [];
  for (const item of items) {
    const { startedAt, doneAt } = deriveWorkTimes(item, snapshotAt);
    if (!startedAt || doneAt) continue;
    observations.push({
      key: item.key,
      value: (snapshotAt.getTime() - startedAt.getTime()) / MS_PER_DAY,
    });
  }
  const r = result(
    WORK_ITEM_AGING_CODE,
    WORK_ITEM_AGING_VERSION,
    { start: snapshotAt, end: snapshotAt },
    observations,
    [],
    policy,
  );
  const values = observations.map((o) => o.value);
  r.extra = {
    p85: r.value === null ? null : percentile(values, 85),
    oldest: [...observations].sort((a, b) => b.value - a.value).slice(0, oldestLimit),
  };
  return r;
}
