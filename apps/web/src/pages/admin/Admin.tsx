import { NavLink, Outlet } from 'react-router-dom';
import { Breadcrumb } from '../../components/Layout';
import { Empty } from '../../components/States';
import { useSession } from '../../session';

const TABS = [
  ['organization', 'Organization'],
  ['people', 'People'],
  ['directory', 'Directory'],
  ['integrations', 'Integrations'],
  ['identities', 'Identity mapping'],
  ['statuses', 'Status mappings'],
  ['data-quality', 'Data quality'],
  ['audit', 'Audit log'],
  ['settings', 'Settings'],
] as const;

/** Administration area: configuration and data health only — never metrics or private reviews. */
export function AdminPage() {
  const { me } = useSession();
  if (!me.roles.includes('ADMIN')) {
    return (
      <Empty>
        Administration needs the Administrator role. Ask an EPI administrator to assign it.
      </Empty>
    );
  }
  return (
    <>
      <Breadcrumb items={[{ label: 'Administration' }]} />
      <h1>Administration</h1>
      <nav aria-label="Administration sections" className="tabs">
        {TABS.map(([path, label]) => (
          <NavLink key={path} to={`/admin/${path}`}>
            {label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </>
  );
}

export function formatTime(iso: string | null): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
