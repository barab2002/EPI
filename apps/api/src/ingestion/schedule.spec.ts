import { dueDate, isValidTimezone, localParts, nextRun, SyncSchedule } from './schedule';

const utc2: SyncSchedule = { enabled: true, hourLocal: 2, timezone: 'UTC' };

describe('localParts', () => {
  it('converts to the local date and hour of an IANA zone', () => {
    // 2026-10-13 22:30Z is 01:30 on the 14th in Jerusalem (UTC+3, summer time).
    expect(localParts(new Date('2026-10-13T22:30:00Z'), 'Asia/Jerusalem')).toEqual({
      date: '2026-10-14',
      hour: 1,
    });
    expect(localParts(new Date('2026-10-13T22:30:00Z'), 'UTC')).toEqual({
      date: '2026-10-13',
      hour: 22,
    });
  });

  it('reports midnight as hour 0, not 24', () => {
    expect(localParts(new Date('2026-10-14T00:05:00Z'), 'UTC').hour).toBe(0);
  });
});

describe('dueDate', () => {
  it('is never due when disabled', () => {
    expect(dueDate(new Date('2026-10-13T12:00:00Z'), { ...utc2, enabled: false }, null)).toBe(null);
  });

  it('is not due before the configured hour', () => {
    expect(dueDate(new Date('2026-10-13T01:59:00Z'), utc2, '2026-10-12')).toBe(null);
  });

  it('is due at the hour and claims the local date', () => {
    expect(dueDate(new Date('2026-10-13T02:00:00Z'), utc2, '2026-10-12')).toBe('2026-10-13');
  });

  it('catches up later the same day after downtime', () => {
    expect(dueDate(new Date('2026-10-13T17:00:00Z'), utc2, '2026-10-11')).toBe('2026-10-13');
  });

  it('runs once per local day', () => {
    expect(dueDate(new Date('2026-10-13T02:01:00Z'), utc2, '2026-10-13')).toBe(null);
    expect(dueDate(new Date('2026-10-13T23:59:00Z'), utc2, '2026-10-13')).toBe(null);
  });

  it('runs on first tick of a fresh install once the hour has passed', () => {
    expect(dueDate(new Date('2026-10-13T03:00:00Z'), utc2, null)).toBe('2026-10-13');
  });

  it('uses the local day, not the UTC day', () => {
    const jlm: SyncSchedule = { enabled: true, hourLocal: 2, timezone: 'Asia/Jerusalem' };
    // 23:00Z on the 13th = 02:00 on the 14th local.
    expect(dueDate(new Date('2026-10-13T23:00:00Z'), jlm, '2026-10-13')).toBe('2026-10-14');
    // 22:00Z = 01:00 local: not yet.
    expect(dueDate(new Date('2026-10-13T22:00:00Z'), jlm, '2026-10-13')).toBe(null);
  });

  it('spring forward: a skipped 02:00 still runs at 03:00 local', () => {
    // Europe/Berlin 2026-03-29: 02:00 local does not exist (01:59 CET → 03:00 CEST = 01:00Z).
    const ber: SyncSchedule = { enabled: true, hourLocal: 2, timezone: 'Europe/Berlin' };
    expect(dueDate(new Date('2026-03-29T00:59:00Z'), ber, '2026-03-28')).toBe(null);
    expect(dueDate(new Date('2026-03-29T01:00:00Z'), ber, '2026-03-28')).toBe('2026-03-29');
  });

  it('fall back: a repeated 02:00 hour runs once', () => {
    // Europe/Berlin 2026-10-25: 02:00–02:59 local occurs at 00:00Z (CEST) and 01:00Z (CET).
    const ber: SyncSchedule = { enabled: true, hourLocal: 2, timezone: 'Europe/Berlin' };
    const first = dueDate(new Date('2026-10-25T00:00:00Z'), ber, '2026-10-24');
    expect(first).toBe('2026-10-25');
    expect(dueDate(new Date('2026-10-25T01:00:00Z'), ber, first)).toBe(null);
  });
});

describe('nextRun', () => {
  it('is null when disabled', () => {
    expect(nextRun(new Date('2026-10-13T12:00:00Z'), { ...utc2, enabled: false }, null)).toBe(null);
  });

  it('is the next local occurrence of the hour', () => {
    expect(nextRun(new Date('2026-10-13T12:34:00Z'), utc2, '2026-10-13')).toEqual(
      new Date('2026-10-14T02:00:00Z'),
    );
    expect(nextRun(new Date('2026-10-13T01:10:00Z'), utc2, '2026-10-12')).toEqual(
      new Date('2026-10-13T02:00:00Z'),
    );
  });

  it('is now when a run is already due', () => {
    const now = new Date('2026-10-13T05:00:00Z');
    expect(nextRun(now, utc2, '2026-10-12')).toEqual(now);
  });
});

describe('isValidTimezone', () => {
  it.each(['UTC', 'Asia/Jerusalem', 'America/New_York', 'Etc/GMT+2'])('accepts %s', (tz) =>
    expect(isValidTimezone(tz)).toBe(true),
  );
  it.each(['', 'Mars/Olympus', 'UTC; DROP TABLE', 'a'.repeat(65)])('rejects %s', (tz) =>
    expect(isValidTimezone(tz)).toBe(false),
  );
});
