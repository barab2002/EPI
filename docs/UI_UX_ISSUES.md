# UI/UX issues

Found in the baseline review (2026-10-13; 40 captures of 10 screens × 390/768/1440/1920 px via
`e2e/ux-capture.spec.ts`; critique per Impeccable craft floor/Operate, audit per Vercel guidelines).
Severity: **Critical** blocks a journey · **High** breaks layout/a11y for a device class · **Medium**
visible inconsistency or friction · **Low** polish. Close an issue only with evidence (test or capture).

| ID | Sev | Screen(s) | Issue | Evidence | Fix (DESIGN.md §) | Status |
|---|---|---|---|---|---|---|
| UX-001 | High | all, 390 px | Page scrolls sideways: document 424 px wide at 390 px viewport. Cause: mobile nav row (`ul.nav`, `white-space: nowrap`) neither wraps nor scrolls; demo banner visibly stops short. | probe: `scrollWidth 424 > 390` on `/`, `/kpis`, `/reviews` | §4 top bar, scrollable nav; automated no-overflow check | Fixed (slice 1) — `e2e/layout.spec.ts` passes at 320–1920 px on 13 routes |
| UX-002 | High | all, 768 px | Sidebar (250 px) takes a third of a tablet; admin tabs wrap to two rows; forms crowd. | `09-admin-people--tablet.png` | §4 sidebar only ≥1024; §5 tabs single scrollable row | Fixed (slice 1) — sidebar only ≥1024 px; tabs one scrollable row |
| UX-003 | Medium | home, team, group, org, developer | Cards nested in panels (KPI cards, team tiles inside sections): box-in-box noise. | `02-…`, `03-team--desktop.png` | §2.2 one container level; §5 KPI tile | Fixed for KPI sections and team tiles (slice 1); remaining pages in slices 2–5 |
| UX-004 | Medium | all | Every link underlined (names, "How calculated?", breadcrumbs): busy, not calm. | `03-team--desktop.png` | §5 Link | Fixed (slice 1) |
| UX-005 | Medium | sidebar | Raw role enum shown ("TEAM_LEAD", "ADMIN"). | all captures | §6 roles as words | Fixed (slice 1) — `roleLabel()` + unit test |
| UX-006 | Medium | KPI drawer | Mixed date formats ("15/07/2026" vs "12 Oct 2026"). | `04-kpi-drawer--desktop.png` | §6 one Intl date style | Fixed (slice 1) — sheet uses `formatDate` |
| UX-007 | Medium | KPI sections | Tiles fixed width leave empty space; fact rows wrap unevenly ("Data as of" drops a line when no trend). | `02-…--desktop.png` | §4 auto-fit grid, §5 KPI tile facts row | Fixed (slice 1) — auto-fit strip, aligned fact columns |
| UX-008 | Medium | numbers | KPI values, samples, table numbers not tabular; columns don't align. | captures | §3 tabular-nums | Fixed (slice 1) |
| UX-009 | Medium | admin forms | Inline label + inputs misalign and wrap ("New person [Full name] / [E-mail] Create"). | `09-admin-people--tablet.png` | §5 Input; stacked field groups | Open |
| UX-010 | Medium | mobile header | Brand + nav + user block take ~190 px before content. | `03-team--mobile.png` | §4 compact top bar | Fixed (slice 1) — compact top bar |
| UX-011 | Low | segmented control | Full blue fill on the active period is loud for a frequent, low-stakes control. | captures | §5 Segmented control | Fixed (slice 1) |
| UX-012 | Low | KPI drawer | Weak label/value hierarchy; text "Close" button; formula code wraps mid-token; no bottom sheet on mobile. | `04-kpi-drawer--*.png` | §5 Sheet | Fixed (slice 1) — icon close, side/bottom sheet, focus trap + return |
| UX-013 | Low | login | Long undifferentiated grid; no product identity; sign-in purpose unclear. | `01-login--desktop.png` | Slice 3 | Open |
| UX-014 | Low | copy | "…" written as "..." in placeholders ("Find a person..."); middle-dot meta strings ("Platform · 7 members"); "→" suffix on links (generic tells per frontend-design). | code grep | §6 Copy | Open |
| UX-015 | Low | brand | Generic "E" square mark; tagline wraps in sidebar. | captures | §5 | Fixed (slice 1) — authored mark, brand links home |

## Found during slice 1

| ID | Sev | Screen(s) | Issue | Status |
|---|---|---|---|---|
| UX-016 | High | 10 tables | Tables without a scroll wrapper widened the page on narrow screens (audit log 461 px at 320). | Fixed — all tables in `.table-wrap`; guard covers all admin routes |
| UX-017 | Medium | KPI value | Number and unit as separate elements would read "4.2days" to screen readers. | Fixed — explicit space; test asserts text "4.2 days" |
| UX-018 | Medium | admin forms | Base input rule (`font: inherit`) overrode field size; inline field groups overflowed at 320 px. | Fixed — body-size fields, wrapping field groups |
