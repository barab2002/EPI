import type { KpiCard, TrendStatus } from './api';
import { MessageKey, t } from './i18n';

/** Formats a KPI value. Missing values are N/A — never rendered as 0. */
export function formatValue(value: number | null, unit: string): string {
  if (value === null || Number.isNaN(value)) return t('na');
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${unit === 'days' ? (rounded === 1 ? 'day' : 'days') : rounded === 1 ? 'hour' : 'hours'}`;
}

export function confidenceLabel(c: KpiCard['confidence']): string {
  switch (c) {
    case 'normal':
      return 'Normal';
    case 'low':
      return 'Low (small sample)';
    case 'insufficient':
      return 'Insufficient sample';
    case 'none':
      return 'No data';
    case 'suppressed':
      return 'Suppressed';
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
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
