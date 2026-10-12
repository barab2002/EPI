# Single sign-on with Keycloak (or another OIDC provider)

EPI uses Keycloak **only for authentication**. Who can see what is decided by EPI's own role assignments. EPI never auto-creates people: every person must exist in EPI (and be mapped to their Keycloak account) before they can sign in.

## 0. Demo: bundled Keycloak with ready-made users

`./epi.sh demo` starts a **demo-only** Keycloak (`http://127.0.0.1:8081`, realm `epi-demo`) next to EPI and prints sign-in accounts at the end. Passwords are random **per install** and stored only in `.epi/keycloak/` (gitignored); show them again with `./epi.sh credentials`.

| Username | Signs in as (synthetic) | Sees |
|---|---|---|
| `morgan` | Morgan Example — engineering manager | whole organization |
| `gal` | Gal Groupman — group manager | Platform group |
| `taylor` | Taylor Lead — team lead | Payments team, can write assessments |
| `eli` | Eli Engineer — developer | own data + Payments aggregate |
| `jo` | Jo Small — developer, 3-person team | own data; team aggregate suppressed |
| `avery` | Avery Admin — administrator | structure only |

Keycloak admin console: `http://127.0.0.1:8081/admin`, user `admin`, password also in `./epi.sh credentials`. Open EPI at **http://127.0.0.1:8080** (if you open `localhost`, EPI switches to `127.0.0.1` before sign-in). Disable with `EPI_DEMO_SSO=false`. The demo Keycloak runs in dev mode with a file database: never use it for real users.

## 1. Keycloak client (IdP admin)

In a dedicated realm (or the existing corporate realm, if approved), create a client:

| Setting | Value |
|---|---|
| Client ID | `epi-web` |
| Client authentication | **On** (confidential) |
| Standard flow | On · Direct access grants **off** · Implicit **off** |
| Valid redirect URIs | `https://<epi-host>/api/v1/auth/callback` (exact) |
| Valid post logout redirect URIs | `https://<epi-host>/*` |
| Advanced → PKCE method | `S256` |
| Web origins | none needed (same-origin app) |

Scopes needed: `openid profile email`. No roles or groups are read from tokens.

Copy the client secret into a root-only file on the EPI host, e.g. `/etc/epi/oidc_client_secret` (`chmod 600`). **Never paste it into chat, tickets or Git.**

## 2. EPI configuration

```bash
export EPI_PUBLIC_URL=https://epi.internal.example          # what users open
export EPI_OIDC_ISSUER=https://sso.internal.example/realms/epi
export EPI_OIDC_CLIENT_ID=epi-web
export EPI_OIDC_CLIENT_SECRET_PATH=/etc/epi/oidc_client_secret
./epi.sh doctor     # checks the secret file and that the issuer is reachable
./epi.sh start
```

- Split DNS: if EPI must reach Keycloak under a different internal address than users do, set `EPI_OIDC_INTERNAL_URL` (e.g. `http://keycloak:8080`); only EPI's server-side calls go there, the issuer stays the public one.
- Internal CA: make the CA bundle available to the container and set `NODE_EXTRA_CA_CERTS`. EPI never disables TLS verification; `http://` issuers are only allowed for local test realms (`EPI_OIDC_ALLOW_HTTP=true`, refused in production mode).
- Production mode (`EPI_MODE=production`) refuses to start without OIDC and an `https://` public URL.

## 3. Mapping people

Each EPI user has `keycloak_sub` (the Keycloak user ID). Options:

1. Set it explicitly (admin screen planned in EPI-008; until then via an approved SQL change).
2. Optional `EPI_OIDC_LINK_BY_VERIFIED_EMAIL=true`: on first sign-in, link to the single active EPI user with the same e-mail if Keycloak marks the e-mail **verified**. Off by default; enabling it is a security-owner decision (ACCESS_REQUIREMENTS C7). Each link is audited (`identity.linked`).

Sign-in failures show a short message to the user (`not_provisioned`, `inactive_user`, `expired_or_invalid_request`, `idp_error`, `oidc_unavailable`) and are audited as `auth.login_failed`.

## Security properties

Authorization Code + PKCE (S256), `state` (single-use, hashed, 10-min expiry), `nonce`, confidential client, browser-binding cookie against login CSRF, same-origin return paths only, ID token issuer/audience/expiry/nonce validated by `openid-client` (token obtained directly from the token endpoint over TLS). EPI stores **no** access, refresh or ID tokens; the browser gets only EPI's opaque HttpOnly session cookie. Because no ID token is kept, Keycloak asks the user to confirm sign-out.

Sessions are not revoked when a Keycloak account is disabled; they end at EPI's idle timeout (30 min) or when the EPI user is deactivated.
