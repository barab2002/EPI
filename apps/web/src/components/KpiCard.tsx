import type { KpiCard as Card } from '../api';
import { confidenceLabel, formatDate, formatPct, trendLabel, valueParts } from '../format';
import { kpiTitle, t } from '../i18n';

export function KpiCardView({
  card,
  onExplain,
  neutralTrend = false,
}: {
  card: Card;
  onExplain: (card: Card) => void;
  /** Individual scope: describe change without judging it (no red/green, ethical measurement). */
  neutralTrend?: boolean;
}) {
  const trend = card.trend;
  const v = valueParts(card.value, card.unit);
  return (
    <article className="kpi-card" aria-labelledby={`kpi-${card.code}`}>
      <header className="kpi-head">
        <h3 id={`kpi-${card.code}`}>{kpiTitle(card.code, card.title)}</h3>
        {card.proxy && <span className="badge badge-warn">{t('proxyLabel')}</span>}
        {card.synthetic && <span className="badge">{t('synthetic')}</span>}
      </header>
      {card.suppressed ? (
        <>
          <p className="kpi-value kpi-na">{t('suppressed')}</p>
          <p className="muted small">{t('suppressedHint')}</p>
        </>
      ) : (
        <>
          <p className={`kpi-value${card.value === null ? ' kpi-na' : ''}`}>
            {v.number}
            {v.unit && (
              <>
                {' '}
                <span className="kpi-unit">{v.unit}</span>
              </>
            )}
          </p>
          {card.value === null && (
            <p className="trend">
              {card.sampleSize === 0
                ? t('noData')
                : `${t('notEnoughData')} (${card.sampleSize} ${t(card.sampleSize === 1 ? 'itemOne' : 'itemMany')})`}
            </p>
          )}
          {trend &&
          neutralTrend &&
          (trend.status === 'improved' || trend.status === 'deteriorated') ? (
            <p className="trend">
              <span dir="ltr">{formatPct(trend.changePct)}</span> {t('trendVsPrevious')}
            </p>
          ) : (
            trend && (
              <p className={`trend trend-${trend.status}`}>
                <span className="trend-label">{trendLabel(trend.status)}</span>{' '}
                {trend.changePct !== null && (
                  <span>
                    <span dir="ltr">{formatPct(trend.changePct)}</span> {t('trendVsPrevious')}
                  </span>
                )}
              </p>
            )
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
