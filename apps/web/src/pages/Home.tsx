import { Link } from 'react-router-dom';
import type { OrgNode } from '../api';
import { KpiPanel } from '../components/KpiPanel';
import { PageTitle } from '../components/Layout';
import { ErrorState, Skeleton } from '../components/States';
import { TeamOverview } from '../components/TeamOverview';
import { formatMonth, roleLabel } from '../format';
import { t } from '../i18n';
import { useSession } from '../session';
import { useApi } from '../useApi';

interface DueList {
  cycle: { periodStart: string; periodEnd: string } | null;
  people: {
    userId: string;
    displayName: string;
    teamName: string | null;
    status: 'draft' | 'not_started';
  }[];
}

/** Monthly assessments the manager still has to write: the one action the home page leads with. */
function AssessmentsDue() {
  const due = useApi<DueList>('/api/v1/reviews/due');
  return (
    <section className="panel" aria-labelledby="due-title">
      <div className="panel-head">
        <h2 id="due-title">
          {t('assessmentsDue')}
          {due.state === 'ready' && due.data.cycle && (
            <span className="muted"> for {formatMonth(due.data.cycle.periodStart)}</span>
          )}
        </h2>
        {due.state === 'ready' && due.data.people.length > 0 && (
          <span className="badge">{due.data.people.length} to write</span>
        )}
      </div>
      {due.state === 'loading' && <Skeleton lines={3} />}
      {due.state === 'error' && <ErrorState error={due.error} onRetry={due.reload} />}
      {due.state === 'ready' && !due.data.cycle && <p className="muted">{t('noOpenCycle')}</p>}
      {due.state === 'ready' && due.data.cycle && due.data.people.length === 0 && (
        <p className="muted">{t('allAssessmentsDone')}</p>
      )}
      {due.state === 'ready' && due.data.people.length > 0 && (
        <ul className="due-list">
          {due.data.people.map((p) => (
            <li key={p.userId}>
              <Link to={`/developers/${p.userId}`}>{p.displayName}</Link>
              <span className="muted small">{p.teamName}</span>
              <span className={`badge ${p.status === 'draft' ? 'badge-warn' : ''}`}>
                {p.status === 'draft' ? t('draft') : t('notStarted')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Context-aware landing page: managers start from what they must do, developers from themselves. */
export function HomePage() {
  const { me } = useSession();
  const tree = useApi<OrgNode[]>('/api/v1/organization/tree');
  const isManager = me.managedTeamIds.length > 0;
  const isAdmin = me.roles.includes('ADMIN');
  const firstName = me.user.display_name.split(' ')[0];
  const teamNames = me.teams.map((tm) => tm.name).join(', ');
  const managedTeams =
    tree.state === 'ready'
      ? tree.data
          .flatMap((o) => o.groups.flatMap((g) => g.teams))
          .filter((tm) => tm.access === 'managed')
      : [];

  return (
    <>
      <PageTitle>Hello, {firstName}</PageTitle>
      <p className="lead page-lead">
        {roleLabel(me.roles)}
        {teamNames && !isAdmin ? ` in ${teamNames}` : ''}
      </p>

      {me.canReview && <AssessmentsDue />}

      {isManager && (
        <section className="panel" aria-labelledby="managed-title">
          <h2 id="managed-title">{t('managedTeams')}</h2>
          {tree.state === 'loading' && <Skeleton lines={3} />}
          {tree.state === 'error' && <ErrorState error={tree.error} onRetry={tree.reload} />}
          {tree.state === 'ready' && <TeamOverview teams={managedTeams} />}
        </section>
      )}

      {me.managedOrganizationIds.map((id) => (
        <KpiPanel key={id} entityType="organization" entityId={id} title={t('orgKpis')} />
      ))}

      {isAdmin && !isManager && (
        <section className="panel">
          <h2>{t('navAdmin')}</h2>
          <p className="muted">{t('structureOnly')}</p>
          <p>
            <Link to="/admin/data-quality">{t('openDataQuality')}</Link>
          </p>
        </section>
      )}

      {!isAdmin && me.teams.length > 0 && (
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
            <Link to={`/developers/${me.user.id}`}>{t('openMyProfile')}</Link>
          </p>
        </>
      )}
    </>
  );
}
