---
name: feishu-web-component-library
description: Build or refactor web UI component libraries to align with Feishu (Lark) design specifications, including design principles, component definitions, visual tokens, interaction rules, responsive behavior, accessibility, internationalization, and version governance. Use when tasks involve Feishu-style buttons, inputs, tables, dialogs, navigation, cards, lists, pagination, loading, tooltip/notice, charts, or when creating reusable component contracts, theme configs, tests, and integration docs. Also use when adapting frontend UI work inside an existing project codebase (especially short-url style projects with `client/src/components/ui` and `client/src/components/business-ui`) while preserving local component reuse and theme files.
---

# Feishu Web Component Library

## Overview

Use this skill to convert Feishu design specification documents into an implementable, reusable web component-library standard.
Use this skill also to adapt Feishu-style UI work into an existing codebase without breaking the local component hierarchy, routing, and theme/token setup.

This skill is optimized for:
- Component-library architecture and API contracts
- Token system and theme configuration
- Interaction/state modeling
- Responsive + A11y + i18n requirements
- Testing and release/version strategy

## Inputs

Prepare the following task inputs before generation:
- Framework: `React` / `Vue` / `Web Components` / `agnostic`
- Target components: e.g. `Button, Input, Table, Dialog, Navigation, Card, List, Pagination, Loading, Tooltip, Chart`
- Density: `compact` or `default`
- Platforms: `web`, `desktop-web`, `mobile-web`
- Locale set: e.g. `zh-CN,en-US,de-DE,ja-JP,th-TH`
- Deliverables: `code`, `spec`, `tests`, `migration guide`

If missing, assume:
- Framework: React
- Density: default
- Breakpoints: XS/S/M/L/XL
- Theme: light

## Existing Project Integration Workflow (short-url aware)

Run this section first when the task is inside an existing frontend project or a provided project zip snapshot.

### 1. Detect the source to inspect

- Prefer workspace source when `client/src` exists.
- If the frontend source is only available as a zip snapshot (for example `/Users/simba/Downloads/app_4jk48fgjse88g.zip`), inspect the zip directly.
- When reading from the zip, use leading-slash entry paths (example: `/client/src/app.tsx`).

```bash
zipinfo -1 /Users/simba/Downloads/app_4jk48fgjse88g.zip | rg '^/client/src/'
unzip -p /Users/simba/Downloads/app_4jk48fgjse88g.zip /client/src/app.tsx | sed -n '1,160p'
```

### 2. Read the project UI source-of-truth files before designing

Read these files first (workspace or zip snapshot equivalent):

- `client/index.html` (shell + mount node)
- `client/src/index.tsx` (bootstrap, `AppContainer`, global CSS import, error boundary)
- `client/src/app.tsx` (route wiring and active page selection)
- `client/src/components/Layout.tsx` (root layout shell)
- `client/src/index.css` (global imports)
- `client/src/tailwind-theme.css` (project tokens)
- `client/src/typography.css` (typography rules)
- `client/src/pages/*` (actual routed pages)

### 3. Reuse local components before introducing new patterns

Prefer this order:

1. Rewire an existing page/route (`client/src/app.tsx`, `client/src/pages/*`)
2. Reuse `client/src/components/business-ui/*` (domain-specific UI)
3. Reuse `client/src/components/ui/*` (primitives)
4. Reuse toolkit wrappers/components already present in the app (for example `@lark-apaas/client-toolkit`)
5. Create a new local component only when no suitable candidate exists

For the analyzed short-url snapshot (`app_4jk48fgjse88g.zip`):

- `client/src/components/ui` contains 79 `.ts/.tsx/.css` files
- `client/src/components/business-ui` contains 93 `.ts/.tsx/.css` files
- `client/src/pages` contains 2 page files

### 4. Preserve project visual consistency first, then apply Feishu refinements

- Preserve project theme tokens from `client/src/tailwind-theme.css`
- Preserve typography rules from `client/src/typography.css`
- Preserve root theme container usage from `client/src/index.tsx` (for example `AppContainer defaultTheme`)
- Preserve root layout constraints from `client/src/components/Layout.tsx` (for example `w-screen h-screen`) unless the task requires structural changes
- Apply Feishu component and interaction rules as a refinement layer, not a replacement of the local design system

### 5. Record current route/page reality before editing

For the analyzed short-url snapshot:

- Home/index route currently renders toolkit `Welcome`
- `client/src/pages/ExamplePage/ExamplePage.tsx` exists but is fully commented out and not mounted
- `client/src/pages/NotFound/NotFound.tsx` is a thin wrapper around toolkit `NotFoundRender`

## Feishu Source Coverage Workflow

Run this after the existing-project audit above (or first if there is no local project code to align with).

Always execute in this order:

1. Confirm source corpus coverage:
- Read `references/source-catalog.md`
- Read `references/component-index.md`

2. Load detailed extracted rules:
- Read `references/source-rules.md`
- Use keyword search inside this file for component-specific constraints

3. Include image-derived checks:
- Read `references/image-map.md`
- Treat image-annotated dimensions/state matrices as authoritative when text is brief

4. Produce implementation guidance from curated references:
- Foundation tokens: `references/feishu-foundation.md`
- Component contracts: `references/feishu-component-specs.md`
- Responsive/A11y/i18n: `references/feishu-responsive-a11y-i18n.md`
- QA/versioning: `references/feishu-testing-versioning.md`

## Build Workflow

### Step 1: Establish Token Baseline
- Start from `assets/templates/theme.default.json`
- If high information density is required, extend `assets/templates/theme.compact.json`
- Keep semantics stable (`text.primary`, `border.interactive`, `state.success`, etc.)

### Step 2: Establish Component Contracts
- Start from `assets/templates/component-contracts.json`
- Keep these components mandatory:
  - `Button`, `Input`, `Table`, `Dialog`, `Navigation`, `Card`, `List`, `Pagination`, `Loading`, `Tooltip`, `Chart`
- Keep each contract at least with:
  - `description`, `props`, `states`, `events`, `a11y`, `responsive`, `i18n` (when applicable)
- If task asks for bootstrap code from contracts, run:
```bash
python3 scripts/generate_react_skeleton_from_contract.py \
  --contracts assets/templates/component-contracts.json \
  --output /tmp/feishu-react-skeleton \
  --overwrite
```

### Step 3: Generate or Refactor UI Code
- Apply component contracts first, style tokens second, interaction details third
- In existing codebases, map the contracts onto local components and file structure before introducing new primitives
- For responsive behavior, map from desktop patterns to S/XS collapses instead of naive shrinking
- For i18n, avoid fixed-width text assumptions and prefer layout adaptation

### Step 4: Validate
Run:
```bash
python3 scripts/validate_component_contracts.py assets/templates/component-contracts.json
python3 scripts/audit_theme_tokens.py assets/templates/theme.default.json
python3 scripts/simulate_i18n_expansion.py "新建候选人" --locale de-DE
python3 scripts/generate_react_skeleton_from_contract.py \
  --contracts assets/templates/component-contracts.json \
  --output /tmp/feishu-react-skeleton \
  --overwrite
```

## Component Implementation Rules

Apply these defaults unless task explicitly overrides:
- Button text does not wrap or ellipsize for critical actions
- Input supports full state matrix (`default/hover/focus/error/readonly/disabled`)
- Table supports density and horizontal internal scroll fallback
- Dialog supports focus trap and `Esc` close
- Navigation supports breakpoint mapping (`M/L full`, `S collapsed`, `XS icon-triggered`)
- Tooltip is for short explanatory text; interactive content uses Popover/Dialog
- Chart uses deterministic palette order and adaptive label strategy

## Required Output Shape

When generating a reusable component-library result, always output:

1. Component API contract
- Props (type/default/required)
- Events
- Slots/composition points
- State machine

2. Theme/token config
- Color, typography, spacing, radius, shadow, motion, breakpoints

3. Behavior rules
- Interaction matrix
- Error/loading/empty handling
- Keyboard/A11y requirements

4. Cross-cutting constraints
- Responsive mapping
- i18n expansion handling

5. Test suite definition
- Token validation
- Contract validation
- Interaction + A11y + i18n + visual-regression cases

6. Versioning plan
- SemVer policy
- Deprecation/alias strategy

## Example Deliverable Starters

- Contract: `assets/templates/component-contracts.json`
- Theme: `assets/templates/theme.default.json`
- Integration example: `assets/examples/react-usage.tsx`
- Test checklist: `assets/examples/test-cases.md`
- React skeleton generator: `scripts/generate_react_skeleton_from_contract.py`

## Guardrails

- Preserve Feishu semantic layering; do not flatten all components into one generic style.
- In existing projects, reuse local `business-ui` and `ui` components before creating new Feishu-style primitives.
- Do not mix multiple unrelated visual styles in one same-priority action group.
- Prioritize readability and operation clarity over decorative style.
- Prefer layout adaptation over text truncation in i18n.
- Enforce contrast and keyboard path for critical actions.

## Resource Map

- Full source inventory: `references/source-catalog.md`
- Full extracted rules (all subfolders): `references/source-rules.md`
- Representative image mapping: `references/image-map.md`
- Component taxonomy: `references/component-index.md`
- Foundation guide: `references/feishu-foundation.md`
- Component guide: `references/feishu-component-specs.md`
- Responsive/A11y/i18n guide: `references/feishu-responsive-a11y-i18n.md`
- QA/versioning guide: `references/feishu-testing-versioning.md`
