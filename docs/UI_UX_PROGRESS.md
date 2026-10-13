# UI/UX progress

## 2026-10-13

- **Done:** skills installed and reviewed (PR #16, ADR-027); baseline captures (40) and analysis;
  `DESIGN.md` design system; issues UX-001…015; plan (6 slices).
- **Branch / commit:** `feature/ui-pass` (see `git log`).
- **Skill use (honest):** UI UX Pro Max search script **run**; Impeccable, frontend-design,
  web-design-guidelines and webapp-testing **followed by reading their SKILL.md/references** (not yet
  registered as skills in this session).
- **Slice 1 done:** tokens (`styles.css` per DESIGN.md §3), responsive shell (sidebar ≥1024 px, compact top bar below, scrollable nav with fade), links, tabular numerals, buttons/inputs/segmented control, KPI strip (no nested cards), KPI sheet (icon close, focus trap, bottom sheet on mobile, Intl dates), role names, authored icons/mark, copy tells removed, all tables wrapped. Layout guard `e2e/layout.spec.ts` (13 routes × 6 widths).
- **Evidence:** web unit 33/33; demo e2e 6 passed (20 skipped by design); admin e2e 2/2 ×2; 40 post-slice captures reviewed (team, mobile, tablet admin, sheet).
- **Slice 1 merged:** PR #17.
- **Slice 2 done:** Impeccable critique (dual sub-agents, 27/40) → 13 fixes (UX-019…031): group team overview, URL-persisted window with dates, neutral individual trends, consistent breadcrumbs, org hierarchy, `PageTitle`, contrast/focus/touch fixes, catalog list, skeletons, N/A reasons, copy. Skills **invoked** this time (impeccable via Skill tool; the skills became available mid-session, without a restart).
- **Slice 2 merged:** PR #18.
- **Slice 3 done:** home leads with assessments to write (new API `GET /api/v1/reviews/due`, 5 integration tests: scope, alphabetical, draft→done, empty for developer/admin, group isolation, auth), team overview reused on home, context line under the greeting, admin home points to data quality; sign-in with product identity, purpose line, SSO divider, role hints. Fixed sidebar column height and phone KPI strip overflow.
- **Slice 3 merged:** PR #19.
- **Slice 4 done:** assessment form per Web Interface Guidelines (enabled actions, inline errors + focus, `aria-invalid`, submit note, unsaved-changes warning), draft prefill (fixes overwrite bug UX-038), per-cycle form visibility via `/reviews/due` (fixes UX-039), lasting confirmation, reviews page title/skeleton/section, no boxed empty states inside sections.
- **Slice 4 merged:** PR #20.
- **Slice 5 done:** administration per Web Interface Guidelines: stacked caption labels, People split into find/add groups, danger styling + confirmation for destructive actions, readable audit actions, one flash component, no middle dots left, org tree alignment, history lists; SSO sign-in button overflow at 320 px fixed (UX-045…052). Capture spec now covers every admin tab.
- **Slice 5 merged:** PR #21.
- **Slice 6 done:** Web Interface Guidelines audit of every page (sub-agent) → UX-053…064 (9 fixed incl. two real date bugs and double-submit protection, 3 low items open); contrast check in CI (ADR-029) fixed input borders; stacked team overview on phones (UX-037); disclaimer decision (ADR-028); committed screenshot spec and refreshed `docs/SCREENSHOTS.md`.
- **UX-01 status:** complete for the pilot. Open low items: UX-062…064.
