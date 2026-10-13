import { useParams } from 'react-router-dom';
import type { Access, TeamNode } from '../api';
import { KpiPanel } from '../components/KpiPanel';
import { Breadcrumb, PageTitle } from '../components/Layout';
import { ErrorState, Skeleton } from '../components/States';
import { TeamOverview } from '../components/TeamOverview';
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

export function GroupPage() {
  const { id } = useParams();
  const g = useApi<GroupDetail>(`/api/v1/groups/${id}`);
  if (g.state === 'loading') return <Skeleton title lines={5} />;
  if (g.state === 'error') return <ErrorState error={g.error} onRetry={g.reload} />;
  const d = g.data;
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
        <TeamOverview teams={d.teams} />
      </section>
    </>
  );
}
