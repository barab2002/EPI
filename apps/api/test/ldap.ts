import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DirectoryConfig } from '../src/config';

/** Synthetic LDAPS directory started by scripts/test-ldap.sh (see scripts/dev/ldap-fixture.sh). */
export const ldapUrl = () => process.env.EPI_TEST_LDAP_URL;

export function requireLdapOrSkip(): boolean {
  if (ldapUrl()) return true;
  if (process.env.EPI_REQUIRE_LDAP) throw new Error('EPI_REQUIRE_LDAP set but no test directory');
  return false;
}

export function ldapPasswords(): Record<string, string> {
  const text = readFileSync(join(process.env.EPI_TEST_LDAP_FIXTURE!, 'passwords.env'), 'utf8');
  return Object.fromEntries(
    text
      .trim()
      .split('\n')
      .map((l) => l.split('=') as [string, string]),
  );
}

export const TEAM_PAYMENTS = 'cn=Team-Payments,ou=Groups,dc=corp,dc=example';
export const TEAM_PLATFORM = 'cn=Team-Platform,ou=Groups,dc=corp,dc=example';

export function directoryConfig(overrides: Partial<DirectoryConfig> = {}): DirectoryConfig {
  return {
    url: ldapUrl()!,
    bindDn: 'cn=svc-epi-read,dc=corp,dc=example',
    bindPassword: ldapPasswords().LDAP_PW_SVC,
    caPem: readFileSync(process.env.EPI_TEST_LDAP_CA_FILE!, 'utf8'),
    usersDn: 'ou=Users,dc=corp,dc=example',
    vendor: 'other',
    teamGroups: [TEAM_PAYMENTS, TEAM_PLATFORM],
    ...overrides,
  };
}
