import { Link, useParams } from 'react-router-dom';
import type { Access } from '../api';
import { KpiPanel } from '../components/KpiPanel';
import { Breadcrumb, PageTitle } from '../components/Layout';
import { ErrorState, Skeleton } from '../components/States';
import { useKpiWindow, withWindow } from '../components/useKpiWindow';
import { t } from '../i18n';
import { useSession } from '../session';
import { useApi } from '../useApi';
import { AccessBadge } from './Organization';

interface TeamDetail {
  id: string;
  name: string;
  group_id: string;
  group_name: string;
  organization_name: string;
  access: Access;
  members: { id: string; display_name: string; grade: string | null; is_lead: boolean }[] | null;
}

export function TeamPage() {
  const { id } = useParams();
  const { me } = useSession();
  const [window] = useKpiWindow();
  const team = useApi<TeamDetail>(`/api/v1/teams/${id}`);
  if (team.state === 'loading') return <Skeleton title lines={5} />;
  if (team.state === 'error') return <ErrorState error={team.error} onRetry={team.reload} />;
  const d = team.data;
  const canOpenGroup = me.managedGroupIds.includes(d.group_id) || me.roles.includes('ADMIN');
  return (
    <>
      <Breadcrumb
        items={[
          { label: t('navOrganization'), to: '/organization' },
          {
            label: d.group_name,
            to: canOpenGroup ? withWindow(`/groups/${d.group_id}`, window) : undefined,
          },
          { label: d.name },
        ]}
      />
      <PageTitle badge={<AccessBadge access={d.access} />}>{d.name}</PageTitle>
      {d.access === 'structure' ? (
        <p className="muted">{t('structureOnly')}</p>
      ) : (
        <KpiPanel
          entityType="team"
          entityId={d.id}
          title={d.access === 'aggregate' ? t('teamAggregate') : t('kpis')}
        />
      )}
      {d.members && (
        <section className="panel">
          <h2>{t('members')}</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">{t('grade')}</th>
                </tr>
              </thead>
              <tbody>
                {d.members.map((m) => (
                  <tr key={m.id}>
                    <td>
                      {d.access === 'managed' ? (
                        <Link to={withWindow(`/developers/${m.id}`, window)}>{m.display_name}</Link>
                      ) : (
                        m.display_name
                      )}
                      {m.is_lead && (
                        <>
                          {' '}
                          <span className="badge">{t('lead')}</span>
                        </>
                      )}
                    </td>
                    <td>{m.grade ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
