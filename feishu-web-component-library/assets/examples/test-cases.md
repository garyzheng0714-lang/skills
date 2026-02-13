# Feishu Web 组件库测试用例模板

## 1. 视觉一致性
- 验证按钮 `primary/secondary/text/link/danger` 在 `default/hover/active/disabled/loading` 状态下与设计 token 一致。
- 验证输入框 `default/hover/focus/error/readonly/disabled` 的边框、占位符、文本色是否符合规范。
- 验证表格密度 `compact/default/loose` 行高差异与分割线一致。

## 2. 交互行为
- 验证 Split Button 左右热区分离，主操作与下拉操作不冲突。
- 验证 Dialog 打开后焦点陷阱、Esc 关闭与返回焦点行为。
- 验证 Tooltip 在 hover/focus 触发下的显示与隐藏时机。

## 3. 响应式
- 在 `XS/S/M/L/XL` 断点验证导航形态变化：完整显示 -> 半收起 -> 图标入口。
- 在 `XS/S` 验证表格触控友好密度与内部滚动策略。
- 验证定宽页面到 1136px 上限时宽度保持固定，Margin 随屏幕增长。

## 4. 无障碍
- 验证按钮文本与背景对比度 >= 4.5:1（禁用态除外）。
- 验证键盘可达性：Tab、Enter、Space、Esc、方向键（列表/菜单/预览场景）。
- 验证关键 ARIA：`aria-label`, `aria-describedby`, `aria-expanded`, `role=dialog/tooltip/grid`。

## 5. 国际化
- 使用德语、法语、俄语测试文案扩展，验证布局是否溢出。
- 使用泰语/越南语/印地语测试高文字，验证行高不会裁切。
- 验证中文/英文/阿拉伯语混排场景下的折行与标点位置。

## 6. 图表
- 验证分类色板在超过 14 类时循环取色。
- 验证图表空间不足时按优先级隐藏非核心元素（图形 > 图例 > 轴 > 网格线）。
- 验证移动端按压触发提示卡而非 desktop hover 依赖。
