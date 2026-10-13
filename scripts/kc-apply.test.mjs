import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planUpdates } from './kc-apply.mjs';
import { buildRealm } from './kc-prod-realm.mjs';

const conf = {
  EPI_PUBLIC_URL: 'https://epi.corp.example',
  EPI_SSO_PUBLIC_URL: 'https://epi-sso.corp.example',
  EPI_LDAP_VENDOR: 'ad',
  EPI_LDAP_URL: 'ldaps://dc1.corp.example:636',
  EPI_LDAP_BIND_DN: 'CN=svc-epi-read,OU=Service Accounts,DC=corp,DC=example',
  EPI_LDAP_USERS_DN: 'OU=Users,DC=corp,DC=example',
  EPI_LDAP_GROUPS_DN: 'OU=Groups,DC=corp,DC=example',
  EPI_LDAP_TEAM_GROUPS:
    'CN=Team-A,OU=Groups,DC=corp,DC=example;CN=Team-B,OU=Groups,DC=corp,DC=example',
};

/** What a running Keycloak returns after importing `realm` (plus server-side fields). */
function running(realm) {
  const p = realm.components['org.keycloak.storage.UserStorageProvider'][0];
  const m = p.subComponents['org.keycloak.storage.ldap.mappers.LDAPStorageMapper'];
  return {
    provider: {
      id: 'p1',
      parentId: 'r1',
      providerType: 'x',
      name: p.name,
      providerId: p.providerId,
      config: { ...p.config, lastSync: ['0'] },
    },
    mappers: m.map((x, i) => ({ id: `m${i}`, parentId: 'p1', ...x })),
    client: { id: 'c1', ...realm.clients[0], secret: '**********' }, // secret-scan:allow (masked placeholder)
  };
}

test('nothing changes when sso.conf is unchanged', () => {
  const realm = buildRealm(conf, 'secret');
  const plan = planUpdates(realm, running(realm));
  assert.deepEqual(plan.changed, { provider: false, mapper: false, client: false });
});

test('a removed team group changes the user filter and the group mapper only', () => {
  const before = running(buildRealm(conf, 'secret'));
  const after = buildRealm(
    { ...conf, EPI_LDAP_TEAM_GROUPS: 'CN=Team-A,OU=Groups,DC=corp,DC=example' },
    'secret',
  );
  const plan = planUpdates(after, before);
  assert.deepEqual(plan.changed, { provider: true, mapper: true, client: false });
  assert.doesNotMatch(plan.provider.config.customUserSearchFilter[0], /Team-B/);
  assert.match(plan.provider.config.customUserSearchFilter[0], /Team-A/);
  assert.doesNotMatch(plan.mapper.config['groups.ldap.filter'][0], /Team-B/);
  // Server-side fields are kept; the bind password stays a vault reference.
  assert.equal(plan.provider.id, 'p1');
  assert.deepEqual(plan.provider.config.lastSync, ['0']);
  assert.match(plan.provider.config.bindCredential[0], /^\$\{vault\./);
});

test('a new public address updates the client redirect and logout addresses, never the secret', () => {
  const before = running(buildRealm(conf, 'secret'));
  const after = buildRealm({ ...conf, EPI_PUBLIC_URL: 'https://epi2.corp.example/' }, 'other');
  const plan = planUpdates(after, before);
  assert.equal(plan.changed.client, true);
  assert.deepEqual(plan.client.redirectUris, ['https://epi2.corp.example/api/v1/auth/callback']);
  assert.equal(plan.client.attributes['post.logout.redirect.uris'], 'https://epi2.corp.example/*');
  assert.equal('secret' in plan.client, false); // never sent: Keycloak keeps the secret
});

test('refuses a Keycloak without the expected provider', () => {
  const realm = buildRealm(conf, 'secret');
  assert.throws(
    () => planUpdates(realm, { ...running(realm), provider: undefined }),
    /no "directory" provider/,
  );
});
