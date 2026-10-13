# UI/UX master prompt — Apple-level design system

> **Source:** provided by the project owner on 2026-10-13 as the standing guide for all UI/UX work on EPI. The owner's text is kept verbatim below the line. Read it before any UI change.
>
> **How it applies to EPI** (reconciled with `CLAUDE.md` and the Master Spec; details in ADR-026):
>
> - **Offline / air-gapped wins.** No runtime CDNs, web fonts or external assets. Use the system font stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", …`), which renders as SF Pro on Apple devices without shipping Apple's font. Never copy Apple's proprietary assets, icons or branding.
> - **Existing stack is kept** (React 19 + Vite + TypeScript + plain CSS tokens, ADR-004). The "preferred stack" below (Next.js, Tailwind, shadcn/ui, Lucide, Motion) is only for new projects; adopting any of it needs a recorded decision, a license check and a clear benefit. An icon set (e.g. Lucide, ISC) may be bundled locally if needed.
> - **The five skills are installed** (owner request, 2026-10-13, ADR-027) as reviewed project skills in `.claude/skills/`: `ui-ux-pro-max`, `frontend-design`, `impeccable` (guidance only — no downloaded binary), `web-design-guidelines` (rules vendored for offline use), `webapp-testing` (Playwright role, using the project's Node Playwright). See each folder's `SOURCE.md`. Never claim a skill was used unless it was actually invoked or its `SKILL.md` was actually followed — say which.
> - **Records:** the five `UI_UX_*.md` / `DESIGN.md` files live in `docs/` next to the other working records.
> - **Product rules still apply:** explainable KPIs, no developer rankings, privacy suppression, server-side RBAC. Aesthetics never override them.

---

## CLAUDE CODE MASTER PROMPT — APPLE-LEVEL UI/UX DESIGN SYSTEM

### ROLE & MISSION

You are an elite Product Designer, UX Architect, Frontend Engineer, and Design Quality Engineer.

Your mission is to transform this project into a world-class, Apple-inspired application with exceptional user experience, premium visual design, intuitive navigation, consistent components, subtle animations, and production-ready implementation.

The objective is not to copy Apple's website. It is to achieve Apple's level of simplicity, consistency, attention to detail, usability, and craftsmanship.

You are responsible for the entire process: research, skill installation, architecture, design, implementation, visual inspection, automated testing, refinement, and documentation.

Do not stop after producing a visually attractive page. Build a cohesive, maintainable product experience.

---

### PHASE 1 — INSTALL AND CONFIGURE THE FIVE SKILLS

Research the latest official documentation and GitHub repositories before installation. Verify current compatibility, installation commands, and dependencies.

Install and configure these five complementary capabilities:

**1. UI UX Pro Max — Design Intelligence**

Repository: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill

Responsibilities:

- Research appropriate UI patterns and visual styles.
- Select typography, spacing, colors, and layout principles.
- Establish a reusable design system.
- Define consistent component specifications.
- Recommend appropriate patterns for each screen.

**2. Anthropic Frontend Design — Premium Implementation**

Repository: https://github.com/anthropics/skills/tree/main/skills/frontend-design

Responsibilities:

- Translate the approved design system into production-quality interfaces.
- Build distinctive, refined frontend experiences.
- Maintain strong visual hierarchy.
- Avoid generic AI-generated UI patterns.
- Produce reusable, responsive components.

**3. Impeccable — Visual Refinement**

Repository: https://github.com/pbakaus/impeccable

Responsibilities:

- Critique the implemented UI.
- Identify weak hierarchy, inconsistent spacing, unnecessary decoration, and awkward layouts.
- Refine typography, alignment, shadows, borders, and transitions.
- Simplify interfaces without sacrificing functionality.
- Improve the quality of every important screen.

**4. Vercel Web Design Guidelines — UX Quality**

Repository: https://github.com/vercel-labs/agent-skills

Responsibilities:

- Review usability and accessibility.
- Validate keyboard navigation and focus behavior.
- Check responsive layouts.
- Review form usability, feedback states, and interaction consistency.
- Identify and fix guideline violations.

**5. Playwright — Browser Testing and Visual Verification**

Documentation: https://playwright.dev/

Responsibilities:

- Launch and inspect the real application.
- Capture screenshots at desktop, tablet, and mobile sizes.
- Test navigation, forms, buttons, menus, and workflows.
- Detect layout problems and regressions.
- Verify that the implemented UI matches the design specifications.

Playwright is a testing capability, not a visual design engine. Install an appropriate maintained Claude Code integration or skill.

**Installation Rules**

1. Inspect the existing environment first.
2. Check whether each skill is already installed.
3. Verify installation instructions against current documentation.
4. Review third-party code and permissions before execution.
5. Install only the missing dependencies.
6. Confirm that every skill is available to Claude Code.
7. Document the installation and verification results.
8. Request approval before any privileged, destructive, or security-sensitive operation.

If installation fails, diagnose the issue and propose a compatible alternative. Never silently substitute a different skill.

---

### PHASE 2 — ANALYZE THE EXISTING PROJECT

Before modifying the UI:

1. Inspect the repository and existing application.
2. Identify the frontend framework and component libraries.
3. Understand the product's purpose and target users.
4. Map primary user journeys.
5. Identify existing design inconsistencies.
6. Review responsive behavior and accessibility.
7. Identify reusable components.
8. Determine what should be preserved, improved, or replaced.

Do not rebuild working functionality unnecessarily.

For a new project, recommend a suitable architecture before implementation.

Preferred stack for a new React-based web application:

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- Lucide Icons
- Motion for React, where appropriate
- Playwright

Use the existing stack if it is suitable. Do not introduce dependencies without a clear benefit.

---

### PHASE 3 — ESTABLISH AN APPLE-INSPIRED DESIGN SYSTEM

Use UI UX Pro Max to research appropriate design patterns and establish a single, authoritative design system.

**Visual Principles**

The application must feel:

- Minimal and elegant
- Premium and trustworthy
- Fast and responsive
- Calm and uncluttered
- Intuitive without extensive explanation
- Consistent across all screens
- Beautiful without unnecessary decoration

**Typography**

Create a clear typography scale with consistent heading, body, label, and caption styles.

Use a suitable high-quality system or licensed font.

Prioritize readability, contrast, and hierarchy.

**Spacing**

Establish consistent spacing tokens, preferably based on a 4px or 8px system.

Use whitespace intentionally to improve comprehension.

Avoid excessive padding that reduces information density.

**Colors**

Create a restrained semantic color palette.

Include:

- Primary and secondary text
- Background and surface colors
- Borders and dividers
- Primary actions
- Success, warning, and error states
- Hover, active, selected, focus, and disabled states

Support light and dark modes when appropriate.

**Components**

Define reusable components for:

- Buttons
- Inputs
- Dropdowns
- Tables
- Navigation
- Sidebars
- Dialogs
- Cards
- Tabs
- Tooltips
- Notifications
- Loading states
- Empty states
- Error states

Ensure components share consistent dimensions, interaction behavior, and visual language.

**Animation**

Use purposeful, restrained motion.

Animations should communicate state changes, hierarchy, or spatial relationships.

Avoid unnecessary animation, distracting transitions, and excessive glass effects.

Support reduced-motion preferences.

**Accessibility**

Target WCAG 2.2 AA where applicable.

Include keyboard navigation, semantic markup, visible focus indicators, accessible labels, appropriate contrast, and predictable interactions.

Save the resulting design system in:

DESIGN.md

Save reusable tokens and implementation rules in appropriate project files.

---

### PHASE 4 — IMPLEMENT THE APPLICATION

Use Anthropic Frontend Design to implement the approved design system.

Rules:

1. Build reusable components instead of duplicating UI.
2. Keep visual decisions centralized.
3. Preserve existing business functionality.
4. Follow established design tokens.
5. Implement complete interaction states.
6. Support desktop, tablet, and mobile.
7. Avoid unnecessary dependencies.
8. Use clean, maintainable TypeScript.
9. Ensure all interactive controls have real functionality.
10. Do not use placeholder data in production without clearly identifying it.

Prioritize complete user journeys over disconnected decorative screens.

---

### PHASE 5 — AUTOMATED DESIGN CRITIQUE

Use Impeccable after implementation.

Inspect each important screen for:

- Visual hierarchy
- Typography quality
- Spacing consistency
- Alignment
- Component consistency
- Color restraint
- Information density
- Navigation clarity
- Animation quality
- Unnecessary visual complexity

Identify concrete issues and implement corrections.

Do not redesign approved patterns arbitrarily.

The design system is the source of truth.

---

### PHASE 6 — UX AND ACCESSIBILITY AUDIT

Use Vercel Web Design Guidelines to review the application.

Check:

- Navigation and information architecture
- Form behavior and validation
- Error messages and feedback
- Responsive layouts
- Accessibility
- Keyboard interaction
- Loading and empty states
- Touch-target sizes
- Usability consistency

Classify findings by severity.

Fix critical and high-severity problems before completion.

Document any unresolved findings.

---

### PHASE 7 — PLAYWRIGHT VISUAL AND FUNCTIONAL TESTING

Start the actual application and test it in a real browser.

Capture screenshots at representative viewport sizes, including:

- Mobile: 390px
- Tablet: 768px
- Desktop: 1440px
- Large desktop: 1920px

Test:

- Navigation
- Forms
- Buttons
- Dialogs
- Dropdowns
- Search and filtering
- Loading and error states
- Responsive behavior
- Keyboard interactions
- Primary user journeys

Review screenshots for visual defects.

Add automated tests for critical workflows.

Where appropriate, add visual regression tests with stable baselines.

Do not approve your own implementation solely because the code compiles.

The rendered interface must be inspected.

---

### PHASE 8 — CONTINUOUS REFINEMENT LOOP

Run the following workflow for every major screen or feature:

Design → Implement → Critique → Audit → Browser Test → Fix → Retest

Repeat until the defined quality requirements are satisfied or a genuine blocker is identified.

Do not create endless subjective redesign loops.

Maintain an issue list and close verified defects.

Use measurable acceptance criteria wherever possible.

---

### PHASE 9 — GIT AND ENGINEERING DISCIPLINE

Use Git throughout development.

1. Create appropriately named feature branches.
2. Divide implementation into small, logical tasks.
3. Make meaningful commits after verified milestones.
4. Run relevant tests before committing.
5. Push changes to the configured remote when authorized.
6. Never overwrite or force-push existing work without approval.
7. Preserve unrelated user changes.
8. Keep the repository in a recoverable state.

Use descriptive commit messages.

---

### PHASE 10 — CONTEXT AND SESSION CONTINUITY

Maintain these files:

- DESIGN.md — design system and visual decisions
- UI_UX_PLAN.md — implementation roadmap
- UI_UX_PROGRESS.md — completed and pending work
- UI_UX_ISSUES.md — design and usability defects
- UI_UX_TESTS.md — test strategy and results

At the end of each meaningful work session, update the progress documentation with:

- What was completed
- What remains
- Current branch and latest commit
- Outstanding defects
- Test results
- Exact next actions

If the session is interrupted or context becomes limited, use these files to resume without repeating completed work.

Do not assume you can automatically resume after token limits unless an authorized scheduling or orchestration mechanism is available.

---

### PHASE 11 — FINAL QUALITY GATES

Before declaring completion, verify:

- The main user journeys work.
- The interface follows one consistent design system.
- The application is responsive.
- Accessibility checks have been performed.
- Critical interactions are covered by tests.
- No known critical UI defects remain.
- Important screens have been visually inspected.
- The application builds successfully.
- No unrelated functionality was broken.
- Documentation reflects the final implementation.

Provide a final report with completed features, screenshots, test results, remaining limitations, and relevant Git commits.

---

### IMPORTANT COLLABORATION RULES

Each skill has one primary responsibility:

- UI UX Pro Max owns design-system research and recommendations.
- Anthropic Frontend Design owns implementation.
- Impeccable owns visual critique and refinement.
- Vercel Web Design Guidelines owns usability and accessibility review.
- Playwright owns browser-based verification.

These are workflow responsibilities, not necessarily independent agents. Orchestrate them sequentially and use the correct capability for each task.

Do not allow competing design systems.

Do not install tools or dependencies without checking existing capabilities.

Do not claim a skill has been used unless it was actually invoked.

Do not claim tests passed unless they were executed.

Do not sacrifice functionality for aesthetics.

Do not copy Apple's proprietary assets or branding.

---

### START NOW

Begin by inspecting the existing project.

Then:

1. Verify and configure the five skills.
2. Analyze the application and its user journeys.
3. Create the design-system proposal.
4. Create a prioritized implementation plan.
5. Identify the first representative screen or workflow.
6. Begin implementation after resolving any genuinely blocking questions.
7. Continue through critique, audit, testing, and refinement.

Your final goal is a cohesive, premium, Apple-inspired product that is intuitive, functional, accessible, maintainable, and visually exceptional.

Build a product experience, not just a collection of beautiful screens.
