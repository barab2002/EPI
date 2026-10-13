# Next actions (ordered) — plan to the 2026-11-02 pilot (ADR-024)

Engineering (Claude, unattended via the hourly routine; each on its own branch → CI → PR → merge):

1. ✅ **EPI-003b Production Keycloak in the install** — done (PR #14, ADR-025); follow-ups: `sso-apply` (update the directory provider after first start), Keycloak DB in `backup`.
   Original scope (~2.5 d): Keycloak (production mode, its own PostgreSQL database, health checks) in `deploy/compose.keycloak.yaml`; realm/client provisioned at install; **LDAPS user federation to AD, read-only** (bind password from a secret file, internal CA trust, user search limited to the pilot team groups); EPI uses it via OIDC. Tests: ephemeral OpenLDAP (synthetic users/groups) + Keycloak.
2. ✅ **EPI-004c AD team import** — done (ADR-030): EPI reads the team groups directly over LDAPS (same read-only account), admin maps group → team, preview → apply exactly the previewed plan, dated memberships, audited; no automatic deactivation (deliberate), roles stay manual. Follow-up: optional daily import on the sync schedule.
3. ✅ **EPI-012c `upgrade` + rollback** — done (ADR-031): `./epi.sh upgrade <bundle>` verifies, backs up (incl. Keycloak DB), loads images, swaps files, migrates on start, health-checks and rolls back automatically; `scripts/test-upgrade.sh`.
4. ✅ **Retention job** — done (ADR-032): 24 months (configurable), daily, audited; assessments/people kept pending HR (open question).
5. **Hebrew UI** — stages 1–2 done (ADR-035: per-user language, RTL, all screens incl. administration); next: stage 3 KPI definitions/explanations and server messages in Hebrew.
5b. ✅ **Source tokens on the server** (ADR-036): `./epi.sh source-token EPI_JIRA_TOKEN|EPI_GITLAB_TOKEN` and `./epi.sh source-ca <pem>`; the running app, scheduler and CLI read them (before: only the CLI with `<REF>_FILE`).
6. **Pilot install guide** (~0.5 d): `docs/PILOT_INSTALL.md` — build the bundle on the owner's machine, copy, `offline-install`, secret files (AD bind; Jira PAT and GitLab token via `./epi.sh source-token`), `jira-check`/`gitlab-check`, AD group selection, first sync, reconciliation checklist (20 issues, 10 MRs).

Owner (when each step is reached, Claude asks for the non-secret details one at a time):

7. Collect non-secret details: Jira URL + project keys, GitLab URL + group/project IDs, AD LDAPS host + base DN + team group names, registry mirror host name, internal CA certificate file. **Never** paste passwords/tokens in chat — they go into files on the server.
8. HR/privacy: sign-off for real employee data (B7) and the privacy minimum (C7).
9. Run the install on the server, the checks and the reconciliation; report results (no personal data in chat).
10. UAT with pilot managers (week of 2026-10-26), then pilot start 2026-11-02.

Later (after the pilot): Jira service account instead of the personal PAT; SBOM/CVE scanner (C11); bundle signing; clean-VM offline test.
