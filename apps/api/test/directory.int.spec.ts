import { DirectoryClient } from '../src/directory/directory.client';
import { directoryConfig, requireLdapOrSkip, TEAM_PAYMENTS, TEAM_PLATFORM } from './ldap';

/** Read-only directory reader against the synthetic LDAPS directory (scripts/test-ldap.sh). */
jest.setTimeout(60_000);
const run = requireLdapOrSkip() ? describe : describe.skip;

run('DirectoryClient (integration, synthetic LDAPS directory)', () => {
  it('reads only the team groups and only their members', async () => {
    const groups = await new DirectoryClient(directoryConfig()).readTeamGroups();
    expect(groups.map((g) => [g.dn, g.name])).toEqual([
      [TEAM_PAYMENTS, 'Team-Payments'],
      [TEAM_PLATFORM, 'Team-Platform'],
    ]);
    expect(groups[0].members.map((m) => [m.username, m.email, m.displayName])).toEqual([
      ['eli', 'eli.engineer@example.invalid', 'Eli Engineer'],
      ['taylor', 'taylor.lead@example.invalid', 'Taylor Lead'],
    ]);
    expect(groups[1].members.map((m) => m.username)).toEqual(['gal']);
    for (const m of groups.flatMap((g) => g.members))
      expect(m.externalId).toMatch(/^[0-9a-f-]{36}$/);
    // The outsider (only in a non-team group) is never read.
    expect(JSON.stringify(groups)).not.toContain('outsider');
  });

  it('reports a configured group that does not exist', async () => {
    const missing = 'cn=Team-Gone,ou=Groups,dc=corp,dc=example';
    const groups = await new DirectoryClient(
      directoryConfig({ teamGroups: [missing] }),
    ).readTeamGroups();
    expect(groups).toEqual([{ dn: missing, name: null, members: [] }]);
  });

  it('fails on a wrong bind password', async () => {
    await expect(
      new DirectoryClient(directoryConfig({ bindPassword: 'wrong' })).readTeamGroups(),
    ).rejects.toThrow('the directory refused the read-only bind account (invalid credentials)');
  });

  it('refuses a server certificate not issued by the configured CA', async () => {
    await expect(
      new DirectoryClient(directoryConfig({ caPem: null })).readTeamGroups(),
    ).rejects.toThrow(/^TLS: the directory's certificate is not trusted/);
  });
});
