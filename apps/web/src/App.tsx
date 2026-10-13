import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { api, ApiError, Me, setCsrfToken } from './api';
import { Layout } from './components/Layout';
import { ErrorState, Loading } from './components/States';
import { AdminPage } from './pages/admin/Admin';
import { AuditTab } from './pages/admin/Audit';
import { DataQualityTab } from './pages/admin/DataQuality';
import { IdentitiesTab } from './pages/admin/Identities';
import { IntegrationsTab } from './pages/admin/Integrations';
import { OrganizationTab } from './pages/admin/Organization';
import { PeopleTab } from './pages/admin/People';
import { StatusesTab } from './pages/admin/Statuses';
import { CatalogPage } from './pages/Catalog';
import { DeveloperPage } from './pages/Developer';
import { GroupPage } from './pages/Group';
import { HomePage } from './pages/Home';
import { Login } from './pages/Login';
import { OrganizationDetailPage, OrganizationPage } from './pages/Organization';
import { ReviewsPage } from './pages/Reviews';
import { TeamPage } from './pages/Team';
import { SessionContext } from './session';

type Boot =
  | { state: 'loading' }
  | { state: 'signed-out'; demo: boolean; oidc: boolean }
  | { state: 'signed-in'; me: Me }
  | { state: 'error'; error: Error };

function OrgRoute() {
  const { id = '' } = useParams();
  return <OrganizationDetailPage id={id} />;
}

function NotFound() {
  return <ErrorState error={new ApiError(404, 'Not found')} />;
}

export function App() {
  const [boot, setBoot] = useState<Boot>({ state: 'loading' });

  const load = useCallback(async () => {
    try {
      const me = await api.get<Me>('/api/v1/me');
      setCsrfToken(me.csrfToken);
      setBoot({ state: 'signed-in', me });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        const cfg = await api
          .get<{ demoLogin: boolean; oidc: boolean }>('/api/v1/auth/config')
          .catch(() => ({ demoLogin: false, oidc: false }));
        setCsrfToken(null);
        setBoot({ state: 'signed-out', demo: cfg.demoLogin, oidc: cfg.oidc });
      } else {
        setBoot({ state: 'error', error: e as Error });
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const signOut = useCallback(async () => {
    const res = await api
      .post<{ logoutUrl: string | null }>('/api/v1/auth/logout')
      .catch(() => null);
    // With SSO, also end the identity-provider session; it redirects back to EPI afterwards.
    if (res?.logoutUrl) {
      window.location.assign(res.logoutUrl);
      return;
    }
    await load();
  }, [load]);

  if (boot.state === 'loading') return <Loading />;
  if (boot.state === 'error') return <ErrorState error={boot.error} onRetry={load} />;
  if (boot.state === 'signed-out')
    return <Login demo={boot.demo} oidc={boot.oidc} onSignedIn={load} />;

  return (
    <SessionContext.Provider value={{ me: boot.me, signOut }}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="organization" element={<OrganizationPage />} />
            <Route path="organizations/:id" element={<OrgRoute />} />
            <Route path="groups/:id" element={<GroupPage />} />
            <Route path="teams/:id" element={<TeamPage />} />
            <Route path="developers/:id" element={<DeveloperPage />} />
            <Route path="reviews" element={<ReviewsPage />} />
            <Route path="kpis" element={<CatalogPage />} />
            <Route path="admin" element={<AdminPage />}>
              <Route index element={<Navigate to="/admin/data-quality" replace />} />
              <Route path="organization" element={<OrganizationTab />} />
              <Route path="people" element={<PeopleTab />} />
              <Route path="integrations" element={<IntegrationsTab />} />
              <Route path="identities" element={<IdentitiesTab />} />
              <Route path="statuses" element={<StatusesTab />} />
              <Route path="data-quality" element={<DataQualityTab />} />
              <Route path="audit" element={<AuditTab />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </SessionContext.Provider>
  );
}
