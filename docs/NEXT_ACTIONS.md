# Next actions (ordered)

1. **Owner decisions** (see `ACCESS_REQUIREMENTS.md` A1–A5): confirm NestJS (ADR-001), license, branch protection/merge policy; review and merge PRs for `chore/phase-0-foundation` and `feature/vertical-slice-1` (no PRs opened yet — owner to request).
2. **EPI-003 Keycloak login** on `feature/keycloak-oidc`: add Keycloak to Compose as an optional profile with a local *test* realm import; implement code+PKCE BFF with `openid-client`, state/nonce, issuer/audience checks, logout; map `sub` → `users.keycloak_sub`; integration tests against the container. Validate: `bash scripts/ci.sh` + new e2e login test.
3. **EPI-006 Jira adapter (mock first)** on `feature/jira-collector`: `EngineeringSource` interface, REST client with pagination/retry/backoff, 48 h overlap cursor, idempotent upserts, status-category mapping table; tests with recorded fixtures (two identical runs → no change).
4. **EPI-007 GitLab adapter (mock first)**: MRs, discussions, reviewer-request events, bot exclusion, issue-key linking with confidence.
5. **EPI-008** identity mapping + data-quality page; **admin CRUD** for hierarchy/roles with audit.
6. **EPI-012** pinned image digests, `bundle`/`offline-install`, egress-blocked install test, SBOM (needs approved tools).
