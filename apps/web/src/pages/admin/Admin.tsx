import { NavLink, Outlet } from 'react-router-dom';
import { Breadcrumb } from '../../components/Layout';
import { Empty } from '../../components/States';
import { intlLocale } from '../../i18n';
import { useSession } from '../../session';
import { AdminKey, ta } from './i18n-admin';

const TABS: [string, AdminKey][] = [
  ['organization', 'tabOrganization'],
  ['people', 'tabPeople'],
  ['directory', 'tabDirectory'],
  ['integrations', 'tabIntegrations'],
  ['identities', 'tabIdentities'],
  ['statuses', 'tabStatuses'],
  ['data-quality', 'tabDataQuality'],
  ['audit', 'tabAudit'],
  ['settings', 'tabSettings'],
];

/** Administration area: configuration and data health only — never metrics or private reviews. */
export function AdminPage() {
  const { me } = useSession();
  if (!me.roles.includes('ADMIN')) {
    return <Empty>{ta('needsAdmin')}</Empty>;
  }
  return (
    <>
      <Breadcrumb items={[{ label: ta('administration') }]} />
      <h1>{ta('administration')}</h1>
      <nav aria-label={ta('adminSections')} className="tabs">
        {TABS.map(([path, label]) => (
          <NavLink key={path} to={`/admin/${path}`}>
            {ta(label)}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </>
  );
}

export function formatTime(iso: string | null): string {
  if (!iso) return ta('never');
  return new Date(iso).toLocaleString(intlLocale(), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
