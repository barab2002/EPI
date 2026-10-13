import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { setCsrfToken } from '../../api';
import { DataQualityTab, pctLabel } from './DataQuality';
import { IdentitiesTab } from './Identities';
import { StatusesTab } from './Statuses';

type Handler = (init?: RequestInit) => unknown;
function mockFetch(routes: Record<string, Handler>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    // Most specific (longest) matching route wins.
    const key = Object.keys(routes)
      .filter((k) => url.startsWith(k))
      .sort((a, b) => b.length - a.length)[0];
    if (!key)
      return new Response(JSON.stringify({ message: `no mock for ${url}` }), { status: 404 });
    return new Response(JSON.stringify(routes[key](init)), { status: 200 });
  });
}

afterEach(() => vi.restoreAllMocks());

describe('IdentitiesTab', () => {
  const account = {
    source: 'jira',
    external_id: 'JIRAUSER1',
    display_name: 'Dana from Jira',
    is_bot: false,
    last_seen_at: '2026-10-12T10:00:00Z',
    user_id: null,
    user_name: null,
    activity: 4,
  };

  it('lists unmapped accounts and maps one to a person via the picker', async () => {
    setCsrfToken('csrf-1');
    const calls: { url: string; init?: RequestInit }[] = [];
    const f = mockFetch({
      '/api/v1/admin/accounts': () => [account],
      '/api/v1/admin/users': () => [
        { id: 'u1', display_name: 'Dana Person', email: null, identities: null },
        {
          id: 'u2',
          display_name: 'Dan Other',
          email: null,
          identities: [{ source: 'jira', external_id: 'X' }],
        },
      ],
      '/api/v1/admin/accounts/jira/JIRAUSER1/mapping': (init) => {
        calls.push({ url: 'map', init });
        return { reattributed: 4 };
      },
    });
    render(<IdentitiesTab />);
    expect(await screen.findByText('Dana from Jira')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('searchbox'), 'dan');
    const option = await screen.findByRole('button', { name: 'Dana Person' });
    // A person already mapped to another Jira account cannot be picked.
    expect(screen.getByRole('button', { name: 'Dan Other' })).toBeDisabled();
    await userEvent.click(option);
    expect(
      await screen.findByText(/Mapped Dana from Jira to Dana Person \(4 records attributed\)/),
    ).toBeInTheDocument();
    expect(calls[0].init?.method).toBe('PUT');
    expect((calls[0].init?.headers as Record<string, string>)['x-csrf-token']).toBe('csrf-1');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ userId: 'u1' });
    expect(f).toHaveBeenCalled();
  });

  it('explains an empty list', async () => {
    mockFetch({ '/api/v1/admin/accounts': () => [] });
    render(<IdentitiesTab />);
    expect(await screen.findByText(/Every account seen in syncs is mapped/)).toBeInTheDocument();
  });
});

describe('DataQualityTab', () => {
  it('shows freshness, coverage (N/A when no data) and unmapped statuses', async () => {
    mockFetch({
      '/api/v1/admin/data-quality': () => ({
        generatedAt: '2026-10-12T10:00:00Z',
        staleAfterHours: 26,
        connections: [
          {
            name: 'jira-main',
            kind: 'jira',
            enabled: true,
            lastSuccessAt: null,
            stale: true,
            lastRun: { status: 'failed', error_summary: 'HTTP 401' },
          },
        ],
        jira: {
          workItems: 10,
          withAssignee: 10,
          mappedAssignees: 5,
          assigneeCoveragePct: 50,
          unmappedAccounts: 2,
          statusesWithoutCategory: [{ connection: 'jira-main', status: 'Parked' }],
        },
        gitlab: {
          mergeRequests: 0,
          mappedAuthors: 0,
          authorCoveragePct: null,
          linkedToJira: 0,
          jiraLinkPct: null,
          unmappedAccounts: 0,
        },
      }),
      '/api/v1/admin/retention': () => ({
        months: 24,
        automatic: true,
        cutoff: '2024-10-13T12:00:00Z',
        due: { workItems: 0, auditEvents: 3 },
        categories: [],
        lastRun: {
          at: '2026-10-13T03:00:00Z',
          cutoff: '2024-10-13T03:00:00Z',
          counts: { auditEvents: 1 },
        },
      }),
    });
    render(
      <MemoryRouter>
        <DataQualityTab />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Stale: last sync over 26 h ago')).toBeInTheDocument();
    expect(screen.getByText('Last run failed: HTTP 401')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getAllByText('N/A')).toHaveLength(2);
    expect(screen.getByText('Parked')).toBeInTheDocument();
    expect(
      await screen.findByText(
        /older than 24 months \(before 13 Oct 2024\) are deleted automatically once a day/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Due now: 3 records')).toBeInTheDocument();
    expect(screen.getByText(/Last run: .*, 1 record deleted/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Map the remaining accounts/ })).toHaveAttribute(
      'href',
      '/admin/identities',
    );
  });

  it('never renders missing percentages as 0', () => {
    expect(pctLabel(null)).toBe('N/A');
    expect(pctLabel(0)).toBe('0%');
  });
});

describe('StatusesTab', () => {
  it('saves a category change for a status', async () => {
    const puts: RequestInit[] = [];
    mockFetch({
      '/api/v1/admin/status-mappings/jira-main/10010': (init) => {
        puts.push(init!);
        return {};
      },
      '/api/v1/admin/status-mappings': () => [
        {
          connection: 'jira-main',
          source_status_id: '10010',
          source_status_name: 'In Review',
          category: 'IN_PROGRESS',
          origin: 'inferred',
        },
      ],
    });
    render(<StatusesTab />);
    const select = await screen.findByLabelText('Category for In Review');
    expect(screen.getByText('Inferred — please confirm')).toBeInTheDocument();
    await userEvent.selectOptions(select, 'REVIEW');
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(JSON.parse(String(puts[0].body))).toEqual({ category: 'REVIEW' });
    expect(await screen.findByText(/“In Review” saved/)).toBeInTheDocument();
  });
});
