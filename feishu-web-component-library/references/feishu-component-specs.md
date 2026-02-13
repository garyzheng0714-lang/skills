# 飞书组件规范（Web 常用组件）

说明：本文件给出可直接实现的组件结构、样式要点、行为接口。完整字段见 `assets/templates/component-contracts.json`。

## 1. Button（按钮）
- 结构：`icon? + label + suffixIcon?`
- 关键变体：基础按钮、文字按钮、图标按钮、分裂按钮、全圆角按钮、悬浮按钮。
- 默认配置：`variant=primary`、`size=md(32px)`、`disabled=false`。
- 行为：hover/active/focus/disabled/loading/selected。
- 扩展接口：`selected`（状态切换按钮）、`tooltip`（图标按钮语义补全）、`split`（主操作+下拉操作）。
- 规则：
  - 同一按钮组视觉样式建议不超过两种。
  - 多语言场景优先精简文案，不换行、不省略。
  - 描边按钮在浅灰背景可去底色；需保证描边与背景对比度。

## 2. Input（输入框）
- 结构：`label? + control + helper/error`
- 关键变体：基础输入、数字输入、前后缀输入、组合输入、textarea。
- 默认配置：`size=md(32px)`、`status=default`、`clearable=true`。
- 行为：focus/typing/filled/error/readonly/disabled。
- 扩展接口：`prefix/suffix`、`mask`、`parser/formatter`、`debounceValidation(500ms)`。
- 规则：
  - 最小宽度建议 240，最大 600。
  - 图标与文本/边距遵循 8/12 间距规则。

## 3. Table（表格）
- 结构：`toolbar? + table + pagination + batchActionBar?`
- 默认配置：`density=default`、`pagination=true`。
- 行为：排序、筛选、选择、行操作、空态、加载态。
- 扩展接口：`stickyHeader`、`stickyColumns`、`virtualized`、`scroll.x/y`。
- 规则：
  - XS/S 使用更宽松触控间距；M/L 使用基础密度。
  - 空间不足时优先横向内部滚动。

## 4. Dialog（弹窗）
- 结构：`header + body + footer`
- 默认配置：`size=m`、`maskClosable=false`、`closable=true`。
- 行为：enter/open/exit 动画，确认/取消，焦点返回。
- 扩展接口：`customFooter`、`dangerConfirm`、`asyncConfirm`。
- 规则：
  - 桌面端 S/M/L/XL 固定档；移动端响应式宽度。
  - 到达最小安全边距后优先内部滚动。

## 5. Navigation（导航）
- 范围：顶部导航、侧边导航、面包屑、Tabs、锚点、下拉菜单。
- 默认配置：
  - `mode=top`
  - `overflow=menu`
- 响应式映射：
  - M/L：完整显示
  - S：半收起（hover/popover 暴露子级）
  - XS：图标入口 + 抽屉/全屏模态
- 扩展接口：`collapsed`, `items`, `activePath`, `overflowStrategy`。

## 6. Card（卡片）
- 结构：`header? + content + actions?`
- 默认配置：`radius=m`、`elevation=s1`、`bordered=true`。
- 行为：hover 提升、active/selected 边界强化、dragging 态。
- 扩展接口：`sectioned`、`interactive`、`skeleton`。

## 7. List（列表）
- 结构：`listHeader? + items + listFooter?`
- 默认配置：`density=default`、`divider=true`。
- 行为：item hover/click、批量选择、无限滚动。
- 扩展接口：`itemLayout`, `virtualized`, `infiniteScroll`。

## 8. Pagination（分页）
- 结构：`prev + pages + next + quickJumper + sizeChanger + total`
- 默认配置：`current=1`、`pageSize=20`、`showQuickJumper=true`。
- 规则：
  - 数字页码最小 28x28。
  - 移动端简化为翻页+总量。
- 扩展接口：`simpleMode`、`showFirstLast`。

## 9. Loading（加载）
- 范围：Spinner、Skeleton、Progress。
- 默认配置：`delay=1000ms`（可配置）。
- 规则：
  - 若内容在延迟内完成则不显示 loading。
  - 长加载需提供可中断/可恢复路径。
- 扩展接口：`fullscreen`、`inline`、`withText`。

## 10. Tooltip（提示）
- 结构：`trigger + bubble`
- 默认配置：`trigger=hover`、`placement=top`、`maxWidth=320`。
- 规则：
  - 短说明使用 Tooltip；含动作内容改用 Popover。
  - 高亮底色场景优先使用 Inverse token 保证可读性。
- 扩展接口：`interactive`, `delayOpen`, `delayClose`。

## 11. Chart（图表）
- 结构：`title + legend + plot + axis + tooltip`
- 默认配置：`palette=categorical`、`showLegend=true`。
- 规则：
  - 分类色板按顺序取色，类别 > 14 循环。
  - 空间不足时隐藏优先级：图形 > 图例 > 坐标轴 > 网格线。
  - 移动端以按压触发提示卡，不依赖 hover。
- 扩展接口：`dataZoom`, `sampling`, `textureMode`（色弱补充）。

## 12. 组件接口统一约束
- 所有组件应支持：`className`、`style`、`data-testid`、`locale`、`theme`。
- 表单类组件统一支持：`status`、`disabled`、`readonly`、`required`、`help`。
- 可交互组件统一支持：`onFocus`、`onBlur`、`onKeyDown`。
