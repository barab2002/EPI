import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRealm, escapeFilter, parseConf } from './kc-prod-realm.mjs';

const base = {
  EPI_PUBLIC_URL: 'https://epi.corp.example',
  EPI_LDAP_URL: 'ldaps://dc1.corp.example:636',
  EPI_LDAP_USERS_DN: 'OU=Users,DC=corp,DC=example',
  EPI_LDAP_BIND_DN: 'CN=svc-epi,OU=Service,DC=corp,DC=example',
  EPI_LDAP_GROUPS_DN: 'OU=Groups,DC=corp,DC=example',
  EPI_LDAP_TEAM_GROUPS:
    'CN=Team-Payments,OU=Groups,DC=corp,DC=example; CN=Team (Core),OU=Groups,DC=corp,DC=example',
};
const ldap = (realm) => realm.components['org.keycloak.storage.UserStorageProvider'][0];

test('parses KEY=VALUE with comments and quotes', () => {
  assert.deepEqual(parseConf('# c\nA=1\n\nB="x y"\nC=\'z\'\n'), { A: '1', B: 'x y', C: 'z' });
  assert.throws(() => parseConf('not a line'), /cannot parse/);
});

test('escapes LDAP filter values (RFC 4515)', () => {
  assert.equal(escapeFilter('a*(b)\\c'), 'a\\2a\\28b\\29\\5cc');
});

test('AD realm: read-only federation, vault bind password, nested team groups, no secrets', () => {
  const r = buildRealm(base, 'client-secret-value');
  const c = ldap(r).config;
  assert.equal(r.realm, 'epi');
  assert.equal(r.sslRequired, 'all');
  assert.equal(r.resetPasswordAllowed, false);
  assert.equal(r.registrationAllowed, false);
  assert.deepEqual(c.editMode, ['READ_ONLY']);
  assert.deepEqual(c.vendor, ['ad']);
  assert.deepEqual(c.bindCredential, ['${vault.ldapbind}']);
  assert.deepEqual(c.useTruststoreSpi, ['always']);
  assert.deepEqual(c.usernameLDAPAttribute, ['sAMAccountName']);
  assert.equal(
    c.customUserSearchFilter[0],
    '(&(|(memberOf:1.2.840.113556.1.4.1941:=CN=Team-Payments,OU=Groups,DC=corp,DC=example)' +
      '(memberOf:1.2.840.113556.1.4.1941:=CN=Team \\28Core\\29,OU=Groups,DC=corp,DC=example))' +
      '(!(userAccountControl:1.2.840.113556.1.4.803:=2)))',
  );
  const groups = ldap(r).subComponents['org.keycloak.storage.ldap.mappers.LDAPStorageMapper'].find(
    (m) => m.providerId === 'group-ldap-mapper',
  );
  assert.deepEqual(groups.config['groups.ldap.filter'], [
    '(|(cn=Team-Payments)(cn=Team \\28Core\\29))',
  ]);
  assert.deepEqual(groups.config.mode, ['READ_ONLY']);
  const client = r.clients[0];
  assert.deepEqual(client.redirectUris, ['https://epi.corp.example/api/v1/auth/callback']);
  assert.equal(client.attributes['pkce.code.challenge.method'], 'S256');
  assert.equal(client.directAccessGrantsEnabled, false);
  assert.equal(r.users, undefined);
});

test('generic LDAP dialect (OpenLDAP)', () => {
  const r = buildRealm({ ...base, EPI_LDAP_VENDOR: 'other' }, 's');
  const c = ldap(r).config;
  assert.deepEqual(c.usernameLDAPAttribute, ['uid']);
  assert.match(c.customUserSearchFilter[0], /^\(&\(\|\(memberOf=CN=Team-Payments/);
});

test('refuses unsafe or incomplete configuration', () => {
  assert.throws(() => buildRealm({ ...base, EPI_LDAP_URL: 'ldap://dc1:389' }, 's'), /ldaps/);
  assert.throws(() => buildRealm({ ...base, EPI_PUBLIC_URL: 'http://epi' }, 's'), /https/);
  assert.throws(() => buildRealm({ ...base, EPI_LDAP_TEAM_GROUPS: ' ; ' }, 's'), /empty/);
  assert.throws(() => buildRealm({ ...base, EPI_LDAP_VENDOR: 'novell' }, 's'), /VENDOR/);
  const { EPI_LDAP_BIND_DN: _, ...noBind } = base;
  assert.throws(() => buildRealm(noBind, 's'), /missing EPI_LDAP_BIND_DN/);
  assert.equal(
    ldap(buildRealm({ ...base, EPI_LDAP_URL: 'ldap://x', EPI_LDAP_ALLOW_PLAIN: 'true' }, 's'))
      .config.connectionUrl[0],
    'ldap://x',
  );
});
