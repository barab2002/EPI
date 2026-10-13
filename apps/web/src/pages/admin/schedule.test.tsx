import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setCsrfToken } from '../../api';
import { SyncScheduleCard } from './Integrations';

const base = {
  enabled: false,
  hourLocal: 2,
  timezone: 'UTC',
  lastRunDate: null,
  lastRunStartedAt: null,
  schedulerActive: true,
  nextRunAt: null,
};

afterEach(() => vi.restoreAllMocks());

describe('SyncScheduleCard', () => {
  it('saves the schedule with the CSRF header and shows the next run', async () => {
    setCsrfToken('csrf-9');
    let saved: Record<string, unknown> | null = null;
    let headers: Record<string, string> = {};
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      if (init?.method === 'PUT') {
        saved = JSON.parse(String(init.body));
        headers = init.headers as Record<string, string>;
      }
      const body = saved ? { ...base, ...saved, nextRunAt: '2026-10-14T00:00:00Z' } : base;
      return new Response(JSON.stringify(body), { status: 200 });
    });
    render(<SyncScheduleCard />);
    const enabled = await screen.findByRole('checkbox', { name: /Sync daily/ });
    expect(enabled).not.toBeChecked();
    expect(screen.getByText(/Next run: not scheduled/)).toBeInTheDocument();
    await userEvent.click(enabled);
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /^Time(?! zone)/ }),
      '03:00',
    );
    const tz = screen.getByRole('combobox', { name: /Time zone/ });
    await userEvent.clear(tz);
    await userEvent.type(tz, 'Asia/Jerusalem');
    await userEvent.click(screen.getByRole('button', { name: 'Save schedule' }));
    expect(
      await screen.findByText('Daily sync at 03:00 Asia/Jerusalem saved.'),
    ).toBeInTheDocument();
    expect(saved).toEqual({ enabled: true, hourLocal: 3, timezone: 'Asia/Jerusalem' });
    expect(headers['x-csrf-token']).toBe('csrf-9');
    expect(await screen.findByText(/Last scheduled run: never/)).toBeInTheDocument();
    expect(screen.queryByText(/Next run: not scheduled/)).not.toBeInTheDocument();
  });

  it('shows server validation errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) =>
      init?.method === 'PUT'
        ? new Response(JSON.stringify({ message: 'Unknown time zone' }), { status: 400 })
        : new Response(JSON.stringify(base), { status: 200 }),
    );
    render(<SyncScheduleCard />);
    await userEvent.click(await screen.findByRole('button', { name: 'Save schedule' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unknown time zone');
  });

  it('warns when the scheduler is switched off on the server', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ...base, enabled: true, schedulerActive: false }), {
        status: 200,
      }),
    );
    render(<SyncScheduleCard />);
    expect(await screen.findByText(/EPI_SYNC_SCHEDULER=off/)).toBeInTheDocument();
  });
});
