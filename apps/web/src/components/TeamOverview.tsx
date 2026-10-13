import { Link } from 'react-router-dom';
import type { KpiCard, TeamNode } from '../api';
import { formatDate, formatValue } from '../format';
import { t } from '../i18n';
import { AccessBadge } from '../pages/Organization';
import { useApi } from '../useApi';
import { KpiWindow, useKpiWindow, withWindow } from './useKpiWindow';

const OVERVIEW = ['CYCLE_TIME', 'REVIEW_WAITING_TIME'] as const;
const LABELS: Record<(typeof OVERVIEW)[number], string> = {
  CYCLE_TIME: 'Cycle Time',
  REVIEW_WAITING_TIME: 'Review Waiting Time',
};

function kpiCell(cards: KpiCard[], code: string): string {
  const c = cards.find((k) => k.code === code);
  if (!c) return '—';
  if (c.suppressed) return t('suppressed');
  return formatValue(c.value, c.unit);
}

/**
 * One team in the group overview. Teams are listed alphabetically, never sorted by a KPI
 * (ethical measurement: an overview for conversations, not a league table).
 */
function TeamRow({ team, window }: { team: TeamNode; window: KpiWindow }) {
  const canSee = team.access === 'managed' || team.access === 'aggregate';
  const cards = useApi<KpiCard[]>(
    canSee ? `/api/v1/kpis?entity_type=team&entity_id=${team.id}&window=${window}` : null,
  );
  const ready = cards.state === 'ready' ? cards.data : null;
  const asOf =
    ready
      ?.map((c) => c.lastDataAt)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;
  return (
    <tr>
      <th scope="row">
        <Link to={withWindow(`/teams/${team.id}`, window)}>{team.name}</Link>{' '}
        <AccessBadge access={team.access} />
      </th>
      <td className="num" data-label={t('members')}>
        {team.memberCount ?? '—'}
      </td>
      {OVERVIEW.map((code) => (
        <td key={code} className="num" data-label={LABELS[code]}>
          {!canSee ? '—' : ready ? kpiCell(ready, code) : cards.state === 'error' ? '—' : '…'}
        </td>
      ))}
      <td className="num" data-label={t('dataAsOf')}>
        {canSee && ready ? formatDate(asOf) : '—'}
      </td>
    </tr>
  );
}

/** Team overview table (group page, managers' home). Alphabetical; never sorted by a KPI. */
export function TeamOverview({ teams }: { teams: TeamNode[] }) {
  const [window] = useKpiWindow();
  const sorted = [...teams].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="table-wrap">
      <table className="table table-stack">
        <thead>
          <tr>
            <th scope="col">{t('team')}</th>
            <th scope="col" className="num">
              {t('members')}
            </th>
            {OVERVIEW.map((code) => (
              <th key={code} scope="col" className="num">
                {LABELS[code]}
              </th>
            ))}
            <th scope="col" className="num">
              {t('dataAsOf')}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((tm) => (
            <TeamRow key={tm.id} team={tm} window={window} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
