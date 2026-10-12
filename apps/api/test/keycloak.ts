import { randomBytes } from 'node:crypto';

/**
 * Test-only helpers: provision a throwaway Keycloak realm through the admin REST API and drive
 * the browser side of the Authorization Code flow with plain fetch (manual redirects + cookies).
 * All credentials are generated per run; nothing is stored in fixtures.
 */

export const keycloakUrl = () => process.env.EPI_TEST_KEYCLOAK_URL;
export const randomSecret = (n = 18) => randomBytes(n).toString('base64url');

async function adminToken(): Promise<string> {
  const res = await fetch(`${keycloakUrl()}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: process.env.EPI_TEST_KEYCLOAK_ADMIN_USER ?? '',
      password: process.env.EPI_TEST_KEYCLOAK_ADMIN_PASSWORD ?? '',
    }),
  });
  if (!res.ok) throw new Error(`keycloak admin login failed: ${res.status}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

async function admin(path: string, body: unknown, method = 'POST'): Promise<Response> {
  const res = await fetch(`${keycloakUrl()}/admin${path}`, {
    method,
    headers: { Authorization: `Bearer ${await adminToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok)
    throw new Error(`keycloak admin ${method} ${path} failed: ${res.status} ${await res.text()}`);
  return res;
}

export interface TestRealm {
  realm: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
  createUser(u: { username: string; email: string; emailVerified: boolean }): Promise<{
    id: string;
    username: string;
    password: string;
  }>;
}

export async function createTestRealm(publicUrl: string): Promise<TestRealm> {
  const realm = `epi-test-${randomBytes(4).toString('hex')}`;
  const clientId = 'epi-web';
  const clientSecret = randomSecret(24);
  await admin('/realms', { realm, enabled: true });
  await admin(`/realms/${realm}/clients`, {
    clientId,
    protocol: 'openid-connect',
    enabled: true,
    publicClient: false,
    secret: clientSecret,
    standardFlowEnabled: true,
    directAccessGrantsEnabled: false,
    implicitFlowEnabled: false,
    redirectUris: [`${publicUrl}/api/v1/auth/callback`],
    webOrigins: [],
    attributes: {
      'pkce.code.challenge.method': 'S256',
      'post.logout.redirect.uris': `${publicUrl}/*`,
    },
  });
  return {
    realm,
    issuer: `${keycloakUrl()}/realms/${realm}`,
    clientId,
    clientSecret,
    async createUser({ username, email, emailVerified }) {
      const password = randomSecret();
      const res = await admin(`/realms/${realm}/users`, {
        username,
        email,
        emailVerified,
        enabled: true,
        firstName: 'Test',
        lastName: username,
        credentials: [{ type: 'password', value: password, temporary: false }],
      });
      const id = (res.headers.get('location') ?? '').split('/').pop() ?? '';
      if (!id) throw new Error('keycloak did not return a user id');
      return { id, username, password };
    },
  };
}

/** Minimal cookie jar keyed by cookie name (single host per jar). */
export class CookieJar {
  private readonly cookies = new Map<string, string>();
  store(res: Response): void {
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      const name = pair.slice(0, i).trim();
      const value = pair.slice(i + 1);
      if (value === '' || /max-age=0|expires=thu, 01 jan 1970/i.test(c)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
  get(name: string): string | undefined {
    return this.cookies.get(name);
  }
  header(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

export async function get(url: string, jar?: CookieJar): Promise<Response> {
  const res = await fetch(url, {
    redirect: 'manual',
    headers: jar ? { Cookie: jar.header() } : {},
  });
  jar?.store(res);
  return res;
}

/**
 * Follows the IdP part of the flow: open the authorization URL, submit the login form, and
 * return the callback URL Keycloak redirects to (not yet visited).
 */
export async function authenticateAtIdp(
  authorizationUrl: string,
  username: string,
  password: string,
): Promise<string> {
  const kc = new CookieJar();
  const page = await get(authorizationUrl, kc);
  if (page.status !== 200) throw new Error(`login page status ${page.status}`);
  const html = await page.text();
  const action = /<form[^>]*id="kc-form-login"[^>]*action="([^"]+)"/.exec(html)?.[1];
  if (!action) throw new Error('login form not found');
  const res = await fetch(action.replace(/&amp;/g, '&'), {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: kc.header() },
    body: new URLSearchParams({ username, password, credentialId: '' }),
  });
  const location = res.headers.get('location');
  if (res.status !== 302 || !location)
    throw new Error(`IdP did not redirect (status ${res.status})`);
  return location;
}
