# Pitfalls Checklist (From Real Iterations)

## 1. Service Not Reachable

Symptoms:
- `ERR_CONNECTION_REFUSED`
- `localhost` cannot open

Checks:
1. Web UI should listen on `5173`.
2. Backend API should listen on `3000`.
3. Verify `GET /api/health` responds.

Hard rule:
- Do not ask user to retest before both endpoints are verified locally.

## 2. SDK Context Error (`getContext` / undefined)

Common cause:
- Detaching SDK instance methods and invoking without binding `this`.

Bad pattern:
```ts
const { getSelectedRecordIdList } = activeView;
await getSelectedRecordIdList();
```

Good pattern:
```ts
await activeView.getSelectedRecordIdList();
```

## 3. Table or Field Not Resolved

Symptoms:
- Current table shows unresolved
- Field count is 0 unexpectedly

Fallback order:
1. `selection.tableId`
2. `bitable.base.getActiveTable()`
3. first table from `getTableList()`
4. if target table has 0 fields, pick a table with fields

## 4. Binding Dropdown Breaks UX

Symptoms:
- Dropdown too wide
- Option text overflows
- Panel gets stretched

Fixes:
1. Searchable select (`showSearch`).
2. Control popup width to match input or clamp width.
3. Option text ellipsis.
4. Keep panel single-column layout in narrow width.

## 5. Confusing Binding + Preview Interaction

Do this:
1. Variable binding table with 2 columns only (variable, bound field).
2. Move selected-row preview to separate panel below.
3. Add hover tooltip for long variable names and preview values.

## 6. Regression Prevention

Before every handoff:
1. Build success.
2. Health checks pass.
3. Real sidebar smoke test completed.
