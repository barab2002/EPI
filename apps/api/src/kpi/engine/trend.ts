import { DEFAULT_SAMPLE_POLICY, median, relativeChangePct, SamplePolicy } from './stats';

export type Direction = 'lower_is_better' | 'higher_is_better';
export type TrendStatus =
  | 'improved'
  | 'deteriorated'
  | 'stable'
  | 'insufficient_data'
  | 'no_baseline';

export interface TrendResult {
  recent: number | null;
  previous: number | null;
  changePct: number | null;
  status: TrendStatus;
  note: string;
}

const HYPOTHESIS_NOTE =
  'Exploratory comparison of two non-overlapping windows. A hypothesis for investigation, not a causal conclusion or a statistical significance test.';

export function previousWindow(w: { start: Date; end: Date }): { start: Date; end: Date } {
  const len = w.end.getTime() - w.start.getTime();
  return { start: new Date(w.start.getTime() - len), end: new Date(w.start.getTime()) };
}

/**
 * Compare recent vs previous window from raw observations. A trend is only reported when both
 * windows reach `policy.minimumSample` (spec §8: no trend below the confident sample size).
 */
export function compareWindows(
  recentObs: readonly { value: number }[],
  previousObs: readonly { value: number }[],
  direction: Direction,
  thresholdPct: number,
  policy: SamplePolicy = DEFAULT_SAMPLE_POLICY,
): TrendResult {
  const recent = median(recentObs.map((o) => o.value));
  const previous = median(previousObs.map((o) => o.value));
  if (
    recentObs.length < policy.minimumSample ||
    previousObs.length < policy.minimumSample ||
    recent === null ||
    previous === null
  ) {
    return {
      recent,
      previous,
      changePct: null,
      status: 'insufficient_data',
      note: HYPOTHESIS_NOTE,
    };
  }
  const changePct = relativeChangePct(recent, previous);
  if (changePct === null) {
    return { recent, previous, changePct: null, status: 'no_baseline', note: HYPOTHESIS_NOTE };
  }
  let status: TrendStatus = 'stable';
  if (Math.abs(changePct) > thresholdPct) {
    const better = direction === 'lower_is_better' ? changePct < 0 : changePct > 0;
    status = better ? 'improved' : 'deteriorated';
  }
  return { recent, previous, changePct, status, note: HYPOTHESIS_NOTE };
}
