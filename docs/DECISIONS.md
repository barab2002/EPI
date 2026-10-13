# Architecture & product decisions (ADR log)

Format: ID · date · status · decision · rationale · consequences. Newest last.

## ADR-001 · 2026-10-12 · Accepted (owner confirmed 2026-10-12) — Backend in NestJS (TypeScript) instead of FastAPI

- **Context:** Master Spec §2/§6/§11 names FastAPI + SQLAlchemy/Alembic/Pydantic. The project owner's standing preference is JS/TS with **NestJS and Swagger**, and there is one developer who must maintain the code.
- **Decision:** `epi-api` is NestJS 11 (TypeScript 5.9) with `@nestjs/swagger` for the generated, versioned OpenAPI document, TypeORM 0.3 with **hand-written SQL migrations** for PostgreSQL, and `class-validator` DTOs in place of Pydantic.
- **Why:** one language across frontend and backend; the owner can maintain it; every spec requirement (OpenAPI, migrations, RBAC service layer, ingestion jobs, KPI engine) is covered. Licenses: NestJS MIT, TypeORM MIT, pg MIT.
- **Consequences:** Spec references to Python tooling (pytest, Ruff, mypy, `Protocol`) map to Jest, ESLint/Prettier, `tsc --noEmit` and TS interfaces. The architecture shape is unchanged: single API + single UI + PostgreSQL + Keycloak. Owner confirmed NestJS on 2026-10-12.

## ADR-002 · 2026-10-12 · Accepted — Doc set: CLAUDE.md list is canonical

- **Conflict:** Spec §0 asks for `READINESS.md`, `IMPLEMENTATION_PLAN.md`, `PROGRESS.md`, `OPEN_QUESTIONS.md`; CLAUDE.md/CLAUDE_START.md ask for a different set.
- **Decision:** Keep CLAUDE.md's set. `READINESS.md` holds the tool inventory and GO/NO-GO verdict; `ACCESS_REQUIREMENTS.md` holds the consolidated request **and** open questions; `BACKLOG.md` holds the implementation plan; `PROJECT_STATE.md` + `IMPLEMENTATION_LOG.md` replace `PROGRESS.md`. Avoids duplicate documents.

## ADR-003 · 2026-10-12 · Accepted — Monorepo with pnpm workspaces

`apps/api` (NestJS), `apps/web` (React 19 + Vite 7 + TypeScript). One lockfile (`pnpm-lock.yaml`) pins everything, which is needed for offline builds. No shared package until duplication justifies it.

## ADR-004 · 2026-10-12 · Accepted — No Tailwind/shadcn in slice 1; plain CSS design tokens

Spec suggests Tailwind/shadcn. For the first slice a small hand-written CSS token system (light/dark, RTL-safe logical properties) and inline-SVG sparklines avoid a build plugin, a component generator and a chart library. Revisit if UI surface grows enough to justify them. No external fonts/CDNs (offline).

## ADR-005 · 2026-10-12 · Accepted — Auth: server-side session (BFF) with OIDC; demo login only in demo mode

- Production: Keycloak OIDC Authorization Code + PKCE handled **by the API** (`openid-client`); the browser only receives an opaque `HttpOnly; SameSite=Lax; Secure` session cookie. Sessions stored in PostgreSQL. Mutations require a CSRF header token.
- Demo mode (`EPI_MODE=demo`): a "choose synthetic user" login that is **refused at startup unless mode=demo**, so seeded RBAC can be demonstrated without Keycloak. Keycloak in Compose arrives with EPI-003.
- Authorization never comes from the IdP's roles: the EPI DB owns role assignments and scopes (spec §5).

## ADR-006 · 2026-10-12 · Accepted — CI: local script first; GitLab CI file provided, no public CI

Remote is currently GitHub (`barab2002/EPI`). Spec forbids relying on public CI. `scripts/ci.sh` is the single source of checks; `.gitlab-ci.yml` calls it for an internal runner. No GitHub Actions workflow is added without approval.

## ADR-007 · 2026-10-12 · Accepted — Test stack

API: Jest + ts-jest + supertest; integration tests against a real PostgreSQL 16 (`EPI_TEST_DATABASE_URL`, started by `scripts/test-db.sh` via Docker). Web: Vitest + Testing Library + jsdom. E2E: Playwright (pre-installed Chromium) — added with EPI-010.

## ADR-008 · 2026-10-12 · Accepted — KPI engine as pure functions

KPI math lives in `apps/api/src/kpi/engine` with no DB or framework imports, so formulas are unit-tested exhaustively and the explanation endpoint can show the exact implementation version. Snapshots are computed from raw observations (spec §14: 90-day trends from raw observations, never from averaged monthly medians).

## ADR-009 · 2026-10-12 · Accepted — Container images via mirror in this dev environment

Docker Hub returns HTTP 429 from this sandbox; `mirror.gcr.io/library/*` works. Compose files reference images through an `EPI_IMAGE_REGISTRY` variable (default `docker.io`) so an internal registry/mirror can be substituted without editing files. Production images must still be pinned by digest (EPI-012).

## ADR-010 · 2026-10-12 · Accepted — KPIs computed on request in slice 1

For pilot scale (2–4 teams, ≤6 months) KPI cards are computed per request from raw events, so results always match the current formula version and need no backfill job. `kpi_snapshots` (already in the schema) will be filled by a scheduled job when history charts or scale require it.

## ADR-011 · 2026-10-12 · Accepted — Developer KPI page shows flow KPIs only

Review Waiting Time is shown for team/group/org only. Spec: never interpret reviewer waiting as the author's productivity; showing it on a person's page invites that reading.

## ADR-012 · 2026-10-12 · Accepted — Commits authored solely by the project owner

Per the owner's standing instruction ("any change … under my name only"), commits use the owner's GitHub identity via repo-local git config and carry no co-author trailer.

## ADR-013 · 2026-10-12 · Accepted — License: Apache-2.0

Owner delegated the choice. Apache-2.0: permissive, OSI-approved, explicit patent grant, compatible with the MIT/ISC/BSD/Apache dependencies used so far (NestJS, TypeORM, React, Vite, pg). `LICENSE` + `NOTICE` at repo root; dependency license inventory (SBOM) follows in EPI-012.

## ADR-014 · 2026-10-12 · Accepted — Hourly resume via a Claude Code Routine in this cloud environment

Owner approved the hourly resume scheduler. The dev container is ephemeral (reclaimed when idle), so an in-container cron would not survive. The scheduler is therefore a Claude Code Routine (`EPI hourly resume`, trigger `trig_01KXpTGZKMatHx36donkyqXL`, minute :32 hourly) that wakes the same session; queued wakes cannot overlap a running turn. Its prompt applies the same guards as `scripts/resume.sh`: skip when blocked/awaiting approval/complete, one bounded task, feature branches only, no merges/PRs/network exposure/real data without explicit approval, stop after a repeated failure. `scripts/setup_scheduler.sh --approved` remains the mechanism for an always-on on-prem host. Stop: ask in chat or delete the Routine.

## ADR-015 · 2026-10-12 · Accepted — OIDC as BFF with openid-client v6; no token storage

- `openid-client` (MIT, OpenID-certified) handles discovery, PKCE, code exchange and ID-token validation. It is ESM-only; Node 22 loads it from the CommonJS build natively, and Jest transpiles only it and its two dependencies (`oauth4webapi`, `jose`) for tests.
- No access/refresh/ID tokens are stored; EPI only needs identity. Trade-off: Keycloak shows a logout confirmation (no `id_token_hint`).
- No auto-provisioning; mapping by `sub`, optional verified-e-mail linking (default off).
- Real deployments point to the corporate/dedicated Keycloak via `deploy/compose.oidc.yaml`; tests use an ephemeral Keycloak on the host. (Demo bundling: ADR-016.)

## ADR-016 · 2026-10-12 · Accepted — Demo bundles a dev-mode Keycloak with generated users

Owner has no Keycloak and asked for ready-made users. `./epi.sh demo` adds `deploy/compose.demo-sso.yaml`: Keycloak 26.3.3 in dev mode (file DB in a volume), realm `epi-demo` generated per install by `scripts/kc-demo-realm.mjs` with one user per demo role, random passwords and client secret kept only in `.epi/keycloak/` (0700, gitignored) and shown by `./epi.sh credentials`. Users link to synthetic EPI people by verified e-mail (enabled in demo only; the seed leaves `keycloak_sub` empty). Split-horizon issuer solved with `EPI_OIDC_INTERNAL_URL` (openid-client `customFetch`): browser uses `127.0.0.1:8081`, EPI's back channel uses `keycloak:8080`, the issuer stays the public URL. `/auth/login` restarts on `EPI_PUBLIC_URL` when opened under another host name so the binding cookie and callback share a host. Not for real users: production uses the organization's Keycloak.

## ADR-017 · 2026-10-12 · Accepted — Jira collector: REST, metadata only, relative JQL

- **REST, not MCP** (spec §7 MCP rule): no approved, locally runnable Jira DC MCP server is available; REST through the `EngineeringSource`-style client is deterministic and testable. Revisit if one is approved (B8).
- **Metadata only:** no summary/description/comments are requested or stored (`title`, `raw_json` stay NULL). Drill-down shows issue keys.
- **Relative JQL time** (`updated >= "-Nm"`) avoids the Jira user-time-zone ambiguity of absolute JQL dates; 48 h overlap absorbs late edits.
- **Status mapping by status ID** (names can be renamed), inferred from Jira status categories, admin-overridable; admin rows are never overwritten.
- **Attribution:** current assignee (documented limitation). Story Points stored only when the field is confirmed or unambiguous.
- **Tests:** an in-process fake Jira DC server (synthetic data, documented response shapes, fault injection) — real-instance reconciliation (spec §14: 20 issues) awaits access B1–B3.

## ADR-018 · 2026-10-12 · Accepted — GitLab collector: REST, review events from system notes

- **REST v4, not MCP** (no approved local GitLab MCP server; same rule as ADR-017). Token scope `read_api` only.
- **Reviewer-request time** comes from GitLab's "requested review from @…" system notes (GitLab ≥ 13.8), one event per requested reviewer; this enables the preferred KPI-03 definition rather than the proxy. Approvals come from "approved this merge request" system notes; all other system notes are dropped as non-substantive.
- **Metadata only:** titles, descriptions and note bodies are never stored; bodies are read in memory only to classify system notes.
- **Bots:** GitLab `bot` flag, project/group bot naming, well-known bot names and a configurable list.
- **Unmapped reviewers:** requests and notes keep the GitLab user ID (`actor_external_id`), so waits are measured for the author's team even before every reviewer is mapped; individual attribution still requires a verified identity.
- **Shared sync-run helpers** (`ingestion/sync-runs.ts`) enforce the same cursor/overlap/one-run rules for Jira and GitLab.

## ADR-019 · 2026-10-12 · Accepted — Identity mapping by verified source IDs, re-attributing history

- People are linked to Jira/GitLab accounts only through explicit `external_identities` set by an administrator (or verified-e-mail SSO linking, ADR-016) — never by display name (spec §7).
- Collectors store external IDs on records (`assignee_external_id`, `author_external_id`, `actor_external_id`) and list seen accounts in `source_accounts` (display names kept only for the admin mapping screen), so a mapping made later re-attributes existing data and an unmapping removes attribution; both are audited.
- One account per person and source; bot accounts cannot be mapped.
- Data quality is a first-class admin page: freshness (stale after 26 h), mapping coverage, MR-to-Jira link rate, statuses without category.

## ADR-020 · 2026-10-13 · Accepted — Organization administration safeguards

- Administrators manage structure, people, memberships, roles and grades, but **cannot change their own roles or deactivate themselves**: otherwise an admin could grant themselves a manager role and read private reviews, which spec §5 forbids. A second administrator must do it (two-person rule).
- At least one active administrator always remains (checked in the service, below the API's self-change rule).
- No hard deletes: memberships, roles and grades end with a date; teams are deactivated only when empty. Transfers end the old membership at the new start instant in one transaction, so historical KPIs stay attributed to the team at the time.
- Deactivating a person revokes their sessions immediately. Audit entries record which fields changed, never personal values.

## ADR-021 · 2026-10-13 · Accepted — In-process daily sync scheduler with a database claim

- **Decision:** a minute timer inside `epi-api` (`SyncScheduler`) runs all enabled Jira/GitLab connections once a day at an admin-set local hour and IANA time zone. No cron container, queue or extra service (lean architecture, one-command install).
- **Once per day:** the run is claimed with a conditional `UPDATE app_settings … WHERE lastRunDate < <local date>`, so several API processes sharing one database never double-run, and editing the schedule after today's run does not trigger a second one. "At or after the hour" gives same-day catch-up after downtime; keying by local date makes DST gaps and repeated hours run exactly once.
- **Safety:** off by default (admin opt-in); sequential runs (gentle on Jira/GitLab rate limits); existing one-running-sync guard per connection; failures are isolated and never advance cursors; audited with counts only. `EPI_SYNC_SCHEDULER=off` disables it per process for operators who prefer an external scheduler calling the CLI.
- **Settings store:** new `app_settings` table (key → non-secret JSON) for admin-editable runtime settings.

## ADR-022 · 2026-10-13 · Accepted — Read-only audit-log viewer for administrators

- **Decision:** admins get `GET /api/v1/admin/audit-events` (filters: exact action or `prefix.`, actor, from/to; newest first; opaque keyset cursor on `(at, id)` with microsecond timestamps, so paging never skips or repeats events with equal times) and `GET /api/v1/admin/audit-actions`, shown as an "Audit log" tab. Spec §4.9 "Audit & Operations".
- **Privacy:** audit metadata never holds review text or personal values (ADR-020). For `assessment.*` events the viewer additionally withholds the subject and resource ID — admins see who acted and when, never about whom (spec §5: administrators do not see private reviews).
- **Read-only:** no edit/delete endpoint exists; the table stays append-only. Retention/export are later work (needs an owner decision on retention period).

## ADR-023 · 2026-10-13 · Accepted — Offline bundle: pinned images, docker save/load, checksums

- **Pins:** node (build base), PostgreSQL and the demo Keycloak are pinned by multi-arch index digest in `deploy/images.lock`; `epi.sh`, the test scripts and `.gitlab-ci.yml` use the pins and `scripts/check-pins.sh` (CI) keeps them in sync. `scripts/pin-images.sh` refreshes them deliberately.
- **Bundle:** one tar per CPU architecture with the EPI image, the pinned images re-tagged `epi-bundle/*` (platform-specific `docker save`), Compose files, `epi.sh`, docs, `THIRD_PARTY_LICENSES.md` and `SHA256SUMS`, plus a sidecar `.sha256`. No registry, Node or pnpm needed on the target.
- **Install:** `offline-install` verifies the outer and inner checksums, loads images, checks each loaded image's identity (manifest or config digest recorded at bundle time) and writes `deploy/offline.env` so the installation only uses bundled images (`pull_policy: never`). It does not start services; the operator chooses demo or production.
- **Why not a private registry or OCI layout tool:** `docker save/load` exists on every Docker host and needs no extra component (lean architecture). Signing (cosign/GPG) is planned once a tool is approved; until then the sidecar hash must come through a trusted channel.
- **Licenses:** `scripts/license-report.mjs` (CI) fails on any production dependency license outside a reviewed permissive allowlist.

## ADR-024 · 2026-10-13 · Accepted (owner answers) — Pilot deployment shape

Owner answers (chat, 2026-10-13), recorded so later sessions don't re-ask:

- **Sources:** Jira Data Center + GitLab Self-Managed, reachable **only on the internal network** → EPI runs on an internal Linux server with Docker; this cloud session never connects to them. Real-system checks are done by the owner with scripted commands and pasted (non-secret) output.
- **Delivery:** internal registry mirror exists (`EPI_IMAGE_REGISTRY`), but code arrives as a **file**: the owner builds `./epi.sh bundle` on their own connected machine and copies the `.tar` + `.sha256` to the server (`offline-install`).
- **Sign-in:** users log in with **AD credentials** through an **EPI-bundled production Keycloak** federated read-only to AD over **LDAPS** (read-only bind account from IT; password only in a root-only secret file). Replaces the demo Keycloak for real use.
- **People & teams:** imported from AD — **one existing AD group per team**; only those groups' members are imported. **Roles (team lead, managers) are assigned in EPI**, not derived from AD.
- **Tokens:** Jira = owner's personal PAT for the pilot (replace with a service account afterwards); GitLab = group/project access token (Reporter, `read_api`). Tokens live only in secret files on the server.
- **Policy:** retention **24 months** with automatic deletion; privacy minimum stays **5** until HR/privacy answers (C7); HR/privacy sign-off still required before real data (B7). Languages **English + Hebrew**. Grades **Junior/Mid/Senior/Tech Lead**. No SBOM/CVE scanner for the pilot (C11). Pilot start **2026-11-02**.

## ADR-025 · 2026-10-13 · Accepted — Production sign-in: bundled Keycloak federated read-only to AD

- **Decision:** `deploy/compose.sso.yaml` runs Keycloak 26 (pinned) in **production mode** with its own `keycloak` database and role in EPI's PostgreSQL (created idempotently by `epi.sh`), behind the customer's TLS front end (`KC_PROXY_HEADERS=xforwarded`). Realm `epi` is generated by `scripts/kc-prod-realm.mjs` from a non-secret `sso.conf` and imported on first start.
- **Directory:** LDAP user federation, `READ_ONLY`, LDAPS required, truststore from the customer CA file, bind password via Keycloak's **file vault** (never in the realm JSON, env or Git), user filter = members of the configured team groups (AD: `LDAP_MATCHING_RULE_IN_CHAIN` for nested groups; disabled accounts excluded), group mapper limited to those groups (input for EPI-004c). No local users, registration or password reset.
- **Linking:** unchanged EPI rule — no auto-provisioning; people link by verified e-mail (directory e-mail trusted) or `sub`.
- **Why bundled rather than "EPI talks LDAP":** Keycloak already does secure LDAP auth, brute-force protection and OIDC; EPI keeps one auth path (OIDC BFF, ADR-015). Cost: one more container (~1 GB RAM limit).
- **Tests:** realm unit tests (node:test, in CI); `scripts/e2e-sso-ldap.sh` with a synthetic OpenLDAP (pinned test image, test CA, AD-style `member`/`memberOf`) — browser sign-in, refusal cases, no stored credentials. AD-specific filters (nested groups, disabled accounts) are unit-tested only; verify against the real AD in the pilot install.
- **Limits:** realm changes after the first start need the admin console until `sso-apply` exists; the Keycloak database is not yet included in `./epi.sh backup` (state is rebuildable from the realm file and AD).

## ADR-026 · 2026-10-13 · Accepted — UI/UX master prompt adopted, reconciled with offline rules

- **Decision:** `docs/UI_UX_MASTER_PROMPT.md` (owner-provided) is the standard for all UI/UX work: one authoritative design system in `docs/DESIGN.md`, the Design → Implement → Critique → Audit → Browser test → Fix loop, WCAG 2.2 AA target, screenshots at 390/768/1440/1920 px, and the `UI_UX_*` records in `docs/`.
- **Conflicts resolved (CLAUDE.md and the Master Spec win):**
  - No web fonts or CDNs (air-gapped): the system font stack, which is SF Pro on Apple devices.
  - No Apple assets or branding.
  - Keep React + Vite + plain CSS tokens (ADR-004) instead of the prompt's "new project" stack. Tailwind, shadcn/ui, Lucide or Motion are adopted only via an ADR with a license check and a clear benefit.
- **Skills:** the five named skills are third-party code. They are installed only after their code is reviewed and the owner approves; until then their roles are done manually and reported as manual. Playwright is already present.
- **Scheduling:** UI work enters the plan after the pilot-critical items (EPI-004c, 012c, retention, Hebrew), or earlier if the owner asks. Hebrew/RTL work will follow the new design system.

## ADR-027 · 2026-10-13 · Accepted (owner: "I want skills") — Five UI/UX skills installed as reviewed project skills

- **What:** `.claude/skills/{ui-ux-pro-max, frontend-design, impeccable, web-design-guidelines, webapp-testing}`, committed to the repo so every session (including after container resets) has them. Each folder has `SOURCE.md` (upstream, commit, license, review notes, local changes) and the upstream license.
- **Review (before installation):** all code read in an isolated scratch clone; nothing executed from it except UI UX Pro Max's offline search script (stdlib Python, local CSV/JSON only, no network). Licenses: MIT (UI UX Pro Max, Vercel) and Apache-2.0 (Anthropic skills, Impeccable), compatible with EPI's Apache-2.0.
- **Deliberate deviations (documented, not silent):**
  - **Impeccable:** guidance only. Its launcher downloads and runs a prebuilt binary that cannot be reviewed, so the launcher, its browser-injection scripts and its edit hooks are not installed. The skill's own "launcher unavailable" path is used.
  - **Vercel Web Design Guidelines:** the rule list is vendored (`guidelines.md`, commit `434b7f9`) instead of being fetched at run time. This works offline and stops remote content from steering reviews.
  - **Playwright role:** Anthropic's `webapp-testing` skill (Playwright-based) is used with the project's existing Node Playwright; no Python Playwright install.
- **Activation:** Claude Code registers project skills at session start; the session that installed them reads their `SKILL.md` directly and says so.
- **Hygiene:** vendored files are excluded from Prettier but **included** in the secret scan (passes).

## ADR-028 · 2026-10-13 · Accepted — KPI disclaimer stays on every KPI section (UX-032)

- **Context:** the critique flagged the sentence "KPIs describe how work flows. They are not individual performance scores and must be read with context." as repeated when a page shows several KPI sections (e.g. a developer's home: own KPIs and team aggregate).
- **Decision:** keep it on every KPI section, next to the window dates. The caveat must travel with the numbers it qualifies: a section is often read, screenshotted or shared on its own, and the product's ethical-measurement rule (CLAUDE.md non-negotiable 6) outranks the cost of one secondary line. It is set in secondary footnote text so it does not compete with the values.
- **Revisit:** with the owner/HR during the pilot if users report it as noise; a shorter per-section form plus one full statement per page is the fallback.

## ADR-029 · 2026-10-13 · Accepted — Contrast checked in CI from the real tokens

- `scripts/check-contrast.mjs` reads the light and dark tokens from `apps/web/src/styles.css`, composites translucent tokens, and fails CI when a pair falls below WCAG 2.2 AA (text 4.5:1, input edges 3:1 per 1.4.11). Tested with `node --test`.
- It found input borders at 1.47:1 (light) and 1.76:1 (dark). Inputs now use `--input-border` (≥3.1:1); buttons keep the lighter `--field-border` because their text identifies them.
- No new dependency (axe-core would need approval).

## ADR-030 · 2026-10-13 · Accepted — AD team import: EPI reads AD directly; mapped teams follow their group; preview then apply

- **Source:** EPI reads the configured team groups over LDAPS with the same read-only bind account Keycloak uses (`ldapts`, MIT), instead of Keycloak's admin API, which would need a realm-management role. Only name, e-mail, username and the stable ID (objectGUID / entryUUID) are read; AD nested groups count, disabled accounts are excluded.
- **Authority:** a group mapped to an EPI team decides that team's membership; teams without a group stay managed by hand and are never touched. People are matched by directory ID, then by e-mail (so SSO links them on first sign-in). Two groups may feed one team.
- **Deliberate deviation from NEXT_ACTIONS ("deactivation when removed"):** leaving a team group ends the membership only; nobody is deactivated or reactivated automatically (leaving a team ≠ leaving the company; deactivation revokes sessions and stays an administrator decision). Roles are never imported (owner decision ADR-024).
- **Safety:** preview reads and plans without changing anything; apply re-reads the directory, re-plans inside one transaction under an advisory lock and runs only if the plan's SHA-256 equals the previewed one (else 409 "preview again"). Ambiguous people (two teams, shared e-mail, inactive in EPI, e-mail linked to another directory account) are skipped and listed. Every change is audited with `source: directory`; `directory.import` records the counts.
- **Manual for the pilot:** no scheduled import yet (can reuse the daily-sync schedule later).
- **Found while wiring:** `epi.sh` loaded `sso.conf` with `source`, which cut `EPI_LDAP_TEAM_GROUPS` at `;` and would fail on DNs with spaces (`OU=Service Accounts`). Replaced by a literal `KEY=value` reader that matches the realm generator (test: `scripts/epi-conf.test.mjs`).

## ADR-031 · 2026-10-13 · Accepted — `./epi.sh upgrade`: backup, migrate on start, automatic rollback

- **Scope:** installations made from a bundle (`EPI_OFFLINE`), matching the owner's delivery (a copied file, ADR-024). Source checkouts use `git pull && ./epi.sh build && ./epi.sh start`.
- **Flow:** verify the bundle (outer `.sha256`, inner `SHA256SUMS`, image identities) → refuse the same version and older base versions (no down-migrations; restore a backup instead) → `pg_dump` of `epi` (and `keycloak` with AD sign-in) → load images → replace only the installation files (state in `.epi/` and `backups/` untouched; previous files kept) → `start` (the image's entrypoint runs migrations) → health check.
- **Rollback:** on any start/health failure: previous files back, `public` schema dropped and recreated, backup restored (so objects created by the failed version also go), previous version started; the failed version's logs are kept. Data written between the backup and the rollback is lost (documented: upgrade at a quiet time).
- **Self-replacement:** `upgrade` re-executes from a temporary copy of `epi.sh` because bash reads scripts while running and the upgrade replaces `epi.sh` itself.
- **Test hooks:** `scripts/bundle.sh` accepts `EPI_BUNDLE_VERSION` and `EPI_BUNDLE_SOURCE_IMAGE` (used only by `scripts/test-upgrade.sh` to bundle a deliberately broken release).
- **Not in CI:** the test builds three bundles (~6 min); it runs before release like `test-offline-install.sh`.

## ADR-032 · 2026-10-13 · Accepted — Data retention: 24 months, daily, source activity and logs only

- **Owner decision (ADR-024):** keep data 24 months with automatic deletion. `EPI_RETENTION_MONTHS` (default 24; 13–240; `off`). The 13-month floor keeps the 6-month backfill, 180-day KPI windows plus their comparison window, and a year of audit history.
- **Deleted when older than the cutoff (now − months, UTC calendar months):** Jira work items by last update (with status history; links from kept merge requests are cleared), merge requests by merge/creation date (with review events), sync runs, stored KPI snapshots, source accounts not seen since, audit entries. Expired sessions and sign-in requests are deleted at any age.
- **Kept (deliberately):** assessments and review cycles, people, memberships, roles, grades, identity mappings. Deleting assessments or people is an HR/privacy decision (B7/C7); until HR answers they follow the organization's HR records policy, not this job. **Open question for the owner/HR.**
- **How:** one transaction per run, counted with `WITH … DELETE … RETURNING`, audited as `retention.run` (counts only); daily in-process job claimed once per UTC day (safe with several processes); disabled with the other in-process jobs by `EPI_SYNC_SCHEDULER=off`. CLI `retention --dry-run` / `retention`. Administration › Data quality shows the window, what is due and the last run. No delete button in the UI.

## ADR-033 · 2026-10-13 · Accepted (owner: "set all the URLs in the UI") — Administration › Settings

- **Editable in the UI:** Jira and GitLab connections — add, change address, projects, token secret name, on/off — and a read-only "Test connection" with the server-side token. Replaces the CLI (`jira-add`/`gitlab-add` still work).
- **Not editable in the UI (owner choice):** EPI's address, sign-in (Keycloak) and the AD directory are shown read-only; they change on the server (`./epi.sh sso-setup`), so a browser session can never redirect sign-in and EPI needs no Keycloak admin rights. Privacy minimum and retention are shown read-only (server settings).
- **Tokens never in the browser:** they stay in files referenced by `<NAME>_FILE`; the page only shows whether the file is present.
- **Token-exfiltration guard:** EPI sends the token to the configured address, so: https only (http only in demo mode), no credentials/query in the URL, every change audited (host before/after), and an optional server allow-list `EPI_SOURCE_HOSTS` (recommended in production) that a browser session cannot change.

## ADR-034 · 2026-10-13 · Accepted (owner) — Minimum group size 3

- The small-group privacy threshold (`EPI_MIN_AGGREGATE_SIZE`) defaults to **3** (was 5): viewers who only see aggregates get no numbers for teams of fewer than 3 people. Managers of the members still see their own people. Answers C7's threshold question; HR/privacy sign-off for real data (B7) is still required.

## ADR-035 · 2026-10-13 · Accepted — Hebrew interface: per-user language, right-to-left, staged

- **Owner decision (ADR-024):** English + Hebrew. Each user picks the language (sidebar / sign-in page switch, "English | עברית"); it is saved to the account (`users.locale`, `PUT /api/v1/me/locale`) and remembered on the browser before sign-in; with nothing saved, the browser language decides.
- **How:** one typed catalog per language in `apps/web/src/i18n.ts` (the compiler rejects a missing Hebrew key); `tf()` for placeholders; dates and numbers through `Intl` with `he-IL`; `<html lang dir>` set on change, layout already uses CSS logical properties; numbers/percentages isolated so signs stay correct in RTL; people, team and product names stay as entered.
- **Stages:** (1) infrastructure + every manager/developer screen; (2) the administration area — done: its own typed catalog `pages/admin/i18n-admin.ts` (~430 texts, Hebrew singular forms may say "one" in words), audit action and resource names translated; (3) KPI definitions/explanations and server messages (import conflict reasons, API errors), which come from the server (until then English, laid out with `dir="auto"`).
- **Checks:** unit tests (placeholders match across languages, Hebrew formatting, switch sets RTL and saves), integration test for the saved preference, and the layout guard runs in Hebrew at six widths.

## ADR-036 · 2026-10-13 · Accepted — Jira/GitLab tokens and company CA on the server (`.epi/sources`)

- **Problem:** connections added in Administration › Settings name a token reference (e.g. `EPI_JIRA_TOKEN`), but the Compose stack passed no `<REF>_FILE` to the app container, so Test connection, Sync now and the scheduler would report the token missing; internal Jira/GitLab CAs (`NODE_EXTRA_CA_CERTS`) were documented but not wired either.
- **Decision:** one installation directory `.epi/sources/` (0755 inside the 0700 state dir, files 0644 so the non-root container user reads them — same model as the DB secret) mounted read-only at `/run/epi-sources`. `resolveSecret` order: `<REF>_FILE` → `$EPI_SOURCE_SECRETS_DIR/<ref in lower case>` → `<REF>`. `./epi.sh source-token <REF>` reads the token without echo (or from stdin), never as an argument; `./epi.sh source-ca <pem>` stores the company CA (refuses non-PEM and private keys); `NODE_EXTRA_CA_CERTS=/run/epi-sources/ca.pem`, empty by default (Node loads an empty file silently). A new reference set in Settings needs no Compose change.
- **Evidence:** unit tests (order, messages, name validation), script tests (modes, no echo, refusals), offline install test proves the running container reads the token and trusts a test CA only through `NODE_EXTRA_CA_CERTS`.
- **Not in backups:** tokens are secrets and stay out of `./epi.sh backup`; re-enter them after a restore on a new server.
