import { useState } from 'react';
import { api, DemoUser } from '../api';
import { ErrorState, Loading } from '../components/States';
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
  const [busy, setBusy] = useState(false);

  async function signIn(id: string) {
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/v1/auth/demo-login', { userId: id });
      onSignedIn();
    } catch (e) {
      setError(e as Error);
      setBusy(false);
    }
  }

  const primary = (u: DemoUser) =>
    ROLE_ORDER.find((r) => u.roles.split(',').includes(r)) ?? 'DEVELOPER';

  return (
    <main className="login">
      <div className="login-card">
        <h1>{t('loginTitle')}</h1>
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
            {oidc && <p className="muted small">{t('loginOr')}</p>}
            <p className="banner inline">{t('syntheticBanner')}</p>
            <p className="muted">{t('loginDemoHint')}</p>
            {error && <ErrorState error={error} />}
            {users.state === 'loading' && <Loading />}
            {users.state === 'error' && <ErrorState error={users.error} onRetry={users.reload} />}
            {users.state === 'ready' &&
              ROLE_ORDER.map((role) => {
                const list = users.data.filter((u) => primary(u) === role);
                if (!list.length) return null;
                return (
                  <section key={role} className="login-group">
                    <h2>{ROLE_LABEL[role]}</h2>
                    <ul>
                      {list.map((u) => (
                        <li key={u.id}>
                          <button
                            type="button"
                            className="user-btn"
                            disabled={busy}
                            onClick={() => signIn(u.id)}
                          >
                            <span>{u.display_name}</span>
                            {u.team && <span className="muted small">{u.team}</span>}
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
