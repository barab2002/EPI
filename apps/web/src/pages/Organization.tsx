import { Link } from 'react-router-dom';
import type { Access, OrgNode } from '../api';
import { KpiPanel } from '../components/KpiPanel';
import { Breadcrumb } from '../components/Layout';
import { Empty, ErrorState, Loading } from '../components/States';
import { t } from '../i18n';
import { useApi } from '../useApi';

export function AccessBadge({ access }: { access: Access | null }) {
  if (!access) return null;
  const label = {
    managed: t('accessManaged'),
    aggregate: t('accessAggregate'),
    structure: t('accessStructure'),
  }[access];
  return <span className={`badge badge-${access}`}>{label}</span>;
}

export function OrganizationPage() {
  const tree = useApi<OrgNode[]>('/api/v1/organization/tree');
  return (
    <>
      <Breadcrumb items={[{ label: t('navOrganization') }]} />
      <h1>{t('navOrganization')}</h1>
      {tree.state === 'loading' && <Loading />}
      {tree.state === 'error' && <ErrorState error={tree.error} onRetry={tree.reload} />}
      {tree.state === 'ready' && tree.data.length === 0 && <Empty>{t('emptyOrg')}</Empty>}
      {tree.state === 'ready' &&
        tree.data.map((org) => (
          <section key={org.id} className="panel">
            <h2>
              {org.access === 'managed' ? (
                <Link to={`/organizations/${org.id}`}>{org.name}</Link>
              ) : (
                org.name
              )}{' '}
              <AccessBadge access={org.access} />
            </h2>
            <ul className="tree">
              {org.groups.map((g) => (
                <li key={g.id}>
                  <div className="tree-row">
                    {g.access ? (
                      <Link to={`/groups/${g.id}`}>{g.name}</Link>
                    ) : (
                      <span>{g.name}</span>
                    )}
                    <AccessBadge access={g.access} />
                  </div>
                  <ul>
                    {g.teams.map((tm) => (
                      <li key={tm.id} className="tree-row">
                        <Link to={`/teams/${tm.id}`}>{tm.name}</Link>
                        <AccessBadge access={tm.access} />
                        {tm.memberCount !== null && (
                          <span className="muted small">
                            {tm.memberCount} {t('members').toLowerCase()}
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
      <h1>{org?.name ?? t('navOrganization')}</h1>
      {/* KpiPanel loads independently and enforces access server-side. */}
      <KpiPanel entityType="organization" entityId={id} />
    </>
  );
}
