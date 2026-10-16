# 配置网页跳转浏览器打开（lk_jump_to_browser）

> 来源：飞书开放平台官方文档。原文保真存档。**不属于 web-meta，但同主题**。

URL 拼接参数让飞书客户端打开页面时直接跳浏览器。

- 桌面端：`lk_jump_to_browser=true`
- 移动端：`lk_mobile_jump_to_browser=true`

示例：
- 桌面端：`https://open.feishu.cn/?lk_jump_to_browser=true`
- 移动端：`https://open.feishu.cn/?lk_mobile_jump_to_browser=true`

## 支持情况

| 是否需要鉴权 | Android | iOS | PC |
|---|---|---|---|
| 不需要 | V7.11 | V7.11 | V7.7 |

## 使用场景

- 飞书工作台/主导航/搜索等场景点击网页应用后直接跳浏览器 → 网页应用**桌面端首页** URL 拼 `lk_jump_to_browser=true`，**移动端首页** URL 拼 `lk_mobile_jump_to_browser=true`。
- 网页应用大部分页面在飞书内新标签页打开（开发者后台配置），但某个页面 B 必须依赖浏览器插件 → 用 `window.open` 或 `<a>` 打开 B，URL 拼 `lk_jump_to_browser=true`。

⚠️ 通过 `window.location.href` 在当前页面内刷新为新页面，则新页面继续在当前页内打开，拼 `lk_jump_to_browser=true` **无法生效**。

## 注意事项

添加 `lk_jump_to_browser=true` 的网页**一定跳浏览器打开**，判断优先级**高于其他配置**：

1. 用户在飞书设置中配置「优先在飞书新标签页打开」，目标网页拼了该参数 → 仍跳浏览器（高于用户设置）。
2. 应用 A 通过 `window.open`/`<a>` 跳页面 B，B 拼了该参数 → B 跳浏览器（高于 A 在开发者后台的「在飞书内新标签页打开」配置）。
3. 「打开网页应用 AppLink」或「打开普通网页 AppLink」目标链接拼了该参数 → 跳浏览器（高于 AppLink 进入飞书端内打开）。

⚠️ `lk_jump_to_browser=true` 暂不支持在**飞书独立窗口**中生效。
