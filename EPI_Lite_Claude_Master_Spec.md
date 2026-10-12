# EPI — Engineering Performance & Improvement
## Master Product & Implementation Specification for Claude Code

**Version:** 1.0  
**Date:** 2026-10-12  
**Owner:** Product sponsor  
**Implementation:** Claude Code with human approvals  
**Target pilot:** 2026-11-02 (stretch target, not a guarantee)  
**Constraints:** One developer, on-premises, air-gapped capable, no mandatory cloud/SaaS, no license fees for core components, single product UI.

---

# 0. INSTRUCTIONS TO CLAUDE — READ FIRST

You are the lead engineer, product engineer, UX designer, test engineer, DevOps engineer, and technical writer for EPI. Your objective is to deliver a working, maintainable, secure on-premises product, not a prototype composed of unrelated dashboards.

**Before writing code:**
1. Read this entire document and inspect the repository and local environment.
2. Produce `docs/READINESS.md` with a checklist of prerequisites, access requests, missing information, risks, and recommended defaults. Ask the user for **all foreseeable permissions, credentials, network details, sample data, and approvals in one consolidated request**. Never request passwords or tokens in chat; provide secure secret-injection instructions.
3. Produce `docs/IMPLEMENTATION_PLAN.md` with phases, estimated effort, dependency graph, and a first demonstrable vertical slice.
4. Identify available tools/skills and state which are installed versus missing. Do not pretend to have a skill, tool, permission, MCP server, or connector that is unavailable.
5. **Do not block on optional access.** Start with synthetic demo data and mock adapters while waiting for real Jira/GitLab access. Clearly label synthetic data.
6. Never run destructive operations against customer systems. All Jira/GitLab access in MVP is read-only. Never change Keycloak realms/users outside an explicitly authorized test realm.
7. Implement in small independently testable increments. After each increment run tests, update documentation, and show screenshots or an accessible demo when available.
8. Prefer simplest working architecture. Avoid introducing extra services, frameworks, or AI unless a concrete acceptance criterion requires them.
9. Do not claim readiness, security, compatibility, or one-click install until verified by tests.
10. Maintain `docs/DECISIONS.md`, `docs/PROGRESS.md`, `docs/OPEN_QUESTIONS.md`, and `docs/RISKS.md`.

**Mandatory workflow:** Discover → Readiness request → Architecture decision record → Build vertical slice → Validate → Extend → Package → Offline install test → Pilot acceptance.

---

# 1. PROBLEM DEFINITION

Engineering leaders lack one trustworthy place to understand whether developers, team leads, teams, and groups are improving. Jira shows work items, GitLab shows code activity, HR tools show reviews, and managers retain context in spreadsheets or memory. These disconnected systems produce incomplete and often misleading conclusions. Raw commit counts, lines of code, and story points are not defensible individual performance scores.

EPI combines **engineering delivery evidence**, **human professional assessment**, **competency expectations**, and **development plans** in one self-explanatory product. Its central question is: **What improved, what deteriorated, why might it have changed, how reliable is the evidence, and what action should we take next?**

## 1.1 Desired outcomes
- Improve individuals and teams month over month; do not create simplistic employee leaderboards.
- Give managers practical evidence for coaching and development.
- Give employees visibility into their own growth, expectations, and feedback.
- Give leadership an aggregated view across organization → group → team → person, limited by authorization.
- Explain every KPI with formula, source, time window, inclusion/exclusion rules, sample size, confidence, and worked example.
- Reduce configuration and operational burden, including in closed networks.
- Support a full review lifecycle over time, without requiring all capabilities for initial pilot.

## 1.2 Personas
- **Developer:** self profile, competencies, own KPIs, goals, feedback, self-review.
- **Team Lead:** own team, employee assessments, coaching actions, team health.
- **Group Manager:** groups/teams assigned, comparison with context, management follow-up.
- **Engineering Manager:** authorized organizational scope, cross-team improvement trends.
- **System Administrator:** configuration, users, integration status, role assignment; **not automatically entitled to private appraisal content**.
- **HR/People Partner (later):** optional scoped review administration and calibration.

## 1.3 Non-goals / safeguards
- No automatic termination, promotion, compensation, or disciplinary decision from a score.
- No ranking developers by commits, LOC, hours online, or story points.
- No AI-generated employee judgment in MVP.
- No collection of code content unless explicitly justified and approved; metadata first.
- No direct writeback to Jira/GitLab in MVP.
- No requirement for public internet, SaaS, hosted LLM, or external telemetry.
- No user navigation to Grafana, Frappe, Keycloak, or DevLake for everyday EPI workflows.

---

# 2. PRODUCT STRATEGY — ONE UI, NOT MANY TOOLS

**Architectural decision for v1:** Build a **single-purpose EPI web application** (React + TypeScript frontend, FastAPI backend, PostgreSQL database) with Keycloak as a background identity service. Use Jira DC and GitLab self-managed only as sources. This is the clearest path to a consistent one-product UX, simple per-scope authorization, and transparent custom calculations.

**Why not use Frappe HR as the primary UI?** It offers mature HR workflows but would constrain UX, require adaptation of its HR data model and MariaDB stack, and introduce additional administration complexity. Revisit this decision only if a time-boxed spike proves that a Frappe extension delivers the same acceptance criteria materially faster. **Do not build or deploy both stacks.** Apache DevLake is also optional; prefer a small collector until demonstrated otherwise.

### Deployment units (MVP)
1. `epi-web`: static frontend served by the application/reverse proxy (may be packaged with API).
2. `epi-api`: FastAPI, ingestion CLI/jobs, KPI calculations, RBAC, audit logging.
3. `postgres`: EPI relational data and history.
4. `keycloak`: OIDC authentication; Keycloak may share PostgreSQL server but must use separate database/schema and credentials.

Optional: existing corporate ingress, internal TLS termination, internal registry. No Kafka, Redis, Celery, Airflow, Grafana, DevLake, microservices, or external analytics by default.

**Deployment modes:**
- `demo`: `./epi up --demo` starts a seeded system with synthetic users/data; suitable for evaluation.
- `production`: `./epi up --config ./epi.yaml` validates config and starts the complete product; requires secure secrets and HTTPS/approved internal ingress.
- `offline`: `./epi bundle --output epi-offline.tar` on a connected build host, then `./epi up --offline --bundle epi-offline.tar --config epi.yaml` on the target. Bundle contains images and any runtime assets. The target must not fetch packages or fonts from the internet.

One-click means **one command after prerequisites are supplied**, not silently inventing network, credentials, TLS certificates, or privileged access. The CLI must print actionable missing prerequisites and exit safely.

---

# 3. PRODUCT CAPABILITIES AND RELEASE PHASES

## Phase 0 — Readiness and proof of connectivity (1–2 working days)
- Validate Docker/Compose, K8s availability, internal registry, TLS and DNS, Keycloak setup.
- Check Jira DC version, API endpoints, changelog pagination, Agile API availability, custom fields, workflows, boards, issue links.
- Check exact GitLab 18.x version, REST API access, projects, MR discussions, reviewers, timestamps, and MCP capability.
- Check access to 6 months of history and identity matching coverage.
- Generate a readiness report with GO / GO-WITH-GAPS / NO-GO.

## Phase 1 — Pilot vertical slice (target 2026-11-02, conditional)
- One login, one EPI UI, roles and hierarchical scopes.
- Admin management: organization, groups, teams, people, assignments, grade, role.
- Jira + GitLab read-only integration with incremental sync and optional 6-month backfill.
- KPIs: cycle time, open-item aging, review waiting time **when reliably measurable**.
- Monthly manager assessment: independence 1–5, growth 1–5, evidence text.
- Overview, group, team, developer, assessment, admin, and KPI explanation screens.
- Demo mode, offline bundle, one-command installation, audit logs, security tests.

## Phase 2 — Complete employee evaluation (November–December, dependent on resources)
- Role-based competency matrices (Junior/Mid/Senior/Tech Lead; configurable).
- Self-assessment, manager assessment, acknowledgment, review cycle states, feedback history.
- Individual development plans with goals, owner, due date, evidence, and follow-up.
- Additional KPIs: defect rework, sprint predictability, blocked-time ratio, WIP, team growth.
- Manager/team-lead competency framework and evidence-based assessment.
- Data-quality dashboards, review calibration, configurable scoring policies (optional).
- Export, retention controls, HR oversight roles where approved.

## Phase 3 — Productization
- Multi-organization configuration (logical tenant separation), versioned KPI catalog, reusable role templates.
- Integration plug-in architecture, advanced analytics, optional self-hosted AI summaries with human review.
- Performance and scale testing, disaster recovery, upgrade/rollback tooling.

---

# 4. UX / INFORMATION ARCHITECTURE

**Design principles:** one left navigation; context breadcrumb `Organization / Group / Team / Person`; clear status cards; trends before scores; every KPI opens a `How calculated?` drawer; always show sample size, data freshness and caveats; keyboard accessible, responsive, RTL-compatible where feasible; Hebrew and English labels supported by localization files; no external fonts/CDNs.

## Screens
1. **Home / My View:** context-aware landing page, KPIs, trends, pending reviews, next actions.
2. **Organization Overview:** authorized aggregate groups, cross-team trends, confidence indicators.
3. **Group Overview:** teams, team lead ownership, improvements/risks, drill-down.
4. **Team Overview:** flow/quality KPIs, member list (permission gated), review completion, blockers.
5. **Developer Profile:** grade, experience, work mix, individual trends, competencies, reviews, goals.
6. **Reviews:** manager monthly form, self-review (Phase 2), history and status.
7. **KPI Catalog:** definition, business rationale, exact SQL/pseudocode, source mapping, examples, limitations, version.
8. **Admin:** groups/teams/users/assignments/grades, integrations, field mapping, status mapping, data health, sync jobs, config.
9. **Audit & Operations (admin):** sync history, errors, security events, last successful update.

## KPI card minimum
`name`, `current value`, `unit`, `direction`, `comparison period`, `delta`, `sample size`, `data freshness`, `confidence`, `how calculated`, `possible next action`.

## UX states
- Loading, empty, permission denied, source unavailable, insufficient sample, stale data, partial mapping, provisional results, successful sync.
- Never show missing metrics as zero. No fabricated sample values in production; demo data must be visibly labeled.
- Aggregation must not allow reidentification of private individuals in small groups.

---

# 5. AUTHENTICATION AND AUTHORIZATION

**Identity:** Keycloak OIDC Authorization Code + PKCE; secure cookie/BFF or other reviewed browser-safe session pattern; validate issuer, audience, signature, expiry, nonce/state, and redirect URI. Never store client secrets in browser code. TLS in production. Keycloak provides authentication; EPI DB owns organizational authorization.

**Hierarchy:** Organization → Groups → Teams → Members. Users may have multiple assignments. Model membership and grade history with effective dates; manager assignments may cover multiple scopes.

## Roles and scopes
| Role | Read | Write |
|---|---|---|
| Developer | Own private data; approved team aggregate | Own self-review and goal updates |
| Team Lead | Assigned teams and their members | Monthly reviews for assigned members |
| Group Manager | Assigned groups, teams, members | Reviews/approvals as policy permits |
| Engineering Manager | Assigned organization/group scope | Authorized management actions |
| Admin | Settings, user mapping, sync status | Manage users, scopes, integrations; **no automatic private reviews** |
| HR Partner (later) | Explicitly scoped reviews | Review-cycle administration |

**Enforcement:** all list/detail/search/export/report/API routes apply server-side scope filtering. Object IDs are never trusted as authorization. Private review contents are separate permissions from aggregate metrics. Group aggregates suppressed if fewer than a configurable minimum (default 5 people), or if inference is possible from filters. Include cross-team and historical reassignment tests. All admin and review mutations audited.

**Minimum security tests:** developer cannot read peer review; team lead cannot read another team; group manager cannot read another group; admin without review privilege cannot read private review; guessed ID and API filter tampering do not bypass permissions; suppressed small-group aggregates remain suppressed in exports.

---

# 6. DATA MODEL (IMPLEMENT AS MIGRATIONS)

Use PostgreSQL, SQLAlchemy 2, Alembic, and Pydantic. Design migrations and constraints before exposing API. Suggested tables:

- `organizations(id, name)`
- `org_groups(id, organization_id, name)`
- `teams(id, group_id, name, active)`
- `users(id, keycloak_sub UNIQUE, display_name, email, active)`
- `team_memberships(id, user_id, team_id, effective_from, effective_to)`
- `role_assignments(id, user_id, role, scope_type, scope_id, effective_from, effective_to)`
- `professional_grades(id, code, label, ordinal)`
- `grade_history(id, user_id, grade_id, effective_from, effective_to, experience_months_at_start)`
- `external_identities(id, user_id, source, external_id, verified, UNIQUE(source,external_id))`
- `integration_connections(id, kind, name, endpoint, enabled, config_json, secret_ref)`
- `sync_cursors(id, connection_id, resource, cursor, last_success_at)`
- `sync_runs(id, connection_id, started_at, finished_at, status, counts_json, error_summary)`
- `work_items(id, connection_id, external_key, project_key, issue_type, work_type, assignee_user_id, complexity_class, story_points, status, created_at, started_at, done_at, updated_at, raw_json, UNIQUE(connection_id,external_key))`
- `work_events(id, work_item_id, external_event_id, field_name, old_value, new_value, event_at, UNIQUE(work_item_id,external_event_id,field_name))`
- `merge_requests(id, connection_id, project_external_id, mr_iid, author_user_id, linked_work_item_id NULL, created_at, merged_at, state, raw_json, UNIQUE(connection_id,project_external_id,mr_iid))`
- `review_events(id, merge_request_id, external_event_id, event_type, actor_user_id, event_at, raw_json, UNIQUE(merge_request_id,external_event_id))`
- `sprint_commitments(id, sprint_external_id, work_item_id, committed_at, committed_weight, done_by_sprint_end)`
- `competency_definitions(id, code, name, description, role_family)`
- `grade_competency_expectations(id, grade_id, competency_id, expected_level, behavioral_anchors_json)`
- `review_cycles(id, period_start, period_end, status, review_type)`
- `assessments(id, cycle_id, subject_user_id, reviewer_user_id, independence_1to5, growth_1to5, evidence, status, submitted_at)`
- `assessment_competencies(id, assessment_id, competency_id, score_1to5, evidence)`
- `development_goals(id, user_id, owner_user_id, title, description, due_at, status, evidence, created_at, completed_at)`
- `kpi_definitions(id, code, version, title, description, formula_text, direction, scope, minimum_sample, active)`
- `kpi_snapshots(id, entity_type, entity_id, period_start, period_end, kpi_code, formula_version, value, unit, sample_size, confidence, provisional, calculated_at, UNIQUE(entity_type,entity_id,period_start,period_end,kpi_code,formula_version))`
- `audit_events(id, actor_user_id, action, resource_type, resource_id, at, metadata_json)`

Use separate EPI and Keycloak databases/users. Encrypt secrets at rest using platform-approved secret store; never store plaintext tokens in `config_json`. Index time and external-ID fields. Define deletion/retention policy with organization approval.

**Identity and historical attribution:** store effective-dated membership and grades. Attribute events based on event time and explicit policy. Do not silently rewrite old team metrics when people move teams.

---

# 7. INTEGRATION CONTRACTS: MCP FIRST WHEN PRACTICAL, REST FALLBACK

Provide a common internal interface:

```python
class EngineeringSource(Protocol):
    def test_connection(self) -> ConnectionHealth: ...
    def list_projects(self) -> list[Project]: ...
    def fetch_work_items(self, since: datetime | None, cursor: str | None) -> Page[WorkItem]: ...
    def fetch_work_events(self, external_key: str) -> list[WorkEvent]: ...
    def fetch_merge_requests(self, since: datetime | None, cursor: str | None) -> Page[MergeRequest]: ...
    def fetch_review_events(self, project_id: str, mr_iid: str) -> list[ReviewEvent]: ...
```

Not every method applies to every source; capability flags must report support. Use idempotent upserts, pagination, retries with bounded backoff, rate limits, checkpoints, and overlapping lookback. Failed sync must not advance the successful cursor.

## Jira Data Center
- Discover server version and REST/Agile capabilities at runtime.
- Common REST endpoints: `/rest/api/2/search`, `/rest/api/2/field`, `/rest/api/2/issue/{key}` with changelog retrieval supported by that deployment; Agile endpoints `/rest/agile/1.0/board`, `/sprint`, `/issue` where available.
- Never hardcode Story Points custom field ID; discover it and let admin confirm mapping.
- Admin-configurable status categories: To Do / In Progress / Blocked / Review / QA / Done. Capture history, not just current status.
- Discover project/board scope and sprint configuration; handle scope changes.
- Sprint commitments must be snapshotted at sprint start going forward. Historical commitments only when reliably reconstructable; otherwise N/A.

## GitLab self-managed 18+
- Verify **exact** version and edition; MCP availability is not guaranteed merely by major version 18.
- REST fallback: `/api/v4/projects`, `/projects/:id/merge_requests`, `/projects/:id/merge_requests/:iid`, `/discussions`, related events where available.
- Map GitLab users to EPI identities using verified IDs; do not rely solely on display names.
- Link MRs to Jira by configurable issue-key regex in branch/title/description; store confidence and allow manual override.
- Review latency definition requires actual reviewer request time if available; otherwise show a distinctly labeled proxy (`MR opened → first human review`) and do not claim it measures request-to-review.
- Exclude bot comments, author self-comments, and non-substantive system notes.

## MCP decision rule
1. Discover whether an approved, locally runnable, maintained, permissively licensed MCP server exists and works in the specific environment.
2. Verify tool coverage, pagination, read-only scope, auth, deployment, and reliability.
3. Use MCP only if it **reduces** implementation/operations effort without losing required data.
4. Otherwise use official REST APIs through the same adapter contract.
5. No LLM required to invoke MCP; avoid arbitrary tool execution and overprivileged MCP servers.

## Backfill
- Target 6 months of history; incremental daily sync thereafter.
- Use 48-hour overlap (configurable) plus periodic reconciliation for late edits.
- Surface mapping coverage, missing events, stale data, and limitations in UI.

---

# 8. KPI CATALOG — EXPLICIT AND AUDITABLE

For every KPI, implement a versioned definition with: purpose, unit, population, numerator/denominator, source fields, event-time rules, exclusions, minimum sample, calculation pseudocode/SQL, examples, direction, caveats, and tests.

## KPI-01: Cycle Time (individual and team)
**Question:** How long does work take once started?  
**Definition:** Median elapsed calendar days from first valid `In Progress` transition to `Done` for completed work items in the selected window. Report by work type and complexity; show blocked/review time separately when available. Exclude invalid/negative intervals.  
**Formula:** `median((done_at - started_at) / 86400 seconds)`.
**Example:** 5 completed items with 2, 3, 4, 6, 9 days → median = 4 days.
**Interpretation:** Lower can be better **only if** quality and work mix remain comparable.  
**Minimum:** 10 comparable items for a confident trend; 5–9 low confidence; <5 no trend.

## KPI-02: Work Item Aging (team/group)
**Question:** Which open work is stuck?  
**Definition:** At snapshot time, age in days since entering active work for items not Done. Report median, P85, and list of oldest items.  
**Formula:** `age_days = (snapshot_time - started_at)/86400`.  
**Example:** open ages 2, 3, 5, 8, 20 → median 5 days; high tail flags 20-day item.  
**Caveat:** Use a consistent work type/status policy; exclude planned backlog items never started.

## KPI-03: Review Waiting Time (individual/team collaboration)
**Question:** How long does a review request wait?  
**Preferred:** median hours from explicit reviewer request to first meaningful human reviewer response.  
**Fallback (different KPI code):** `MR_OPEN_TO_FIRST_REVIEW` = first meaningful human review minus MR creation.  
**Example:** 4, 8, 12 hours → median 8 hours.  
**Caveat:** Never interpret reviewer waiting time as author productivity; track team process and contributor role.

## KPI-04: Defect Rework Rate (Phase 2)
**Formula:** `100 * unique completed items with confirmed defect-driven rework / eligible completed items`.  
Deduplicate reopened issues, QA returns, and linked defects. Exclude scope changes. Use 30-day maturation window and provisional flag before maturity.

## KPI-05: Sprint Predictability (Phase 2, team only)
**Formula:** `100 * committed complexity weight completed by sprint end / complexity weight committed at sprint start`.  
Requires authentic commitment snapshot. Story points only within consistent team estimation practice; do not compare raw points across teams.

## KPI-06: Blocked Time Ratio (Phase 2)
**Formula:** `100 * total time in Blocked / total active cycle time` for eligible items with reliable status history. Document overlapping states.

## KPI-07: Independence (monthly manager rubric)
1: substantially dependent; 2: frequent guidance; 3: meets grade expectations; 4: above-grade autonomy; 5: demonstrates and develops others. Require concrete evidence and grade context. This is **human judgment**, not telemetry.

## KPI-08: Growth (monthly manager rubric + goals)
1–5 anchored relative to agreed development plan. Goal completion shown separately as `completed due goals / due goals`; N/A if no goals due. Do not convert qualitative ratings into objective engineering measures.

## Complexity normalization
- Use Story Points only if a team's estimation practice is stable and coverage/consistency is sufficient; expose a configurable reliability decision with evidence.
- Otherwise classify Small / Medium / Large, illustrative weights 1 / 2 / 4, **not** absolute measures of effort.
- Compare medians within `(work_type, complexity_class)` strata; for composite team trends, use a fixed reference mix with enough observations per stratum.
- Grade/seniority controls competency expectations, **not arbitrary multipliers to output**. Tenure is context, not an automatic score adjustment.

## Trend detection
- Show monthly values and recent 90-day window versus preceding non-overlapping 90-day window, only when both are available.
- Relative change = `(recent - previous)/abs(previous)*100`; invert direction in interpretation for lower-is-better KPIs; guard against zero baseline.
- Configurable exploratory threshold ±8% and minimum sample; not a statistically validated significance test.
- Trigger `needs attention` on meaningful sustained deterioration, or faster cycle time alongside worse quality. Label as **hypothesis for investigation**, not causal conclusion.
- Show missing-data and confidence states. Never produce performance ratings from insufficient samples.

---

# 9. API DESIGN (INITIAL)

Use `/api/v1`. OpenAPI auto-generated and versioned. Endpoints:

```
GET  /health/live
GET  /health/ready
GET  /api/v1/me
GET  /api/v1/organization/tree
GET  /api/v1/groups
GET  /api/v1/groups/{id}
GET  /api/v1/teams
GET  /api/v1/teams/{id}
GET  /api/v1/developers/{id}
GET  /api/v1/kpis?entity_type=team&entity_id=...&window=90d
GET  /api/v1/kpis/catalog
GET  /api/v1/kpis/{code}/explanation
GET  /api/v1/reviews?scope=mine
POST /api/v1/reviews
PUT  /api/v1/reviews/{id}
GET  /api/v1/goals?user_id=...
POST /api/v1/goals
GET  /api/v1/admin/integrations
POST /api/v1/admin/integrations/test
POST /api/v1/admin/sync
GET  /api/v1/admin/sync-runs
GET  /api/v1/admin/data-quality
```

Add CRUD for groups, teams, membership, role assignments, grade templates, and competencies under admin routes. Enforce authorization in service layer and query filters. Paginate every list; validate input; structured error messages with correlation IDs; no token leaks.

---

# 10. CONFIGURATION AND ONE-COMMAND INSTALL

## Config file (`epi.yaml`)

```yaml
app:
  public_url: "https://epi.internal.example"
  language: "en"
  timezone: "Asia/Jerusalem"
  mode: "production"
security:
  tls_mode: "external-ingress"
  minimum_aggregate_size: 5
  session_idle_minutes: 30
keycloak:
  issuer_url: "https://sso.internal.example/realms/epi"
  client_id: "epi-web"
  # secrets injected via environment / secret store
jira:
  enabled: true
  base_url: "https://jira.internal.example"
  project_keys: ["ENG"]
  story_points_field: "auto-detect"
  auth_secret_ref: "EPI_JIRA_TOKEN"
gitlab:
  enabled: true
  base_url: "https://gitlab.internal.example"
  project_ids: []
  auth_secret_ref: "EPI_GITLAB_TOKEN"
  prefer_mcp: true
sync:
  backfill_months: 6
  daily_hour_local: 2
  overlap_hours: 48
kpis:
  minimum_sample: 10
  trend_threshold_pct: 8
```

## Required CLI behavior
- `./epi doctor --config epi.yaml`: validate CPU/RAM/disk, Docker, ports, DNS, TLS chain, config, secret refs, image availability, outbound dependencies, source reachability and permissions. Print PASS/WARN/FAIL with remediation.
- `./epi init`: create template config, example secrets file with placeholders, local directories; never generate weak production secrets silently.
- `./epi up --demo`: start local demonstration and seed synthetic data.
- `./epi up --config epi.yaml`: pull/load pinned images, run migrations, provision **dedicated** Keycloak realm/client (only with authorized admin credentials), start services, verify health and display URL.
- `./epi bundle --output epi-offline.tar`: export pinned OCI images and deployment manifests; include SHA-256 manifest, SBOM/license inventory, versions and offline documentation.
- `./epi up --offline --bundle ... --config ...`: install without network egress; verify checksums, fail if missing dependencies.
- `./epi backup`, `./epi restore`, `./epi upgrade`, `./epi down` with safe confirmations and documentation.

## Packaging requirements
- Pin image digests and Python/JS dependencies with lockfiles; build on connected host, deploy offline.
- Do not fetch assets, icons, fonts, maps, JS, or telemetry at runtime.
- Use health checks, restart policies, named persistent volumes, resource limits, non-root where possible, secrets via file mounts or secret manager.
- Internal CA bundle support for Jira/GitLab/Keycloak; no `verify_ssl=false` shortcuts.
- Docker Compose is the **first-class one-command install**. Provide optional Helm chart after Compose is proven; do not require K8s to demo or pilot.
- Keycloak and PostgreSQL must be backed up and recoverable. Document how to connect to an existing corporate Keycloak instead of creating another instance.
- Test install on clean Linux VM with **network egress disabled** and only internal DNS/registry/source systems reachable.

---

# 11. SKILLS AND TOOLS CLAUDE MUST CHECK

These are **capability requirements**, not assertions that any Claude skill is preinstalled. Claude must enumerate actual tools and install/enable only approved ones.

| Capability / skill | Purpose | Required at phase |
|---|---|---|
| Product requirements / backlog decomposition | Convert spec to stories and acceptance tests | 0 |
| Full-stack Python/FastAPI/SQLAlchemy/Alembic | API, data model, migrations, KPI engine | 1 |
| React/TypeScript/Tailwind/shadcn/ui | Single cohesive frontend | 1 |
| UX accessibility / responsive design | Self-explanatory, keyboard accessible UI | 1 |
| PostgreSQL and query optimization | Event history, aggregations, RBAC filtering | 1 |
| Keycloak / OIDC security | Login, token/session safety, roles | 1 |
| Jira Data Center REST/MCP research | Workflow history and Agile field mapping | 0–1 |
| GitLab self-managed REST/MCP research | MR/review events and identity mapping | 0–1 |
| Docker/Compose and offline packaging | One-command on-prem installation | 1 |
| Kubernetes/Helm | Optional production environment | 2 |
| Testing: pytest, Playwright, integration/security tests | Reproducibility, RBAC, UX flows | 1 |
| Threat modeling / privacy | Sensitive employee data, audit, retention | 0–1 |
| Technical writing | Install/runbook/API/KPI documentation | all |

**Recommended local tooling:** Claude Code, Git, Python 3.12+, Node LTS, Docker Engine + Compose, PostgreSQL, Playwright browsers pre-bundled for offline CI, pytest, Ruff, mypy, ESLint, TypeScript, Trivy or equivalent offline vulnerability scan, Syft or equivalent SBOM tool. Versions must be pinned and verified for license/security compatibility.

**MCP tools to discover, not assume:** filesystem/repository access, Git, Jira DC MCP server, GitLab MCP server, container orchestration. MCP servers must be approved, read-only where possible, locally runnable, and scoped to minimum privileges. If unavailable, use local CLI/official REST instead. Never install arbitrary MCP servers from unverified sources.

---

# 12. PERMISSIONS AND PREREQUISITES — ASK UP FRONT

Claude must present **one consolidated readiness request** with owner, why needed, scope, whether mandatory, and how to provide securely:

## A. Local development and repository
- Write access to a new Git repository and ability to create branches/MRs; approval before merges to protected branch.
- Local terminal, Docker/Compose, disk space, ability to install approved dependencies.
- Permission to run local test containers and bind ports.
- Access to approved offline package mirrors or a connected build machine for bundle creation.

## B. Jira Data Center (read-only)
- Base URL, exact version, TLS CA certificate, project/board IDs, test issue keys.
- Service account/token with read access to project issues, status changelog, custom fields, sprint/board data, issue links; **no write scopes**.
- Description of status workflows, Story Points field, issue types, work-type mapping, privacy boundaries.
- Approval to ingest 6 months of metadata into EPI.

## C. GitLab self-managed (read-only)
- Base URL, exact 18.x version and edition, TLS CA certificate, relevant groups/projects.
- Service token with minimum API read permissions to MRs, discussions, reviewers, relevant metadata; **no repository write scopes**.
- Branch naming conventions and Jira issue key conventions.
- Permission to test MCP capabilities and approved self-hosted MCP server, if any.

## D. Identity and authorization
- Permission to create a **dedicated Keycloak test realm/client**, or an existing IdP client; issuer URL, redirect URLs, test users.
- Org chart: organization, groups, teams, employee IDs, managers, roles, grades, historical membership where available.
- Security owner to approve who can view private reviews, aggregation suppression policy, and admin access.

## E. Infrastructure
- Target OS/CPU/RAM/storage, Docker/Compose availability, Kubernetes optional, network architecture.
- Internal DNS name, ingress/TLS certificates, allowed ports, firewall routes to Jira/GitLab/IdP, internal CA chain.
- Container registry/mirror access, persistent storage, backup target, logging and monitoring destination.
- Approval for secrets store or secure environment variable injection; **never paste secrets into chat or commit them**.

## F. Product and privacy decisions
- Pilot teams, number of users, approved data retention period, data controller/HR/privacy approval.
- Whether individuals can see team aggregates and minimum aggregation threshold.
- Default grading levels, manager review rubric, and language requirements.
- Explicit permission to use real employee data in development/test; otherwise use anonymized or synthetic data.

**First output required:** a table with `Requirement | Mandatory? | Owner | Least privilege | Why | Status | Secure handoff method`, plus a single concise request for all missing prerequisites.

---

# 13. DEVELOPMENT BACKLOG — DEPENDENCY ORDER

Each story must include test cases and demonstration evidence. Estimates are **rough developer-days**, not commitments.

| ID | Priority | Deliverable | Estimate | Dependencies |
|---|---|---|---:|---|
| EPI-001 | P0 | Repository, ADRs, docs, CI checks | 0.5 | none |
| EPI-002 | P0 | Compose, config, doctor, demo seed | 1.5 | 001 |
| EPI-003 | P0 | Keycloak login/session and auth tests | 1.5 | 002 |
| EPI-004 | P0 | Org tree, memberships, RBAC, audit | 2.5 | 003 |
| EPI-005 | P0 | Unified UI shell, navigation, design system | 1.5 | 003 |
| EPI-006 | P0 | Jira collector + field/status mapping | 2.5 | 002 |
| EPI-007 | P0 | GitLab collector + MR/review mapping | 2.0 | 002 |
| EPI-008 | P0 | Identity mapping + ingestion quality view | 1.0 | 006,007 |
| EPI-009 | P0 | 3 KPI calculations + explanation drawer | 2.0 | 006,007,008 |
| EPI-010 | P0 | Org/group/team/person dashboards | 2.5 | 004,005,009 |
| EPI-011 | P0 | Monthly manager assessment form | 1.5 | 004,005 |
| EPI-012 | P0 | Offline bundle, install tests, security/UAT | 3.0 | all P0 |
| EPI-013 | P1 | Competency matrices and self-review | 3.0 | 011 |
| EPI-014 | P1 | Development plans and review cycles | 3.0 | 013 |
| EPI-015 | P1 | Rework, predictability, blocked-time KPIs | 3.0 | 009 |
| EPI-016 | P1 | Lead/manager evaluations, calibration | 3.0 | 014 |

**Reality check:** P0 totals ~21.5 developer-days before uncertainty; with one developer starting 2026-10-13, a full P0 by 2026-11-02 is **not reliably feasible**. Treat November 2 as **pilot kickoff** with an agreed subset: login/RBAC, org hierarchy, demo or live Jira Cycle Time, one dashboard, KPI explanation, install path. Complete remaining P0 in subsequent iterations. Do not hide schedule risk or drop security controls to meet a date.

**Fallback sequence:** live integration may initially be Jira-only; GitLab review KPI follows. Demo remains fully functional. All deferred items explicitly marked in UI and release notes.

---

# 14. DEFINITION OF DONE AND ACCEPTANCE TESTS

## Functional
- A group manager can log in, navigate to an assigned group/team/developer, see authorized metrics, and submit a monthly assessment.
- A developer can see only their private profile/reviews, plus permitted aggregates.
- Every KPI has an accessible explanation and sample size. Clicking a KPI shows underlying evidence summary without leaking unauthorized data.
- Historical charts distinguish real, provisional, and synthetic data.

## Data quality
- Two identical sync runs do not duplicate records or change results.
- Missing data remains N/A; stale data is visibly flagged.
- Reconcile at least 20 Jira work items and 10 GitLab MRs against source (when access exists).
- Unit tests cover time zones, empty samples, zero denominator, status loops, reopened work, unmapped identities, team transfers, MR with multiple reviewers, bot comments.
- 90-day trends computed from raw observations, not averaged monthly medians.

## Security
- Negative RBAC tests pass at both UI and API levels; IDOR tests included.
- No tokens, passwords, or review contents in application logs.
- TLS validated; secure session management; CSRF protection where applicable.
- Least-privilege read-only Jira/GitLab accounts; audit trail for review changes and role assignment.
- Privacy owner signs off retention and employee-data processing before real-data pilot.

## UX
- Core workflows usable without training; explanatory microcopy and tooltips.
- Keyboard accessible; mobile/tablet layouts; proper loading/error/empty states.
- No routine workflow requires opening Keycloak/Jira/GitLab/DevLake/Frappe.

## Operations / offline
- Clean installation via one command with pre-provided config and secrets.
- Clean install tested with internet egress blocked; no runtime CDN or package downloads.
- Backup/restore tested; restart retains data; migration and rollback documented.
- `doctor` identifies missing permissions, source access, TLS, disk, ports, and image availability.
- Images pinned; SBOM and license inventory provided; vulnerability review recorded.

## Documentation
- `README.md`, `docs/READINESS.md`, `docs/ARCHITECTURE.md`, `docs/KPI_CATALOG.md`, `docs/SECURITY.md`, `docs/OFFLINE_INSTALL.md`, `docs/OPERATIONS.md`, `docs/TEST_REPORT.md` current and reproducible.

---

# 15. EXECUTION PROMPT FOR CLAUDE CODE

Copy the following into Claude Code **together with this file**:

> Read `EPI_Lite_Claude_Master_Spec.md` in full. Act as lead product engineer and implement EPI from scratch in this repository. Start by auditing available tools and skills and produce `docs/READINESS.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/DECISIONS.md`, and a consolidated, least-privilege request for every missing permission or configuration. Do not ask for secrets in chat. Use synthetic data to begin immediately. Build the smallest secure vertical slice with one EPI UI, Keycloak, org/team RBAC, one real or mock Jira KPI, transparent KPI explanation, and one-command Docker Compose demo. Add GitLab, reviews, offline packaging, and broader KPIs in dependency order. Use MCP for Jira/GitLab only if locally available and verified to simplify the implementation; otherwise use official REST. Maintain tests and documentation, run checks after each step, and explicitly distinguish implemented/verified from planned/unverified. Never compromise authorization or fabricate production metrics to meet the schedule. Ask for approval before destructive operations, deployment to shared infrastructure, or ingestion of real employee data.

---

# 16. DECISION LOG — LOCKED DEFAULTS

- **Single UI:** Yes; all daily user flows in EPI.
- **Core code:** Open Source; select compatible licenses, inventory dependencies.
- **Deployment:** On-prem; air-gap install is mandatory.
- **Auth:** Keycloak (dedicated realm or existing approved instance).
- **Data sources:** Jira Data Center and GitLab self-managed 18+.
- **MCP:** preferred only where proven; REST fallback required.
- **Database:** PostgreSQL for custom EPI application.
- **Review cadence:** monthly manager check-in; fuller quarterly review later.
- **Seniority:** combined professional grade and experience context; no arbitrary productivity multiplier.
- **Complexity:** reliable Story Points; otherwise S/M/L.
- **History:** six months, with confidence flags.
- **Measurement purpose:** individual and team improvement, not employee ranking.
- **Pilot:** two teams, November 2 kickoff target, one developer; phase-gated delivery.
- **AI:** optional later; no cloud LLM dependency.

**End of specification.**
