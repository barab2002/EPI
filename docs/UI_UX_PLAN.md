# UI/UX plan (UX-01)

Goal: one calm, Apple-level design system across EPI (`DESIGN.md`) without breaking any journey,
following `UI_UX_MASTER_PROMPT.md`. Each slice runs Design → Implement → Critique (Impeccable) →
Audit (Vercel) → Browser test (Playwright, 4 widths) → Fix → Retest, then CI → PR → merge.

## Primary journeys (must keep working; covered by e2e)

1. Sign in (demo person or SSO) → role-appropriate home.
2. Team lead: home → team → KPI "How calculated?" → member → write/submit monthly assessment.
3. Group/engineering manager: organization → group → team drill-down; small-team suppression.
4. Developer: own KPIs and assessments; peers not visible.
5. Admin: integrations/sync, identity mapping, statuses, data quality, organization, people, audit.

## Slices (priority order)

| # | Slice | Scope | Acceptance |
|---|---|---|---|
| 1 | Foundation + shell | Tokens (§3), base elements, links, tabular numerals, buttons/inputs/segmented, responsive shell (sidebar ≥1024, top bar below, scrollable nav), role names, Intl dates. Fixes UX-001/002/004/005/006/008/010/011/014(part). | No horizontal overflow at 320/390/768/1440/1920 on all routes (automated); existing unit/web/e2e green; captures reviewed. |
| 2 | KPI surfaces | Section + KPI tile redesign (no nesting), auto-fit grid, facts row, sheet (side/bottom) for "How calculated?". Fixes UX-003/007/012. | Same + drawer keyboard test (focus trap, Esc, return focus). |
| 3 | Home + login | Calm home (managed teams as a list, my KPIs), sign-in page with identity and grouped roles. UX-013/015. | Same. |
| 4 | Reviews + assessment | Form fields, rubric, evidence, states. | e2e assessment flow green; field errors announced. |
| 5 | Administration | Tabs single row, field groups, tables, flash messages. UX-009/002(admin). | admin e2e green ×3. |
| 6 | Audit & docs | Full Vercel audit, contrast table, refresh `docs/screenshots/` + SCREENSHOTS.md, close issues. | No open Critical/High; Medium documented. |

Out of scope unless asked: new features, a component library dependency (Tailwind/shadcn — ADR-004/026),
web fonts, Hebrew translation (separate backlog item; layout stays RTL-safe).
