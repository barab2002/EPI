# Access & approval requirements — consolidated request

**Never paste passwords, tokens or certificates' private keys into chat, Markdown or Git.** Secure handoff: put secrets in a file outside the repo (e.g. `/etc/epi/secrets.env`, mode 0600) or in the approved secret store, and reference them from `epi.yaml` by name (`auth_secret_ref: EPI_JIRA_TOKEN`). EPI reads them from the environment / mounted files only.

Status legend: ✅ available · ⏳ requested · ❓ unknown · ⛔ blocked

## Blocking now (needed to continue past synthetic data / to merge)

| # | Requirement | Mandatory? | Owner | Least privilege | Why | Status | Secure handoff |
|---|---|---|---|---|---|---|---|
| A1 | Confirm stack: NestJS backend instead of spec's FastAPI (ADR-001) | Yes | Product sponsor | — | Changes agreed architecture | ✅ confirmed by owner 2026-10-12 | Reply in chat |
| A2 | Merge policy for `main`: who reviews/merges PRs; enable branch protection on GitHub | Yes before first merge | Repo owner | Push to feature branches only | `main` must stay protected | ❓ protection status unknown | GitHub settings |
| A3 | Is GitHub (`barab2002/EPI`) the approved remote, or will code move to internal GitLab? | Yes | Repo owner | — | CI and push target | ✅ GitHub push works for feature branches | Reply in chat |
| A5 | Open-source license for EPI code (proposal: Apache-2.0) | Yes before release | Product sponsor | — | Spec §16 "Core code: Open Source" | ✅ Apache-2.0 (owner delegated, ADR-013) | Reply in chat |
| A4 | Use of synthetic data only until privacy sign-off (default assumed) | Yes | Privacy/HR | — | Spec §12F | ✅ assumed: synthetic only | Reply in chat |

## Needed for real-data integration (EPI-006/007/008) — not blocking current work

| # | Requirement | Mandatory? | Owner | Least privilege | Why | Status | Secure handoff |
|---|---|---|---|---|---|---|---|
| B1 | Jira DC base URL, exact version, TLS CA chain | Yes | Jira admin | — | Capability discovery | ❓ | CA file path on host |
| B2 | Jira read-only service account/PAT: issues, changelog, fields, boards/sprints, links | Yes | Jira admin | Browse projects only, no write | Ingestion | ❓ | `EPI_JIRA_TOKEN` in secret file |
| B3 | Jira project keys, board IDs, 3–5 test issue keys; status workflow → category mapping; Story Points field; issue types → work types | Yes | Team leads | — | Field/status mapping | ❓ | Chat / config |
| B4 | GitLab URL, **exact** 18.x version & edition, CA chain | Yes | GitLab admin | — | Capability + MCP check | ❓ | CA file path |
| B5 | GitLab token with `read_api` on pilot projects only | Yes | GitLab admin | `read_api`, project-scoped | MRs, discussions, reviewers | ❓ | `EPI_GITLAB_TOKEN` in secret file |
| B6 | Branch naming and Jira-key conventions; known bot accounts | Yes | Team leads | — | MR↔issue linking, bot exclusion | ❓ | Chat |
| B7 | Approval to ingest 6 months of Jira/GitLab **metadata** | Yes | Privacy/HR + sponsor | Metadata only, no code content | Backfill | ❓ | Written approval |
| B8 | Approval to evaluate a self-hosted Jira/GitLab MCP server (else REST only) | No | Security | Read-only | Spec §7 MCP rule | ❓ default: REST | Reply |
| B9 | Org chart for pilot teams: groups, teams, people, managers, grades, historical membership; Jira/GitLab user IDs | Yes | Pilot managers/HR | Pilot teams only | Hierarchy + identity mapping | ❓ | Approved CSV via secure channel, not Git |

## Needed for production / pilot install (EPI-003, EPI-012)

| # | Requirement | Mandatory? | Owner | Least privilege | Why | Status | Secure handoff |
|---|---|---|---|---|---|---|---|
| C1 | Keycloak: dedicated test realm + client, or existing realm; issuer URL, redirect URIs, test users | Yes | IdP admin | Realm-admin on **test realm only** | Login | ❓ | Client secret in secret file |
| C2 | Target host: OS, CPU/RAM/disk (proposed ≥4 vCPU, 8 GB, 50 GB), Docker Engine + Compose v2 | Yes | Infra | Non-root docker group | Install | ❓ | Chat |
| C3 | Internal DNS name, TLS certificate/ingress, allowed ports, firewall routes to Jira/GitLab/IdP | Yes | Infra/Network | Only required routes | HTTPS access | ❓ | Cert files on host |
| C4 | Internal registry/mirror for images & npm (or connected build host for offline bundle) | Yes | Infra | Pull-only | Offline install | ❓ | Chat |
| C5 | Backup target and retention | Yes | Infra | Write to backup path only | Backup/restore | ❓ | Chat |
| C6 | Secret store choice (Vault, file mounts, Docker secrets) | Yes | Security | — | Secret injection | ❓ default: root-only env file | Chat |
| C7 | Security owner: who may read private reviews; small-group suppression threshold (default 5) | Yes | Security/HR | — | RBAC policy | ❓ default 5 | Chat |
| C8 | Data retention period and privacy sign-off for real employee data | Yes before real data | Privacy/HR | — | Compliance | ❓ | Written approval |
| C9 | Pilot teams (spec: 2), languages (EN + HE?), grade ladder, review rubric confirmation | Yes | Sponsor | — | Product config | ❓ default: EN, Junior/Mid/Senior/Tech Lead | Chat |
| C11 | Approval to use an SBOM/vulnerability scanner (e.g. Syft + Grype or Trivy, Apache-2.0) with an offline vulnerability DB | No (P1) | Security | Read-only scan of images | EPI-012b SBOM + CVE report | ❓ | Reply |
| C10 | Approval to enable the hourly resume scheduler (implemented, **disabled**) | No | Owner | — | Unattended automation | ✅ approved 2026-10-12 (see ADR-014) | Reply |

## Open questions

1. Should a developer see their team's aggregate KPIs (spec allows "approved team aggregate")? Default: yes, if team size ≥ threshold.
2. Hebrew UI required for pilot or Phase 2? Default: English first, localization files from day one.
3. Is the GitLab "reviewer requested" event available on your version? If not, Review Waiting Time uses the labeled proxy `MR_OPEN_TO_FIRST_REVIEW`.
