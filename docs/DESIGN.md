# EPI design system — "calm instrument"

Single source of truth for EPI's visual and interaction design (UX-01, ADR-026/027). Tokens live in
`apps/web/src/styles.css` (`:root`); components in `apps/web/src/components/`. If code and this
document disagree, fix one of them in the same change.

**How this was made (honest record):** following the owner's `docs/UI_UX_MASTER_PROMPT.md`. Inputs:
UI UX Pro Max's offline design-system search (`"internal analytics dashboard enterprise productivity"`,
variance 2, motion 2, density 7 → style *Minimalism & Swiss Style*; its marketing pattern, Google
Fonts and GSAP suggestions were rejected as unfit for an offline work tool); Impeccable's craft floor
and *Operate* mode; Anthropic frontend-design's plan → review → build → critique process; Vercel's
Web Interface Guidelines for the audit. In the session that installed the skills they were followed
by reading their `SKILL.md` (Claude Code registers project skills at the next session start).

## 1. Brief

- **Product:** a self-hosted tool where engineering managers and developers understand how work
  flows (KPIs with explanations), write monthly assessments, and administer the organization.
- **People and scene:** team leads, group/engineering managers and developers at a desk, in a
  focused review moment (1:1 prep, monthly assessment), mostly laptop or large monitor, sometimes a
  phone between meetings. Hebrew and English, light and dark offices.
- **Primary job:** read a number, trust it (sample, confidence, freshness, "How calculated?"), act
  (open a person, write an assessment). Never rank people.
- **Mode (Impeccable):** *Operate*. The tool disappears into the task; earned familiarity beats
  novelty.

## 2. Principles

1. **Quiet surfaces, loud facts.** The KPI value and its confidence are the only bold things on a
   screen. Everything else is neutral, hairline-separated, unboxed.
2. **One container level.** Content sits in *sections* on the canvas. Never a card inside a card;
   inside a section, items are separated by hairlines or space.
3. **Honest numbers.** Tabular numerals, units spelled out, N/A shown plainly with the reason, trend
   words ("Improved", "Needs attention") never without the sample and window.
4. **Familiar controls.** Native semantics (button, a, table, dialog), standard patterns (sidebar +
   breadcrumbs, segmented control, sheet), visible keyboard focus everywhere.
5. **Motion only answers an action.** 160–240 ms ease-out; no load choreography; none under
   `prefers-reduced-motion`.

The memorable element ("spend boldness in one place"): the **KPI value line** — large, tight,
tabular, with its trend and confidence set as a single calm sentence beneath it.

## 3. Tokens

### Typography

One family: the platform UI font (SF Pro on Apple devices, Segoe UI Variable on Windows, Roboto/Noto
elsewhere, Noto Sans Hebrew for Hebrew). No web fonts (air-gapped). Impeccable *Operate* permits system
fonts; the craft-floor rule about self-hosting a display face applies to own-world brand pages, not to
this tool.

`--font: -apple-system, BlinkMacSystemFont, 'Segoe UI Variable Text', 'Segoe UI', Roboto, 'Noto Sans', 'Noto Sans Hebrew', system-ui, sans-serif`

| Token | Size / line | Weight | Use |
|---|---|---|---|
| `--text-caption` | 12 / 16 | 400–500 | metadata labels, badges |
| `--text-footnote` | 13 / 18 | 400 | secondary text, table meta |
| `--text-body` | 15 / 22 | 400 | default body, controls |
| `--text-headline` | 17 / 24 | 600 | section titles |
| `--text-title-3` | 20 / 26 | 600 | drawer/sheet titles |
| `--text-title-2` | 24 / 30 | 650 | page titles on mobile |
| `--text-title-1` | 30 / 36 | 700 | page titles |
| `--text-metric` | 34 / 38 | 650 | KPI values (tabular) |

Scale ratio ≈1.15–1.2 (Operate). Titles `letter-spacing: -0.015em`, `text-wrap: balance`.
Numbers in tables, KPI values and dates: `font-variant-numeric: tabular-nums`. Sentence case
everywhere (owner-agnostic default; Vercel's Title Case rule is overridden here for consistency with
existing copy and Hebrew). No ALL-CAPS labels, no eyebrows.

### Color (semantic; light / dark)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--canvas` | `#f4f5f7` | `#0e0f11` | page background |
| `--surface` | `#ffffff` | `#17181b` | sections, sheets |
| `--surface-sunken` | `#eef0f3` | `#1f2024` | segmented track, code, inputs (dark) |
| `--chrome` | `#f9fafb` | `#131416` | sidebar / top bar layer |
| `--text` | `#15171a` | `#f2f3f5` | primary text |
| `--text-secondary` | `#5a616c` | `#a3a9b3` | secondary text (≥4.5:1 on surface) |
| `--text-tertiary` | `#79808b` | `#7f8690` | captions only (≥4.5:1 on surface light) |
| `--separator` | `rgb(20 24 31 / 9%)` | `rgb(255 255 255 / 10%)` | hairlines |
| `--accent` | `#0a63d6` | `#4d9bff` | links, primary action, selection, focus |
| `--accent-soft` | `rgb(10 99 214 / 9%)` | `rgb(77 155 255 / 16%)` | selected rows, secondary buttons |
| `--positive` | `#17784a` | `#4fcf8a` | "Improved", success |
| `--caution` | `#8a5a00` | `#f2c25b` | warnings, low confidence |
| `--critical` | `#bf2a1f` | `#ff8378` | "Needs attention", errors, destructive |
| `--notice-bg` / `--notice-text` | `#fff5d9` / `#5c4300` | `#2e2610` / `#f6d98a` | demo banner, inline notices |

Restrained: accent only for actions, current selection, links and focus. Status colors only for
status. Contrast: body and secondary text ≥4.5:1, large text ≥3:1 (checked in `docs/UI_UX_TESTS.md`).

### Space, radius, elevation, motion

- **Space (4 px base):** `--s-1` 4, `--s-2` 8, `--s-3` 12, `--s-4` 16, `--s-5` 20, `--s-6` 24,
  `--s-8` 32, `--s-10` 40, `--s-12` 48. Tight inside groups, generous between sections, more above a
  heading than below.
- **Radius:** `--r-control` 8 (buttons, inputs), `--r-section` 12 (sections), `--r-sheet` 16
  (drawer/sheet), pill 999 (badges, segmented thumb).
- **Elevation:** surfaces are flat with hairline separators. Shadow only for things above the page:
  `--shadow-overlay: 0 12px 32px rgb(0 0 0 / 14%), 0 2px 6px rgb(0 0 0 / 8%)` (sheet, popover,
  segmented thumb uses `0 1px 2px rgb(0 0 0 / 12%)`).
- **Motion:** `--ease: cubic-bezier(0.2, 0.8, 0.2, 1)`; `--dur-fast` 160 ms (hover, press),
  `--dur` 220 ms (sheet, segmented thumb). Animate `transform`/`opacity` only; list properties
  (never `transition: all`). `prefers-reduced-motion: reduce` → durations 0.

## 4. Layout

```
≥1024 px                                  768–1023 px                 <768 px
┌────────┬──────────────────────────┐     ┌──────────────────────┐    ┌────────────────┐
│ EPI    │ Breadcrumb               │     │ EPI   nav…   Taylor ▾│    │ EPI     Taylor │
│ nav    │ Title            [30|90] │     ├──────────────────────┤    │ nav (scroll) → │
│        │ ┌ section ─────────────┐ │     │ Breadcrumb / Title   │    ├────────────────┤
│        │ │ KPI │ KPI │ KPI      │ │     │ ┌ section ─────────┐ │    │ Title          │
│        │ └──────────────────────┘ │     │ │ KPI │ KPI        │ │    │ ┌ section ───┐ │
│ user   │ ┌ section: members ────┐ │     │ └──────────────────┘ │    │ │ KPI        │ │
└────────┴──────────────────────────┘     └──────────────────────┘    │ │ KPI        │ │
```

- Sidebar 232 px only at ≥1024 px; below, a compact top bar with a horizontally scrollable nav. No
  horizontal page scroll at any width ≥ 320 px (automated check).
- Content max width 1200 px, left-aligned (LTR) / right-aligned (RTL) via logical properties.
- KPI tiles: `grid-template-columns: repeat(auto-fit, minmax(220px, 1fr))`, separated by hairlines
  inside one section (no nested boxes).

## 5. Components (contract)

Every interactive component has default, hover, focus-visible, active, disabled, and where relevant
loading and error states.

| Component | Spec |
|---|---|
| **Button** | `.btn` secondary (surface, hairline border), `.btn-primary` (accent fill), `.btn-plain` (text only, accent), `.btn-danger` (critical text, soft critical bg on hover). Height 36 (≥44 on coarse pointers), radius 8, 15/500. Busy: label stays, `aria-busy`, spinner inline. |
| **Link** | Accent, no underline; underline on hover/focus (offset 3 px). Names in tables are links at weight 500. No "→" suffix. |
| **Input / select / textarea** | Height 36, radius 8, 1 px border `--separator` ×2, surface bg; focus ring `0 0 0 3px var(--accent-soft)` + accent border; error: critical border + message below (`aria-describedby`). Placeholders end with "…". |
| **Segmented control** | Sunken track, raised surface thumb with small shadow, 13/500 labels, `role=group` + `aria-pressed`. |
| **Section** | `.section`: surface, radius 12, hairline border, padding 20/24; header row = headline title + actions. Not nestable. |
| **KPI tile** | Name (headline) · value (`--text-metric`, tabular) · one-line status sentence (trend word coloured, rest secondary) · facts row (sample, confidence, data as of) as caption labels over footnote values · "How calculated?" plain link. Synthetic badge as caption pill. N/A: value "N/A" in secondary + reason. |
| **Table** | Hairline rows, 44 px row height, header 13/600 secondary, numbers right-aligned tabular, wraps in `.table-wrap` (horizontal scroll inside section only). |
| **Tabs (admin)** | Underline tabs, single row, horizontally scrollable on narrow screens. |
| **Sheet (KPI drawer)** | Right side sheet ≥768 px (max 520 px), bottom sheet below; radius 16; `role=dialog`, focus trapped, Esc closes, icon close button with `aria-label`. Definition list with caption labels. |
| **Badge** | Caption pill: neutral, accent (managed), caution, critical. |
| **Notice** | Inline `--notice-*` box; demo banner full width. |
| **States** | Loading: skeleton lines in place of content (spinner only for actions). Empty: says what is missing and the next action. Error: what happened + how to fix + Retry. Denied/not-found: plain explanation. |
| **Icons** | Small authored inline SVG set (chevron, close, info, external) at 16/20 px, `currentColor`, 1.75 stroke, `aria-hidden`. No emoji or Unicode glyphs as icons. |

## 6. Copy

Sentence case, active voice, the product's own words ("Write assessment", "How calculated?").
Errors say what happened and how to fix it. Loading text ends with "…". Roles are shown as words
("Team lead"), never enum codes. Dates via `Intl.DateTimeFormat` in one style: `12 Oct 2026`; times
`12 Oct 2026, 14:05`.

## 7. Accessibility (WCAG 2.2 AA target)

Skip link; landmarks (`nav`, `main`); one `h1` per page, ordered headings; visible focus ring
(`:focus-visible`, 2 px accent + 2 px offset) never removed; touch targets ≥24×24 (2.5.8), ≥44 on
coarse pointers for primary controls; `aria-live` for async results; dialogs trap focus and return
it; color never the only signal (trend word + sign); reduced motion honored; RTL via logical
properties.
