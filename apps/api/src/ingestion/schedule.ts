/**
 * Daily sync schedule (pure; no DB or timers). The scheduler ticks every minute and asks
 * `isDue`; a run is due once per local calendar day, at or after the configured local hour.
 *
 * - "At or after" means a host that was down at the scheduled hour catches up later that day.
 * - DST: a skipped local hour (spring forward) still runs at the next existing hour; a repeated
 *   hour (fall back) runs once, because the claim is keyed by the local date.
 */
export interface SyncSchedule {
  enabled: boolean;
  /** Local hour of day, 0–23. */
  hourLocal: number;
  /** IANA time zone, e.g. "Asia/Jerusalem" or "UTC". */
  timezone: string;
}

export const DEFAULT_SCHEDULE: SyncSchedule = { enabled: false, hourLocal: 2, timezone: 'UTC' };

export function isValidTimezone(tz: string): boolean {
  if (typeof tz !== 'string' || !/^[A-Za-z0-9_+\-/]{1,64}$/.test(tz)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Local calendar date (YYYY-MM-DD) and hour (0–23) of `now` in `timezone`. */
export function localParts(now: Date, timezone: string): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
}

/** Returns the local date to claim when a run is due, otherwise null. */
export function dueDate(
  now: Date,
  schedule: SyncSchedule,
  lastRunDate: string | null,
): string | null {
  if (!schedule.enabled) return null;
  const { date, hour } = localParts(now, schedule.timezone);
  if (hour < schedule.hourLocal) return null;
  if (lastRunDate !== null && lastRunDate >= date) return null;
  return date;
}

/** Next scheduled start (UTC instant) after `now`, for display; searches hour by hour. */
export function nextRun(
  now: Date,
  schedule: SyncSchedule,
  lastRunDate: string | null,
): Date | null {
  if (!schedule.enabled) return null;
  const hourMs = 3_600_000;
  const start = new Date(Math.floor(now.getTime() / hourMs) * hourMs);
  if (dueDate(now, schedule, lastRunDate)) return now;
  for (let i = 1; i <= 49; i++) {
    const t = new Date(start.getTime() + i * hourMs);
    if (dueDate(t, schedule, lastRunDate)) return t;
  }
  return null;
}
