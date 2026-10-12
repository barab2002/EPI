# EPI — Claude Code execution mandate

> Read this document together with `EPI_Lite_Claude_Master_Spec.md` and `CLAUDE.md` before making changes. This is the execution mandate; the Master Spec is the product source of truth; `CLAUDE.md` is the persistent working policy. Do not silently override conflicts: record them in `docs/DECISIONS.md` and ask only when the choice materially changes product scope, security, cost, or architecture.

## Mission

Implement **EPI — Engineering Performance & Improvement** as **one unified, practical, responsive web product**. Users must not switch between multiple applications to manage organization structure, employees, competencies, self/manager assessments, growth plans, engineering metrics, trends, and drill-down explanations. Jira Data Center and GitLab Self-Managed are read-only sources, not user-facing workflows. Keycloak may be a behind-the-scenes identity component. Build a maintainable, self-hosted, open-source solution for a closed network with **one-command installation**, offline packaging, and straightforward configuration.

Do not add AI features merely for novelty. Prioritize reliable data, useful manager actions, clear UX, security, and an end-to-end working pilot. Treat 2026-11-02 as a stretch pilot milestone, not a promise of full product completion.

## Operating sequence — do this first

1. Read the complete Master Spec and `CLAUDE.md`; inspect the repository, Git status/remotes, available CLI tools, OS, Docker, runtime versions, MCP servers, installed skills, and network restrictions. Never assume tools or credentials exist.
2. Inventory reusable open-source components and verify licenses, support, maintenance, compatibility, and operational cost. Evaluate reuse vs. custom code pragmatically; retain **one EPI UI** regardless of internal dependencies. Do not switch stacks without a documented decision and approval when it changes the agreed architecture.
3. Create/update `docs/ACCESS_REQUIREMENTS.md` with **one consolidated upfront request** for missing access, approvals, skills, secrets-handling method, and infrastructure. Distinguish **blocking now**, **needed for real-data integration**, and **needed for production**. Never ask the user to paste passwords or tokens into Markdown or chat.
4. Produce `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/BACKLOG.md`, `docs/PROJECT_STATE.md`, `docs/NEXT_ACTIONS.md`, `docs/RESUME.md`, `docs/TEST_STATUS.md`, `docs/GIT_STATE.md`, `docs/IMPLEMENTATION_LOG.md`, and `docs/RISKS.md`. Keep them concise and truthful. Do not create unnecessary bureaucracy.
5. Define a prioritized, vertical-slice implementation plan, with acceptance criteria and realistic estimates. Implement safe, unblocked work using synthetic data while access is pending.
6. Ask for necessary human approvals in one batch, then proceed on all approved/unblocked tasks. **Do not stop after planning** unless genuinely blocked.

## Skills and tooling discovery

Check availability and fitness of: Python/FastAPI/SQLAlchemy/Alembic/PostgreSQL; React/TypeScript/Vite/Tailwind/shadcn/ui/charts; Keycloak/OIDC/PKCE/RBAC; Jira DC REST and GitLab Self-Managed REST/MCP; data ingestion and engineering metrics; Docker/Compose/Helm/offline bundles; pytest/Playwright/frontend test tooling; secure software supply chain; UX/accessibility; Git/GitLab CI. Use existing skills and supported MCP servers when useful, but never fabricate installations or rely on an LLM for deterministic data ingestion. If a skill is missing, use normal engineering practices or propose installation and request approval where appropriate.

## Required access inventory

Request/verify upfront: Git remote URL, branch protections and push/MR rights; Jira URL/version, read-only service account, projects, custom Story Points field, workflow mappings, history permissions; GitLab URL/exact version, project/group scope, read-only API token, MR discussions/review events access; Keycloak admin approval and OIDC realm/client strategy; on-prem VM/Kubernetes/Docker resources, internal registry, internal DNS/TLS/CA, proxy restrictions, offline dependency mirror; test users and org/team membership mapping; employee-data handling approval, retention and privacy policy. Mark unknowns; never invent values.

## Architecture and scope guardrails

- A single coherent product UI and navigation across organization > group > team > developer.
- Prefer the Master Spec's chosen stack and deployment model. Avoid extra services (Kafka, Redis, Celery, separate HR portal, Grafana UI) unless demonstrated necessary.
- Integrations must support pagination, incremental cursors, idempotent upserts, retries/backoff, partial links, data lineage, confidence, and missing-data handling. Support six-month backfill when possible without fabricating history.
- Start with Cycle Time, Review Waiting Time, Work Item Aging, and a short manager assessment; expand other KPIs later.
- Each KPI must expose its formula, version, source, sample size, measurement window, caveats, and a reproducible example. No automatic individual ranking based on commits, LOC, or raw Story Points.
- Backend-enforced hierarchical RBAC; test negative cross-team and cross-group access, including export and API paths. Respect least privilege and employee privacy.
- Provide sample/demo data, loading/empty/error states, responsive polished UI, and accessible interactions.
- Deliver `./epi.sh demo|install|start|stop|status|test|backup|restore|upgrade|offline-install` with honest behavior and useful diagnostics. An offline bundle must include all approved images/packages and install without runtime internet access.

## Development workflow — mandatory

For each backlog task follow:

**PLAN → FEATURE BRANCH → TEST DESIGN → IMPLEMENT → RUN TESTS → REVIEW → COMMIT → PUSH → CHECKPOINT → NEXT TASK.**

1. Inspect the working tree before any change; preserve preexisting work.
2. Use `main` as protected/stable; use `feature/<name>`, `fix/<name>`, `test/<name>`, `chore/<name>`. Add `develop` or release branches **only if useful**, not as needless process. Never code directly on protected `main`.
3. Write tests with the feature, preferably before business logic. Unit tests for KPI math, trends, normalization, and permissions; integration tests for DB/migrations, connectors, pagination/idempotency; API/RBAC tests; frontend tests; Playwright end-to-end flows; offline install, backup/restore and smoke tests.
4. Run relevant tests after each meaningful change. Before merge run lint, formatting, type checks, full affected test suite, build, migrations, secret scan, and security-negative tests where relevant. Record exact commands and outcomes. Never claim tests passed without running them.
5. Make small, coherent **Conventional Commits** (`feat:`, `fix:`, `test:`, `docs:`, `chore:`). Preserve incomplete work in a clearly marked WIP commit on a feature branch only if needed for safe recovery.
6. **Push every meaningful verified commit** to its remote feature branch, and push before switching branches, planned pauses, or session end when possible. Push is backup, not merge. Do not push secrets, force-push, bypass protections, or auto-merge to `main` without approved policy. If remote is absent or unreachable, retain local commits, log the blocker, and retry later; do not falsely report remote backup.
7. Use merge requests and GitLab CI on internal runners if available; otherwise provide equivalent local scripts. Never rely on public CI or unapproved internet dependencies.
8. Keep `docs/GIT_STATE.md` and `docs/TEST_STATUS.md` synchronized with actual commits, push results, and test evidence.

## Persistent memory and recovery

The repository, not the conversation, is the source of truth. Maintain:

- `CLAUDE.md`: stable working rules (edit deliberately).
- `docs/PROJECT_STATE.md`: milestone, implemented features, known limitations.
- `docs/NEXT_ACTIONS.md`: ordered, executable tasks with blockers.
- `docs/RESUME.md`: exact next command/task, branch, files, validation steps.
- `docs/DECISIONS.md`: architecture and product choices with rationale.
- `docs/TEST_STATUS.md`: tests actually run and results.
- `docs/GIT_STATE.md`: current branch/SHA, last confirmed push, pending commits/MRs.
- `docs/ACCESS_REQUIREMENTS.md`: missing accesses, approvals and owners.
- `docs/IMPLEMENTATION_LOG.md`: short chronological change record.

**Checkpoint after each completed task, before risky operations, and before session end.** Each checkpoint must identify: last completed task; changed files; current branch and SHA; tests and results; confirmed push status; blockers; next exact action; how to validate it. Avoid secret values. Commit and push checkpoint updates on the feature branch as appropriate.

At the start of any resumed session: read `CLAUDE.md`, Master Spec, `docs/RESUME.md`, `docs/PROJECT_STATE.md`, `docs/GIT_STATE.md`, `docs/TEST_STATUS.md`; inspect actual `git status`, log, branches, remote, running processes and tests. Reconcile documentation with reality; do not restart finished work or perform destructive Git recovery automatically.

## Optional hourly continuation scheduler — implement but DO NOT enable without approval

Create and test `scripts/check_status.sh`, `scripts/resume.sh`, `scripts/setup_scheduler.sh`, and `scripts/stop_scheduler.sh`, plus a documented `--dry-run` mode. Use a supported OS scheduler (systemd timer/cron or platform equivalent) and supported Claude Code CLI/auth methods only.

Required behavior:

- At most one check per hour; run only while an approved unfinished milestone exists.
- Acquire a process lock; never start overlapping Claude sessions.
- Detect ongoing work and skip when already active.
- Confirm repository and checkpoint integrity; identify pending commits/pushes.
- Use documented CLI behavior to attempt continuation when allowed; do not pretend to know token balance unless an official API provides it.
- If usage/rate limits prevent execution, exit safely, log a **bounded** retry for the next hourly check, and preserve all work. Treat ambiguous authentication/network errors as blockers, not token exhaustion.
- On permitted resumption, validate state, run relevant tests, continue the next unblocked task, commit, push, and checkpoint.
- Stop on human-approval boundaries, persistent errors, configured limits, or milestone completion.
- Provide start/stop/status commands and logging. Use least-privilege identity, explicit allowed directories, and bounded execution time.
- Do **not** bypass provider usage restrictions, rotate accounts, scrape tokens, or promise guaranteed unattended continuation.

**Ask me to approve scheduler enablement, permitted operations, schedule, environment and credentials before enabling it.** The scheduler requires an always-on machine/runner and cannot resume if the provider or local environment disallows it.

## Approval boundaries

Obtain explicit approval before: deploying to production; exposing ports or changing firewall/network policy; modifying production Jira/GitLab data; accessing or exporting real employee data; privileged account creation; installing unverified tools/MCP servers; destructive DB or Git operations; changing security controls; enabling unattended automation; or incurring new costs. Safe local code, mock data, documentation, tests, and non-destructive commits may proceed. Push only to a remote/branch approved for this project.

## Acceptance and reporting

For each milestone provide a short report with implemented scope, links/SHAs of branches and commits, test commands and pass/fail, push/MR status, blockers, remaining tasks, and next step. No fabricated metrics, tests, deployments, or completion claims. If schedule pressure rises, preserve correctness and security; reduce scope explicitly.

## START NOW

Read the three instruction files, perform environment and skill discovery, produce the consolidated access request and Phase 0 artifacts, establish Git/checkpoint discipline, then implement the first safe end-to-end vertical slice. Continue task by task until blocked by an approval, environment limitation, or a documented completion milestone. Always leave the repository in a recoverable state.
