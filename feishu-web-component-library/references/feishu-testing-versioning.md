# 测试策略与版本管理

## 1. 测试分层
- Token 层：颜色、字号、间距、圆角、投影、动效 token 完整性与格式校验。
- 组件契约层：常见组件接口必填字段、默认值、状态映射校验。
- 交互层：状态切换、键盘行为、弹窗焦点管理、下拉与分页逻辑。
- 可用性层：A11y（对比度/ARIA/键盘路径）与 i18n（文案扩展/折行）。
- 视觉层：关键页面快照与断点截图对比。

## 2. 内置脚本
- `scripts/validate_component_contracts.py`
  - 校验核心组件是否齐全（Button/Input/Table/Dialog/Navigation/Card/List/Pagination/Loading/Tooltip/Chart）。
- `scripts/audit_theme_tokens.py`
  - 校验主题 token 完整性与对比度下限。
- `scripts/simulate_i18n_expansion.py`
  - 生成多语言膨胀文案，做布局压力测试。
- `scripts/generate_react_skeleton_from_contract.py`
  - 依据组件契约自动生成 React + TypeScript 组件骨架与 `index.ts` 导出。

## 3. 推荐测试用例集合
- 见 `assets/examples/test-cases.md`。
- 建议在 CI 中按以下顺序执行：
  1. token/contract 脚本校验
  2. 单元测试（组件逻辑）
  3. E2E（关键流程）
  4. 视觉回归（多断点）

## 4. 版本策略（SemVer）
- MAJOR：设计 token 语义变化、组件 API 不兼容变更。
- MINOR：新增组件能力、兼容性增强、响应式规则扩展。
- PATCH：样式修复、无障碍修复、文档与示例修正。

## 5. 变更流程
1. 更新 `assets/templates/theme.*.json` 或 `assets/templates/component-contracts.json`。
2. 必要时运行 `scripts/generate_react_skeleton_from_contract.py` 生成/更新骨架。
3. 运行校验脚本。
4. 更新 `references/*` 中受影响规范。
5. 记录版本号与变更摘要。

## 6. 兼容策略
- 设计 token 改名时保留一个小版本的 alias 映射。
- 弃用接口至少经历一个 MINOR 周期，并提供迁移示例。
- 响应式与 i18n 行为调整必须附带对比案例（旧行为 vs 新行为）。
