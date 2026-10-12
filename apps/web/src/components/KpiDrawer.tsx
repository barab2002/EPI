import { useEffect, useRef } from 'react';
import type { KpiCard, KpiExplanation } from '../api';
import { formatValue } from '../format';
import { t } from '../i18n';
import { useApi } from '../useApi';
import { ErrorState, Loading } from './States';

/** "How calculated?" drawer: definition, worked example, and (if permitted) the items behind the value. */
export function KpiDrawer({ card, onClose }: { card: KpiCard; onClose: () => void }) {
  const exp = useApi<KpiExplanation>(`/api/v1/kpis/${card.code}/explanation`);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer-head">
          <h2 id="drawer-title">{card.title}</h2>
          <button ref={closeRef} type="button" className="btn" onClick={onClose}>
            {t('close')}
          </button>
        </header>
        {exp.state === 'loading' && <Loading />}
        {exp.state === 'error' && <ErrorState error={exp.error} onRetry={exp.reload} />}
        {exp.state === 'ready' && (
          <div className="drawer-body">
            <p className="lead">{exp.data.question}</p>
            <dl className="defs">
              <dt>{t('formula')}</dt>
              <dd>
                <code>{exp.data.formula}</code>
              </dd>
              <dt>{t('population')}</dt>
              <dd>{exp.data.population}</dd>
              <dt>{t('source')}</dt>
              <dd>{exp.data.source}</dd>
              <dt>{t('window')}</dt>
              <dd>
                {new Date(card.window.start).toLocaleDateString('en-GB')} –{' '}
                {new Date(card.window.end).toLocaleDateString('en-GB')}
              </dd>
              <dt>{t('minimumSample')}</dt>
              <dd>{exp.data.minimumSample}</dd>
              <dt>{t('version')}</dt>
              <dd>
                {exp.data.code} v{exp.data.version} · <code>{exp.data.implementation}</code>
              </dd>
            </dl>
            <h3>{t('exclusions')}</h3>
            <ul>
              {exp.data.exclusions.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
            <h3>{t('caveats')}</h3>
            <ul>
              {exp.data.caveats.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
            {card.trend && <p className="muted small">{card.trend.note}</p>}
            <h3>{t('example')}</h3>
            <p>{exp.data.example.description}</p>
            <p className="muted small">
              Input: [{exp.data.example.input.join(', ')}] → engine result:{' '}
              <strong>{formatValue(exp.data.example.result.value, exp.data.unit)}</strong> (n=
              {exp.data.example.result.sampleSize}, {exp.data.example.result.confidence})
            </p>
            <h3>{t('actions')}</h3>
            <ul>
              {exp.data.possibleActions.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
            {card.evidence && (
              <>
                <h3>{t('evidenceItems')}</h3>
                {card.evidence.observations.length === 0 ? (
                  <p className="muted">{t('noData')}</p>
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th scope="col">Item</th>
                        <th scope="col">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {card.evidence.observations.map((o) => (
                        <tr key={o.key}>
                          <td>{o.key}</td>
                          <td>{formatValue(o.value, card.unit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {card.evidence.exclusions.length > 0 && (
                  <p className="muted small">
                    {t('excluded')}:{' '}
                    {card.evidence.exclusions.map((e) => `${e.key} (${e.reason})`).join(', ')}
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
