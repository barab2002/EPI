import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Me } from '../../api';
import { SessionContext } from '../../session';
import { OrganizationTab } from './Organization';
import { PeopleTab } from './People';

type Handler = (init?: RequestInit) => unknown;
function mockFetch(routes: Record<string, Handler>) {
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
    if (!key)
      return new Response(JSON.stringify({ message: `no mock for ${url}` }), { status: 404 });
    return new Response(JSON.stringify(routes[key](init)), { status: 200 });
  });
  return calls;
}

const me = {
  user: { id: 'admin-1', display_name: 'Avery Admin', is_synthetic: true },
  roles: ['DEVELOPER', 'ADMIN'],
} as Me;
const tree = [
  {
    id: 'org-1',
    name: 'Org',
    access: null,
    groups: [
      {
        id: 'g-1',
        name: 'Platform',
        access: 'structure',
        teams: [{ id: 't-1', name: 'Payments', access: 'structure', memberCount: 1 }],
      },
      { id: 'g-2', name: 'Product', access: 'structure', teams: [] },
    ],
  },
];

afterEach(() => vi.restoreAllMocks());

describe('OrganizationTab', () => {
  it('shows team members and adds a person with a transfer from a date', async () => {
    const calls = mockFetch({
      '/api/v1/organization/tree': () => tree,
      '/api/v1/admin/teams/t-1/memberships': () => [
        {
          id: 'm-1',
          user_id: 'u-1',
          display_name: 'Dana Dev',
          active: true,
          effective_from: '2026-01-01T00:00:00Z',
          effective_to: null,
        },
      ],
      '/api/v1/admin/users': () => [
        { id: 'u-2', display_name: 'Eli Engineer', email: null, identities: null },
      ],
      '/api/v1/admin/memberships': () => ({ id: 'm-2' }),
    });
    render(<OrganizationTab />);
    await userEvent.click(await screen.findByRole('button', { name: 'Payments' }));
    expect(await screen.findByText('Dana Dev')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Find a person to add…' }), 'eli');
    await userEvent.click(await screen.findByRole('button', { name: 'Eli Engineer' }));
    const date = screen.getByLabelText(/from/);
    await userEvent.clear(date);
    await userEvent.type(date, '2026-09-01');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(calls.some((c) => c.method === 'POST' && c.url === '/api/v1/admin/memberships')).toBe(
        true,
      ),
    );
    const post = calls.find((c) => c.method === 'POST' && c.url === '/api/v1/admin/memberships')!;
    expect(post.body).toEqual({
      userId: 'u-2',
      teamId: 't-1',
      effectiveFrom: '2026-09-01T00:00:00.000Z',
      transfer: true,
    });
    expect(await screen.findByText('Eli Engineer added to Payments.')).toBeInTheDocument();
  });

  it('creates a team inside a group', async () => {
    const calls = mockFetch({
      '/api/v1/organization/tree': () => tree,
      '/api/v1/admin/teams': () => ({ id: 't-9' }),
    });
    render(<OrganizationTab />);
    await screen.findByText('Platform');
    await userEvent.click(screen.getAllByText('Rename / add team')[0]);
    await userEvent.type(screen.getByRole('textbox', { name: 'New team in Platform' }), 'Edge');
    const form = screen.getByRole('textbox', { name: 'New team in Platform' }).closest('form')!;
    await userEvent.click(form.querySelector('button')!);
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
        groupId: 'g-1',
        name: 'Edge',
      }),
    );
  });
});

describe('PeopleTab', () => {
  const person = (id: string, name: string) => ({
    id,
    display_name: name,
    email: null,
    active: true,
    memberships: [],
    roles: [],
    grades: [],
  });

  function renderPeople() {
    return render(
      <SessionContext.Provider value={{ me, signOut: () => undefined }}>
        <PeopleTab />
      </SessionContext.Provider>,
    );
  }

  it('assigns a team-lead role on a chosen team', async () => {
    const calls = mockFetch({
      '/api/v1/admin/users': () => [
        { id: 'u-2', display_name: 'Eli Engineer', email: null, identities: null },
      ],
      '/api/v1/admin/people/u-2': () => person('u-2', 'Eli Engineer'),
      '/api/v1/organization/tree': () => tree,
      '/api/v1/admin/grades': () => [{ code: 'MID', label: 'Mid' }],
      '/api/v1/admin/role-assignments': () => ({ id: 'r-1' }),
    });
    renderPeople();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Find a person…' }), 'eli');
    await userEvent.click(await screen.findByRole('button', { name: 'Eli Engineer' }));
    await screen.findByRole('heading', { name: /Eli Engineer/ });
    await userEvent.selectOptions(await screen.findByLabelText(/^Scope/), 't-1');
    await userEvent.click(screen.getByRole('button', { name: 'Assign role' }));
    await waitFor(() =>
      expect(
        calls.find((c) => c.method === 'POST' && c.url === '/api/v1/admin/role-assignments')?.body,
      ).toEqual({
        userId: 'u-2',
        role: 'TEAM_LEAD',
        scopeType: 'TEAM',
        scopeId: 't-1',
      }),
    );
  });

  it('never offers role changes or deactivation for yourself', async () => {
    mockFetch({
      '/api/v1/admin/users': () => [
        { id: 'admin-1', display_name: 'Avery Admin', email: null, identities: null },
      ],
      '/api/v1/admin/people/admin-1': () => person('admin-1', 'Avery Admin'),
      '/api/v1/organization/tree': () => tree,
      '/api/v1/admin/grades': () => [],
    });
    renderPeople();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Find a person…' }), 'avery');
    await userEvent.click(await screen.findByRole('button', { name: 'Avery Admin' }));
    expect(await screen.findByText(/You cannot change your own roles/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Assign role' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Deactivate' })).not.toBeInTheDocument();
  });
});
