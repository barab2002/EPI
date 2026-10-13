import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { KpiCard } from '../api';
import { KpiCardView } from './KpiCard';

const base: KpiCard = {
  code: 'CYCLE_TIME',
  title: 'Cycle Time',
  unit: 'days',
  direction: 'lower_is_better',
  formulaVersion: '1.0.0',
  value: 4.2,
  sampleSize: 12,
  confidence: 'normal',
  window: { start: '2026-07-01T00:00:00Z', end: '2026-10-01T00:00:00Z' },
  trend: { recent: 4.2, previous: 5, changePct: -16, status: 'improved', note: 'hypothesis' },
  proxy: false,
  suppressed: false,
  synthetic: true,
  lastDataAt: '2026-09-30T10:00:00Z',
};

describe('KpiCardView', () => {
  it('shows value, sample, confidence, trend and synthetic label', () => {
    render(<KpiCardView card={base} onExplain={() => undefined} />);
    // Number and unit are separate elements (unit set smaller) but read as one phrase.
    expect(document.querySelector('.kpi-value')?.textContent).toBe('4.2 days');
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Improved')).toBeInTheDocument();
    expect(screen.getByText('Synthetic')).toBeInTheDocument();
  });

  it('renders insufficient data as N/A, never 0', () => {
    render(
      <KpiCardView
        card={{ ...base, value: null, sampleSize: 3, confidence: 'insufficient', trend: null }}
        onExplain={() => undefined}
      />,
    );
    expect(screen.getByText('N/A')).toBeInTheDocument();
    expect(screen.queryByText(/^0/)).not.toBeInTheDocument();
  });

  it('explains suppression and hides numbers', () => {
    render(
      <KpiCardView
        card={{
          ...base,
          value: null,
          sampleSize: 0,
          confidence: 'suppressed',
          suppressed: true,
          trend: null,
        }}
        onExplain={() => undefined}
      />,
    );
    expect(screen.getByText('Hidden: group too small')).toBeInTheDocument();
    expect(screen.queryByText('Sample')).not.toBeInTheDocument();
  });

  it('labels proxy measures', () => {
    render(<KpiCardView card={{ ...base, proxy: true }} onExplain={() => undefined} />);
    expect(screen.getByText('Proxy measure')).toBeInTheDocument();
  });

  it('opens the explanation from a keyboard-accessible button', async () => {
    const onExplain = vi.fn();
    render(<KpiCardView card={base} onExplain={onExplain} />);
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    expect(onExplain).toHaveBeenCalledWith(base);
  });
});
