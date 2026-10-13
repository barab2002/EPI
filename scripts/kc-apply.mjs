// Applies a regenerated realm file (scripts/kc-prod-realm.mjs) to a RUNNING Keycloak, because
// Keycloak imports a realm only on its first start (`./epi.sh sso-apply`). Updates exactly what
// .epi/sso.conf controls: the "directory" LDAP provider (address, bind DN, users DN, team-group
// search filter, vendor attributes), its "team groups" mapper, and the epi-web client's redirect
// and logout addresses. Users, sessions and the client secret are left alone.
// Usage: node kc-apply.mjs <epi-realm.json> <keycloak base URL>   (admin password on stdin)
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const STORAGE = 'org.keycloak.storage.UserStorageProvider';
const MAPPER = 'org.keycloak.storage.ldap.mappers.LDAPStorageMapper';

/**
 * Pure: the PUT bodies that bring the running realm in line with the file. `current` holds what
 * Keycloak returned for the provider, its mappers and the client.
 */
const withoutSecret = ({ secret: _secret, ...rest }) => rest; // eslint-disable-line no-unused-vars

export function planUpdates(realm, current) {
  const want = realm.components[STORAGE].find((c) => c.name === 'directory');
  if (!want) throw new Error('realm file has no "directory" provider');
  const wantMapper = want.subComponents[MAPPER].find((m) => m.name === 'team groups');
  const client = realm.clients.find((c) => c.clientId === 'epi-web');
  if (!current.provider) throw new Error('Keycloak has no "directory" provider in realm epi');
  const mapper = current.mappers.find((m) => m.name === 'team groups');
  if (!mapper) throw new Error('Keycloak has no "team groups" mapper');
  if (!current.client) throw new Error('Keycloak has no epi-web client');
  // The bind password stays a vault reference; never replace it with a value.
  const providerConfig = { ...current.provider.config, ...want.config };
  return {
    provider: { ...current.provider, config: providerConfig },
    mapper: { ...mapper, config: { ...mapper.config, ...wantMapper.config } },
    // No `secret`: Keycloak keeps the client secret when the field is absent.
    client: {
      ...withoutSecret(current.client),
      redirectUris: client.redirectUris,
      attributes: { ...current.client.attributes, ...client.attributes },
    },
    changed: {
      provider: JSON.stringify(current.provider.config) !== JSON.stringify(providerConfig),
      mapper:
        JSON.stringify(mapper.config) !==
        JSON.stringify({ ...mapper.config, ...wantMapper.config }),
      client:
        JSON.stringify(current.client.redirectUris) !== JSON.stringify(client.redirectUris) ||
        current.client.attributes?.['post.logout.redirect.uris'] !==
          client.attributes['post.logout.redirect.uris'],
    },
  };
}

async function main() {
  const [realmPath, base] = process.argv.slice(2);
  if (!realmPath || !base) {
    console.error(
      'usage: node kc-apply.mjs <epi-realm.json> <keycloak URL>  (admin password on stdin)',
    );
    process.exit(64);
  }
  const password = readFileSync(0, 'utf8').trim();
  if (!password) throw new Error('no admin password on stdin');
  const realm = JSON.parse(readFileSync(realmPath, 'utf8'));
  const tokenRes = await fetch(`${base}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: 'admin',
      password,
    }),
  });
  if (!tokenRes.ok) throw new Error(`Keycloak admin sign-in failed (HTTP ${tokenRes.status})`);
  const { access_token: token } = await tokenRes.json();
  const api = async (method, path, body) => {
    const r = await fetch(`${base}/admin/realms/epi${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`Keycloak ${method} ${path}: HTTP ${r.status}`);
    return r.status === 204 ? null : r.json();
  };
  const [provider] = await api('GET', `/components?type=${STORAGE}&name=directory`);
  const mappers = provider
    ? await api('GET', `/components?parent=${provider.id}&type=${MAPPER}`)
    : [];
  const [client] = await api('GET', '/clients?clientId=epi-web');
  const plan = planUpdates(realm, { provider, mappers, client });
  if (plan.changed.provider) await api('PUT', `/components/${provider.id}`, plan.provider);
  if (plan.changed.mapper) await api('PUT', `/components/${plan.mapper.id}`, plan.mapper);
  if (plan.changed.client) await api('PUT', `/clients/${client.id}`, plan.client);
  const what = Object.entries(plan.changed)
    .filter(([, v]) => v)
    .map(([k]) => k);
  console.log(what.length ? `sign-in updated: ${what.join(', ')}` : 'sign-in already up to date');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
