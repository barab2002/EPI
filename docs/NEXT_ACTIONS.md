# Next actions (ordered) — plan to the 2026-11-02 pilot (ADR-024)

Engineering (Claude, unattended via the hourly routine; each on its own branch → CI → PR → merge):

1. **EPI-003b Production Keycloak in the install** (~2.5 d): Keycloak (production mode, its own PostgreSQL database, health checks) in `deploy/compose.keycloak.yaml`; realm/client provisioned at install; **LDAPS user federation to AD, read-only** (bind password from a secret file, internal CA trust, user search limited to the pilot team groups); EPI uses it via OIDC. Tests: ephemeral OpenLDAP (synthetic users/groups) + Keycloak.
2. **EPI-004c AD team import** (~2 d): admin chooses which AD groups (synced by Keycloak's group mapper) are which EPI teams; EPI imports/updates people and memberships from Keycloak's admin API (read-only service account), dated memberships, deactivation when removed, dry-run preview, audited. Roles stay manual.
3. **EPI-012c `upgrade` + rollback** (~1 d): automatic backup, load new images, health check, roll back on failure.
4. **Retention job** (~0.5 d): delete raw activity, sessions and audit entries older than 24 months (configurable), daily, audited counts.
5. **Hebrew UI** (~1.5 d): translation catalog, language switch per user, RTL layout check, screenshots.
6. **Pilot install guide** (~0.5 d): `docs/PILOT_INSTALL.md` — build the bundle on the owner's machine, copy, `offline-install`, secret files (AD bind, Jira PAT, GitLab token), `jira-check`/`gitlab-check`, AD group selection, first sync, reconciliation checklist (20 issues, 10 MRs).

Owner (when each step is reached, Claude asks for the non-secret details one at a time):

7. Collect non-secret details: Jira URL + project keys, GitLab URL + group/project IDs, AD LDAPS host + base DN + team group names, registry mirror host name, internal CA certificate file. **Never** paste passwords/tokens in chat — they go into files on the server.
8. HR/privacy: sign-off for real employee data (B7) and the privacy minimum (C7).
9. Run the install on the server, the checks and the reconciliation; report results (no personal data in chat).
10. UAT with pilot managers (week of 2026-10-26), then pilot start 2026-11-02.

Later (after the pilot): Jira service account instead of the personal PAT; SBOM/CVE scanner (C11); bundle signing; clean-VM offline test.
