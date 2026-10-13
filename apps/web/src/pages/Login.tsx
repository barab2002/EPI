import { useState } from 'react';
import { api, DemoUser } from '../api';
import { MarkIcon } from '../components/Icons';
import { ErrorState, Skeleton } from '../components/States';
import { MessageKey, t } from '../i18n';
import { useApi } from '../useApi';

const ROLE_ORDER = ['ADMIN', 'ENGINEERING_MANAGER', 'GROUP_MANAGER', 'TEAM_LEAD', 'DEVELOPER'];
const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administrator',
  ENGINEERING_MANAGER: 'Engineering manager',
  GROUP_MANAGER: 'Group managers',
  TEAM_LEAD: 'Team leads',
  DEVELOPER: 'Developers',
};

/** What each demo role can see — the point of trying several people. */
const ROLE_HINT: Record<string, string> = {
  ADMIN: 'Structure, integrations and data quality. No KPIs or private reviews.',
  ENGINEERING_MANAGER: 'The whole organization and all KPIs.',
  GROUP_MANAGER: 'Their group’s teams and people.',
  TEAM_LEAD: 'Their team’s members and KPIs. Writes monthly assessments.',
  DEVELOPER: 'Their own KPIs and assessments. Their team only as a total.',
};

const LOGIN_ERRORS: Record<string, MessageKey> = {
  not_provisioned: 'loginErrorNotProvisioned',
  inactive_user: 'loginErrorInactive',
  expired_or_invalid_request: 'loginErrorExpired',
  idp_error: 'loginErrorIdp',
  oidc_unavailable: 'loginErrorUnavailable',
};

/** Reads `?login_error=` set by the OIDC callback; unknown codes get a generic message. */
export function loginErrorMessage(search: string): string | null {
  const code = new URLSearchParams(search).get('login_error');
  if (!code) return null;
  return t(LOGIN_ERRORS[code] ?? 'loginErrorIdp');
}

export function ssoLoginHref(path: string): string {
  return `/api/v1/auth/login?return_to=${encodeURIComponent(path)}`;
}

export function Login({
  demo,
  oidc,
  onSignedIn,
}: {
  demo: boolean;
  oidc: boolean;
  onSignedIn: () => void;
}) {
  const users = useApi<DemoUser[]>(demo ? '/api/v1/auth/demo-users' : null);
  const loginError = loginErrorMessage(window.location.search);
  const returnTo = window.location.pathname === '/' ? '/' : window.location.pathname;
  const [error, setError] = useState<Error | null>(null);
  const [signingIn, setSigningIn] = useState<string | null>(null);
  const busy = signingIn !== null;

  async function signIn(id: string) {
    setSigningIn(id);
    setError(null);
    try {
      await api.post('/api/v1/auth/demo-login', { userId: id });
      onSignedIn();
    } catch (e) {
      setError(e as Error);
      setSigningIn(null);
    }
  }

  const primary = (u: DemoUser) =>
    ROLE_ORDER.find((r) => u.roles.split(',').includes(r)) ?? 'DEVELOPER';

  return (
    <main className="login">
      <div className="login-card">
        <div className="login-brand">
          <span className="brand-mark">
            <MarkIcon />
          </span>
          <span>
            <span className="brand-name">{t('appName')}</span>
            <span className="brand-sub">{t('appTagline')}</span>
          </span>
        </div>
        <h1>{t('loginTitle')}</h1>
        <p className="muted login-purpose">{t('loginPurpose')}</p>
        {loginError && (
          <p role="alert" className="error-text">
            {loginError}
          </p>
        )}
        {!demo && !oidc && <p>{t('loginNoMethod')}</p>}
        {oidc && (
          <p>
            <a className="btn btn-primary btn-block" href={ssoLoginHref(returnTo)}>
              {t('loginSso')}
            </a>
          </p>
        )}
        {demo && (
          <>
            {oidc && (
              <p className="login-divider">
                <span>{t('loginOr')}</span>
              </p>
            )}
            <p className="banner inline">{t('syntheticBanner')}</p>
            <p className="muted">{t('loginDemoHint')}</p>
            {error && <ErrorState error={error} />}
            {users.state === 'loading' && <Skeleton lines={4} />}
            {users.state === 'error' && <ErrorState error={users.error} onRetry={users.reload} />}
            {users.state === 'ready' &&
              ROLE_ORDER.map((role) => {
                const list = users.data.filter((u) => primary(u) === role);
                if (!list.length) return null;
                return (
                  <section key={role} className="login-group">
                    <h2>{ROLE_LABEL[role]}</h2>
                    <p className="muted small login-hint">{ROLE_HINT[role]}</p>
                    <ul>
                      {list.map((u) => (
                        <li key={u.id}>
                          <button
                            type="button"
                            className="user-btn"
                            disabled={busy}
                            aria-busy={signingIn === u.id}
                            onClick={() => signIn(u.id)}
                          >
                            <span>{u.display_name}</span>
                            {signingIn === u.id ? (
                              <span className="muted small">{t('signingIn')}</span>
                            ) : (
                              u.team && <span className="muted small">{u.team}</span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
          </>
        )}
      </div>
    </main>
  );
}
