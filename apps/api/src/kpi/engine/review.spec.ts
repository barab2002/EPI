import { mrOpenToFirstReview, reviewWaitingTime } from './review';
import type { MergeRequestObservation, Note } from './types';

const d = (iso: string) => new Date(iso);
const window = { start: d('2026-07-01T00:00:00Z'), end: d('2026-10-01T00:00:00Z') };
const H = 3_600_000;

const human = (authorId: string, at: Date): Note => ({
  authorId,
  at,
  isBot: false,
  isSystem: false,
});

function mr(key: string, hoursToReview: number, overrides: Partial<MergeRequestObservation> = {}) {
  const createdAt = d('2026-08-10T08:00:00Z');
  return {
    key,
    authorId: 'author',
    createdAt,
    reviewRequests: [{ reviewerId: 'rev', at: createdAt }],
    notes: [human('rev', new Date(createdAt.getTime() + hoursToReview * H))],
    ...overrides,
  } satisfies MergeRequestObservation;
}

describe('reviewWaitingTime (KPI-03, preferred: request -> first reviewer response)', () => {
  it('reproduces the spec example 4,8,12 h -> median 8 (low-floor policy 3)', () => {
    const r = reviewWaitingTime([mr('A', 4), mr('B', 8), mr('C', 12)], window, {
      minimumSample: 10,
      lowConfidenceFloor: 3,
    });
    expect(r.value).toBe(8);
    expect(r.unit).toBe('hours');
    expect(r.kpiCode).toBe('REVIEW_WAITING_TIME');
  });

  it('measures each reviewer request separately (multiple reviewers)', () => {
    const createdAt = d('2026-08-10T08:00:00Z');
    const m: MergeRequestObservation = {
      key: 'M',
      authorId: 'author',
      createdAt,
      reviewRequests: [
        { reviewerId: 'r1', at: createdAt },
        { reviewerId: 'r2', at: new Date(createdAt.getTime() + 2 * H) },
      ],
      notes: [
        human('r1', new Date(createdAt.getTime() + 3 * H)),
        human('r2', new Date(createdAt.getTime() + 7 * H)),
      ],
    };
    const r = reviewWaitingTime([m], window, { minimumSample: 1, lowConfidenceFloor: 1 });
    expect(r.observations).toEqual([
      { key: 'M#r1', value: 3 },
      { key: 'M#r2', value: 5 },
    ]);
  });

  it('ignores bot notes, system notes, author self-comments and notes before the request', () => {
    const createdAt = d('2026-08-10T08:00:00Z');
    const m: MergeRequestObservation = {
      key: 'M',
      authorId: 'author',
      createdAt,
      reviewRequests: [{ reviewerId: 'rev', at: new Date(createdAt.getTime() + 1 * H) }],
      notes: [
        { authorId: 'rev', at: createdAt, isBot: false, isSystem: false }, // before request
        {
          authorId: 'ci-bot',
          at: new Date(createdAt.getTime() + 2 * H),
          isBot: true,
          isSystem: false,
        },
        {
          authorId: 'rev',
          at: new Date(createdAt.getTime() + 2 * H),
          isBot: false,
          isSystem: true,
        },
        human('author', new Date(createdAt.getTime() + 2 * H)),
        human('rev', new Date(createdAt.getTime() + 6 * H)),
      ],
    };
    const r = reviewWaitingTime([m], window, { minimumSample: 1, lowConfidenceFloor: 1 });
    expect(r.observations).toEqual([{ key: 'M#rev', value: 5 }]);
  });

  it('excludes unanswered requests from the median and reports them', () => {
    const r = reviewWaitingTime([mr('A', 4, { notes: [] })], window);
    expect(r.sampleSize).toBe(0);
    expect(r.exclusions).toEqual([{ key: 'A#rev', reason: 'no_response_yet' }]);
  });

  it('returns N/A when the source exposes no reviewer-request events', () => {
    const r = reviewWaitingTime([mr('A', 4, { reviewRequests: [] })], window);
    expect(r.value).toBeNull();
    expect(r.extra?.requestEventsAvailable).toBe(false);
  });
});

describe('mrOpenToFirstReview (proxy KPI, separate code)', () => {
  it('uses MR creation -> first meaningful human non-author note', () => {
    const r = mrOpenToFirstReview(
      [
        mr('A', 4, { reviewRequests: [] }),
        mr('B', 8, { reviewRequests: [] }),
        mr('C', 12, { reviewRequests: [] }),
      ],
      window,
      { minimumSample: 10, lowConfidenceFloor: 3 },
    );
    expect(r.kpiCode).toBe('MR_OPEN_TO_FIRST_REVIEW');
    expect(r.value).toBe(8);
  });

  it('only includes MRs opened within the window', () => {
    const old = mr('OLD', 2, { createdAt: d('2026-01-01T00:00:00Z') });
    const r = mrOpenToFirstReview([old], window, { minimumSample: 1, lowConfidenceFloor: 1 });
    expect(r.sampleSize).toBe(0);
  });
});
