import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { setCsrfToken } from './api';
import { LanguageSwitch } from './components/LanguageSwitch';
import { formatDate, formatValue, roleLabel } from './format';
import { browserLocale, getLocale, kpiTitle, Locale, setLocale, t, tf } from './i18n';
import { applyLocale, LocaleContext } from './locale';

afterEach(() => {
  setLocale('en');
  vi.restoreAllMocks();
});

describe('catalogs', () => {
  it('Hebrew has every key, no empty text, and the same {placeholders} as English', () => {
    const keys = [
      'hello',
      'roleIn',
      'forMonth',
      'toWrite',
      'outOf5',
      'teamFrom',
      'teamTo',
      'submitNoteNamed',
      'assessmentDoneVisible',
      'exampleInput',
    ] as const;
    for (const k of keys) {
      setLocale('en');
      const a = (t(k).match(/\{\w+\}/g) ?? []).sort();
      setLocale('he');
      const b = (t(k).match(/\{\w+\}/g) ?? []).sort();
      expect(b).toEqual(a);
    }
  });

  it('interpolates and formats in Hebrew', () => {
    setLocale('he');
    expect(tf('hello', { name: 'Dana' })).toBe('שלום, Dana');
    expect(formatValue(4.2, 'days')).toBe('4.2 ימים');
    expect(formatValue(1, 'hours')).toBe('1 שעה');
    expect(roleLabel(['TEAM_LEAD'])).toBe('ראש צוות');
    expect(kpiTitle('CYCLE_TIME', 'Cycle Time')).toBe('זמן מחזור');
    expect(kpiTitle('UNKNOWN', 'Fallback')).toBe('Fallback');
    expect(formatDate('2026-10-12T10:00:00Z')).toMatch(/2026/);
    expect(formatDate('2026-10-12T10:00:00Z')).not.toMatch(/Oct/);
  });

  it('follows the browser language when nothing is saved', () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['he-IL', 'en']);
    expect(browserLocale()).toBe('he');
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
    expect(browserLocale()).toBe('en');
  });
});

function Harness({ onChange }: { onChange: (l: Locale) => void }) {
  const [locale, set] = useState<Locale>('en');
  return (
    <LocaleContext.Provider
      value={{
        locale,
        change: (l) => {
          applyLocale(l);
          set(l);
          onChange(l);
        },
      }}
    >
      <LanguageSwitch />
      <p>{t('signOut')}</p>
    </LocaleContext.Provider>
  );
}

describe('LanguageSwitch', () => {
  it('switches to Hebrew: right-to-left page, Hebrew text, choice remembered', async () => {
    setCsrfToken('c');
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'עברית' }));
    expect(onChange).toHaveBeenCalledWith('he');
    expect(getLocale()).toBe('he');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('he');
    await waitFor(() => expect(screen.getByText('התנתקות')).toBeInTheDocument());
    expect(window.localStorage.getItem('epi.locale')).toBe('he');
    await userEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(document.documentElement.dir).toBe('ltr');
  });
});
