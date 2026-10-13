import { retentionCutoff, retentionMonths } from './retention';

describe('retentionCutoff', () => {
  it('goes back whole calendar months in UTC', () => {
    expect(retentionCutoff(new Date('2026-10-13T14:00:00Z'), 24).toISOString()).toBe(
      '2024-10-13T14:00:00.000Z',
    );
  });
  it('clamps to the last day of a shorter month', () => {
    expect(retentionCutoff(new Date('2026-03-31T00:00:00Z'), 1).toISOString()).toBe(
      '2026-02-28T00:00:00.000Z',
    );
    expect(retentionCutoff(new Date('2028-02-29T12:00:00Z'), 12).toISOString()).toBe(
      '2027-02-28T12:00:00.000Z',
    );
  });
});

describe('retentionMonths', () => {
  it('defaults to 24 months (owner decision) and accepts off', () => {
    expect(retentionMonths(undefined)).toBe(24);
    expect(retentionMonths('')).toBe(24);
    expect(retentionMonths('36')).toBe(36);
    expect(retentionMonths('off')).toBeNull();
  });
  it('refuses windows too short for the 6-month KPI backfill and comparisons, or nonsense', () => {
    for (const bad of ['0', '5', '12', '-1', '12.5', 'abc', '241']) {
      expect(() => retentionMonths(bad)).toThrow(/EPI_RETENTION_MONTHS/);
    }
  });
});
