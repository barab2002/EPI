import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setCsrfToken } from '../../api';
import type { AdminSettings } from '../../api';
import { SettingsTab } from './Settings';

const settings = (): AdminSettings => ({
  connections: [
    {
      id: 'c-1',
      kind: 'jira',
      name: 'jira-main',
      url: 'https://jira.corp.example',
      enabled: true,
      projects: ['PAY'],
      secretRef: 'EPI_JIRA_TOKEN',
      tokenPresent: true,
    },
    {
      id: 'c-2',
      kind: 'gitlab',
      name: 'gitlab-main',
      url: 'https://gitlab.corp.example',
      enabled: true,
      projects: ['12'],
      secretRef: 'EPI_GITLAB_TOKEN',
      tokenPresent: false,
    },
  ],
  rules: { httpAllowed: false, allowedHosts: ['jira.corp.example', 'gitlab.corp.example'] },
  server: {
    mode: 'production',
    publicUrl: 'https://epi.corp.example',
    signIn: { issuer: 'https://epi-sso.corp.example/realms/epi' },
    directory: {
      url: 'ldaps://dc1.corp.example:636',
      usersDn: 'OU=Users,DC=corp',
      teamGroups: ['CN=Team-Payments,OU=Groups,DC=corp'],
    },
    minimumGroupSize: 3,
    retentionMonths: 24,
  },
});

function mock(routes: Record<string, (init?: RequestInit) => unknown>) {
  const calls: { url: string; method: string; body: unknown }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    calls.push({
      url,
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const key = Object.keys(routes)
      .filter((k) => url.startsWith(k))
      .sort((a, b) => b.length - a.length)[0];
    if (!key) return new Response(JSON.stringify({ message: 'no mock' }), { status: 404 });
    return new Response(JSON.stringify(routes[key](init)), { status: 200 });
  });
  return calls;
}

afterEach(() => vi.restoreAllMocks());

describe('SettingsTab', () => {
  it('shows connections with token status and the read-only server settings', async () => {
    mock({ '/api/v1/admin/settings': settings });
    render(<SettingsTab />);
    expect(await screen.findByText('Token found on the server')).toBeInTheDocument();
    expect(screen.getByText(/Token missing\. On the server, run/)).toBeInTheDocument();
    expect(screen.getByText('./epi.sh source-token EPI_GITLAB_TOKEN')).toBeInTheDocument();
    expect(screen.getByText(/Allowed hosts on this server: jira.corp.example/)).toBeInTheDocument();
    expect(screen.getByText('https://epi-sso.corp.example/realms/epi')).toBeInTheDocument();
    expect(screen.getByText('Team groups: Team-Payments')).toBeInTheDocument();
    expect(screen.getByText(/^3 people\./)).toBeInTheDocument();
    // Sign-in settings are not editable in the browser.
    expect(screen.queryByDisplayValue('https://epi.corp.example')).not.toBeInTheDocument();
  });

  it('saves an edited address and projects, and tests a connection', async () => {
    setCsrfToken('csrf-s');
    const calls = mock({
      '/api/v1/admin/settings/connections/c-1/test': () => ({
        ok: true,
        summary: 'Jira 9.12: token accepted.',
      }),
      '/api/v1/admin/settings/connections/c-1': () => ({ id: 'c-1' }),
      '/api/v1/admin/settings': settings,
    });
    render(<SettingsTab />);
    const url = await screen.findByDisplayValue('https://jira.corp.example');
    await userEvent.clear(url);
    await userEvent.type(url, 'https://jira.corp.example/jira');
    const projects = screen.getByDisplayValue('PAY');
    await userEvent.clear(projects);
    await userEvent.type(projects, 'PAY, web');
    await userEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]);
    expect(await screen.findByText(/jira-main saved/)).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'PUT')!.body).toEqual({
      url: 'https://jira.corp.example/jira',
      projects: ['PAY', 'web'],
      secretRef: 'EPI_JIRA_TOKEN',
      enabled: true,
    });
    await userEvent.click(screen.getAllByRole('button', { name: 'Test connection' })[0]);
    expect(await screen.findByText('Jira 9.12: token accepted.')).toBeInTheDocument();
  });

  it('adds a GitLab connection', async () => {
    setCsrfToken('csrf-s');
    const calls = mock({
      '/api/v1/admin/settings/connections': () => ({ id: 'c-3' }),
      '/api/v1/admin/settings': () => ({ ...settings(), connections: [] }),
    });
    render(<SettingsTab />);
    expect(await screen.findByText(/No Jira or GitLab connection yet/)).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Source'), 'gitlab');
    await userEvent.type(screen.getByLabelText('Name'), 'gitlab-main');
    await userEvent.type(screen.getByLabelText('Address'), 'https://gitlab.corp.example');
    await userEvent.type(screen.getByLabelText('Project IDs'), '12 40');
    await userEvent.click(screen.getByRole('button', { name: 'Add connection' }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
        kind: 'gitlab',
        name: 'gitlab-main',
        url: 'https://gitlab.corp.example',
        projects: ['12', '40'],
      }),
    );
    expect(await screen.findByText(/gitlab-main added/)).toBeInTheDocument();
  });
});
