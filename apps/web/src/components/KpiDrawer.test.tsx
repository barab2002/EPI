import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { KpiCard, KpiExplanation } from '../api';
import { setLocale } from '../i18n';
import { KpiDrawer } from './KpiDrawer';

const card = {
  code: 'CYCLE_TIME',
  title: 'Cycle Time',
  unit: 'days',
  direction: 'lower_is_better',
  formulaVersion: '1.0.0',
  value: null,
  sampleSize: 0,
  confidence: 'none',
  window: { start: '2026-07-01T00:00:00Z', end: '2026-10-01T00:00:00Z' },
  trend: null,
  proxy: false,
  suppressed: false,
  synthetic: false,
  lastDataAt: null,
} as KpiCard;

const explanation = (title: string, description: string): KpiExplanation => ({
  code: 'CYCLE_TIME',
  version: '1.0.0',
  title,
  question: '?',
  unit: 'days',
  direction: 'lower_is_better',
  formula: 'f',
  population: 'p',
  source: 's',
  exclusions: [],
  minimumSample: 'm',
  caveats: [],
  possibleActions: [],
  implementation: 'i',
  example: { description, input: [4], result: { value: 4, sampleSize: 1, confidence: 'low' } },
});

afterEach(() => {
  vi.restoreAllMocks();
  setLocale('en');
});

describe('KpiDrawer language', () => {
  it('asks the server for the texts in the language the page shows', async () => {
    setLocale('he');
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        async () =>
          new Response(JSON.stringify(explanation('זמן מחזור', 'חציון 4 ימים')), { status: 200 }),
      );
    render(<KpiDrawer card={card} onClose={() => undefined} />);
    expect(await screen.findByText('חציון 4 ימים')).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/kpis/CYCLE_TIME/explanation?lang=he');
    expect((init?.headers as Record<string, string>)['Accept-Language']).toBe('he');
  });
});
