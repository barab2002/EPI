# Next actions (ordered)

1. **Owner:** approve merging `feature/keycloak-oidc` (EPI-003) to `main`; provide Keycloak details (C1) when available.
2. **EPI-006 Jira adapter (mock first)** on `feature/jira-collector`: `EngineeringSource` interface, REST client with pagination/retry/backoff, 48 h overlap cursor, idempotent upserts, status-category mapping table; tests with recorded fixtures (two identical runs → no change).
3. **EPI-007 GitLab adapter (mock first)**: MRs, discussions, reviewer-request events, bot exclusion, issue-key linking with confidence.
4. **EPI-008** identity mapping + data-quality page; **admin CRUD** for hierarchy/roles with audit.
5. **EPI-012** pinned image digests, `bundle`/`offline-install`, egress-blocked install test, SBOM (needs approved tools).
