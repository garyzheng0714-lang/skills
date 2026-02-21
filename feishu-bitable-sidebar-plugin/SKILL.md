---
name: feishu-bitable-sidebar-plugin
description: Build, refactor, and debug Feishu Bitable sidebar plugins (边栏插件, not 字段捷径) with fixed-width panel UX, reliable local startup, health checks, template variable extraction (`{{}}`), field auto-binding, selected-row preview, and batch/single-row generation. Use when users request sidebar plugin development, see ERR_CONNECTION_REFUSED, encounter SDK context errors (like getContext), or report binding/layout/dropdown interaction problems.
---

# Feishu Bitable Sidebar Plugin

Follow this workflow to avoid repeated back-and-forth and ship a usable sidebar plugin in one pass.

## Step 1: Load Minimal Context

Read files in this order:
1. `references/pitfalls-checklist.md` (always)
2. `references/ui-fixed-width-spec.md` (for any UI change)
3. `references/dev-guide-essentials.md` (for API/auth/deploy constraints)

## Step 2: Run Preflight Before Coding

Run in project root:
```bash
bash /Users/macmini_gary/.codex/skills/feishu-bitable-sidebar-plugin/scripts/preflight_check.sh .
```

If preflight warns, fix first. Do not continue to feature work before critical warnings are resolved.

## Step 3: Start and Verify Runtime First

Start dev services, then verify both ports before asking user to test.

Recommended run:
```bash
npm run dev
```

Health check:
```bash
bash /Users/macmini_gary/.codex/skills/feishu-bitable-sidebar-plugin/scripts/health_check.sh 5173 3000
```

Never ask user to open plugin URL unless both web and API health checks pass.

## Step 4: Sidebar Plugin Contract (Non-Negotiable)

Implement as 边栏插件 behavior, not 字段捷径 behavior:
1. Operate in Bitable sidebar iframe context.
2. Resolve active table robustly: selection table -> active table -> first table fallback.
3. Extract template variables strictly from `{{变量}}` placeholders.
4. Auto-bind variable to field by normalized name match; keep manual override.
5. Support generate mode: selected rows and all rows.
6. Write result link to chosen field; create URL field automatically when not selected.

## Step 5: Interaction Contract (Fixed Width)

Use fixed narrow sidebar interaction:
1. Variable binding area has exactly 2 columns:
   - variable name
   - bound field select
2. If variable text is long, show ellipsis and full text on hover tooltip.
3. Selected-row preview is shown in a separate panel, not as a third table column.
4. Dropdown must not expand panel width.
5. No horizontal overflow in panel main workflow sections.

## Step 6: Debugging Rules

When users report errors, validate in this order:
1. `ERR_CONNECTION_REFUSED`: verify web/API listeners and health endpoints first.
2. SDK context error (example `getContext`): check for unbound SDK method calls and bind to instance.
3. Fields show zero or table unresolved: rerun table resolution fallback and check sidebar context.
4. Binding dropdown unusable: enforce searchable select + popup width control + text ellipsis.

## Step 7: Done Criteria

Before handoff, confirm all items:
1. `npm run build` passes.
2. `http://localhost:5173` returns HTTP 200.
3. `http://localhost:3000/api/health` returns `{\"ok\":true}`.
4. In sidebar: variable extraction, auto-bind, manual bind, selected-row preview, generate, writeback all work.
5. Layout remains usable at fixed narrow panel width with no horizontal overflow.

## References

- `references/pitfalls-checklist.md`
- `references/ui-fixed-width-spec.md`
- `references/dev-guide-essentials.md`
