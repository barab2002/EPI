// Test-only: creates a throwaway realm, confidential client and one user in the ephemeral
// Keycloak from scripts/test-keycloak.sh. Prints JSON {issuer, clientSecret, userId, username,
// password} to stdout. All secrets are random per run.
import { randomBytes } from 'node:crypto';

const kc = process.env.EPI_TEST_KEYCLOAK_URL;
const publicUrl = process.argv[2];
if (!kc || !publicUrl) {
  console.error('usage: EPI_TEST_KEYCLOAK_URL=... node kc-provision-test-realm.mjs <publicUrl>');
  process.exit(64);
}
const rnd = (n = 18) => randomBytes(n).toString('base64url');
const tokenRes = await fetch(`${kc}/realms/master/protocol/openid-connect/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'password',
    client_id: 'admin-cli',
    username: process.env.EPI_TEST_KEYCLOAK_ADMIN_USER,
    password: process.env.EPI_TEST_KEYCLOAK_ADMIN_PASSWORD,
  }),
});
if (!tokenRes.ok) throw new Error(`admin login failed ${tokenRes.status}`);
const { access_token } = await tokenRes.json();
async function admin(path, body) {
  const r = await fetch(`${kc}/admin${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r;
}
const realm = `epi-e2e-${randomBytes(3).toString('hex')}`;
const clientSecret = rnd(24);
await admin('/realms', { realm, enabled: true });
await admin(`/realms/${realm}/clients`, {
  clientId: 'epi-web',
  protocol: 'openid-connect',
  publicClient: false,
  secret: clientSecret,
  standardFlowEnabled: true,
  directAccessGrantsEnabled: false,
  redirectUris: [`${publicUrl}/api/v1/auth/callback`],
  attributes: {
    'pkce.code.challenge.method': 'S256',
    'post.logout.redirect.uris': `${publicUrl}/*`,
  },
});
const username = 'taylor';
const password = rnd();
const u = await admin(`/realms/${realm}/users`, {
  username,
  email: 'kc-taylor@example.invalid',
  emailVerified: true,
  enabled: true,
  firstName: 'Taylor',
  lastName: 'Lead',
  credentials: [{ type: 'password', value: password, temporary: false }],
});
const userId = u.headers.get('location').split('/').pop();
process.stdout.write(
  JSON.stringify({ issuer: `${kc}/realms/${realm}`, clientSecret, userId, username, password }),
);
