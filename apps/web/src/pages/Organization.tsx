import { Link } from 'react-router-dom';
import type { Access, OrgNode } from '../api';
import { KpiPanel } from '../components/KpiPanel';
import { Breadcrumb, PageTitle } from '../components/Layout';
import { Empty, ErrorState, Skeleton } from '../components/States';
import { useKpiWindow, withWindow } from '../components/useKpiWindow';
import { t } from '../i18n';
import { useApi } from '../useApi';

/** Shows access only when it is an exception: "Managed" is the normal case and stays quiet. */
export function AccessBadge({ access }: { access: Access | null }) {
  if (!access || access === 'managed') return null;
  const label = {
    managed: t('accessManaged'),
    aggregate: t('accessAggregate'),
    structure: t('accessStructure'),
  }[access];
  return <span className={`badge badge-${access}`}>{label}</span>;
}

export function OrganizationPage() {
  const tree = useApi<OrgNode[]>('/api/v1/organization/tree');
  const [window] = useKpiWindow();
  return (
    <>
      <Breadcrumb items={[{ label: t('navOrganization') }]} />
      <h1>{t('navOrganization')}</h1>
      {tree.state === 'loading' && <Skeleton lines={6} />}
      {tree.state === 'error' && <ErrorState error={tree.error} onRetry={tree.reload} />}
      {tree.state === 'ready' && tree.data.length === 0 && <Empty>{t('emptyOrg')}</Empty>}
      {tree.state === 'ready' &&
        tree.data.map((org) => (
          <section key={org.id} className="panel">
            <h2>
              {org.access === 'managed' ? (
                <Link to={withWindow(`/organizations/${org.id}`, window)}>{org.name}</Link>
              ) : (
                org.name
              )}{' '}
              <AccessBadge access={org.access} />
            </h2>
            <ul className="tree">
              {org.groups.map((g) => (
                <li key={g.id} className="tree-group">
                  <div className="tree-row tree-group-row">
                    {g.access ? (
                      <Link to={withWindow(`/groups/${g.id}`, window)}>{g.name}</Link>
                    ) : (
                      <span>{g.name}</span>
                    )}
                    <AccessBadge access={g.access} />
                    <span className="tree-meta">
                      {g.teams.length} {t(g.teams.length === 1 ? 'teamOne' : 'teamMany')}
                    </span>
                  </div>
                  <ul>
                    {g.teams.map((tm) => (
                      <li key={tm.id} className="tree-row">
                        <Link to={withWindow(`/teams/${tm.id}`, window)}>{tm.name}</Link>
                        <AccessBadge access={tm.access} />
                        {tm.memberCount !== null && (
                          <span className="tree-meta">
                            {tm.memberCount} {t(tm.memberCount === 1 ? 'memberOne' : 'memberMany')}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </>
  );
}

export function OrganizationDetailPage({ id }: { id: string }) {
  const tree = useApi<OrgNode[]>('/api/v1/organization/tree');
  const org = tree.state === 'ready' ? tree.data.find((o) => o.id === id) : undefined;
  return (
    <>
      <Breadcrumb
        items={[{ label: t('navOrganization'), to: '/organization' }, { label: org?.name ?? '…' }]}
      />
      <PageTitle>{org?.name ?? t('navOrganization')}</PageTitle>
      {/* KpiPanel loads independently and enforces access server-side. */}
      <KpiPanel entityType="organization" entityId={id} />
    </>
  );
}
