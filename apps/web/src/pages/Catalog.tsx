import { useState } from 'react';
import type { KpiCard } from '../api';
import { KpiDrawer } from '../components/KpiDrawer';
import { Breadcrumb } from '../components/Layout';
import { ErrorState, Loading } from '../components/States';
import { t } from '../i18n';
import { useApi } from '../useApi';

interface CatalogEntry {
  code: string;
  version: string;
  title: string;
  question: string;
  unit: 'days' | 'hours';
  direction: string;
  scopes: string[];
}

export function CatalogPage() {
  const list = useApi<CatalogEntry[]>('/api/v1/kpis/catalog');
  const [open, setOpen] = useState<KpiCard | null>(null);
  return (
    <>
      <Breadcrumb items={[{ label: t('navCatalog') }]} />
      <h1>{t('navCatalog')}</h1>
      <p className="muted">{t('kpiDisclaimer')}</p>
      {list.state === 'loading' && <Loading />}
      {list.state === 'error' && <ErrorState error={list.error} onRetry={list.reload} />}
      {list.state === 'ready' && (
        <div className="kpi-grid">
          {list.data.map((k) => (
            <article key={k.code} className="kpi-card">
              <h3>{k.title}</h3>
              <p>{k.question}</p>
              <p className="muted small">
                {k.code} v{k.version} · {k.unit} · {k.direction.replace(/_/g, ' ')} ·{' '}
                {k.scopes.join(', ')}
              </p>
              <button
                type="button"
                className="link-btn"
                onClick={() =>
                  setOpen({
                    code: k.code,
                    title: k.title,
                    unit: k.unit,
                    direction: k.direction,
                    formulaVersion: k.version,
                    value: null,
                    sampleSize: 0,
                    confidence: 'none',
                    window: { start: new Date().toISOString(), end: new Date().toISOString() },
                    trend: null,
                    proxy: false,
                    suppressed: false,
                    synthetic: false,
                    lastDataAt: null,
                  })
                }
              >
                {t('howCalculated')}
              </button>
            </article>
          ))}
        </div>
      )}
      {open && <KpiDrawer card={open} onClose={() => setOpen(null)} />}
    </>
  );
}
