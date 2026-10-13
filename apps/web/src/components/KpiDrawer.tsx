import { useEffect, useRef } from 'react';
import type { KpiCard, KpiExplanation } from '../api';
import { formatDate, formatValue } from '../format';
import { getLocale, kpiTitle, t, tf } from '../i18n';
import { useApi } from '../useApi';
import { CloseIcon } from './Icons';
import { ErrorState, Loading } from './States';

/** "How calculated?" drawer: definition, worked example, and (if permitted) the items behind the value. */
export function KpiDrawer({
  card,
  onClose,
  showWindow = true,
}: {
  card: KpiCard;
  onClose: () => void;
  /** False when opened from the catalog: there is no measured window to show. */
  showWindow?: boolean;
}) {
  // The language is part of the URL so switching language loads the texts again.
  const exp = useApi<KpiExplanation>(`/api/v1/kpis/${card.code}/explanation?lang=${getLocale()}`);
  const closeRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  useEffect(() => {
    // Modal sheet: focus moves in, Tab stays inside, Esc closes, focus returns to the opener.
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose();
      if (e.key !== 'Tab' || !sheetRef.current) return;
      const focusable = sheetRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, [onClose]);

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        ref={sheetRef}
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer-head">
          <h2 id="drawer-title">{kpiTitle(card.code, card.title)}</h2>
          <button
            ref={closeRef}
            type="button"
            className="icon-btn"
            aria-label={t('close')}
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </header>
        {exp.state === 'loading' && <Loading />}
        {exp.state === 'error' && <ErrorState error={exp.error} onRetry={exp.reload} />}
        {exp.state === 'ready' && (
          <div className="drawer-body">
            <p className="lead" dir="auto">
              {exp.data.question}
            </p>
            <dl className="defs">
              <dt>{t('formula')}</dt>
              <dd>
                <code translate="no" dir="ltr">
                  {exp.data.formula}
                </code>
              </dd>
              <dt>{t('population')}</dt>
              <dd dir="auto">{exp.data.population}</dd>
              <dt>{t('source')}</dt>
              <dd dir="auto">{exp.data.source}</dd>
              {showWindow && (
                <>
                  <dt>{t('window')}</dt>
                  <dd>
                    <time dateTime={card.window.start}>{formatDate(card.window.start)}</time> –{' '}
                    <time dateTime={card.window.end}>{formatDate(card.window.end)}</time>
                  </dd>
                </>
              )}
              <dt>{t('minimumSample')}</dt>
              <dd dir="auto">{exp.data.minimumSample}</dd>
              <dt>{t('version')}</dt>
              <dd dir="ltr">
                {exp.data.code} v{exp.data.version},{' '}
                <code translate="no" dir="ltr">
                  {exp.data.implementation}
                </code>
              </dd>
            </dl>
            <h3>{t('exclusions')}</h3>
            <ul>
              {exp.data.exclusions.map((x) => (
                <li key={x} dir="auto">
                  {x}
                </li>
              ))}
            </ul>
            <h3>{t('caveats')}</h3>
            <ul>
              {exp.data.caveats.map((x) => (
                <li key={x} dir="auto">
                  {x}
                </li>
              ))}
            </ul>
            {card.trend && <p className="muted small">{t('trendHypothesisNote')}</p>}
            <h3>{t('example')}</h3>
            <p dir="auto">{exp.data.example.description}</p>
            <p className="muted small">
              {tf('exampleInput', { input: exp.data.example.input.join(', ') })}{' '}
              <strong>{formatValue(exp.data.example.result.value, exp.data.unit)}</strong> (n=
              {exp.data.example.result.sampleSize}, {exp.data.example.result.confidence})
            </p>
            <h3>{t('actions')}</h3>
            <ul>
              {exp.data.possibleActions.map((x) => (
                <li key={x} dir="auto">
                  {x}
                </li>
              ))}
            </ul>
            {card.evidence && (
              <>
                <h3>{t('evidenceItems')}</h3>
                {card.evidence.observations.length === 0 ? (
                  <p className="muted">{t('noData')}</p>
                ) : (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th scope="col">{t('item')}</th>
                          <th scope="col" className="num">
                            {t('value')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {card.evidence.observations.map((o) => (
                          <tr key={o.key}>
                            <td translate="no">{o.key}</td>
                            <td className="num">{formatValue(o.value, card.unit)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
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
