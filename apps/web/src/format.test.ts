import { formatMonth, formatPct, formatValue, roleLabel, valueParts } from './format';

describe('formatValue', () => {
  it('renders missing values as N/A, never as zero', () => {
    expect(formatValue(null, 'days')).toBe('N/A');
  });
  it('keeps one decimal below 10 and rounds above', () => {
    expect(formatValue(4.26, 'days')).toBe('4.3 days');
    expect(formatValue(12.6, 'hours')).toBe('13 hours');
  });
  it('uses singular units', () => {
    expect(formatValue(1, 'days')).toBe('1 day');
  });
  it('shows zero only when the measured value really is zero', () => {
    expect(formatValue(0, 'hours')).toBe('0 hours');
  });
});

describe('formatPct', () => {
  it('signs changes', () => {
    expect(formatPct(-20.4)).toBe('-20%');
    expect(formatPct(8.6)).toBe('+9%');
    expect(formatPct(null)).toBe('');
  });
});

describe('valueParts', () => {
  it('splits number and unit; N/A has no unit', () => {
    expect(valueParts(4.26, 'days')).toEqual({ number: '4.3', unit: 'days' });
    expect(valueParts(null, 'days')).toEqual({ number: 'N/A', unit: '' });
  });
});

describe('roleLabel', () => {
  it('shows words, highest role first, developer only when nothing else', () => {
    expect(roleLabel(['DEVELOPER', 'TEAM_LEAD'])).toBe('Team lead');
    expect(roleLabel(['TEAM_LEAD', 'ADMIN'])).toBe('Administrator, Team lead');
    expect(roleLabel(['DEVELOPER'])).toBe('Developer');
    expect(roleLabel([])).toBe('Developer');
  });
});

describe('formatMonth', () => {
  it('formats a DATE sent as UTC midnight in UTC, so no time zone shifts it a month back', () => {
    expect(formatMonth('2026-10-01T00:00:00.000Z')).toBe('October 2026');
    expect(formatMonth(null)).toBe('No data yet');
  });
});
