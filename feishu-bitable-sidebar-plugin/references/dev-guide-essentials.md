# Feishu Sidebar Plugin Dev Guide Essentials

This file condenses practical constraints from the official sidebar plugin guide and repeated implementation issues.

## Plugin Type and Runtime

1. Build as 边栏插件 running inside Bitable plugin panel.
2. Use HTTPS URL in production; localhost for local debug.
3. During local debug: run service, then paste URL into custom plugin entry.

## Core Data/SDK Practices

1. Resolve current base/table/view from SDK context, with fallbacks.
2. React to selection changes and context changes.
3. Prefer batch operations for large write workloads.
4. Do not exfiltrate table data to external services unless required by plugin function.

## Template-Generation Workflow

Recommended flow:
1. Read template doc and extract `{{}}` variables.
2. Auto-bind by field name similarity.
3. Allow manual re-binding.
4. Pick output field or auto-create URL field.
5. Generate per selected row or all rows.
6. Write back generated document link.

## Auth Notes

1. Frontend plugin permissions follow current user permissions.
2. Server-side Base SDK uses `PersonalBaseToken` and acts with token owner's scope.

## Build/Deploy Notes

1. Static assets must support relative paths (for Vite, `base: './'`).
2. Avoid history routing for plugin bundle.
3. Keep dist output stable for upload/review flows.

## UI/Quality Notes

1. Sidebar width is resizable but narrow-first design is required.
2. Support light/dark mode when customizing component styles.
3. Provide clear guidance when plugin lacks selection/context.
4. Validate initialization behavior when no rows or no matching fields exist.
