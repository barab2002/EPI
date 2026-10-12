import { formatPct, formatValue } from './format';

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
