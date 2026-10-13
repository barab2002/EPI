import { normalizeConnection, parseSourceHosts } from './connection-input';

const base = {
  kind: 'jira' as const,
  name: 'jira-main',
  url: 'https://jira.corp.example/',
  projects: ['pay', ' web '],
};
const opts = { allowHttp: false, allowedHosts: null };

describe('normalizeConnection', () => {
  it('normalizes a Jira connection', () => {
    expect(normalizeConnection(base, opts)).toEqual({
      kind: 'jira',
      name: 'jira-main',
      endpoint: 'https://jira.corp.example',
      projects: ['PAY', 'WEB'],
      secretRef: 'EPI_JIRA_TOKEN',
    });
  });

  it('keeps a context path and a port, drops trailing slashes', () => {
    expect(
      normalizeConnection({ ...base, url: 'https://tools.corp.example:8443/jira//' }, opts)
        .endpoint,
    ).toBe('https://tools.corp.example:8443/jira');
  });

  it('takes numeric GitLab project IDs and a custom secret name', () => {
    expect(
      normalizeConnection(
        {
          kind: 'gitlab',
          name: 'gl',
          url: 'https://gitlab.corp.example',
          projects: ['12', '40'],
          secretRef: 'EPI_GITLAB_TOKEN_2',
        },
        opts,
      ),
    ).toMatchObject({ projects: ['12', '40'], secretRef: 'EPI_GITLAB_TOKEN_2' });
  });

  it.each([
    [{ url: 'http://jira.corp.example' }, /https/],
    [{ url: 'https://user:pw@jira.corp.example' }, /user name or password/],
    [{ url: 'https://jira.corp.example/?x=1' }, /query/],
    [{ url: 'ftp://jira.corp.example' }, /https/],
    [{ url: 'not a url' }, /valid address/],
    [{ name: 'Bad Name' }, /Name/],
    [{ projects: [] }, /at least one project/],
    [{ projects: ['P!'] }, /project key/],
    [{ secretRef: 'lower_case' }, /secret/],
  ])('refuses %j', (patch, msg) => {
    expect(() => normalizeConnection({ ...base, ...patch }, opts)).toThrow(msg);
  });

  it('refuses non-numeric GitLab project IDs', () => {
    expect(() =>
      normalizeConnection(
        { kind: 'gitlab', name: 'gl', url: 'https://g.example', projects: ['web'] },
        opts,
      ),
    ).toThrow(/numeric/);
  });

  it('allows http only when the server allows it (demo/test servers)', () => {
    expect(
      normalizeConnection({ ...base, url: 'http://127.0.0.1:9000' }, { ...opts, allowHttp: true })
        .endpoint,
    ).toBe('http://127.0.0.1:9000');
  });

  it('enforces the server allow-list of source hosts when set', () => {
    const allowed = parseSourceHosts('jira.corp.example, gitlab.corp.example:8443');
    expect(normalizeConnection(base, { ...opts, allowedHosts: allowed }).endpoint).toBe(
      'https://jira.corp.example',
    );
    expect(() =>
      normalizeConnection(
        { ...base, url: 'https://evil.example' },
        { ...opts, allowedHosts: allowed },
      ),
    ).toThrow(/EPI_SOURCE_HOSTS/);
    expect(() =>
      normalizeConnection(
        { ...base, url: 'https://gitlab.corp.example' },
        { ...opts, allowedHosts: allowed },
      ),
    ).toThrow(/EPI_SOURCE_HOSTS/); // the allowed entry names port 8443
  });
});

describe('parseSourceHosts', () => {
  it('is null when unset and lower-cases entries', () => {
    expect(parseSourceHosts(undefined)).toBeNull();
    expect(parseSourceHosts('')).toBeNull();
    expect(parseSourceHosts('Jira.Corp.Example')).toEqual(['jira.corp.example']);
  });
  it('refuses entries with a scheme or path', () => {
    expect(() => parseSourceHosts('https://jira.corp.example')).toThrow(/EPI_SOURCE_HOSTS/);
  });
});
