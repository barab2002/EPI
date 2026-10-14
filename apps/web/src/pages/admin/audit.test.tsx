import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuditTab } from './Audit';

const event = (n: number, extra: object = {}) => ({
  id: `e${n}`,
  at: `2026-10-13T0${n % 10}:00:00.000000Z`,
  action: 'role.assign',
  actor: { id: 'a1', name: 'Avery Admin' },
  resourceType: 'user',
  resourceId: 'u1',
  resourceLabel: 'Dana Dev',
  metadata: { role: 'TEAM_LEAD' },
  ...extra,
});

afterEach(() => vi.restoreAllMocks());

function mock(handler: (url: string) => unknown) {
  const urls: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    urls.push(url);
    return new Response(JSON.stringify(handler(url)), { status: 200 });
  });
  return urls;
}

describe('AuditTab', () => {
  it('lists events, filters by action group and loads older pages', async () => {
    const urls = mock((url) => {
      if (url.startsWith('/api/v1/admin/audit-actions')) return ['auth.login', 'role.assign'];
      if (url.includes('cursor=c1')) return { items: [event(2)], nextCursor: null };
      return { items: [event(1)], nextCursor: 'c1' };
    });
    render(<AuditTab />, { wrapper: MemoryRouter });
    expect(await screen.findByText('Dana Dev')).toBeInTheDocument();
    expect(screen.getByText('role: TEAM_LEAD')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Load older events' }));
    expect(await screen.findAllByText('role.assign')).toHaveLength(2); // one code per row
    expect(screen.getAllByText('Role assigned')).toHaveLength(2); // plain-language action name
    expect(screen.queryByRole('button', { name: 'Load older events' })).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByRole('combobox', { name: /Action/ }), 'Role changes');
    await screen.findByText('Dana Dev');
    expect(urls.some((u) => u.includes('action=role.') && !u.includes('cursor'))).toBe(true);
  });

  it('shows system events and an empty state', async () => {
    mock((url) =>
      url.startsWith('/api/v1/admin/audit-actions')
        ? []
        : url.includes('from=')
          ? { items: [], nextCursor: null }
          : {
              items: [
                event(3, {
                  actor: null,
                  action: 'sync.scheduled',
                  resourceLabel: null,
                  resourceType: 'app_setting',
                  metadata: {},
                }),
              ],
              nextCursor: null,
            },
    );
    render(<AuditTab />, { wrapper: MemoryRouter });
    expect(await screen.findByText('system')).toBeInTheDocument();
    expect(screen.getByText('setting')).toBeInTheDocument(); // app_setting, in plain words
    const from = screen.getByLabelText('From');
    await userEvent.type(from, '2026-10-01');
    expect(await screen.findByText(/No audit events match/)).toBeInTheDocument();
  });
});
