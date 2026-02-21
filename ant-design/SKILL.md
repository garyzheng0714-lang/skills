---
name: ant-design
description: Work effectively in the ant-design/ant-design codebase and in Ant Design based React apps. Use when tasks involve implementing or fixing Ant Design components, adding demos, updating component docs (index.en-US.md / index.zh-CN.md), adjusting theme tokens via ConfigProvider, handling Next.js or Vite integration, or preparing contribution-quality tests/lint/build checks for Ant Design changes.
---

# Ant Design

## Overview

Execute Ant Design tasks with repository-accurate workflow and guardrails. Prefer small, reviewable changes that keep component code, demos, docs, and tests in sync.

## Workflow

1. Identify task mode:
- Use **repo contribution mode** for changes inside `ant-design/ant-design`.
- Use **app integration mode** for consumer apps using `antd`.
2. Load only the needed reference:
- Open `references/repo-map.md` for directory map and command matrix.
- Open `references/implementation-playbook.md` for change and validation checklist.
3. Locate the component scope quickly:
- Run `scripts/find_component.sh <repo_root> <component_or_keyword>`.
4. Implement paired changes:
- Update source, demo, docs, and tests together when behavior or API changes.
5. Validate progressively:
- Start from targeted checks, then run broader checks only if needed.
6. Summarize impact:
- Report modified files, commands run, and remaining risk.

## Repo Contribution Mode

1. Locate the target component:
- Example: `scripts/find_component.sh /path/to/ant-design button`.
2. Follow component structure convention:
- `components/<name>/index.tsx`: public export entry.
- `components/<name>/*.tsx`: implementation.
- `components/<name>/style/*`: token/style logic.
- `components/<name>/demo/*`: docs demos.
- `components/<name>/index.en-US.md` and `index.zh-CN.md`: API/docs.
- `components/<name>/__tests__/*`: behavior snapshots and tests.
3. Keep docs and demos aligned with behavior:
- Add or update demos if UX/API changed.
- Update both Chinese and English docs when API changes.
4. Validate with minimal-first ladder:
- Targeted test first, then `npm run test`, `npm run lint`, optional `npm run compile`.
- Run image tests only for visual-impacting changes.

## App Integration Mode

1. Bootstrap quickly:
- Install `antd` and import components directly (`import { Button } from 'antd'`).
2. Configure theme through `ConfigProvider theme={{ token: ... }}`.
3. Handle SSR/style extraction by framework:
- Next.js App Router: use `@ant-design/nextjs-registry`.
- Next.js Pages Router: use `@ant-design/cssinjs` cache + `extractStyle`.
4. Respect known constraints:
- Next.js App Router does not support sub-components via dot syntax like `<Select.Option />`.
- Static methods (`message.xxx`, `Modal.xxx`, `notification.xxx`) do not consume surrounding `ConfigProvider` context; use hooks or `App` wrapper when context is needed.

## High-Value References

- Ant Design LLM endpoints:
  - `https://ant.design/llms.txt`
  - `https://ant.design/llms-full.txt`
- Use these for quick component/API grounding when local docs are unavailable.

## Resources

- `scripts/find_component.sh`
  - Locate matching components and print key implementation/docs/test files.
- `references/repo-map.md`
  - Read for repository structure and common commands.
- `references/implementation-playbook.md`
  - Read for execution checklist before submitting or finalizing changes.
