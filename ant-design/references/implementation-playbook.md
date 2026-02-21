# Implementation Playbook

## 1. Decide change type

- `Consumer app change`: use Ant Design in a product app.
- `Repo component change`: modify `ant-design/ant-design` source.

Use this file mainly for `repo component change`.

## 2. Scope the target component

1. Run:
```bash
scripts/find_component.sh <repo_root> <keyword>
```
2. Confirm a single target component directory.
3. List files to touch before editing.

## 3. Edit with component completeness

When component behavior or API changes, update in one pass:

- implementation files (`components/<name>/*.tsx`)
- style/token files (`components/<name>/style/*`) if styling semantics changed
- demos (`components/<name>/demo/*`) for new or updated usage
- docs (`index.en-US.md` and `index.zh-CN.md`) for public API changes
- tests (`components/<name>/__tests__/*`) for behavior assertions

## 4. Validate in cost order

1. Run targeted checks first:
```bash
npm run test -- --watch <ComponentName>
```
2. Run baseline quality gates:
```bash
npm run test
npm run lint
```
3. Run compile/build checks when needed:
```bash
npm run compile
```
4. Run visual tests only for visual changes:
```bash
npm run test:image
```

## 5. Integration notes for app usage

- Use `ConfigProvider theme={{ token: ... }}` for global token customization.
- For Next.js App Router SSR styles, use `@ant-design/nextjs-registry`.
- For Next.js Pages Router SSR styles, use `@ant-design/cssinjs` and `extractStyle`.
- Avoid dot-subcomponent syntax in Next.js App Router (`<Select.Option />`).

## 6. Final handoff checklist

- Confirm docs/demo/test alignment with code changes.
- Confirm command results and include failures if any remain.
- Confirm no unrelated files were modified.
