import { classifyConfidence, median, percentile, relativeChangePct } from './stats';

describe('median', () => {
  it('returns null for an empty sample (never zero)', () => {
    expect(median([])).toBeNull();
  });
  it('uses the middle value for odd counts (spec KPI-01 example)', () => {
    expect(median([9, 2, 6, 3, 4])).toBe(4);
  });
  it('averages the two middle values for even counts', () => {
    expect(median([1, 2, 3, 10])).toBe(2.5);
  });
});

describe('percentile', () => {
  it('returns null for an empty sample', () => {
    expect(percentile([], 85)).toBeNull();
  });
  it('uses linear interpolation between closest ranks', () => {
    // sorted [2,3,5,8,20]; rank = 0.85*(5-1) = 3.4 -> 8 + 0.4*(20-8) = 12.8
    expect(percentile([20, 3, 8, 2, 5], 85)).toBeCloseTo(12.8, 10);
  });
  it('handles a single observation', () => {
    expect(percentile([7], 85)).toBe(7);
  });
  it('rejects out-of-range percentiles', () => {
    expect(() => percentile([1], 101)).toThrow(RangeError);
  });
});

describe('classifyConfidence', () => {
  const policy = { minimumSample: 10, lowConfidenceFloor: 5 };
  it.each([
    [0, 'none'],
    [4, 'insufficient'],
    [5, 'low'],
    [9, 'low'],
    [10, 'normal'],
    [250, 'normal'],
  ])('n=%i -> %s', (n, expected) => {
    expect(classifyConfidence(n, policy)).toBe(expected);
  });
});

describe('relativeChangePct', () => {
  it('computes (recent - previous) / |previous| * 100', () => {
    expect(relativeChangePct(4, 5)).toBeCloseTo(-20, 10);
    expect(relativeChangePct(6, 5)).toBeCloseTo(20, 10);
  });
  it('guards against a zero baseline', () => {
    expect(relativeChangePct(3, 0)).toBeNull();
  });
  it('handles a negative baseline using its absolute value', () => {
    expect(relativeChangePct(-1, -2)).toBeCloseTo(50, 10);
  });
});
