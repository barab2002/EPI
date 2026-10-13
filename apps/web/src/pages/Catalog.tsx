import { useState } from 'react';
import type { KpiCard } from '../api';
import { KpiDrawer } from '../components/KpiDrawer';
import { Breadcrumb, PageTitle } from '../components/Layout';
import { ErrorState, Skeleton } from '../components/States';
import { getLocale, kpiTitle, MessageKey, t } from '../i18n';
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

function directionLabel(d: string): string {
  if (d === 'lower_is_better') return t('dirLower');
  if (d === 'higher_is_better') return t('dirHigher');
  return d.replace(/_/g, ' ');
}

const SCOPES: Record<string, MessageKey> = {
  organization: 'scopeOrganization',
  group: 'scopeGroup',
  team: 'scopeTeam',
  developer: 'scopeDeveloper',
};

function catalogCard(k: CatalogEntry): KpiCard {
  return {
    code: k.code,
    title: k.title,
    unit: k.unit,
    direction: k.direction,
    formulaVersion: k.version,
    value: null,
    sampleSize: 0,
    confidence: 'none',
    window: { start: '', end: '' },
    trend: null,
    proxy: false,
    suppressed: false,
    synthetic: false,
    lastDataAt: null,
  };
}

export function CatalogPage() {
  const list = useApi<CatalogEntry[]>(`/api/v1/kpis/catalog?lang=${getLocale()}`);
  const [open, setOpen] = useState<KpiCard | null>(null);
  return (
    <>
      <Breadcrumb items={[{ label: t('navCatalog') }]} />
      <PageTitle>{t('navCatalog')}</PageTitle>
      <p className="muted">{t('kpiDisclaimer')}</p>
      {list.state === 'loading' && <Skeleton lines={4} />}
      {list.state === 'error' && <ErrorState error={list.error} onRetry={list.reload} />}
      {list.state === 'ready' && (
        <section className="panel" aria-label={t('navCatalog')}>
          <ul className="catalog">
            {list.data.map((k) => (
              <li key={k.code}>
                <div>
                  <h2 className="kpi-title">{kpiTitle(k.code, k.title)}</h2>
                  <p dir="auto">{k.question}</p>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => setOpen(catalogCard(k))}
                  >
                    {t('howCalculated')}
                  </button>
                </div>
                <dl className="kpi-meta">
                  <div>
                    <dt>{t('unit')}</dt>
                    <dd>{t(k.unit === 'days' ? 'unitDaysName' : 'unitHoursName')}</dd>
                  </div>
                  <div>
                    <dt>{t('direction')}</dt>
                    <dd>{directionLabel(k.direction)}</dd>
                  </div>
                  <div>
                    <dt>{t('shownFor')}</dt>
                    <dd>{k.scopes.map((sc) => (SCOPES[sc] ? t(SCOPES[sc]) : sc)).join(', ')}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        </section>
      )}
      {open && <KpiDrawer card={open} showWindow={false} onClose={() => setOpen(null)} />}
    </>
  );
}
