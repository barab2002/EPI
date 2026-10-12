import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import * as client from 'openid-client';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { EPI_CONFIG, EpiConfig, OidcConfig } from '../config';
import { DATA_SOURCE } from '../db/data-source';
import { rows } from '../db/rows';

const LOGIN_REQUEST_MINUTES = 10;
const hash = (v: string) => createHash('sha256').update(v).digest('hex');

/** Failure categories shown to users; details stay in the audit log/server log. */
export type LoginFailure =
  | 'expired_or_invalid_request'
  | 'idp_error'
  | 'not_provisioned'
  | 'inactive_user'
  | 'oidc_unavailable';

export class OidcLoginError extends Error {
  constructor(
    public readonly reason: LoginFailure,
    detail: string,
  ) {
    super(detail);
  }
}

/** Only same-origin relative paths; blocks open redirects (`//host`, `/\host`, schemes). */
export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string' || value.length > 512) return '/';
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
  if (/[\r\n]/.test(value)) return '/';
  return value;
}

/**
 * Keycloak (or any OIDC provider) login as a backend-for-frontend: Authorization Code + PKCE
 * (S256), state and nonce, confidential client. EPI keeps no access/refresh tokens; after the
 * ID token is validated the user gets an EPI session. Authorization stays in the EPI database.
 */
@Injectable()
export class OidcService {
  private readonly log = new Logger('OIDC');
  private configPromise: Promise<client.Configuration> | null = null;

  constructor(
    @Inject(DATA_SOURCE) private readonly ds: DataSource,
    @Inject(EPI_CONFIG) private readonly config: EpiConfig,
    private readonly audit: AuditService,
  ) {}

  get enabled(): boolean {
    return this.config.oidc !== null;
  }

  private get oidc(): OidcConfig {
    if (!this.config.oidc) throw new OidcLoginError('oidc_unavailable', 'OIDC not configured');
    return this.config.oidc;
  }

  get redirectUri(): string {
    return `${this.config.publicUrl}/api/v1/auth/callback`;
  }

  /** Discovery is cached; a failure is not cached so the next attempt retries. */
  private discover(): Promise<client.Configuration> {
    if (!this.configPromise) {
      const o = this.oidc;
      this.configPromise = client
        .discovery(
          new URL(o.issuer),
          o.clientId,
          { client_secret: o.clientSecret },
          client.ClientSecretBasic(o.clientSecret),
          { execute: o.allowHttp ? [client.allowInsecureRequests] : [], timeout: 10 },
        )
        .catch((e: unknown) => {
          this.configPromise = null;
          this.log.error(`discovery failed: ${e instanceof Error ? e.message : 'unknown'}`);
          throw new OidcLoginError('oidc_unavailable', 'OIDC discovery failed');
        });
    }
    return this.configPromise;
  }

  /** Readiness probe for doctor/health: true when the provider's metadata is reachable. */
  async check(): Promise<boolean> {
    if (!this.enabled) return true;
    try {
      await this.discover();
      return true;
    } catch {
      return false;
    }
  }

  /** Creates a single-use login request and returns the IdP URL plus a browser-binding value. */
  async startLogin(returnTo: unknown): Promise<{ url: string; binding: string }> {
    const cfg = await this.discover();
    const state = client.randomState();
    const nonce = client.randomNonce();
    const verifier = client.randomPKCECodeVerifier();
    const binding = randomBytes(24).toString('base64url');
    await this.ds.query(`DELETE FROM oidc_login_requests WHERE expires_at < now()`);
    await this.ds.query(
      `INSERT INTO oidc_login_requests(state_hash,binding_hash,code_verifier,nonce,return_to,expires_at)
       VALUES ($1,$2,$3,$4,$5, now() + make_interval(mins => $6))`,
      [hash(state), hash(binding), verifier, nonce, safeReturnTo(returnTo), LOGIN_REQUEST_MINUTES],
    );
    const url = client.buildAuthorizationUrl(cfg, {
      redirect_uri: this.redirectUri,
      scope: 'openid profile email',
      response_type: 'code',
      code_challenge: await client.calculatePKCECodeChallenge(verifier),
      code_challenge_method: 'S256',
      state,
      nonce,
    });
    return { url: url.href, binding };
  }

  /**
   * Completes the login. `callbackUrl` is the full URL the IdP redirected to. The login request is
   * consumed (deleted) before validation so a code/state can never be replayed.
   */
  async finishLogin(
    callbackUrl: URL,
    binding: string | undefined,
  ): Promise<{ userId: string; returnTo: string }> {
    const state = callbackUrl.searchParams.get('state');
    if (!state || !binding) {
      throw new OidcLoginError('expired_or_invalid_request', 'missing state or binding cookie');
    }
    const [req] = await rows<{
      binding_hash: string;
      code_verifier: string;
      nonce: string;
      return_to: string;
    }>(
      this.ds,
      `DELETE FROM oidc_login_requests WHERE state_hash = $1 AND expires_at > now()
       RETURNING binding_hash, code_verifier, nonce, return_to`,
      [hash(state)],
    );
    if (!req || req.binding_hash !== hash(binding)) {
      throw new OidcLoginError('expired_or_invalid_request', 'unknown, expired or unbound state');
    }
    if (callbackUrl.searchParams.get('error')) {
      throw new OidcLoginError(
        'idp_error',
        `IdP returned ${callbackUrl.searchParams.get('error')}`,
      );
    }

    const cfg = await this.discover();
    let claims: client.IDToken;
    try {
      const tokens = await client.authorizationCodeGrant(cfg, callbackUrl, {
        pkceCodeVerifier: req.code_verifier,
        expectedState: state,
        expectedNonce: req.nonce,
        idTokenExpected: true,
      });
      const c = tokens.claims();
      if (!c) throw new Error('no ID token claims');
      claims = c;
    } catch (e) {
      throw new OidcLoginError(
        'idp_error',
        `token exchange/validation failed: ${e instanceof Error ? e.message : 'unknown'}`,
      );
    }
    const userId = await this.resolveUser(claims);
    return { userId, returnTo: req.return_to };
  }

  private async resolveUser(claims: client.IDToken): Promise<string> {
    const sub = claims.sub;
    const [bySub] = await this.ds.query(`SELECT id, active FROM users WHERE keycloak_sub = $1`, [
      sub,
    ]);
    if (bySub) {
      if (!bySub.active) throw new OidcLoginError('inactive_user', 'user is deactivated');
      return bySub.id;
    }
    const email = typeof claims.email === 'string' ? claims.email.toLowerCase() : null;
    if (this.oidc.linkByVerifiedEmail && email && claims.email_verified === true) {
      const linked = await this.ds.transaction(async (m) => {
        const candidates = await m.query(
          `SELECT id FROM users WHERE lower(email) = $1 AND active AND keycloak_sub IS NULL FOR UPDATE`,
          [email],
        );
        if (candidates.length !== 1) return null;
        await m.query(`UPDATE users SET keycloak_sub = $2 WHERE id = $1`, [candidates[0].id, sub]);
        await this.audit.record(
          candidates[0].id,
          'identity.linked',
          'user',
          candidates[0].id,
          { method: 'verified_email' },
          m,
        );
        return candidates[0].id as string;
      });
      if (linked) return linked;
    }
    throw new OidcLoginError('not_provisioned', 'no EPI user mapped to this identity');
  }

  /** Provider logout URL (RP-initiated logout), or null when OIDC is off or discovery fails. */
  async logoutUrl(): Promise<string | null> {
    if (!this.enabled) return null;
    try {
      const cfg = await this.discover();
      if (!cfg.serverMetadata().end_session_endpoint) return null;
      return client.buildEndSessionUrl(cfg, {
        client_id: this.oidc.clientId,
        post_logout_redirect_uri: `${this.config.publicUrl}/`,
      }).href;
    } catch {
      return null;
    }
  }
}
