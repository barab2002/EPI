import {
  classifyConfidence,
  DEFAULT_SAMPLE_POLICY,
  median,
  MS_PER_HOUR,
  SamplePolicy,
} from './stats';
import type { Exclusion, KpiResult, MergeRequestObservation, Note } from './types';

export const REVIEW_WAITING_TIME_CODE = 'REVIEW_WAITING_TIME';
export const REVIEW_WAITING_TIME_VERSION = '1.0.0';
export const MR_OPEN_TO_FIRST_REVIEW_CODE = 'MR_OPEN_TO_FIRST_REVIEW';
export const MR_OPEN_TO_FIRST_REVIEW_VERSION = '1.0.0';

/** Meaningful = human, not a system note, not written by the MR author. */
function isMeaningful(note: Note, mrAuthorId: string): boolean {
  return !note.isBot && !note.isSystem && note.authorId !== mrAuthorId;
}

function inWindow(at: Date, window: { start: Date; end: Date }): boolean {
  return at.getTime() >= window.start.getTime() && at.getTime() < window.end.getTime();
}

function build(
  code: string,
  version: string,
  window: { start: Date; end: Date },
  observations: { key: string; value: number }[],
  exclusions: Exclusion[],
  policy: SamplePolicy,
  extra: Record<string, unknown>,
): KpiResult {
  const confidence = classifyConfidence(observations.length, policy);
  return {
    kpiCode: code,
    formulaVersion: version,
    unit: 'hours',
    value:
      confidence === 'low' || confidence === 'normal'
        ? median(observations.map((o) => o.value))
        : null,
    sampleSize: observations.length,
    confidence,
    window,
    exclusions,
    observations,
    extra,
  };
}

/**
 * KPI-03 preferred: per explicit reviewer request inside the window, hours until that reviewer's
 * first meaningful note after the request. Median across requests.
 */
export function reviewWaitingTime(
  mrs: readonly MergeRequestObservation[],
  window: { start: Date; end: Date },
  policy: SamplePolicy = DEFAULT_SAMPLE_POLICY,
): KpiResult {
  const observations: { key: string; value: number }[] = [];
  const exclusions: Exclusion[] = [];
  let requestEvents = 0;
  for (const m of mrs) {
    for (const req of m.reviewRequests) {
      requestEvents++;
      if (!inWindow(req.at, window)) continue;
      const key = `${m.key}#${req.reviewerId}`;
      const response = m.notes
        .filter(
          (n) =>
            n.authorId === req.reviewerId &&
            isMeaningful(n, m.authorId) &&
            n.at.getTime() >= req.at.getTime(),
        )
        .sort((a, b) => a.at.getTime() - b.at.getTime())[0];
      if (!response) {
        exclusions.push({ key, reason: 'no_response_yet' });
        continue;
      }
      observations.push({ key, value: (response.at.getTime() - req.at.getTime()) / MS_PER_HOUR });
    }
  }
  return build(
    REVIEW_WAITING_TIME_CODE,
    REVIEW_WAITING_TIME_VERSION,
    window,
    observations,
    exclusions,
    policy,
    { requestEventsAvailable: requestEvents > 0 },
  );
}

/** Proxy (distinct KPI): MR creation -> first meaningful human review note, for MRs opened in window. */
export function mrOpenToFirstReview(
  mrs: readonly MergeRequestObservation[],
  window: { start: Date; end: Date },
  policy: SamplePolicy = DEFAULT_SAMPLE_POLICY,
): KpiResult {
  const observations: { key: string; value: number }[] = [];
  const exclusions: Exclusion[] = [];
  for (const m of mrs) {
    if (!inWindow(m.createdAt, window)) continue;
    const first = m.notes
      .filter((n) => isMeaningful(n, m.authorId) && n.at.getTime() >= m.createdAt.getTime())
      .sort((a, b) => a.at.getTime() - b.at.getTime())[0];
    if (!first) {
      exclusions.push({ key: m.key, reason: 'no_review_yet' });
      continue;
    }
    observations.push({
      key: m.key,
      value: (first.at.getTime() - m.createdAt.getTime()) / MS_PER_HOUR,
    });
  }
  return build(
    MR_OPEN_TO_FIRST_REVIEW_CODE,
    MR_OPEN_TO_FIRST_REVIEW_VERSION,
    window,
    observations,
    exclusions,
    policy,
    { proxy: true },
  );
}
