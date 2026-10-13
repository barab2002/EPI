import { render, screen } from '@testing-library/react';
import { setLocale } from '../../i18n';
import { adminCatalogs, ta, taf } from './i18n-admin';
import { SettingsTab } from './Settings';

afterEach(() => {
  setLocale('en');
  vi.restoreAllMocks();
});

describe('administration catalog', () => {
  it('has Hebrew text for every key with the same {placeholders}', () => {
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const [k, en] of Object.entries(adminCatalogs.en)) {
      const he = adminCatalogs.he[k as keyof typeof adminCatalogs.he];
      expect(he.trim(), k).not.toBe('');
      // Hebrew singular forms say "one" in words ("רשומה אחת") instead of "{n}".
      const expected = k.endsWith('One') ? vars(en).filter((v) => v !== '{n}') : vars(en);
      expect(
        vars(he).filter((v) => !(k.endsWith('One') && v === '{n}')),
        k,
      ).toEqual(expected);
    }
  });

  it('follows the current language', () => {
    expect(ta('tabSettings')).toBe('Settings');
    setLocale('he');
    expect(ta('tabSettings')).toBe('הגדרות');
    expect(taf('connSaved', { name: 'jira-main' })).toBe(
      'jira-main נשמר. הסנכרון הבא ישתמש בהגדרות החדשות.',
    );
  });

  it('renders an administration tab in Hebrew', async () => {
    setLocale('he');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          connections: [],
          rules: { httpAllowed: false, allowedHosts: null },
          server: {
            mode: 'production',
            publicUrl: 'https://epi.corp.example',
            signIn: null,
            directory: null,
            minimumGroupSize: 3,
            retentionMonths: 24,
          },
        }),
        { status: 200 },
      ),
    );
    render(<SettingsTab />);
    expect(await screen.findByRole('heading', { name: 'Jira ו-GitLab' })).toBeInTheDocument();
    expect(
      screen.getByText('3 אנשים. מי שרואה רק סיכומי צוות לא יקבל מספרים לקבוצות קטנות יותר.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'הוספת חיבור' })).toBeInTheDocument();
  });
});
