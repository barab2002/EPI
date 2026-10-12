import { Link } from 'react-router-dom';
import type { OrgNode } from '../api';
import { KpiPanel } from '../components/KpiPanel';
import { ErrorState, Loading } from '../components/States';
import { t } from '../i18n';
import { useSession } from '../session';
import { useApi } from '../useApi';

/** Context-aware landing page: managers start from what they manage, developers from themselves. */
export function HomePage() {
  const { me } = useSession();
  const tree = useApi<OrgNode[]>('/api/v1/organization/tree');
  const isManager = me.managedTeamIds.length > 0;
  const firstName = me.user.display_name.split(' ')[0];

  return (
    <>
      <h1>Hello, {firstName}</h1>
      {me.roles.includes('ADMIN') && !isManager && <p className="muted">{t('structureOnly')}</p>}
      {me.managedOrganizationIds.map((id) => (
        <KpiPanel key={id} entityType="organization" entityId={id} title="Organization KPIs" />
      ))}
      {isManager && (
        <section className="panel">
          <h2>{t('managedTeams')}</h2>
          {tree.state === 'loading' && <Loading />}
          {tree.state === 'error' && <ErrorState error={tree.error} onRetry={tree.reload} />}
          {tree.state === 'ready' && (
            <ul className="card-list">
              {tree.data
                .flatMap((o) => o.groups.flatMap((g) => g.teams.map((tm) => ({ ...tm, group: g }))))
                .filter((tm) => tm.access === 'managed')
                .map((tm) => (
                  <li key={tm.id}>
                    <Link className="tile" to={`/teams/${tm.id}`}>
                      <strong>{tm.name}</strong>
                      <span className="muted small">
                        {tm.group.name} · {tm.memberCount} {t('members').toLowerCase()}
                      </span>
                    </Link>
                  </li>
                ))}
            </ul>
          )}
        </section>
      )}
      {!me.roles.includes('ADMIN') && me.teams.length > 0 && (
        <>
          <KpiPanel entityType="developer" entityId={me.user.id} title={t('myKpis')} />
          {!isManager &&
            me.teams.map((tm) => (
              <KpiPanel
                key={tm.id}
                entityType="team"
                entityId={tm.id}
                title={`${t('teamAggregate')}: ${tm.name}`}
              />
            ))}
          <p>
            <Link to={`/developers/${me.user.id}`}>Open my profile and assessments →</Link>
          </p>
        </>
      )}
    </>
  );
}
