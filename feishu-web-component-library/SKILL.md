---
name: feishu-web-component-library
description: Build or refactor web UI component libraries to align with Feishu (Lark) design specifications, including design principles, component definitions, visual tokens, interaction rules, responsive behavior, accessibility, internationalization, and version governance. Use when tasks involve Feishu-style buttons, inputs, tables, dialogs, navigation, cards, lists, pagination, loading, tooltip/notice, charts, or when creating reusable component contracts, theme configs, tests, and integration docs.
---

# Feishu Web Component Library

## Overview

Use this skill to convert Feishu design specification documents into an implementable, reusable web component-library standard.

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

## Source Coverage Workflow

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
