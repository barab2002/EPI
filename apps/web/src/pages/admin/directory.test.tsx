import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setCsrfToken } from '../../api';
import type { DirectoryPreview, ImportPlan } from '../../api';
import { DirectoryTab, groupLabel, planSummary } from './Directory';

const PAY = 'cn=Team-Payments,ou=Groups,dc=corp,dc=example';
const tree = [
  {
    id: 'o-1',
    name: 'Org',
    groups: [{ id: 'g-1', name: 'Platform', teams: [{ id: 't-pay', name: 'Payments' }] }],
  },
];
const empty: ImportPlan = {
  creates: [],
  links: [],
  updates: [],
  adds: [],
  ends: [],
  conflicts: [],
  warnings: [],
  total: 0,
};

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

describe('planSummary / groupLabel', () => {
  it('describes the plan in one sentence', () => {
    expect(planSummary(empty)).toBe('EPI already matches the directory. Nothing to change.');
    const p = {
      ...empty,
      creates: [{ externalId: 'x', displayName: 'A', email: null, teamId: 't' }],
      ends: [
        { membershipId: 'm1', userId: 'u1', displayName: 'B', teamId: 't' },
        { membershipId: 'm2', userId: 'u2', displayName: 'C', teamId: 't' },
      ],
      total: 3,
    };
    expect(planSummary(p)).toBe('Applying will add 1 new person and remove 2 people from a team.');
    expect(groupLabel(PAY)).toBe('Team-Payments');
  });
});

describe('DirectoryTab', () => {
  it('explains how to set it up when the server has no directory settings', async () => {
    mock({
      '/api/v1/admin/directory': () => ({ configured: false, groups: [] }),
      '/api/v1/organization/tree': () => tree,
    });
    render(<DirectoryTab />);
    expect(await screen.findByText(/not set up on this server/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Preview import' })).not.toBeInTheDocument();
  });

  it('maps a group, previews the plan and applies exactly the previewed hash', async () => {
    setCsrfToken('csrf-d');
    let mapped: string | null = null;
    const preview: DirectoryPreview = {
      readAt: '2026-10-13T10:00:00Z',
      hash: 'f'.repeat(64),
      groups: [{ dn: PAY, name: 'Team-Payments', memberCount: 2 }],
      teamNames: { 't-pay': 'Payments' },
      plan: {
        ...empty,
        links: [{ userId: 'u-eli', externalId: 'g-eli', displayName: 'Eli Engineer' }],
        ends: [{ membershipId: 'm-1', userId: 'u-dana', displayName: 'Dana Dev', teamId: 't-pay' }],
        conflicts: [
          { externalId: 'g-x', displayName: 'Two Teams', reason: 'In groups of 2 teams.' },
        ],
        total: 2,
      },
    };
    const calls = mock({
      '/api/v1/admin/directory/mappings': (init) => {
        mapped = JSON.parse(String(init!.body)).teamId;
        return { groupDn: PAY, teamId: mapped };
      },
      '/api/v1/admin/directory/preview': () => preview,
      '/api/v1/admin/directory/apply': () => ({ linked: 1, ended: 1 }),
      '/api/v1/admin/directory': () => ({
        configured: true,
        groups: [{ dn: PAY, teamId: mapped, teamName: mapped ? 'Payments' : null }],
        lastImport: null,
      }),
      '/api/v1/organization/tree': () => tree,
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<DirectoryTab />);
    const preview_btn = await screen.findByRole('button', { name: 'Preview import' });
    expect(preview_btn).toBeDisabled(); // nothing mapped yet

    await userEvent.selectOptions(
      await screen.findByLabelText('EPI team for Team-Payments'),
      't-pay',
    );
    expect(
      await screen.findByText('Team-Payments now feeds Payments (Platform).'),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Preview import' })).toBeEnabled(),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Preview import' }));
    expect(
      await screen.findByText(
        'Applying will link 1 existing person by e-mail and remove 1 person from a team.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('In groups of 2 teams.')).toBeInTheDocument();
    expect(screen.getByText('Dana Dev')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Apply 2 changes' }));
    expect(confirm.mock.calls[0][0]).toMatch(/1 membership will end today; history is kept/);
    expect(await screen.findByText(/Import applied/)).toBeInTheDocument();
    const apply = calls.find((c) => c.url === '/api/v1/admin/directory/apply')!;
    expect(apply.body).toEqual({ hash: 'f'.repeat(64) });
    // The preview is gone after applying: a new import needs a new preview.
    expect(screen.queryByRole('button', { name: /^Apply/ })).not.toBeInTheDocument();
  });

  it('does nothing when the administrator cancels the confirmation', async () => {
    setCsrfToken('csrf-d');
    const calls = mock({
      '/api/v1/admin/directory/preview': () => ({
        readAt: '2026-10-13T10:00:00Z',
        hash: 'e'.repeat(64),
        groups: [],
        teamNames: {},
        plan: {
          ...empty,
          ends: [{ membershipId: 'm', userId: 'u', displayName: 'Dana Dev', teamId: 't-pay' }],
          total: 1,
        },
      }),
      '/api/v1/admin/directory': () => ({
        configured: true,
        groups: [{ dn: PAY, teamId: 't-pay', teamName: 'Payments' }],
        lastImport: null,
      }),
      '/api/v1/organization/tree': () => tree,
    });
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<DirectoryTab />);
    await userEvent.click(await screen.findByRole('button', { name: 'Preview import' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Apply 1 change' }));
    expect(calls.some((c) => c.url.endsWith('/apply'))).toBe(false);
  });
});
