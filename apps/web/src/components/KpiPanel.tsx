import { useState } from 'react';
import { formatDate } from '../format';
import type { KpiCard } from '../api';
import { t } from '../i18n';
import { useApi } from '../useApi';
import { KpiCardView } from './KpiCard';
import { KpiDrawer } from './KpiDrawer';
import { ErrorState, Skeleton } from './States';
import { useKpiWindow, WINDOWS } from './useKpiWindow';

export function KpiPanel({
  entityType,
  entityId,
  title = t('kpis'),
}: {
  entityType: 'developer' | 'team' | 'group' | 'organization';
  entityId: string;
  title?: string;
}) {
  const [window, setWindow] = useKpiWindow();
  const [open, setOpen] = useState<KpiCard | null>(null);
  const cards = useApi<KpiCard[]>(
    `/api/v1/kpis?entity_type=${entityType}&entity_id=${entityId}&window=${window}`,
  );
  return (
    <section className="panel" aria-labelledby={`kpis-${entityId}`}>
      <div className="panel-head">
        <h2 id={`kpis-${entityId}`}>{title}</h2>
        <div className="segmented" role="group" aria-label={t('window')}>
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              aria-pressed={window === w}
              className={window === w ? 'active' : ''}
              onClick={() => setWindow(w)}
            >
              {w}
            </button>
          ))}
        </div>
      </div>
      <p className="muted small">
        {cards.state === 'ready' && cards.data[0] && (
          <>
            <time dateTime={cards.data[0].window.start}>
              {formatDate(cards.data[0].window.start)}
            </time>{' '}
            –{' '}
            <time dateTime={cards.data[0].window.end}>{formatDate(cards.data[0].window.end)}</time>
            .{' '}
          </>
        )}
        {t('kpiDisclaimer')}
      </p>
      {cards.state === 'loading' && <Skeleton lines={4} />}
      {cards.state === 'error' && <ErrorState error={cards.error} onRetry={cards.reload} />}
      {cards.state === 'ready' && (
        <div className="kpi-grid">
          {cards.data.map((c) => (
            <KpiCardView
              key={c.code}
              card={c}
              onExplain={setOpen}
              neutralTrend={entityType === 'developer'}
            />
          ))}
        </div>
      )}
      {open && <KpiDrawer card={open} onClose={() => setOpen(null)} />}
    </section>
  );
}
