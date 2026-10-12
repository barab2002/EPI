# Security notes (slice 1)

- **Sessions:** 32-byte random token in an `HttpOnly; SameSite=Lax` cookie (`Secure` in production); only its SHA-256 is stored. Idle timeout 30 min (sliding). Mutations need `x-csrf-token` matching the session (constant-time compare).
- **Authorization:** computed per request from EPI's `role_assignments`/`team_memberships` (effective-dated). IdP claims are never used for authorization. Unknown and out-of-scope objects both return 404. Unknown query parameters are rejected.
- **Privacy:** aggregate-only viewers of teams below `EPI_MIN_AGGREGATE_SIZE` (default 5) get `suppressed` with no value, sample or trend. Item-level evidence only for member-level access. Assessments: subject sees submitted only; peers and admins see none.
- **Audit:** logins/logouts, assessment create/update; metadata never contains review text or secrets.
- **Secrets:** DB password via file (`EPI_DB_PASSWORD_FILE`), generated per install into `.epi/` (dir 0700, gitignored). No secrets in Git (secret scan in CI). Error responses carry a correlation ID and never echo driver errors.
- **Network:** demo binds to `127.0.0.1` only. Helmet CSP: same-origin scripts, no external sources.
- **Demo login** is a deliberate demo-only backdoor: route returns 404 unless `EPI_MODE=demo`, and only accepts users flagged `is_synthetic`. Production mode refuses to start until OIDC exists.
