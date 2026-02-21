# Ant Design Repo Map

## Source snapshot

- Upstream: `https://github.com/ant-design/ant-design`
- Snapshot commit used for this skill: `4131b4d08ebf92c627d807202207d652ad2ab79d`

## Top-level directories

- `components/`: core React components.
- `docs/react/`: React usage, integration, migration, and contribution docs.
- `docs/spec/`: design language and visual specification documents.
- `scripts/`: build/test/release helper scripts.
- `tests/`: cross-component and infrastructure tests.

## Component directory convention

For `components/<name>/`:

- `index.tsx`: component export entry.
- `*.tsx`: main implementation files.
- `style/`: style and token derivation code.
- `demo/`: showcase examples consumed by docs site.
- `index.en-US.md`: English API and docs page.
- `index.zh-CN.md`: Chinese API and docs page.
- `__tests__/`: unit, behavior, snapshot, and semantic tests.

Example: `components/button/` follows this full structure.

## Common command matrix

Run commands at repo root:

- `npm start`: run local docs/site server (`dumi dev`) on port `8001`.
- `npm run lint`: lint and consistency checks.
- `npm run test`: unit and snapshot tests.
- `npm run test:image`: visual regression image tests (Docker-dependent).
- `npm run compile`: compile to `lib` and `es`.
- `npm run dist`: create distributable build.
- `npm run site`: build docs site.
- `npm run test:site`: verify generated site snapshots.

## High-signal docs

- `docs/react/contributing.en-US.md`: contribution and validation expectations.
- `docs/react/getting-started.en-US.md`: base usage flow.
- `docs/react/customize-theme.en-US.md`: token system and theme APIs.
- `docs/react/use-with-next.en-US.md`: Next.js SSR and style extraction.
- `docs/react/use-with-vite.en-US.md`: Vite integration baseline.
- `docs/react/llms.en-US.md`: LLM-oriented docs routes.

## Useful online context routes

- `https://ant.design/llms.txt`: compact component/doc index.
- `https://ant.design/llms-full.txt`: expanded docs payload for tooling.

## Practical guardrails

- Update docs and demos when API or behavior changes.
- Prefer targeted tests over full-suite first.
- Escalate to full lint/test/build checks before final handoff.
- Run image tests only for visual-impacting changes.
