import { compareWindows, previousWindow } from './trend';

const obs = (...values: number[]) => values.map((value, i) => ({ key: `k${i}`, value }));
const policy = { minimumSample: 3, lowConfidenceFloor: 2 };

describe('previousWindow', () => {
  it('returns the immediately preceding non-overlapping window of equal length', () => {
    const w = previousWindow({
      start: new Date('2026-07-01T00:00:00Z'),
      end: new Date('2026-09-29T00:00:00Z'),
    });
    expect(w.end.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(w.start.toISOString()).toBe('2026-04-02T00:00:00.000Z');
  });
});

describe('compareWindows', () => {
  it('flags a lower-is-better KPI that got faster as improved', () => {
    const t = compareWindows(obs(4, 4, 4), obs(5, 5, 5), 'lower_is_better', 8, policy);
    expect(t.changePct).toBeCloseTo(-20, 10);
    expect(t.status).toBe('improved');
  });

  it('flags a lower-is-better KPI that got slower as deteriorated', () => {
    const t = compareWindows(obs(6, 6, 6), obs(5, 5, 5), 'lower_is_better', 8, policy);
    expect(t.status).toBe('deteriorated');
  });

  it('treats changes within the threshold as stable', () => {
    const t = compareWindows(obs(5.2, 5.2, 5.2), obs(5, 5, 5), 'lower_is_better', 8, policy);
    expect(t.status).toBe('stable');
  });

  it('computes medians from raw observations, not averaged sub-period medians', () => {
    const t = compareWindows(obs(1, 2, 3, 100), obs(2, 2, 2), 'lower_is_better', 8, policy);
    expect(t.recent).toBe(2.5);
  });

  it('returns insufficient_data when either window is below the minimum sample', () => {
    const t = compareWindows(obs(1, 2), obs(5, 5, 5), 'lower_is_better', 8, policy);
    expect(t.status).toBe('insufficient_data');
    expect(t.changePct).toBeNull();
  });

  it('guards against a zero baseline', () => {
    const t = compareWindows(obs(1, 1, 1), obs(0, 0, 0), 'lower_is_better', 8, policy);
    expect(t.status).toBe('no_baseline');
  });

  it('labels the result as a hypothesis, not a causal conclusion', () => {
    const t = compareWindows(obs(6, 6, 6), obs(5, 5, 5), 'lower_is_better', 8, policy);
    expect(t.note).toMatch(/hypothesis/i);
  });
});
