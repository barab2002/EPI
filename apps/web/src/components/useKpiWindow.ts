import { useSearchParams } from 'react-router-dom';

export const WINDOWS = ['30d', '90d', '180d'] as const;
export type KpiWindow = (typeof WINDOWS)[number];

/** KPI window kept in the URL (`?window=30d`) so it survives drill-down, Back and sharing. */
export function useKpiWindow(): [KpiWindow, (w: KpiWindow) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get('window');
  const value: KpiWindow = (WINDOWS as readonly string[]).includes(raw ?? '')
    ? (raw as KpiWindow)
    : '90d';
  const set = (w: KpiWindow) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (w === '90d') next.delete('window');
        else next.set('window', w);
        return next;
      },
      { replace: true },
    );
  return [value, set];
}

/** Carries the current window onto a drill-down link. */
export function withWindow(path: string, w: KpiWindow): string {
  return w === '90d' ? path : `${path}?window=${w}`;
}
