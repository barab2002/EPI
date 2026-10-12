import { useState } from 'react';
import { api, DemoUser } from '../api';
import { ErrorState, Loading } from '../components/States';
import { t } from '../i18n';
import { useApi } from '../useApi';

const ROLE_ORDER = ['ADMIN', 'ENGINEERING_MANAGER', 'GROUP_MANAGER', 'TEAM_LEAD', 'DEVELOPER'];
const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administrator',
  ENGINEERING_MANAGER: 'Engineering manager',
  GROUP_MANAGER: 'Group managers',
  TEAM_LEAD: 'Team leads',
  DEVELOPER: 'Developers',
};

export function Login({ demo, onSignedIn }: { demo: boolean; onSignedIn: () => void }) {
  const users = useApi<DemoUser[]>(demo ? '/api/v1/auth/demo-users' : null);
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
        {!demo && <p>{t('loginNoMethod')}</p>}
        {demo && (
          <>
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
