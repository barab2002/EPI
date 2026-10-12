import { Link, NavLink, Outlet } from 'react-router-dom';
import { t } from '../i18n';
import { useSession } from '../session';

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
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              E
            </span>
            <span>
              <strong>{t('appName')}</strong>
              <span className="brand-sub">{t('appTagline')}</span>
            </span>
          </div>
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
            </ul>
          </nav>
          <div className="user">
            <div>
              <strong>{me.user.display_name}</strong>
              <div className="muted small">
                {me.roles.filter((r) => r !== 'DEVELOPER').join(', ') || 'DEVELOPER'}
              </div>
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
