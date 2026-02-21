# Fixed-Width Sidebar UI Spec

Target:
- Feishu Bitable sidebar fixed narrow panel (min width around 410px)

## Layout Rules

1. Use vertical single-column section flow.
2. Keep section spacing tight and consistent.
3. Avoid multi-column forms in narrow panel.
4. Avoid horizontal table scrolling in core workflow.

## Variable Binding Block

Must-have:
1. Two columns only:
   - variable name
   - field select
2. Variable name supports ellipsis + hover full text.
3. Field select is searchable.
4. Dropdown option text uses ellipsis.

## Preview Block

1. Put selected-row preview in a separate card/panel.
2. Show selected record id near panel title.
3. For each variable, show `{{name}}` and resolved value.
4. Use tooltip for full value when text is long.

## Visual Interaction Rules

1. Keep primary action button full width near bottom of flow.
2. Keep status/notice near top and easy to scan.
3. Keep form controls full width.
4. Prevent any popup/menu from forcing body width growth.

## Anti-Patterns

1. Three-column binding table in narrow sidebar.
2. Popup menus wider than viewport.
3. Side-by-side form grids in fixed narrow width.
4. Hiding long key text without tooltip fallback.
