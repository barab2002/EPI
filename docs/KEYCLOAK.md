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

## A. Production: sign in with Active Directory (bundled Keycloak, recommended for the pilot)

People use their **Windows/AD username and password**. EPI ships its own Keycloak (production mode, own database in EPI's PostgreSQL) that checks passwords against AD over **LDAPS, read-only**; Keycloak never stores AD passwords and cannot change anything in AD. Only members of the AD groups you list (the pilot **team groups**, nested groups included) can sign in. EPI still decides what each person may see.

**What IT provides** (nothing of it goes into chat or Git):

| Item | Where it goes |
|---|---|
| Read-only AD bind account (DN) | `EPI_LDAP_BIND_DN` in `.epi/sso.conf` |
| Its password | file `.epi/sso/ldap_bind_password` (one line, created by root) |
| LDAPS URL of a domain controller (`ldaps://dc1.corp…:636`) | `EPI_LDAP_URL` |
| CA certificate that signed the DCs' LDAPS certificates (PEM) | file `.epi/sso/ldap-ca.pem` |
| Users OU, groups OU, the team groups' DNs | `EPI_LDAP_USERS_DN`, `EPI_LDAP_GROUPS_DN`, `EPI_LDAP_TEAM_GROUPS` |
| HTTPS names for EPI and the sign-in page (TLS front end) | `EPI_PUBLIC_URL`, `EPI_SSO_PUBLIC_URL` |

**Steps on the EPI server:**

```bash
mkdir -p .epi/sso && chmod 700 .epi .epi/sso
cp deploy/sso.conf.example .epi/sso.conf && vi .epi/sso.conf     # non-secret values
sudo install -m 600 /dev/null .epi/sso/ldap_bind_password && sudo vi .epi/sso/ldap_bind_password
cp /path/to/corp-ca.pem .epi/sso/ldap-ca.pem
./epi.sh sso-setup     # validates inputs, generates the realm, Keycloak secrets
./epi.sh start         # PostgreSQL + Keycloak + EPI
```

**First administrator** (an empty installation has no people, and sign-in never creates accounts):

```bash
./epi.sh cli setup-admin --name "Your Name" --email you@corp.example --org "Your Company"
```

It creates the organization and makes that person an administrator (an existing person with the same e-mail is reused; repeatable; audited as `admin.bootstrap`). Use the e-mail that AD holds for your account: you are linked on first sign-in. Then, in Administration: Organization (groups and teams) → Directory (map AD groups to teams, preview, apply) → People (roles).

People must exist in EPI with the same e-mail as in AD (the AD team import below creates them); they are linked automatically on first sign-in (verified e-mail from the directory). Keycloak's admin console is for emergencies only (`admin`, password in `.epi/sso/kc_admin_password`). Keycloak imports the realm on its **first** start; to change the team groups, addresses, bind account, its password or the CA later, edit `.epi/sso.conf` (or the files) and run `./epi.sh sso-apply` with EPI running: it updates the running directory provider, its team-groups mapper and EPI's sign-in addresses through Keycloak's admin API, then restarts Keycloak and EPI. People no longer in a team group cannot sign in any more.

Security properties: read-only federation (`editMode READ_ONLY`), password reset/registration disabled, LDAPS enforced (plain LDAP refused unless explicitly allowed), the bind password stays in Keycloak's file vault (`${vault.ldapbind}`), disabled AD accounts excluded, brute-force protection on. Verified by `scripts/e2e-sso-ldap.sh` against a synthetic LDAPS directory: team members sign in with their directory password, wrong passwords and non-team users are refused, and the realm holds no stored credentials.

## 1. Alternative: an existing Keycloak — client (IdP admin)

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

## AD team import (EPI-004c, ADR-030)

With production sign-in configured, EPI also reads the same team groups (same read-only account, same CA) to keep team membership in step with AD:

1. Check access: `./epi.sh cli directory-check` lists each team group with its member count (and members without an e-mail, who cannot sign in).
2. **Administration › Directory**: choose the EPI team each AD group feeds ("Not imported" leaves a team managed by hand).
3. **Preview import** shows every change: new people, people linked by e-mail, name/e-mail updates, people joining or leaving a team, and skipped people with the reason. Nothing changes yet.
4. **Apply** runs exactly that preview (if AD or EPI changed meanwhile, EPI asks you to preview again). Leavers' memberships end today with history kept; nobody is deactivated and roles are never imported — assign roles under People.
