import type { KpiCard, TrendStatus } from './api';
import { intlLocale, MessageKey, t } from './i18n';

/** Formats a KPI value. Missing values are N/A — never rendered as 0. */
export function formatValue(value: number | null, unit: string): string {
  if (value === null || Number.isNaN(value)) return t('na');
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  const one = rounded === 1;
  const word =
    unit === 'days'
      ? t(one ? 'unitDayOne' : 'unitDayMany')
      : t(one ? 'unitHourOne' : 'unitHourMany');
  return `${rounded.toLocaleString(intlLocale())} ${word}`;
}

/** Splits a formatted KPI value into number and unit for typographic emphasis on the number. */
export function valueParts(value: number | null, unit: string): { number: string; unit: string } {
  const text = formatValue(value, unit);
  const i = text.indexOf(' ');
  return i < 0 ? { number: text, unit: '' } : { number: text.slice(0, i), unit: text.slice(i + 1) };
}

const ROLE_LABELS: Record<string, MessageKey> = {
  ADMIN: 'roleAdmin',
  ENGINEERING_MANAGER: 'roleEngineeringManager',
  GROUP_MANAGER: 'roleGroupManager',
  TEAM_LEAD: 'roleTeamLead',
  HR_PARTNER: 'roleHrPartner',
  DEVELOPER: 'roleDeveloper',
};

/** Human role names (never enum codes in the UI, DESIGN.md §6). Highest role first. */
export function roleLabel(roles: string[]): string {
  const order = Object.keys(ROLE_LABELS);
  const shown = roles.filter((r) => r !== 'DEVELOPER');
  const list = (shown.length ? shown : ['DEVELOPER']).sort(
    (a, b) => order.indexOf(a) - order.indexOf(b),
  );
  return list
    .map((r) => (ROLE_LABELS[r] ? t(ROLE_LABELS[r]) : r.toLowerCase().replace(/_/g, ' ')))
    .join(', ');
}

export function confidenceLabel(c: KpiCard['confidence']): string {
  switch (c) {
    case 'normal':
      return t('confNormal');
    case 'low':
      return t('confLow');
    case 'insufficient':
      return t('confInsufficient');
    case 'none':
      return t('confNone');
    case 'suppressed':
      return t('confSuppressed');
  }
}

const trendKeys: Record<TrendStatus, MessageKey> = {
  improved: 'trendImproved',
  deteriorated: 'trendDeteriorated',
  stable: 'trendStable',
  insufficient_data: 'trendInsufficient',
  no_baseline: 'trendNoBaseline',
};

export function trendLabel(status: TrendStatus): string {
  return t(trendKeys[status]);
}

export function formatPct(p: number | null): string {
  if (p === null) return '';
  const r = Math.round(p);
  return `${r > 0 ? '+' : ''}${r}%`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return t('noData');
  return new Date(iso).toLocaleDateString(intlLocale(), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * A calendar month ("October 2026") from a date-only value. The API sends DATE columns as UTC
 * midnight, so format in UTC: local time west of UTC would show the previous day's month.
 */
export function formatMonth(iso: string | null): string {
  if (!iso) return t('noData');
  return new Date(iso).toLocaleDateString(intlLocale(), {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
