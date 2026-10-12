import { cycleTime, deriveWorkTimes, workItemAging } from './flow';
import type { StatusCategory, WorkItemObservation } from './types';

const d = (iso: string) => new Date(iso);
const window = { start: d('2026-07-01T00:00:00Z'), end: d('2026-10-01T00:00:00Z') };

function item(key: string, steps: [string, StatusCategory][]): WorkItemObservation {
  return {
    key,
    workType: 'story',
    complexity: 'M',
    transitions: steps.map(([at, to]) => ({ at: d(at), to })),
  };
}

/** Item started on day 1 of August and finished `days` later. */
function doneItem(key: string, days: number): WorkItemObservation {
  const start = d('2026-08-01T09:00:00Z');
  const end = new Date(start.getTime() + days * 86_400_000);
  return item(key, [
    ['2026-07-20T09:00:00Z', 'TODO'],
    [start.toISOString(), 'IN_PROGRESS'],
    [end.toISOString(), 'DONE'],
  ]);
}

describe('deriveWorkTimes', () => {
  it('uses the first entry into any active category as start', () => {
    const t = deriveWorkTimes(
      item('A', [
        ['2026-08-01T00:00:00Z', 'TODO'],
        ['2026-08-03T00:00:00Z', 'REVIEW'],
        ['2026-08-05T00:00:00Z', 'DONE'],
      ]),
    );
    expect(t.startedAt?.toISOString()).toBe('2026-08-03T00:00:00.000Z');
    expect(t.doneAt?.toISOString()).toBe('2026-08-05T00:00:00.000Z');
  });

  it('sorts unordered history before deriving times', () => {
    const t = deriveWorkTimes(
      item('A', [
        ['2026-08-05T00:00:00Z', 'DONE'],
        ['2026-08-02T00:00:00Z', 'IN_PROGRESS'],
      ]),
    );
    expect(t.startedAt?.toISOString()).toBe('2026-08-02T00:00:00.000Z');
  });

  it('treats a reopened item as done only at its final Done transition', () => {
    const t = deriveWorkTimes(
      item('A', [
        ['2026-08-01T00:00:00Z', 'IN_PROGRESS'],
        ['2026-08-03T00:00:00Z', 'DONE'],
        ['2026-08-04T00:00:00Z', 'IN_PROGRESS'],
        ['2026-08-09T00:00:00Z', 'DONE'],
      ]),
    );
    expect(t.doneAt?.toISOString()).toBe('2026-08-09T00:00:00.000Z');
    expect(t.reopened).toBe(true);
  });

  it('reports not done when the last transition leaves Done', () => {
    const t = deriveWorkTimes(
      item('A', [
        ['2026-08-01T00:00:00Z', 'IN_PROGRESS'],
        ['2026-08-03T00:00:00Z', 'DONE'],
        ['2026-08-04T00:00:00Z', 'QA'],
      ]),
    );
    expect(t.doneAt).toBeNull();
  });
});

describe('cycleTime (KPI-01)', () => {
  it('reproduces the spec example: 2,3,4,6,9 days -> median 4', () => {
    const r = cycleTime(
      [2, 3, 4, 6, 9].map((n, i) => doneItem(`K-${i}`, n)),
      window,
    );
    expect(r.value).toBe(4);
    expect(r.sampleSize).toBe(5);
    expect(r.confidence).toBe('low');
    expect(r.unit).toBe('days');
  });

  it('is N/A (null, not 0) with no completed items', () => {
    const r = cycleTime([], window);
    expect(r.value).toBeNull();
    expect(r.confidence).toBe('none');
  });

  it('is N/A below the low-confidence floor', () => {
    const r = cycleTime([doneItem('A', 1), doneItem('B', 2)], window);
    expect(r.value).toBeNull();
    expect(r.confidence).toBe('insufficient');
    expect(r.sampleSize).toBe(2);
  });

  it('only counts items completed inside the window [start, end)', () => {
    const outside = item('OUT', [
      ['2026-06-01T00:00:00Z', 'IN_PROGRESS'],
      ['2026-06-10T00:00:00Z', 'DONE'],
    ]);
    const atEnd = item('END', [
      ['2026-09-20T00:00:00Z', 'IN_PROGRESS'],
      ['2026-10-01T00:00:00Z', 'DONE'],
    ]);
    const r = cycleTime(
      [outside, atEnd, ...[1, 2, 3, 4, 5].map((n) => doneItem(`K${n}`, n))],
      window,
    );
    expect(r.sampleSize).toBe(5);
    expect(r.observations.map((o) => o.key)).not.toContain('OUT');
    expect(r.observations.map((o) => o.key)).not.toContain('END');
  });

  it('excludes items that were never started, with a reason', () => {
    const neverStarted = item('NS', [
      ['2026-08-01T00:00:00Z', 'TODO'],
      ['2026-08-02T00:00:00Z', 'DONE'],
    ]);
    const r = cycleTime([neverStarted], window);
    expect(r.exclusions).toEqual([{ key: 'NS', reason: 'never_started' }]);
  });

  it('is independent of the source time zone (epoch based)', () => {
    const a = item('TZ', [
      ['2026-08-01T23:00:00-05:00', 'IN_PROGRESS'],
      ['2026-08-03T04:00:00+00:00', 'DONE'],
    ]);
    const r = cycleTime(
      [a, doneItem('B', 1), doneItem('C', 1), doneItem('D', 9), doneItem('E', 9)],
      window,
    );
    const tz = r.observations.find((o) => o.key === 'TZ');
    expect(tz?.value).toBeCloseTo(1, 10); // 2026-08-02T04:00Z -> 2026-08-03T04:00Z
  });

  it('reports high confidence at the minimum sample', () => {
    const r = cycleTime(
      Array.from({ length: 10 }, (_, i) => doneItem(`K${i}`, i + 1)),
      window,
    );
    expect(r.confidence).toBe('normal');
    expect(r.value).toBe(5.5);
  });
});

describe('workItemAging (KPI-02)', () => {
  const snapshot = d('2026-09-30T00:00:00Z');
  const open = (key: string, ageDays: number) =>
    item(key, [[new Date(snapshot.getTime() - ageDays * 86_400_000).toISOString(), 'IN_PROGRESS']]);

  it('reproduces the spec example: ages 2,3,5,8,20 -> median 5, flags 20', () => {
    const r = workItemAging(
      [2, 3, 5, 8, 20].map((n, i) => open(`O${i}`, n)),
      snapshot,
    );
    expect(r.value).toBe(5);
    expect(r.extra?.p85).toBeCloseTo(12.8, 10);
    expect((r.extra?.oldest as { key: string }[])[0].key).toBe('O4');
  });

  it('excludes backlog items that were never started and done items', () => {
    const backlog = item('B', [['2026-09-01T00:00:00Z', 'TODO']]);
    const finished = doneItem('F', 3);
    const r = workItemAging([backlog, finished], snapshot);
    expect(r.sampleSize).toBe(0);
    expect(r.value).toBeNull();
  });

  it('ignores transitions after the snapshot (point-in-time reconstruction)', () => {
    const later = item('L', [
      ['2026-09-20T00:00:00Z', 'IN_PROGRESS'],
      ['2026-10-05T00:00:00Z', 'DONE'],
    ]);
    const r = workItemAging([later], snapshot);
    expect(r.observations).toEqual([{ key: 'L', value: 10 }]);
  });
});
