import { Link, useParams } from 'react-router-dom';
import { KpiPanel } from '../components/KpiPanel';
import { Breadcrumb } from '../components/Layout';
import { ErrorState, Loading } from '../components/States';
import type { Access, TeamNode } from '../api';
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
  if (g.state === 'loading') return <Loading />;
  if (g.state === 'error') return <ErrorState error={g.error} onRetry={g.reload} />;
  const d = g.data;
  return (
    <>
      <Breadcrumb
        items={[{ label: d.organization_name, to: '/organization' }, { label: d.name }]}
      />
      <h1>
        {d.name} <AccessBadge access={d.access} />
      </h1>
      {d.access === 'structure' ? (
        <p className="muted">{t('structureOnly')}</p>
      ) : (
        <KpiPanel entityType="group" entityId={d.id} />
      )}
      <section className="panel">
        <h2>{t('teams')}</h2>
        <ul className="list">
          {d.teams.map((tm) => (
            <li key={tm.id}>
              <Link to={`/teams/${tm.id}`}>{tm.name}</Link> <AccessBadge access={tm.access} />
              {tm.memberCount !== null && <span className="muted small"> · {tm.memberCount}</span>}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
