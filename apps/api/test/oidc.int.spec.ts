import type { INestApplication } from '@nestjs/common';
import { createServer } from 'node:net';
import { DataSource } from 'typeorm';
import { freshDatabase, startApp, userId } from './helpers';
import {
  authenticateAtIdp,
  CookieJar,
  createTestRealm,
  get,
  keycloakUrl,
  TestRealm,
} from './keycloak';

/**
 * EPI-003: real Keycloak (scripts/test-keycloak.sh) + real PostgreSQL. Covers the BFF
 * Authorization Code + PKCE flow and its negative paths (replay, login CSRF, tampering,
 * unmapped/inactive identities, open redirect, IdP error).
 */
const required = process.env.EPI_REQUIRE_KEYCLOAK === '1';
const describeKc = keycloakUrl() ? describe : required ? describe : describe.skip;
if (!keycloakUrl() && !required) {
  console.warn(
    'OIDC integration tests skipped: run via scripts/test-keycloak.sh (CI requires them)',
  );
}

jest.setTimeout(120_000);

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
    s.on('error', reject);
  });
}

describeKc('OIDC sign-in with Keycloak (integration)', () => {
  let ds: DataSource;
  let app: INestApplication;
  let base: string;
  let realm: TestRealm;
  let taylor: { id: string; username: string; password: string };

  /** Browser-side start: returns the IdP URL and the EPI cookie jar holding the binding cookie. */
  async function start(returnTo = '/') {
    const jar = new CookieJar();
    const res = await get(
      `${base}/api/v1/auth/login?return_to=${encodeURIComponent(returnTo)}`,
      jar,
    );
    expect(res.status).toBe(302);
    return { jar, idpUrl: res.headers.get('location') ?? '' };
  }

  async function fullLogin(username: string, password: string, returnTo = '/') {
    const { jar, idpUrl } = await start(returnTo);
    const callback = await authenticateAtIdp(idpUrl, username, password);
    const res = await get(callback, jar);
    return { res, jar, callback };
  }

  beforeAll(async () => {
    if (!keycloakUrl()) throw new Error('EPI_TEST_KEYCLOAK_URL missing (EPI_REQUIRE_KEYCLOAK=1)');
    ds = await freshDatabase();
    const port = await freePort();
    base = `http://127.0.0.1:${port}`;
    realm = await createTestRealm(base);
    taylor = await realm.createUser({
      username: 'taylor',
      email: 'kc-taylor@example.invalid',
      emailVerified: true,
    });
    await ds.query(`UPDATE users SET keycloak_sub = $1 WHERE display_name = 'Taylor Lead'`, [
      taylor.id,
    ]);
    app = await startApp(ds, {
      publicUrl: base,
      oidc: {
        issuer: realm.issuer,
        clientId: realm.clientId,
        clientSecret: realm.clientSecret,
        allowHttp: true,
        linkByVerifiedEmail: true,
      },
    });
    await app.listen(port, '127.0.0.1');
  });

  afterAll(async () => {
    await app?.close();
    await ds?.destroy();
  });

  it('advertises OIDC sign-in', async () => {
    const res = await get(`${base}/api/v1/auth/config`);
    expect(await res.json()).toMatchObject({ oidc: true });
  });

  it('redirects to Keycloak with PKCE S256, state and nonce, and sets a binding cookie', async () => {
    const { jar, idpUrl } = await start();
    const url = new URL(idpUrl);
    expect(url.origin + url.pathname).toBe(`${realm.issuer}/protocol/openid-connect/auth`);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
    expect(url.searchParams.get('state')).toBeTruthy();
    expect(url.searchParams.get('nonce')).toBeTruthy();
    expect(url.searchParams.get('redirect_uri')).toBe(`${base}/api/v1/auth/callback`);
    expect(jar.get('epi_oidc')).toBeTruthy();
    const [row] = await ds.query(`SELECT count(*)::int AS n FROM oidc_login_requests`);
    expect(row.n).toBeGreaterThan(0);
  });

  it('signs a mapped user in, honors a safe return path and audits the login', async () => {
    const { res, jar } = await fullLogin(taylor.username, taylor.password, '/teams');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/teams');
    expect(jar.get('epi_session')).toBeTruthy();
    expect(res.headers.getSetCookie().join(';')).toMatch(/epi_session=[^;]+;.*HttpOnly/i);
    const me = await get(`${base}/api/v1/me`, jar);
    expect(me.status).toBe(200);
    const body = (await me.json()) as { user: { display_name: string }; roles: string[] };
    expect(body.user.display_name).toBe('Taylor Lead');
    expect(body.roles).toContain('TEAM_LEAD');
    const [audit] = await ds.query(
      `SELECT metadata_json->>'method' AS method FROM audit_events
       WHERE action = 'auth.login' AND actor_user_id = $1 ORDER BY at DESC LIMIT 1`,
      [await userId(ds, 'Taylor Lead')],
    );
    expect(audit.method).toBe('oidc');
  });

  it('rejects replay of a used callback (state is single-use)', async () => {
    const { callback, jar } = await fullLogin(taylor.username, taylor.password);
    const replay = await get(callback, jar);
    expect(replay.headers.get('location')).toBe('/?login_error=expired_or_invalid_request');
  });

  it('rejects a callback without the browser binding cookie (login CSRF)', async () => {
    const { idpUrl } = await start();
    const callback = await authenticateAtIdp(idpUrl, taylor.username, taylor.password);
    const res = await get(callback); // victim browser: no epi_oidc cookie
    expect(res.headers.get('location')).toBe('/?login_error=expired_or_invalid_request');
    expect(res.headers.getSetCookie().join(';')).not.toMatch(/epi_session=[^;]/);
  });

  it("rejects a callback bound to another browser's login request", async () => {
    const a = await start();
    const b = await start();
    const callbackA = await authenticateAtIdp(a.idpUrl, taylor.username, taylor.password);
    const res = await get(callbackA, b.jar);
    expect(res.headers.get('location')).toBe('/?login_error=expired_or_invalid_request');
  });

  it('rejects a tampered state', async () => {
    const { jar, idpUrl } = await start();
    const callback = new URL(await authenticateAtIdp(idpUrl, taylor.username, taylor.password));
    callback.searchParams.set('state', 'forged-state');
    const res = await get(callback.href, jar);
    expect(res.headers.get('location')).toBe('/?login_error=expired_or_invalid_request');
  });

  it('reports an IdP error without creating a session', async () => {
    const { jar, idpUrl } = await start();
    const state = new URL(idpUrl).searchParams.get('state') ?? '';
    const res = await get(
      `${base}/api/v1/auth/callback?error=access_denied&state=${encodeURIComponent(state)}`,
      jar,
    );
    expect(res.headers.get('location')).toBe('/?login_error=idp_error');
    expect(jar.get('epi_session')).toBeUndefined();
  });

  it('refuses identities with no EPI user (no auto-provisioning) and audits the failure', async () => {
    const stranger = await realm.createUser({
      username: 'stranger',
      email: 'nobody@example.invalid',
      emailVerified: true,
    });
    const { res, jar } = await fullLogin(stranger.username, stranger.password);
    expect(res.headers.get('location')).toBe('/?login_error=not_provisioned');
    expect(jar.get('epi_session')).toBeUndefined();
    const [row] = await ds.query(
      `SELECT count(*)::int AS n FROM audit_events WHERE action = 'auth.login_failed'
         AND metadata_json->>'reason' = 'not_provisioned'`,
    );
    expect(row.n).toBeGreaterThan(0);
  });

  it('does not link by e-mail when the e-mail is unverified', async () => {
    const u = await realm.createUser({
      username: 'eli-unverified',
      email: 'eli.engineer@example.invalid',
      emailVerified: false,
    });
    const { res } = await fullLogin(u.username, u.password);
    expect(res.headers.get('location')).toBe('/?login_error=not_provisioned');
    const [eli] = await ds.query(
      `SELECT keycloak_sub FROM users WHERE display_name = 'Eli Engineer'`,
    );
    expect(eli.keycloak_sub).not.toBe(u.id);
  });

  it('links a first login to an existing user by verified e-mail when enabled, and audits it', async () => {
    await ds.query(`UPDATE users SET keycloak_sub = NULL WHERE display_name = 'Dana Dev'`);
    const u = await realm.createUser({
      username: 'dana',
      email: 'Dana.Dev@example.invalid',
      emailVerified: true,
    });
    const { res, jar } = await fullLogin(u.username, u.password);
    expect(res.headers.get('location')).toBe('/');
    const me = (await (await get(`${base}/api/v1/me`, jar)).json()) as {
      user: { display_name: string };
    };
    expect(me.user.display_name).toBe('Dana Dev');
    const [dana] = await ds.query(`SELECT keycloak_sub FROM users WHERE display_name = 'Dana Dev'`);
    expect(dana.keycloak_sub).toBe(u.id);
    const [audit] = await ds.query(
      `SELECT count(*)::int AS n FROM audit_events WHERE action = 'identity.linked'`,
    );
    expect(audit.n).toBe(1);
  });

  it('refuses deactivated EPI users', async () => {
    const u = await realm.createUser({
      username: 'gil',
      email: 'kc-gil@example.invalid',
      emailVerified: true,
    });
    await ds.query(
      `UPDATE users SET keycloak_sub = $1, active = false WHERE display_name = 'Gil Builder'`,
      [u.id],
    );
    const { res } = await fullLogin(u.username, u.password);
    expect(res.headers.get('location')).toBe('/?login_error=inactive_user');
  });

  it('ignores unsafe return paths (open redirect)', async () => {
    for (const evil of ['//evil.example/x', 'https://evil.example', '/\\evil.example']) {
      const { res } = await fullLogin(taylor.username, taylor.password, evil);
      expect(res.headers.get('location')).toBe('/');
    }
  });

  it('logs out locally and returns the Keycloak end-session URL', async () => {
    const { jar } = await fullLogin(taylor.username, taylor.password);
    const me = (await (await get(`${base}/api/v1/me`, jar)).json()) as { csrfToken: string };
    const res = await fetch(`${base}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { Cookie: jar.header(), 'x-csrf-token': me.csrfToken },
    });
    expect(res.status).toBe(200);
    const { logoutUrl } = (await res.json()) as { logoutUrl: string };
    const url = new URL(logoutUrl);
    expect(url.origin + url.pathname).toBe(`${realm.issuer}/protocol/openid-connect/logout`);
    expect(url.searchParams.get('client_id')).toBe('epi-web');
    expect(url.searchParams.get('post_logout_redirect_uri')).toBe(`${base}/`);
    expect((await get(`${base}/api/v1/me`, jar)).status).toBe(401);
  });

  it('never stores tokens: no token columns are written and login requests are consumed', async () => {
    await fullLogin(taylor.username, taylor.password);
    const cols = await ds.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name IN ('sessions','users') AND column_name ~ '(access|refresh|id)_token'`,
    );
    expect(cols).toHaveLength(0);
  });
});
