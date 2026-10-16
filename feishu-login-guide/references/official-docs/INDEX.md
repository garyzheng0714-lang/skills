# 飞书网页应用官方文档速查索引

> 用户 2026-05-21 提供的飞书开放平台原始文档，已分主题保真存档。
> 这些是**飞书官方文档**，作为这个 skill 写代码时的真相来源（source of truth）。
> 遇到飞书网页应用相关问题先查这里，再决定是否需要 WebFetch 查更新版本。

## 开发指南（必读基础）

| 文档 | 用途 |
|---|---|
| [guide/01-overview.md](guide/01-overview.md) | 网页应用开发指南概述：基本概念、角色、操作导航 |
| [guide/02-step1-create-app.md](guide/02-step1-create-app.md) | 步骤一：创建并配置自建应用 + 桌面端主页打开方式 |
| [guide/03-step2-jsapi-auth.md](guide/03-step2-jsapi-auth.md) | 步骤二：JSAPI 鉴权 + Config 错误码 |
| [guide/04-step3-login-free.md](guide/04-step3-login-free.md) | **步骤三：免登流程 + `requestAccess` 兼容代码**（项目核心） |
| [guide/05-step4-publish.md](guide/05-step4-publish.md) | 步骤四：应用发布与使用 |

## 应用配置（部署必看）

| 文档 | 用途 |
|---|---|
| [config/redirect-urls.md](config/redirect-urls.md) | **重定向 URL 白名单配置**（含 shorturl 项目 6 条具体 URL） |
| [config/efficient-mobile-homepage.md](config/efficient-mobile-homepage.md) | 高效配置移动端主页（避免性能陷阱） |

## web-meta（网页容器行为定制）

⚠️ web-meta 系列**只对移动端生效，PC 端不支持**。

| 文档 | 控制项 |
|---|---|
| [web-meta/00-web-meta.md](web-meta/00-web-meta.md) | web-meta 基础：page-meta vs view-meta，两种定义方式 |
| [web-meta/screen-orientation.md](web-meta/screen-orientation.md) | `orientation` — 屏幕方向 |
| [web-meta/hide-menu-items.md](web-meta/hide-menu-items.md) | `hideMenuItems` — 隐藏更多菜单功能项 |
| [web-meta/slide-to-close.md](web-meta/slide-to-close.md) | `slideToClose` — 侧滑关闭应用 |
| [web-meta/nav-color.md](web-meta/nav-color.md) | `navFgColor` / `navBgColor` — 导航栏颜色 |
| [web-meta/hide-nav-bar.md](web-meta/hide-nav-bar.md) | `showNavBar` — 隐藏顶部导航栏 |
| [web-meta/hide-nav-buttons.md](web-meta/hide-nav-buttons.md) | `showNavLBarBtn` / `showNavRBarBtn` — 隐藏左右导航按钮 |
| [web-meta/hide-bottom-nav.md](web-meta/hide-bottom-nav.md) | `showBottomNavBar` — 隐藏底部导航栏 |
| [web-meta/jump-to-browser.md](web-meta/jump-to-browser.md) | `lk_jump_to_browser` — 跳浏览器打开（非 web-meta，同主题） |

## 扩展能力（按需）

| 文档 | 能力 |
|---|---|
| [extensions/app-badge.md](extensions/app-badge.md) | 应用角标（红点） |
| [extensions/search-shortcuts.md](extensions/search-shortcuts.md) | 搜索结果快捷入口（最多 4 个，仅电脑端） |
| [extensions/chat-plus-menu.md](extensions/chat-plus-menu.md) | 聊天框「+」菜单（H5 需要 mode=sidebar） |
| [extensions/message-action.md](extensions/message-action.md) | 消息快捷操作（最多 20 条，支持 6 类消息） |

## 排查（坑表）

| 文档 | 问题 |
|---|---|
| [troubleshooting/ios-cross-domain-cookies.md](troubleshooting/ios-cross-domain-cookies.md) | **iOS WKWebview 第三方 cookie 被阻止**（解释 v3.1.1 登录事故的根因） |

## 与本 skill 内部文档的关系

- **`references/scenarios/h5-in-feishu.md`** — skill 自己整理的「场景 C：飞书端内免登」操作手册，**做事就看它**。
- **`references/official-docs/guide/04-step3-login-free.md`** — 官方原文，**有疑问/要复核细节就看它**。

两者不冲突，分工是「操作手册 vs 真相来源」。
