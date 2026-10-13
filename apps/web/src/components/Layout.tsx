import { Link, NavLink, Outlet } from 'react-router-dom';
import { roleLabel } from '../format';
import { t } from '../i18n';
import { useSession } from '../session';
import { MarkIcon } from './Icons';

export interface Crumb {
  label: string;
  to?: string;
}

export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="breadcrumb">
      <ol>
        {items.map((c, i) => (
          <li key={`${c.label}-${i}`}>
            {c.to && i < items.length - 1 ? (
              <Link to={c.to}>{c.label}</Link>
            ) : (
              <span aria-current={i === items.length - 1 ? 'page' : undefined}>{c.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Page title with an optional status badge kept OUT of the heading's accessible name. */
export function PageTitle({
  children,
  badge,
}: {
  children: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <div className="page-title">
      <h1>{children}</h1>
      {badge}
    </div>
  );
}

export function Layout() {
  const { me, signOut } = useSession();
  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {me.mode === 'demo' && (
        <div className="banner" role="note">
          {t('syntheticBanner')}
        </div>
      )}
      <div className="shell">
        <aside className="sidebar">
          <Link to="/" className="brand" aria-label={`${t('appName')} — ${t('navHome')}`}>
            <span className="brand-mark">
              <MarkIcon />
            </span>
            <span>
              <span className="brand-name">{t('appName')}</span>
              <span className="brand-sub">{t('appTagline')}</span>
            </span>
          </Link>
          <nav aria-label="Main">
            <ul className="nav">
              <li>
                <NavLink to="/" end>
                  {t('navHome')}
                </NavLink>
              </li>
              <li>
                <NavLink to="/organization">{t('navOrganization')}</NavLink>
              </li>
              <li>
                <NavLink to="/reviews">{t('navReviews')}</NavLink>
              </li>
              <li>
                <NavLink to="/kpis">{t('navCatalog')}</NavLink>
              </li>
              {me.roles.includes('ADMIN') && (
                <li>
                  <NavLink to="/admin">{t('navAdmin')}</NavLink>
                </li>
              )}
            </ul>
          </nav>
          <div className="user">
            <div>
              <span className="user-name">{me.user.display_name}</span>
              <span className="user-role">{roleLabel(me.roles)}</span>
            </div>
            <button type="button" className="btn" onClick={signOut}>
              {t('signOut')}
            </button>
          </div>
        </aside>
        <main id="main" className="content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
