/**
 * Data retention (ADR-032): the owner set 24 months with automatic deletion (ADR-024).
 * The minimum of 13 months keeps the 6-month backfill, 180-day KPI windows and their previous
 * window for comparison, plus a year of audit history.
 */
export const DEFAULT_RETENTION_MONTHS = 24;
const MIN_MONTHS = 13;
const MAX_MONTHS = 240;

/** EPI_RETENTION_MONTHS → months, or null when retention is switched off ("off"). */
export function retentionMonths(raw: string | undefined): number | null {
  if (raw === undefined || raw === '') return DEFAULT_RETENTION_MONTHS;
  if (raw === 'off') return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < MIN_MONTHS || n > MAX_MONTHS) {
    throw new Error(
      `Config: EPI_RETENTION_MONTHS must be a whole number of months from ${MIN_MONTHS} to ${MAX_MONTHS}, or "off"`,
    );
  }
  return n;
}

/** `now` minus whole calendar months in UTC, clamped to the end of shorter months. */
export function retentionCutoff(now: Date, months: number): Date {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() - months;
  const target = new Date(Date.UTC(y, m, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(now.getUTCDate(), lastDay));
  target.setUTCHours(
    now.getUTCHours(),
    now.getUTCMinutes(),
    now.getUTCSeconds(),
    now.getUTCMilliseconds(),
  );
  return target;
}
