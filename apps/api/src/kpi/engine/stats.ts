/** Pure statistics helpers used by every KPI. No I/O, no framework imports. */

export type Confidence = 'none' | 'insufficient' | 'low' | 'normal';

export interface SamplePolicy {
  /** Observations needed for a confident value/trend (spec default 10). */
  minimumSample: number;
  /** Below this the KPI is N/A (spec: <5 no trend). */
  lowConfidenceFloor: number;
}

export const DEFAULT_SAMPLE_POLICY: SamplePolicy = { minimumSample: 10, lowConfidenceFloor: 5 };

function sorted(values: readonly number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = sorted(values);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Percentile with linear interpolation between closest ranks (rank = p/100 * (n-1)). */
export function percentile(values: readonly number[], p: number): number | null {
  if (p < 0 || p > 100) throw new RangeError(`percentile must be within 0..100, got ${p}`);
  if (values.length === 0) return null;
  const s = sorted(values);
  const rank = (p / 100) * (s.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return s[lo] + (rank - lo) * (s[hi] - s[lo]);
}

export function classifyConfidence(sampleSize: number, policy: SamplePolicy): Confidence {
  if (sampleSize === 0) return 'none';
  if (sampleSize < policy.lowConfidenceFloor) return 'insufficient';
  if (sampleSize < policy.minimumSample) return 'low';
  return 'normal';
}

/** (recent - previous) / |previous| * 100; null when the baseline is zero. */
export function relativeChangePct(recent: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((recent - previous) / Math.abs(previous)) * 100;
}

export const MS_PER_DAY = 86_400_000;
export const MS_PER_HOUR = 3_600_000;
