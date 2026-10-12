import type { KpiCard as Card } from '../api';
import { confidenceLabel, formatDate, formatPct, formatValue, trendLabel } from '../format';
import { t } from '../i18n';

export function KpiCardView({ card, onExplain }: { card: Card; onExplain: (card: Card) => void }) {
  const trend = card.trend;
  return (
    <article className="kpi-card" aria-labelledby={`kpi-${card.code}`}>
      <header className="kpi-head">
        <h3 id={`kpi-${card.code}`}>{card.title}</h3>
        {card.proxy && <span className="badge badge-warn">{t('proxyLabel')}</span>}
        {card.synthetic && <span className="badge">Synthetic</span>}
      </header>
      {card.suppressed ? (
        <>
          <p className="kpi-value kpi-na">{t('suppressed')}</p>
          <p className="muted small">{t('suppressedHint')}</p>
        </>
      ) : (
        <>
          <p className={`kpi-value${card.value === null ? ' kpi-na' : ''}`}>
            {formatValue(card.value, card.unit)}
          </p>
          {trend && (
            <p className={`trend trend-${trend.status}`}>
              <span className="trend-label">{trendLabel(trend.status)}</span>{' '}
              {trend.changePct !== null && (
                <span>
                  {formatPct(trend.changePct)} {t('trendVsPrevious')}
                </span>
              )}
            </p>
          )}
          <dl className="kpi-meta">
            <div>
              <dt>{t('sample')}</dt>
              <dd>{card.sampleSize}</dd>
            </div>
            <div>
              <dt>{t('confidence')}</dt>
              <dd>{confidenceLabel(card.confidence)}</dd>
            </div>
            <div>
              <dt>{t('dataAsOf')}</dt>
              <dd>{formatDate(card.lastDataAt)}</dd>
            </div>
          </dl>
        </>
      )}
      <button type="button" className="link-btn" onClick={() => onExplain(card)}>
        {t('howCalculated')}
      </button>
    </article>
  );
}
