import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { translateMessage } from './messages-he';

const SRC = join(__dirname, '..');
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return files(p);
    return p.endsWith('.ts') && !p.endsWith('.spec.ts') ? [p] : [];
  });
const hebrew = /[֐-׿]/;

/** Fixed (non-template) messages people can see: HTTP exceptions, form rules, import reasons. */
function fixedMessages(): string[] {
  const out = new Set<string>();
  const patterns = [
    /new (?:BadRequest|NotFound|Forbidden|Conflict|Unauthorized|UnprocessableEntity)Exception\(\s*'([^']+)'/g,
    /\bfail\('([^']+)'\)/g,
    /conflict\(p, '([^']+)'\)/g,
  ];
  for (const f of files(SRC)) {
    const text = readFileSync(f, 'utf8');
    for (const re of patterns) for (const m of text.matchAll(re)) out.add(m[1]);
  }
  // LDAP result texts of the directory reader.
  const ldap = readFileSync(join(SRC, 'directory/directory.client.ts'), 'utf8');
  const block = /const LDAP_CODES[^{]*\{([\s\S]*?)\};/.exec(ldap)![1];
  for (const m of block.matchAll(/\d+: '([^']+)'/g)) out.add(m[1]);
  return [...out];
}

describe('Hebrew server messages', () => {
  it('translate every fixed message people can see', () => {
    const found = fixedMessages();
    expect(found.length).toBeGreaterThan(50);
    const missing = found.filter((m) => !hebrew.test(translateMessage(m, 'he')));
    expect(missing).toEqual([]);
  });

  it('translate messages with names and numbers, keeping those parts', () => {
    const cases: [string, string[]][] = [
      ['Team not found', []],
      ['Membership not found', []],
      ['A connection named "jira-main" already exists', ['"jira-main"']],
      ['End the 3 current membership(s) before deactivating the team', ['3']],
      ['TEAM_LEAD can only be assigned on: TEAM', ['TEAM_LEAD', 'TEAM']],
      [
        "evil.example is not in this server's allowed source hosts (EPI_SOURCE_HOSTS)",
        ['evil.example'],
      ],
      ['"pay" is not a Jira project key (e.g. PAY)', ['"pay"']],
      ['Group cn=Team-A,ou=Groups was not found in the directory.', ['cn=Team-A,ou=Groups']],
      ['Group cn=B is not mapped to a team; its 4 member(s) are not imported.', ['cn=B', '4']],
      ['In groups of 2 teams (Payments, Mobile); add them to one team only.', ['Payments, Mobile']],
      ['Several EPI people have the e-mail a@corp.example.', ['a@corp.example']],
      [
        'The EPI person with a@corp.example is linked to another directory account.',
        ['a@corp.example'],
      ],
      ['cannot reach the directory (ECONNREFUSED 10.0.0.1:636)', ['ECONNREFUSED 10.0.0.1:636']],
      [
        'Jira 9.12.0: token accepted, 14 statuses visible, 812 issues in the backfill window.',
        ['9.12.0', '812'],
      ],
      ['GitLab 18.2.1-ee: token accepted, 2 project(s) readable.', ['18.2.1-ee']],
      [
        'Secret EPI_JIRA_TOKEN is not provided (on the server: ./epi.sh source-token EPI_JIRA_TOKEN)',
        ['./epi.sh source-token EPI_JIRA_TOKEN'],
      ],
      [
        'https://jira.corp.example/rest/api/2/serverInfo: network error (timeout)',
        ['https://jira.corp.example/rest/api/2/serverInfo'],
      ],
      ['A sync for "jira-main" is already running', ['"jira-main"']],
      ['name should not be empty', ['name']],
      ['locale must be one of the following values: en, he', ['locale', 'en, he']],
      ['property foo should not exist', ['foo']],
    ];
    for (const [en, kept] of cases) {
      const he = translateMessage(en, 'he');
      expect([en, hebrew.test(he)]).toEqual([en, true]);
      for (const k of kept) expect([en, he.includes(k)]).toEqual([en, true]);
    }
  });

  it('leaves English and unknown messages unchanged', () => {
    expect(translateMessage('Team not found', 'en')).toBe('Team not found');
    expect(translateMessage('Something new', 'he')).toBe('Something new');
  });
});
