# EPI — Persistent instructions for Claude Code

This file is intentionally committed to the EPI repository. Read it **at the start of every session**. Read `EPI_Lite_Claude_Master_Spec.md` for complete product requirements and `CLAUDE_START.md` for the execution mandate. These three files must remain consistent; document conflicts in `docs/DECISIONS.md`.

## Product north star

Build **one self-hosted, open-source, air-gap-capable Engineering Performance & Improvement application**, not several user-facing tools. The product combines organizational hierarchy, employee/manager evaluations, competencies, improvement plans, explainable engineering KPIs, and trends. Jira DC and GitLab Self-Managed are data sources. Keycloak can be a hidden identity service. Optimize for useful manager decisions, clarity, privacy, and minimal operating complexity — **not AI features or developer rankings**.

## Non-negotiables

1. **One UI**, intuitive navigation: organization → group → team → developer; polished responsive states.
2. **No mandatory cloud or runtime internet**; offline install and operation must be verified.
3. **One-command installation** with prerequisites, safe configuration, health checks, backup/restore, and meaningful errors.
4. **Secure scoped RBAC**, enforced server-side and tested for cross-team/group leakage, exports and APIs.
5. **Explainable KPIs**: exact formula, version, source, window, sample size, confidence/limitations and reproducible example. N/A when data is insufficient; never invent precision.
6. **Ethical measurement**: do not score or rank developers from commits, LOC or raw Story Points; account for role, complexity, work type and human evidence.
7. **Lean architecture**: prefer Master Spec stack; avoid unnecessary microservices and user-facing products. Confirm licenses and compatibility before adopting components.
8. **No secrets in Git**, logs, checkpoints, prompts, or test fixtures. Use least-privilege credentials and approved secret storage.
9. **No unapproved destructive or production actions**. Ask before unattended scheduler enablement, privileged access, real employee data, network exposure, or production deployment.
10. **Do not report success without evidence**. Execute tests and record real outcomes.

## UI/UX standard

Before any UI work, read `docs/UI_UX_MASTER_PROMPT.md` (owner's Apple-level UI/UX guide, 2026-10-13) and its EPI notes at the top: offline rules win (system fonts, no CDNs, no Apple assets), the existing React + Vite + CSS-token stack stays (ADR-004/ADR-026), the five reviewed UI/UX skills live in `.claude/skills/` (ADR-027; re-review before updating them), and the UI records live in `docs/DESIGN.md`, `docs/UI_UX_PLAN.md`, `docs/UI_UX_PROGRESS.md`, `docs/UI_UX_ISSUES.md`, `docs/UI_UX_TESTS.md`.

## Project layout and working records

Keep these documents up to date, creating them when absent:

- `docs/ACCESS_REQUIREMENTS.md` — consolidated access/approval checklist; distinguish blockers from later needs.
- `docs/ARCHITECTURE.md` — components, data flows, security boundaries, deployment.
- `docs/DECISIONS.md` — ADR-style decisions and rationale.
- `docs/BACKLOG.md` — prioritized tasks and acceptance criteria.
- `docs/PROJECT_STATE.md` — what actually works now.
- `docs/NEXT_ACTIONS.md` — ordered actionable tasks.
- `docs/RESUME.md` — exact recovery point and next action.
- `docs/TEST_STATUS.md` — commands, timestamps, results, unresolved failures.
- `docs/GIT_STATE.md` — branch, commit SHA, last successful push, unpushed work, MR status.
- `docs/IMPLEMENTATION_LOG.md` — concise milestones and changes.
- `docs/RISKS.md` — significant risks and mitigations.

Avoid long repetitive logs. The Git history contains detailed change history; docs should summarize what the next session needs.

## Start-of-session checklist

1. Read `CLAUDE_START.md`, Master Spec, and this file.
2. Read `docs/RESUME.md`, `docs/PROJECT_STATE.md`, `docs/NEXT_ACTIONS.md`, `docs/GIT_STATE.md`, `docs/TEST_STATUS.md` if present.
3. Inspect `git status`, branch, recent commits, remote, and local processes. Do not overwrite existing work.
4. Reconcile docs with the actual code and test results.
5. Select the highest-priority safe, unblocked backlog item and continue. Ask for blocking decisions together.

## Git policy

- `main` is stable/protected. Use short-lived `feature/*`, `fix/*`, `test/*`, `chore/*` branches. Use `develop` only if project complexity justifies it.
- For each task: **PLAN → BRANCH → TEST → CODE → VERIFY → COMMIT → PUSH → CHECKPOINT**.
- Conventional Commits. Small, coherent commits. Keep unrelated changes separate.
- Push **every meaningful verified commit** to the configured, approved remote feature branch. Push before pauses and session end where possible.
- Push is not merge. Do not auto-merge protected branches, force-push, reset hard, clean untracked work, or bypass required reviews.
- If push is unavailable, retain local commits and record the exact reason; never claim remote backup succeeded.
- GitLab CI on an approved internal runner when available; otherwise equivalent local scripts.

## Testing policy

- Tests accompany implementation. Prefer test-first for KPI calculations, permissions, and ingestion.
- Unit: KPI formulas, trends, normalization, confidence, validation.
- Integration: DB/migrations, Jira/GitLab mock API responses, pagination, retries, incremental sync, idempotency.
- Security: authentication, role/scope isolation, direct API access, export leakage, privilege escalation.
- Frontend: navigation, forms, loading/empty/error states, accessibility basics.
- End-to-end: login, drill-down, evaluation, goals, logout.
- Deployment: demo, clean install, offline install, backup/restore, upgrade smoke test.
- Run affected tests before each meaningful commit and required checks before merge. Record actual commands and results in `docs/TEST_STATUS.md`.

## Checkpoint discipline

After each completed task and before session end update:

- Completed task and acceptance evidence.
- Branch, commit SHA and **confirmed** push status.
- Files changed and tests run (pass/fail).
- Blockers and decisions.
- **Next exact action**, with commands/files and validation method.

Persist in `docs/RESUME.md`, `docs/PROJECT_STATE.md`, `docs/GIT_STATE.md`, and `docs/TEST_STATUS.md`. Commit/push checkpoint changes as appropriate. A new session must be able to resume without previous chat context.

## Optional hourly resume automation

Implement but **do not enable without explicit approval**. Use `scripts/check_status.sh`, `scripts/resume.sh`, `scripts/setup_scheduler.sh`, `scripts/stop_scheduler.sh` and a native OS scheduler. At most once per hour; lock to prevent concurrency; skip active sessions; honor provider usage limits; use only supported Claude Code CLI/auth mechanisms; bounded retries; stop on errors/approvals/completion; log outcomes. Do not invent a token-balance API or bypass usage limits. A running host is required.

## Build order

1. Phase 0: access inventory, architecture, demo skeleton, Git/test/recovery discipline.
2. Pilot vertical slice: identity + RBAC, org hierarchy, mocked then real ingestion, Cycle Time / Review Waiting Time / Work Item Aging, KPI explanations, unified drill-down, short manager assessment.
3. Broader evaluations, competency and growth plans, additional quality/team KPIs, history and productization.
4. Hardening: offline bundle, upgrade, backup/restore, deployment and security tests.

Keep scope realistic for the 2026-11-02 stretch pilot. If needed, explicitly reduce pilot features instead of bypassing testing or privacy controls.

## Response format at milestones

Report: **Done / Evidence / Git branch & SHA / Tests / Push & MR status / Blockers / Next task**. Be concise, specific, and truthful.
