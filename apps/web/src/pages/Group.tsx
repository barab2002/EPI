import { Link, useParams } from 'react-router-dom';
import type { Access, KpiCard, TeamNode } from '../api';
import { KpiPanel } from '../components/KpiPanel';
import { Breadcrumb, PageTitle } from '../components/Layout';
import { ErrorState, Skeleton } from '../components/States';
import { KpiWindow, useKpiWindow, withWindow } from '../components/useKpiWindow';
import { formatDate, formatValue } from '../format';
import { t } from '../i18n';
import { useApi } from '../useApi';
import { AccessBadge } from './Organization';

interface GroupDetail {
  id: string;
  name: string;
  organization_id: string;
  organization_name: string;
  access: Access;
  teams: TeamNode[];
}

const OVERVIEW = ['CYCLE_TIME', 'REVIEW_WAITING_TIME'] as const;

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
      <td className="num">{team.memberCount ?? '—'}</td>
      {OVERVIEW.map((code) => (
        <td key={code} className="num">
          {!canSee ? '—' : ready ? kpiCell(ready, code) : cards.state === 'error' ? '—' : '…'}
        </td>
      ))}
      <td className="num">{canSee && ready ? formatDate(asOf) : '—'}</td>
    </tr>
  );
}

export function GroupPage() {
  const { id } = useParams();
  const [window] = useKpiWindow();
  const g = useApi<GroupDetail>(`/api/v1/groups/${id}`);
  if (g.state === 'loading') return <Skeleton title lines={5} />;
  if (g.state === 'error') return <ErrorState error={g.error} onRetry={g.reload} />;
  const d = g.data;
  const teams = [...d.teams].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <Breadcrumb
        items={[{ label: t('navOrganization'), to: '/organization' }, { label: d.name }]}
      />
      <PageTitle badge={<AccessBadge access={d.access} />}>{d.name}</PageTitle>
      {d.access === 'structure' ? (
        <p className="muted">{t('structureOnly')}</p>
      ) : (
        <KpiPanel entityType="group" entityId={d.id} />
      )}
      <section className="panel" aria-labelledby="group-teams">
        <h2 id="group-teams">{t('teams')}</h2>
        <p className="muted small">{t('teamsOverviewHint')}</p>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{t('team')}</th>
                <th scope="col" className="num">
                  {t('members')}
                </th>
                <th scope="col" className="num">
                  Cycle Time
                </th>
                <th scope="col" className="num">
                  Review Waiting Time
                </th>
                <th scope="col" className="num">
                  {t('dataAsOf')}
                </th>
              </tr>
            </thead>
            <tbody>
              {teams.map((tm) => (
                <TeamRow key={tm.id} team={tm} window={window} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
