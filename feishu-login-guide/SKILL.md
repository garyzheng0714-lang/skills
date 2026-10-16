---
name: feishu-login-guide
description: "AI 执行手册：在任何项目里稳定接入飞书登录。**v5（2026-10-15）新项目一律走路线 A「飞书集成平台（AnyCross）单点登录」：每项目在集成平台建自己的 SSO 应用（OIDC 授权码 + PKCE），会话放服务端，每 5 分钟核对、用户信息 403 下线，接名单提醒接口 POST /internal/auth/blocklist-changed 实现离职/冻结/紧急下线，上线前跑合规测试；模板与契约在 templates/backend/anycross-sso/README.md（Go、Node）。** 存量项目一次性切换，没切之前按下面的 v4 维护。登录页用 Su Design 的登录卡 @su/sign-in-card（v8：所有项目一模一样，飞书按钮 + 账号密码表单，FeishuSignInPage 不收参数、原样复制；保留门+小黄人插画，颜色、圆角、阴影全用 Su Design 设计变量，模板 templates/frontend/react-vite/FeishuSignIn.tsx.template）。**v4 默认「单应用统一登录」：每项目一个 FBIF 登录 App，飞书后台开「关联组织应用共享」，FBIF 和富的员工走同一个应用、登录页只有一个「使用飞书登录」按钮（不分企业）**（生产验证：feed.foodtalks.cn）。登录页无扫码入口（后端扫码路由保留；确需扫码先问用户，改模板所有项目同步，用 passport.feishu.cn + v1 token）。AI 收集 App ID/Secret + 部署 URL → 写后端 OAuth 代码（Go/Node/Python，签名 state + session header/hash 兜底）+ React 登录页组件 + .env + .gitignore → 输出待办清单（飞书后台加 2 条 redirect URL + 可用范围 + 关联组织共享）。**接入第一步先用 AskUserQuestion 问「开放模式」：① 仅飞书客户端内打开（拦截页 + 唤起飞书 + 端内免登，走 references/scenarios/feishu-only.md）；② 浏览器也可访问（默认）。**历史「双 App 双按钮」模式（存量项目维护用）见 references/scenarios/dual-app-legacy.md。MUST trigger when the user says: 「给项目加飞书登录」「接入飞书登录」「飞书 OAuth」「Feishu login」「Feishu SSO」「飞书扫码登录」「飞书端内免登」「仅飞书内登录」「只能在飞书里打开」「飞书内打开」「FBIF 登录」「富的登录」「登录失效」「过一段时间要重新登录」「飞书授权过期」「重新授权」「refresh_token」「集成平台单点登录」「AnyCross SSO」「统一登录」「离职下线」「停用名单」「紧急下线」「接入项目通知地址」, or invokes /feishu-login-guide."
version: 5.0.0
owner: garyzheng
private: false
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
---

# Feishu Login Guide — AI 执行规范（v5）

**这份文件给 AI 看，不是给用户看。** 用户不需要懂 OAuth 原理。AI 严格按本规范执行，目标是每次接入都产出**视觉/路径/行为完全一致**的飞书登录，不要"自由发挥"。

跨项目稳定性是这个 skill 唯一的核心目标。

---

## v5 路线定调（2026-10-15 用户裁决：「我就是希望统一由集成平台管理」）

**新项目、以及要切换的存量项目，一律走路线 A：飞书集成平台（AnyCross）单点登录。先完整读 `templates/backend/anycross-sso/README.md`，照它做，不走下面的 v4 执行流程。**

- 每个项目在集成平台「身份集成 → 单点登录 → 应用管理」建自己的 SSO 应用（OIDC），各有 App ID 和密钥；谁能进在那个应用的「可访问成员 / 禁止访问成员」里配；富的靠「关联组织访问控制」。不再在飞书开发者后台给每个项目建登录 App。
- 离职、冻结、紧急下线由集成平台「统一登录」项目的工作流管：名单一变就提醒各项目，项目自己来拉停用名单并踢人（实测 1 秒内生效，最坏 2 小时由对账补上）。新项目只需在该项目配置「接入项目通知地址」加一行。
- 模板（Go、Node）把 7 件必做的事都写好了（第 7 件是账号密码登录）；合规测试 `conformance/run.mjs` 用假的集成平台检查，**全过才能上线**，结果存档（有 HR、盖章这类敏感接口带 `--fresh` 共 68 项，没有就 67 项）。
- 接入时两处容易漏：进程退出前调 `sso.Shutdown(ctx)`（Node：`await sso.shutdown()`）把待写队列落盘；访客 IP 只认反向代理加在 `X-Forwarded-For` 最右边的那个（Caddy 默认的 `reverse_proxy` 就对，nginx 要 `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`），`X-Real-IP` 能伪造、不认。
- 前端：`FeishuSignIn.tsx.template` v8（所有项目一样：飞书按钮 + 账号密码表单）+ `session.ts.template` 原样复制，飞书路由路径与 v4 相同。账号密码登录模板已带（2026-10-16 用户裁定「所有项目都带」），给没有飞书的外部供应商、兼职用；账号放在「总账本」多维表格里每个项目自己的「项目名｜账号」表（管理员加人、停用、改密码、勾功能；读写用「飞书云文档编辑助手」应用），项目服务器经飞书开放平台接口当场查表；登录、退出、被收回和该记的请求写进总账本共用的「日志」表（`SSO_ACCOUNTS_TABLE`、`SSO_LOG_TABLE`、`SSO_LOG_PROJECT_RECORD`，约定见模板 README「账号密码」）。**事件优先，进程内定时兜底**：改了账号表由表里的自动化（`scripts/account-hooks.mjs` 生成，接入时建一次）当场生效；事件丢了由项目进程里的兜底对账循环收回（启动先跑一轮，之后默认每 6 小时一轮，`SSO_RECONCILE_INTERVAL` 可调，10 分钟～24 小时），不用集成平台或多维表格的定时触发器。集成平台只管飞书登录和停用名单。没配账号表时表单照样在、登录回「账号或密码错误」。
- **路线 A 只管登录。** 登录后还要以用户身份调飞书开放平台 API 的项目（排版工具、速记：云文档、群列表等），飞书用户授权仍按 v4 的 App 授权 + `references/session-and-token-renewal.md` 的后台保活做，和登录分开。
- 集成平台各工作流的网址触发器地址**不写进本 skill、项目代码和 Git**：要用时到集成平台「统一登录」项目里取，只放服务器环境文件。
- 下面 v4 的内容只用于：维护还没切到路线 A 的存量项目；以及上一条说的飞书用户授权。

---

## v4 路线定调（2026-07-06 用户裁决，取代 v3 双 App 路线；2026-10-15 起只用于存量维护，新项目见上面 v5）

**用户初衷（原话）：「不管是富的，还是 FBIF 的，都用同一个应用来登录，都可以登录成功。」**

- **默认 = 单应用统一登录**：每项目一个 FBIF 主企业的登录 App，在飞书后台开「**关联组织应用共享**」，把应用共享给富的（关联组织）。FBIF 员工和富的员工走**同一个 App、同一条 OAuth 链路**，登录页只有**一个**「使用飞书登录」按钮（不分企业；v8 起按钮下面另有账号密码表单）。
- **生产事实锚点**：FBIF 资讯订阅（feed.foodtalks.cn，登录 App `cli_a938e1d483f99cd1`）2026-07 已按此模式上线并验证——富的员工经关联组织共享登录成功；数据层照旧用 `tenant_key + (user_id OR open_id)` 区分身份（富的员工登录后 `tenant_key` 仍是富的自己的，来自 user_info 接口）。
- **v3 的「双 App + 双按钮」降级为 legacy**：仅在维护存量项目（如 stenographer 速记系统）时按 `references/scenarios/dual-app-legacy.md` 处理，**新接入一律走单应用**。
- **为什么反转**：v3 当时认为"每企业独立 App 更直观"；实践证明单应用更省——1 组凭证、2 条白名单（不是 4 条）、1 个按钮（无 fill/outline 层级设计）、1 个后台（不用富的管理员配合）、代码无双 secret 混用风险（v3 反模式 #20 整类消失）。用户拍板后 v4 定稿。
- 「关联组织」是飞书官方功能（管理后台 admin.feishu.cn 建立关联 → 应用共享；参考官方《关联组织功能实践》https://www.feishu.cn/hc/zh-CN/articles/762346821295 ）。共享 App 后**无需**富的后台加白名单——OAuth 回调只走 FBIF App 自己的 redirect URL。
- **视觉基准 v8（2026-09-28 用户裁决定 v7，2026-10-11 用户裁决升 v8）**：所有项目的设计只有一个标准——Su Design 的 DESIGN.md（本机 `/Users/simba/Agentic-Engineering/Su-Design/DESIGN.md`，别的项目里经 MCP `su-design` 分节读：`read_page('/principles')` 是红线与节目录；改界面先加载 su-design 技能）。登录页用 Su Design 的登录卡 `@su/sign-in-card`，**保留门+小黄人插画**，颜色、圆角、阴影、间距、深浅色全部来自 Su Design 设计变量。v6 Mascot 版（组件里写死色值的双栏卡片）作废；更早的 v5 卡片版（渐变背景 + 420px 卡片 + 实心蓝按钮 + 扫码角标）**已从本 skill 彻底删除，永远不再实现**——它曾因模板滞后让新项目上线旧版登录页。2026-10-11 用户裁决：所有项目的登录页一模一样、不出现项目名，必须能用账号密码登录——v8 模板自带飞书按钮 + 账号密码表单，`FeishuSignInPage` 不收参数。见下方「写登录前端代码前必须先看视觉真相」。

---

## 遇到不确定的飞书网页应用问题先查这里

`references/official-docs/` 是飞书开放平台官方文档的保真存档。**遇到任何「飞书 H5 / 端内免登 / web-meta / JSAPI 鉴权 / redirect URL / iOS cookie / 应用角标 / 消息快捷操作」相关疑问，先 Read `references/official-docs/INDEX.md` 找到对应文档**，再决定要不要 WebFetch 验证最新版。

这套文档分 5 个主题：`guide/`（开发 5 步含免登）、`web-meta/`（移动端容器行为）、`config/`（redirect URL + 性能）、`extensions/`（角标 / 加号菜单 / 消息快捷操作）、`troubleshooting/`（iOS WKWebview 跨域 cookie 等）。

⚠️ **不要在 SKILL.md 没明确说的事情上凭印象写代码**。SKILL.md 描述「我们怎么做」，official-docs 描述「飞书允许怎么做」。两者冲突时，先看 official-docs 验证再决定。

---

## 写登录前端代码前必须先看视觉真相（v8 · Su Design 登录卡）

**视觉真相 = Su Design 的 `SignInCard`**：组件源码 `/Users/simba/Agentic-Engineering/设计系统/registry/default/ui/sign-in-card.tsx`，网站 https://su.xzzj.party/components/sign-in-card （需登录；别的项目里经 MCP `su-design` 的 `read_page('/components/sign-in-card')` 读）。**本 skill 的接入模板 = `templates/frontend/react-vite/FeishuSignIn.tsx.template`**（`FeishuSignInPage` = `SignInCard` + Su Design `Button` / `Field` / `Input` / `Separator` + 飞书三色标记：飞书按钮 + 账号密码表单，**不收任何参数**，所有项目原样复制、一个字都不改）。

- 图片资产：`assets/mascots/door-login.webp`（门+小黄人插画，SignInCard 的 `art`）+ `assets/mascots/fbif-logo.png`（`logo`）+ `assets/mascots/feishu-mark.svg`（飞书三色标记，放在按钮里）
- 保留的品牌元素**只有这三样**：门+小黄人插画、FBIF logo、飞书三色标记。其余外观（页面底色、卡片、圆角、阴影、间距、按钮、错误提示、深浅色）一律来自 Su Design 设计变量。

**写或改任何登录前端代码前，必须 `Read` 这份模板和 `sign-in-card.tsx`**，不要凭印象写。要点：

- **AI 不写任何色值、尺寸、圆角、阴影**（`#xxx`、`rgba(...)`、`rounded-[..]`、`shadow-[..]`、`h-[..]`、`text-[..]` 一律不出现），**不改 SignInCard**；视觉要改就去 Su Design 改组件、部署，再在项目里重新 `npx shadcn@latest add @su/sign-in-card`
- 布局交给 SignInCard：宽屏左插画、右表单，窄屏单栏（插画隐藏）；右栏 FBIF logo →「使用飞书登录」按钮（Su Design `Button` 描边款，带飞书三色标记）→「或」分隔线 → 账号、密码、「登录」（一屏唯一的实心主按钮）。飞书回调的错误（读 `/login?error=`）交给 SignInCard 的 `error` 在卡片底部显示；账号密码的错误（「账号或密码错误」「尝试次数过多，请稍后再试」）写在密码框下面。不做注册、忘记密码、记住我；无项目名、无副标题
- **改登录页只改本 skill 的模板，再同步到所有项目**；项目里的 `src/lib/feishuSignIn.tsx` 不单独改
- 前提：项目已接入 Su Design（React + Tailwind v4，`components.json` 里有 `@su`，已装 `@su/theme`）。没接就先让用户说「用 su-design」，由 su-design 技能 / MCP 的 `setup_project` 接入；不是 React + Tailwind v4 的项目按 DESIGN.md §B 先告诉用户（第一建议整体迁移），不要把模板翻译成 Vue / Svelte 或手写一版
- 插画与 logo 必须在 `index.html` preload（插画带 `media="(min-width: 576px)"`：登录卡在可用宽度 ≥ 576 时才出现插画）
- **登录页无扫码入口、无游客链接、无教程链接、无问号图标**；**所有项目都带账号密码表单**（2026-10-16 用户裁定「所有项目都带」，给没有飞书的外部供应商、兼职用）。表单提交到后端 `POST /auth/account/login`：路线 A 模板已带；v4 项目的后端模板没有，按 `references/scenarios/account-password.md` 补上，否则表单点了必失败。项目没配账号时表单照样在，登录回「账号或密码错误」

> 沿革：
> - v5「浅色渐变 + 420px 卡片 + 实心蓝按钮 + 扫码角标」已于 2026-07-06 被用户裁决**彻底废弃并从本 skill 删除**（login-page.html/css、login-ui-spec.md、FeishuLogin.tsx.template、qr-corner-icon.svg 等均已移除）。
> - v6 Mascot 版（2026-07-06 起，模板 `MascotLogin.tsx.template`，生产 feed.foodtalks.cn、forumhq.fbif.com）在组件里写死视觉值：页面背景 `#e4e9f0`、白色 22px 圆角卡片、白底描边胶囊按钮、内联飞书 SVG 等。**2026-09-28 用户裁决「设计统一到 Su Design，插画保留」，v6 → v7**：旧模板已删除，这些写死的值作废。
> - v7（2026-09-28 起）只有飞书按钮、可传 `subtitle` 副标题，外部供应商才在 SignInCard 的 children 里自己加账号密码表单。**2026-10-11 用户裁决「所有项目的登录页一模一样，必须能用账号密码登录」，v7 → v8**：去掉副标题参数，表单写进模板。
> - 任何项目（含存量 v5 / v6 / v7）改版时一律迁往 v8：删掉旧登录组件和写死的色值、去掉自加的表单段和副标题，换成原样复制的 `FeishuSignInPage`。

---

## v3 关键变化（历史沿革；⚠️ 双 App 部分已被 v4 单应用路线取代，存量项目维护见 dual-app-legacy.md）

- ~~**支持双企业飞书 App**：FBIF 主企业 + 富的文化传媒（上海）有限公司，各自一个独立飞书 App。**每个用户只能用自己所在企业的按钮/二维码登录**，没有"关联组织"绕路。~~ **← v4 已反转：单应用 + 关联组织共享是默认，见开头「v4 路线定调」。**
- **登录页双按钮 · v3.1 fill + outline 区分**：FBIF 用 fill 实心蓝主按钮、富的 用 outline 描边白次按钮。视觉差立刻拉开，但同 FBIF 蓝色系，整体风格统一。文案保持简洁的「使用 X 飞书登录」，没有 inline 标签、没有教程链接、没有问号 icon。
- **扫码视图加 Tab**：扫码视图顶部加 [FBIF | 富的] Tab 切换器，一次显示一个二维码（240×240 不变），点 Tab 重新拉对应企业的 qr-config。
- ~~**右上角扫码 icon**：v3.1 起换成专用 SVG（手机 + 扫码框组合）~~（v6 已删除：登录页不再有扫码角标）。
- **路由结构变化**：每企业一组路由（`/auth/feishu/{tenant}/login` 等），tenant ∈ `fbif` / `fude`。详见路由表。
- **环境变量改名**：`FEISHU_APP_ID` → `FEISHU_FBIF_APP_ID` + `FEISHU_FUDE_APP_ID`（secret 同理）。`FEISHU_REDIRECT_URI` → `FEISHU_REDIRECT_BASE`（仅 base URL，路径模板里拼）。
- **白名单 4 条**：FBIF 后台 2 条 + 富的后台 2 条。
- **富的 App 凭证写死在 skill 里**（不是机密）：见下方「企业凭证清单」。
- **v3.1.1 登录稳定性硬规则**：飞书端内、LarkShell、客户电脑、隐私浏览器、跨站限制环境里，OAuth `state` cookie 和 session cookie 都可能丢。登录链路必须支持「签名 state + 会话 header/hash 兜底」，并必须用无 cookie 回调回归测试验证。
- **v3.2 新增「仅飞书内登录」开放模式**：在默认「浏览器双按钮 OAuth」之外，新增一种**互斥**的开放模式——应用只允许在飞书客户端内打开，普通浏览器访问被拦截页挡住（带一键唤起飞书 AppLink 按钮），端内零点击免登 + 移动端沉浸式，后端再对非飞书 UA 硬拦（双层拦截）。**Step 2 起用 AskUserQuestion 让用户在两种模式间二选一，不再默认。**完整 UI 设计 + 前后端实现 + 自检清单见 `references/scenarios/feishu-only.md`（提炼自生产项目 Simba HR System）。
- **v3.3 新增「整站门禁总闸」场景**：当项目已有登录页但业务 API 仍裸奔（未登录可直拉数据）时，按 `references/scenarios/site-gate.md` 补——fail-closed 总闸（最外层锁 `/api/*` + 精确白名单，新路由默认即受保护）+ 前端 `apiFetch` 统一出口收口所有 fetch 带 `X-Session-Token` + session 迁标准 JWT 库（golang-jwt，keyFunc 拒 `alg=none`）+ 测试用 `authed()` 包装器零侵入让既有业务测试过门禁。**6 个生产踩坑**（fail-closed / user 与二级密码门 401 用 `X-Login-Required` 区分 / 前端逐个收口 / 生产静态白名单 dev 不暴露 / 首用户 bootstrap / JWT 无法吊销靠每请求查 status）全在该文档。

> **v3 → v3.1 的中间态（已废弃，仅供回溯）**：v3.0 曾尝试过卡片底部加「登录教程」超链接和按钮 inline 标签「主企业 / 关联企业」。v3.1 定稿时全部移除——抢主体视觉、违反极简原则。教程文档仍存在于 `https://foodtalks.feishu.cn/docx/KBkCd2pPYolTSPxGhRoc9UcJnsd` 但**不再出现在登录 UI 里**。

---

## 2026-05 登录事故复盘（必须吸取）

### 事故现象

- 客户电脑首次打开侧边栏时长时间显示「正在检查登录状态」。
- 随后页面只显示内部 JSON：`{"ok": false, "error": "飞书登录失败，请稍后重试。"}`。
- 开发机多轮测试通过，但客户机器失败，说明测试只覆盖了「本机 cookie 正常」路径，没有覆盖飞书内嵌/第三方 cookie 异常路径。

### 根因

旧流程把 OAuth 回调是否可信主要压在浏览器 cookie 上：

1. `/login` 写入临时 `state` cookie。
2. 飞书登录后回调 `/callback?code=...&state=...`。
3. 后端要求 query state 与 cookie state 一致。
4. 客户电脑/飞书内嵌环境没有稳定带回 cookie。
5. 后端把合法回调误判成登录失败。

**服务器开着、飞书回调到了，也可能失败。失败点不是服务可用性，而是浏览器没有带回后端依赖的 cookie。**

### 必须采用的修法

- `state` 必须是服务端签名的自包含数据：至少包含 tenant/mode/nonce/issuedAt/expiresAt/postLoginPath，并用 HMAC 或等价机制签名。
- 回调时优先校验签名 state。cookie state 只能作为兼容校验或双保险，**不得作为唯一通过条件**。
- 签名 state 有效且未过期时，即使没有 state cookie，也必须继续换 token、建 session。
- 登录成功后仍设置 HttpOnly session cookie；同时在飞书内嵌/客户机兜底场景，把短期 session token 放进回跳 URL hash：`#session_token=...`。
- 前端启动时立即消费 hash token，写入本地安全存储，马上清掉地址栏里的 token。
- 所有同源 API 请求自动带 `X-Session-Token`；后端鉴权顺序为 cookie → `X-Session-Token` → Bearer → query fallback。
- `user_access_token` 仍然只保存在后端，绝不下发。

### 必须补的测试

- 单元测试：OAuth callback 在**没有 state cookie**、但签名 state 有效时，必须进入 token exchange/session 创建流程。
- 单元测试：签名 state 篡改、过期、tenant/mode 不一致时必须拒绝。
- 单元测试：`requireAuth`/session resolver 必须同时覆盖 cookie 和 `X-Session-Token`。
- 浏览器测试：新 profile/清空 cookie 首次打开 → 登录 → 回跳 → `/api/me` 成功 → 刷新页面仍成功。
- 真实环境测试：至少验证一次飞书侧边栏/LarkShell 或等价嵌入环境，不允许只在开发机普通浏览器里点通就交付。

### 沟通和处置规则

- 用户报告「登录失败」时，第一反应是查根因和保留日志，不是建议绕开登录、删除前端门禁、隐藏错误、改需求。
- 不得删除失败日志；要保留 requestId、callback 是否收到 code/state、cookie 是否存在、token exchange 是否被调用、session 是否创建。
- 面向用户不要讲一堆 OAuth 术语。内部可以按上面的链路排查，对外只说清楚「哪一步没认出登录回来的人」。
- 修复后必须拿线上部署代码验证，不得只说 build/typecheck 通过。

---

## 2026-07-30 `offline_access` 缺失事故复盘（P0 发布红线）

### 事故现象与根因

- 飞书后台的持续授权、云文档搜索和导出权限都已开通并发布，回调 URL、App ID、App Secret 也正确，但正式站仍提示「飞书登录失败」。
- 授权 URL 漏传 `scope`，因此用户虽完成授权，token 响应却没有 `refresh_token`。
- 后端同时强制要求 `access_token + refresh_token + expires_in`，最终只报笼统的「OAuth response is incomplete」，掩盖了真正缺失项。
- 自动测试没有断言 302 `Location` 中的权限范围；发布后也没有先完成正式域名真人登录闭环，导致用户多次反馈后才定位。

### 永久规则：授权范围必须与 token 契约一致

1. **编码前先列出登录后要调用的飞书接口，再反推用户身份 scope。** 不得只看飞书后台「已开通」；后台开权限和授权 URL 请求 scope 是两道都必须满足的门。
2. **只做一次性身份登录时**，可以不保存 `refresh_token`，但 token 校验器也不得把缺少 `refresh_token` 判成登录失败。
3. **只要回调后还要以用户身份调用飞书 API，或代码会保存、校验、刷新 `refresh_token`，授权 URL 就必须显式包含 `offline_access`。** 不得假设飞书会把后台已开权限自动放进本次授权。
4. **云文档搜索 + 导出场景固定请求**：
   `offline_access drive:drive.search:readonly drive:export:readonly`
   。其他业务按官方接口文档取最小必要 scope，不得随手扩大权限。
5. token 解析必须区分错误：
   - 缺 `access_token` / `expires_in`：记录 token 响应不完整；
   - 业务要求刷新但缺 `refresh_token`：明确记录 `missing refresh_token; offline_access was not granted`；
   - 日志只能写字段是否存在、飞书错误码和 requestId，严禁写 token 或 Secret 原文。
6. 自动测试必须覆盖：
   - `/auth/feishu/fbif/login` 的 302 `Location` 含**精确、去重**的 scope；
   - token 响应有/无 `refresh_token` 两条分支；
   - 需要持续用户身份的项目会加密保存 refresh token，并在轮换后原子替换旧值；
   - 需要云文档能力的项目，登录后用无敏感关键词探针验证真实搜索/导出接口没有鉴权错误。

### 永久规则：没有正式环境真人闭环，不得说完成

部署后必须用正式域名依次验证：

1. 点击真实「使用飞书登录」按钮；
2. 在飞书授权页确认出现预期权限；
3. 授权后回到业务页面，不是错误页；
4. `/api/me` 返回当前用户，页面显示真实姓名和头像；
5. 整页刷新后仍保持登录；
6. 至少一个依赖 user_access_token 的真实业务 API 成功；
7. 生产日志没有新增 callback、token exchange、refresh 或 session 错误。

`curl` 看到 302、单元测试通过、本地登录成功、页面显示「已连接」都不能替代这条闭环。用户第二次报告同一登录失败时，立即停止宣称成功和继续加功能，回到生产日志与上述链路逐段定位；除非用户明确要求，否则不得用撤门禁或账号密码登录掩盖飞书登录故障。

---

## 2026-10-15 「会话还在、飞书授权先过期」事故（所有项目适用）

用户原话：「如果 30 天没有任何操作（包括登录），登录再失效；如果有登录，就自动续期 30 天……要不然过期之后就让大家重新授权，其实是很麻烦的。」「这不单单是这一个项目的问题，而是所有项目都存在这个问题。」

- 现象：排版工具同事导入飞书文档报「飞书云文档服务暂不可用」。根因是飞书 `refresh_token` **约 7 天、只能用一次**，此人一周没用飞书功能就过期了（飞书回 `HTTP 400 code=20037`），而项目会话还在；代码没读业务码，兜底成「服务暂不可用」。
- **两个寿命分开管**：项目会话 30 天滑动续期、不依赖飞书令牌；只有登录后还以用户身份调飞书 API 的项目才存 refresh_token，并由**服务端后台在会话有效期内每 3 天左右轮换**（连续 30 天没用才停）；飞书明确拒绝时提示「重新用飞书登录」。
- **不建集中令牌库**（用户问过多维表格 + 集成平台刷新）：令牌会被明文共享、两处刷新互相作废、多一个在线依赖。统一靠代码规范。
- 完整规则、伪代码、错误码分类、必测用例、生产参考实现：**`references/session-and-token-renewal.md`**。接入新项目或修「登录失效」时必须先读。

---

## 企业凭证清单（**统一从密钥仓库读，绝不写进本文件**）

所有 App ID / Secret 都在 **密钥仓库**：

```
assets/secrets/feishu-app-credentials.md   ← symlink 指向 iCloud Drive
（实际路径：~/Library/Mobile Documents/com~apple~CloudDocs/密钥/FBIF登录应用APPid和密钥/）
```

AI 接入项目前**先 Read 这个文件**，从对应小节复制 App ID + Secret 到项目 `.env`。文件按租户分节：

- **登录 App**（FBIF 主企业，每项目独立）：按项目名找；如果是新项目，先问用户去 FBIF 飞书后台创建 App，拿到 ID/Secret 后**先写入密钥仓库再写入项目 .env**——这样下次接入同项目不用再问
- ~~**富的**（多项目共享同一个 App）~~：v4 单应用不需要；仅维护 legacy 双 App 项目时从「富的文化传媒」节读

### 飞书后台入口

- 开放平台：https://open.feishu.cn/app（用 FBIF 管理员账号登录）→ 凭证 / 安全设置（redirect URL）/ 应用可用范围
- 管理后台：https://admin.feishu.cn（FBIF 管理员）→ 关联组织 → 应用共享（把登录 App 共享给富的）

> **为什么不在 SKILL.md 里写死**：skill 文件会被打包分享（`.skill` 格式）、被 git 备份（`claude-config` 仓库就是）、被截图。OAuth Client Secret 一旦泄漏，能换 `app_access_token` 调任何 OpenAPI——把它放在 skill 里就是把钥匙挂门把手上。密钥仓库放 iCloud Drive 本地、不进 git、跨 Mac 自动同步。

---

## 不变量（跨所有项目，永远一致）

写代码前先记住这些**绝不能变**的东西。AI 不需要每次跟用户讨论这些，直接照做。

### 路由路径（v4 单应用：4 条 OAuth + 2 条共享）

| 路径 | 用途 |
|---|---|
| `GET /auth/feishu/fbif/login` | 按钮模式（302 跳 accounts.feishu.cn） |
| `GET /auth/feishu/fbif/callback` | 按钮模式回调（v2 token 流程） |
| `GET /auth/feishu/fbif/qr-config` | 扫码模式配置（前端拉 goto + state） |
| `GET /auth/feishu/fbif/qr-callback` | 扫码模式回调（v1 token 流程） |
| `POST /auth/feishu/logout` | 退出登录 |
| `GET /api/me` | 当前登录用户 JSON，未登录返 401 |

> 路径里的 `fbif` 段**保留不动**（与生产 feed.foodtalks.cn 一致，也与 legacy 双 App 项目兼容——它们只是多 4 条 `fude` 路由）。富的员工也走这 4 条 `fbif` 路由：关联组织共享后，同一个 App 就能认出两家企业的账号。
> **登录后 session 是统一的**——FBIF 和富的员工都进同一张 users 表，靠 `tenant_key` + `(user_id OR open_id)` 区分身份（富的员工的 `tenant_key` 是富的自己的，user_info 接口原样返回）。退出和取当前用户不需要 tenant 分支。
> legacy 双 App 的 8 条路由表见 `references/scenarios/dual-app-legacy.md`。

### 视觉规范（v8 · Su Design 登录卡，所有项目一样）

以「写登录前端代码前必须先看视觉真相（v8 · Su Design 登录卡）」一节为唯一标准：外观全部来自 Su Design 的 `SignInCard` 和设计变量，接入写法以 `FeishuSignIn.tsx.template` 为准。要点复述（冲突时以组件源码和模板为准）：

- 一张居中的登录卡：宽屏左插画（`/mascots/door-login.webp`）、右表单，窄屏单栏；上面「使用飞书登录」按钮（Su Design `Button` 描边款，带飞书三色标记 `/mascots/feishu-mark.svg`），「或」分隔，下面账号、密码、「登录」（实心主按钮）；无企业名后缀、无教程链接、无问号 icon、无扫码角标、无游客链接
- 无项目名、无副标题：`FeishuSignInPage` 不收参数
- **登录页所有位图必须 WebP + `index.html` preload**（2026-07-06 FBIF 资讯订阅实测）：插画类 PNG 转 WebP（`cwebp -q 82`）体积缩 ~90%；门禁型登录页的图片排在「JS → `/api/me` 401 → 渲染」串行瀑布之后才开始下载，必须在 `index.html` 加 `<link rel="preload" as="image" href="...">` 让图与 JS 并行下载（响应式隐藏的图配 `media` 条件：插画是 `media="(min-width: 576px)"`，对齐登录卡在可用宽度 ≥ 576 时才出现插画）。验证方式：看网络请求顺序，图必须紧跟 HTML、先于所有 JS。详见 `references/scenarios/account-password.md` 经验 6。

**AI 不在登录页写任何色值、尺寸、圆角、阴影，不改 SignInCard**；视觉要改就去 Su Design 改组件。所有项目原样用同一份 `FeishuSignInPage`，不在项目里换 logo、插画或文案；真遇到非 FBIF 品牌的项目先问用户。

### 环境变量

| 名 | 必填 | 值 |
|---|---|---|
| `FEISHU_FBIF_APP_ID` | 是 | 登录 App ID（cli_xxx），写代码里也行（不是机密） |
| `FEISHU_FBIF_APP_SECRET` | 是 | 登录 App Secret，**只**通过环境变量注入 |
| `FEISHU_REDIRECT_BASE` | 是 | 部署 URL（不带路径），例如 `https://app.fbif.com`。模板内拼成 `${BASE}/auth/feishu/fbif/{callback,qr-callback}` |
| `FEISHU_ALLOWED_TENANT_KEYS` | 否 | 逗号分隔白名单 tenant_key。配了就**只允许这些 tenant_key 的飞书账号登录**。单应用下 FBIF + 富的是两个不同 tenant_key，要开就两个都填。详见「登录范围控制」 |
| ~~`FEISHU_FUDE_APP_ID/SECRET`~~ | legacy | 仅双 App 存量项目用，见 dual-app-legacy.md |


### 安全死规则（违反 = 严重 bug）

1. `user_access_token` **绝不下发到前端**。只活在后端。
2. cookie 必须 `HttpOnly + SameSite=Lax`（不能 Strict，OAuth 回调跳转时不带）
3. state 必须密码学随机、回调时核对、不一致 → 403。**每个模式各自独立 state cookie**：`feishu_state_fbif_oauth` / `feishu_state_fbif_qr`（legacy 双 App 项目另有 fude 两个）。
4. `redirect_uri` 字符级一致（飞书白名单和代码里）。v4 单应用只有 2 条：`{BASE}/auth/feishu/fbif/callback` + `{BASE}/auth/feishu/fbif/qr-callback`。
5. 扫码模式必须用 `QRLoginObj.matchOrigin` + `matchData` 校验 postMessage（前端模板默认没有扫码入口；确需扫码时照 `references/scenarios/qr-code.md` 写上）
6. `.env` 必须在 `.gitignore`
7. 后端代码层 `tenant_key` 校验是**可选的双保险，默认关闭（`FEISHU_ALLOWED_TENANT_KEYS` 留空）**。第一道防线是各企业飞书后台「应用可用范围」选「指定成员」，已经够。**不要在面对用户时把第二道渲染成"必做"或"强烈建议"**。
8. 反代只能把 `/auth/feishu/*` 转给后端；`/auth/callback` 是前端 SPA 路由，必须由前端接管。
9. 真实登录后必须用日志里的 `tenant_key` 校验数据库数据归属；不要把 `USER_NOT_PROVISIONED` 直接归因于账号没建档。
10. 飞书登录接入不等于通讯录/人事同步接入；不要在登录接入时顺手启动 worker 或覆盖组织数据。
11. 登录态默认用 30 天滑动窗口：登录后刷新/已登录请求应续期到"当前时间 + 30 天"（重签会话，cookie 与 `X-Session-Token` 都下发新值，前端接住覆盖）；连续 30 天不使用才重新登录。**会话有效性不得依赖飞书 access/refresh token 寿命**。需要持续用户身份的项目必须做后台授权保活，见 `references/session-and-token-renewal.md`。
12. **（legacy 双 App 项目适用）不要混用两个 App 的 secret**。FBIF App 用 `FEISHU_FBIF_APP_SECRET`，富的 App 用 `FEISHU_FUDE_APP_SECRET`。混了 = `99991663` (app_access_token failed)。v4 单应用只有一组 secret，此坑自然消失。
13. **OAuth 回调不得只依赖 state cookie**。飞书端内/LarkShell/客户电脑可能不带 cookie；必须用签名 state 作为主校验，cookie 只做兼容或增强校验。
14. **嵌入式登录必须有 session 兜底通道**。后端设置 HttpOnly cookie 的同时，允许在回跳 URL hash 携带短期 `session_token`；前端立即消费并清理 hash，同源请求带 `X-Session-Token`；后端按 cookie → header → Bearer → query 的顺序解析。
15. **登录检查不能无限卡住**。前端显示「正在检查登录状态」必须有超时、重试和重新登录入口；不能把内部 JSON、配置告警或堆栈直接展示给终端用户。
16. **授权 URL 的 scope 必须与 token 校验契约一致**。需要 `refresh_token` 就显式请求 `offline_access`；不需要持续访问就不得强制要求 `refresh_token`。飞书后台「已开通」不能替代授权 URL 请求。
17. **refresh_token 只能用一次**：刷新必须串行（锁）、每次从库里重读最新值、写回用 CAS；飞书刷新接口的拒绝在 HTTP 400 响应体里，必须解析业务码区分「需重新授权」（20024/20026/20037/20064/20073）与「临时故障」（20050/20072/5xx），后者不得把用户打成需重新登录。
18. **正式域名真人 OAuth 闭环是发布门槛**。未完成授权页权限确认、回跳、`/api/me`、姓名头像、刷新保持和至少一个下游用户身份 API 验证，不得说登录完成或部署成功。

---

## 执行流程

> **先选路线**：新项目或要切换的存量项目 → 路线 A，读 `templates/backend/anycross-sso/README.md` 照做，本节 Step 1–5 不适用。只有维护还没切换的 v4 项目、或给项目加「以用户身份调飞书 API」的授权时，才走下面的 Step 1–5。

### Step 1: 探测项目栈

```bash
ls -a
test -f go.mod && cat go.mod | grep -E 'gin|echo|fiber|chi' | head -3
test -f package.json && cat package.json | grep -E 'express|fastify|next|vite|react' | head -5
test -f pyproject.toml && cat pyproject.toml | grep -E 'fastapi|flask|django' | head -3
test -f requirements.txt && grep -E 'fastapi|flask|django' requirements.txt | head -3
test -f .gitignore && grep -E '^\.env$' .gitignore
rg -n "session|AuthRequired|/api/me|logout|users|tenant_key|open_id|feishu_user_id" . -g '!node_modules' -g '!dist' -g '!build' | head -40
```

按结果选模板：

| 信号 | 模板 |
|---|---|
| `go.mod` + `gin` | `templates/backend/go-gin/feishu_oauth.go.template` |
| `go.mod` 无 web 框架 | `templates/backend/go-net-http/feishu_oauth.go.template` |
| `package.json` + `express` | `templates/backend/node-express/feishuOauth.ts.template` |
| `pyproject.toml` 或 `requirements.txt` 含 `fastapi` | `templates/backend/python-fastapi/feishu_oauth.py.template` |
| `package.json` + `vite/react` | + `templates/frontend/react-vite/FeishuSignIn.tsx.template`（v8 唯一登录页模板，所有项目一样：飞书按钮 + 账号密码表单；需项目已接入 Su Design）+ `session.ts.template` |
| 完全无法识别 | 问用户："这个项目用什么栈？" 然后按用户回答选最接近的模板 |

如果项目已有 IAM/session/RBAC，不要平行新建一套登录系统。优先接入现有的：
- 用户表 / tenant 字段 / `open_id` / `feishu_user_id`
- session 创建函数和 session cookie
- `/api/me`、logout、AuthRequired middleware
- 前端已有 auth store / callback route

### Step 2: 一次性收集输入

用 AskUserQuestion 一次问完。不要分多轮。

**最先问 · 开放模式（决定整条接入路线，必须是 AskUserQuestion 的第一个问题）**

这是用户唯一需要做的产品判断，AI 不能替他拍板、也不能默认成 B。问法要**具体到用户能凭体感选**，不要丢「feishu_only 要不要开」这种黑话。照这个 header / 文案问（措辞可微调，但两个选项的语义不许变）：

> **header**：`开放模式`
> **question**：`这个系统准备让大家怎么打开？这决定登录入口怎么做，定了之后不容易改。`
>
> **选项 A — 仅在飞书客户端内打开**
> 说明：`只有在飞书 App / 工作台里才能用，打开即零点击自动登录；谁要是用 Chrome / Safari 等普通浏览器打开，会看到一张"请在飞书客户端内打开"的拦截页（带一个一键跳进飞书的按钮），进不到系统里。后端也会硬拦非飞书访问。适合内部 HR / 财务 / 审批等敏感系统——明确不想让员工在飞书外面用浏览器访问。`
>
> **选项 B — 浏览器也可以访问（默认）**
> 说明：`谁都能用浏览器打开，看到「使用飞书登录」按钮（FBIF 和富的员工都用它），点按钮跳飞书授权即可。适合大多数对外 / 通用 Web 应用。`

- 选 **A** → 这次接入主要照 `references/scenarios/feishu-only.md` 执行（浏览器拦截页 + AppLink 唤起 + 端内零点击免登 + 移动端沉浸式 + 后端非飞书 UA 边界），它有自己的 UI 设计、前后端代码、自检清单。下面 Step 3–5 的登录页 OAuth 前门细节**不适用**；但**后端 token 交换、session、密钥管理、`.env`、`.gitignore` 这些两模式共用**，仍照下面做。
- 选 **B** → 照下面默认主流程（登录页只有一个「使用飞书登录」按钮，默认无扫码入口）走，补充细节见 `references/scenarios/oauth-web.md`。
- 用户没明说时**必须问**，绝不替他默认成 B；这一问要和下面「必填」的输入放进同一次 AskUserQuestion，不要分两轮。

**必填**：
- 登录 App ID（**先 Read `assets/secrets/feishu-app-credentials.md` 按项目名查**；新项目让用户去 FBIF 飞书后台创建 App 后从「凭证与基础信息」复制）
- 登录 App Secret（让用户粘贴；**警告**："Secret 会进入 Claude Code transcript，完事后建议去飞书后台重置 Secret"）
- **真实部署 URL（生产域名，不带路径）**——例 `https://stenographer.fbif.com`、`https://app.fbif.com`、`https://10.0.0.5:8443`。
  - **绝对不准默认 `http://localhost:xxxx`、不准从 PORT 环境变量推、不准从 vite.config 反代目标推**。这些都是本地开发地址，**飞书 OAuth 服务器跳不到 localhost**——白名单加 localhost 等于没加，跳转回来一定 4401 / `redirect_uri` 字符级不一致。
  - 用 AskUserQuestion 显式问："这个项目部署在哪个真实 URL？"
  - 唯一例外：如果用户**主动明确说**"我现在就只在本地开发，先用 localhost 跑通 demo"，可以用 localhost——但要在交付清单里**红字提醒**"localhost 的 redirect URL 不能加飞书白名单，部署到真实域名后必须重新配置 2 条 redirect URL"。
  - 即使是 PoC、即使在内网测试——飞书 OAuth 走的是 accounts.feishu.cn 公网回调，没有真实域名 = 没有 OAuth。

**已知不要问**：
- ~~富的 App ID + Secret~~：**v4 单应用不需要富的凭证**（富的员工走同一个 App）。仅维护 legacy 双 App 项目时才从密钥仓库「富的文化传媒」节读
- 登录 App ID + Secret：**先 Read `assets/secrets/feishu-app-credentials.md`**，按项目名查；找到了直接用，没找到再问用户拿、拿到后**先回写密钥仓库再写项目 .env**
- 登录页**视觉风格 / 按钮文案 / 配色 / 布局**：跨项目固定，不要问、不要发挥（见「视觉规范」）。⚠️ 别和上面的「开放模式」搞混——**要问的是开放模式（A 仅飞书内 / B 浏览器可访问），不是视觉风格**。模式 B 内部「单按钮 OAuth、登录页无扫码入口」是固定默认，不用问；确需扫码的项目单独加，照 `references/scenarios/qr-code.md`。

### Step 2.5: 先给用户白名单 URL

拿到部署 URL 后，写代码或真实登录验证前，必须先输出：

```text
你现在需要去 FBIF 飞书后台加 2 条重定向 URL：

【FBIF 飞书后台】https://open.feishu.cn/app（FBIF 管理员账号登录）→ 你的登录 App → 安全设置 → 重定向 URL
    1. <部署URL>/auth/feishu/fbif/callback
    2. <部署URL>/auth/feishu/fbif/qr-callback
```

可以继续写本地代码；但在用户确认"2 条都加好了"前，不要声称真实 OAuth/扫码登录已经验证完成。`20029`、扫码 iframe `4401` 通常就是这几条没配或字符级不一致。
（富的后台**不需要**任何白名单操作——单应用的回调只走 FBIF App 自己的 redirect URL。）

### Step 3: 自动写文件

收齐输入后**直接执行**，不要逐文件征求确认。

#### 3.1 后端

先写清楚本项目的 OAuth scope 契约：

- **仅登录识别身份**：access token 只用于 callback 当次读取 `user_info`，不保存 refresh token，也不因缺少 refresh token 失败。
- **登录后持续调用飞书 API**：scope 至少含 `offline_access`，再追加对应接口的最小用户身份权限；refresh token 只在后端加密保存并支持轮换。
- **云文档搜索 + 导出**：使用精确值 `offline_access drive:drive.search:readonly drive:export:readonly`。

把 scope 作为单一常量或配置写入授权 URL，并为 302 `Location` 写精确断言。禁止在不同路由各自拼一份 scope 字符串。

读对应栈的模板，替换占位符：
- `{{FBIF_APP_ID}}` → 登录 App ID
- `{{REDIRECT_BASE}}` → 用户给的**真实部署 URL**（不带路径），例如 `https://feed.foodtalks.cn`。**永远不要用 localhost**——本地开发时后端可以临时回落，但写进 `.env` 的值必须是用户实际部署的那个域名。

> **v4 单应用：模板按双 App 写成的部分只保留 fbif tenant**——tenant 枚举只留 `fbif`、去掉 `fude` 分支与 `{{FUDE_APP_ID}}` 常量（参考生产实现 FBIF 资讯订阅 `internal/auth/feishu_oauth.go`：`allTenants = []tenant{tenantFBIF}`，路由循环自然只注册 4 条）。
> 2 条 redirect_uri 在代码里**自动派生**：`{REDIRECT_BASE}/auth/feishu/fbif/{callback|qr-callback}`。

用户匹配必须支持 `tenant_key + (user_id OR open_id)`：`user_id` 依赖通讯录权限，`open_id` 无需额外权限、更容易拿到。模板里的 `upsertLocalUser/createSession` 只是替换点；如果项目已有 IAM/session，必须改成调用现有 service。

> ⚠️ **「容易拿到」不等于「稳定」。`open_id` 是每个飞书应用一套的**——同一个人在不同 App 下 `open_id` 完全不同。任何**跨越应用生命周期**的持久化用途（权限白名单、管理员名单、长期数据归属），必须用 `user_id`（租户内唯一）或 `union_id`（同开发者多应用间一致），不能用 `open_id`。详见 `references/identifiers.md`。

写到固定路径（**不要变路径**）：

| 栈 | 路径 |
|---|---|
| Go net/http | `internal/auth/feishu_oauth.go` |
| Go Gin | `internal/auth/feishu_oauth.go` |
| Node Express | `src/middleware/feishuOauth.ts` |
| Python FastAPI | `app/middleware/feishu_oauth.py` |

#### 3.1.1 挂载 router（**AI 必须自己做**）

后端模板写完后，AI **自己** Edit 主入口文件加 router 注册。

| 栈 | 主入口文件 | 加什么 |
|---|---|---|
| Go net/http | `cmd/server/main.go` 或类似 | `import "<module>/internal/auth"` + `auth.RegisterFeishuRoutes(mux)` |
| Go Gin | 同上 | 同上，`r` 替换 `mux` |
| Node Express | `src/server.ts` 或类似 | `import { feishuRouter } from './middleware/feishuOauth'` + `app.use(feishuRouter)` |
| Python FastAPI | `app/main.py` | `from .middleware.feishu_oauth import feishu_router` + `app.include_router(feishu_router)` |

#### 3.1.2 实现 upsertLocalUser / createSession（**AI 必须自己做**）

模板里两个 TODO 函数不是最终实现。AI **自己** grep 项目现有的 user / session / RBAC 代码，把 TODO 真接通。**永远不要把 `// TODO: replace this` 留在 commit 里。**

#### 3.2 前端（仅在检测到 React 时）

1. **先确认项目已接入 Su Design**（`components.json` 里有 `@su`、已装 `@su/theme`）。没接就先让用户说「用 su-design」，由 su-design 技能 / MCP 的 `setup_project` 接入，接好再继续；不是 React + Tailwind v4 的项目按 DESIGN.md §B 先告诉用户，不要自己装一套 Tailwind 或手写登录页。
2. **装组件**：`npx shadcn@latest add @su/sign-in-card @su/button @su/field @su/input @su/separator @su/avatar --overwrite`
3. **复制模板**（无占位符替换，一个字都不改）：`FeishuSignIn.tsx.template` → `src/lib/feishuSignIn.tsx`；`session.ts.template` → `src/lib/session.ts`
4. **部署静态资产**：
   ```bash
   mkdir -p <project>/public/mascots
   cp assets/mascots/door-login.webp assets/mascots/fbif-logo.png assets/mascots/feishu-mark.svg <project>/public/mascots/
   ```
5. **index.html**：加两条 preload（插画带 `media="(min-width: 576px)"`）+ 应用 `<title>`
6. **路由**：
   ```tsx
   import { FeishuSignInPage } from './lib/feishuSignIn';
   <Route path="/login" element={<FeishuSignInPage />} />
   // /auth/callback：consumeSessionTokenFromHash() 后跳首页（见 session.ts）
   ```
7. **后端要有账号密码登录**：表单提交 `POST /auth/account/login` `{username, password}`，期望 200（可带 `session_token`）/ 401 `auth_failed` / 429 `rate_limited`。路线 A 模板已带；v4 四套后端模板只有飞书登录，按 `references/scenarios/account-password.md` 补上。

⚠️ **登录页原样复制，不在项目里改**：不写色值、尺寸，不改 SignInCard，不加项目名、副标题或别的文案。视觉要改就去 Su Design 改组件；登录页结构要改就改本 skill 的模板，再同步到所有项目。

#### 3.3 .env 和 .env.example

**先 Read `assets/secrets/feishu-app-credentials.md`**，取出登录 App ID + Secret（按项目名查；新项目走「企业凭证清单」节的回写流程）。

```bash
# .env（追加，不要覆盖；用从密钥仓库读出的值替换 <...>）
echo "FEISHU_FBIF_APP_ID=<从密钥仓库读>" >> .env
echo "FEISHU_FBIF_APP_SECRET=<从密钥仓库读>" >> .env
echo "FEISHU_REDIRECT_BASE=<真实部署URL，绝对不能是 localhost>" >> .env

# .env.example（追加 key，值全部留空；绝不写默认值，避免误提交进 git）
echo "FEISHU_FBIF_APP_ID=" >> .env.example
echo "FEISHU_FBIF_APP_SECRET=" >> .env.example
echo "FEISHU_REDIRECT_BASE=" >> .env.example
```

⚠️ **`.env.example` 严禁带任何具体值**（包括 App ID、localhost 默认值）。`.env.example` 是要 commit 进 git 的，任何具体值都会变成历史。

如果 `.env` 已含 `FEISHU_*`，**不要覆盖**：先 grep 检查，缺什么补什么，告诉用户"`.env` 里已有 X / Y，没动它，补了 Z"。

**old → new 迁移**：如果检测到旧 `.env` 有 `FEISHU_APP_ID` / `FEISHU_APP_SECRET` / `FEISHU_REDIRECT_URI`（v2 命名），AI 自己改成新名 + 删旧条目，告诉用户"已迁移 .env 到 v3 命名"。

#### 3.4 .gitignore

```bash
test -f .gitignore || touch .gitignore
grep -qE '^\.env$' .gitignore || echo '.env' >> .gitignore
```

### Step 4: 自检（写完后必须确认这些项都过）

- [ ] 后端文件已写入正确路径（v4：4 条 OAuth 路由 + 2 条共享路由）
- [ ] 前端已用 FeishuSignIn 模板渲染 `/login`（Su Design 登录卡：插画 + FBIF logo + 飞书按钮），`@su/sign-in-card @su/button @su/avatar` 已装，mascots 三个资产已拷贝且 index.html 已 preload；登录页代码里没有任何色值、尺寸
- [ ] `.env` 含 `FEISHU_FBIF_APP_*` 和 `FEISHU_REDIRECT_BASE`
- [ ] `.gitignore` 含 `.env`
- [ ] 后端代码里 2 个 `redirect_uri` 跟你即将告诉用户去白名单加的 2 条 URL 字符级一致
- [ ] 已明确输出 2 条飞书重定向 URL（FBIF 后台）+ 关联组织共享待办
- [ ] 若有反代/Caddy/Nginx：只把 `/auth/feishu/*` 转后端，`/auth/callback` 仍由前端 SPA 返回 `index.html`
- [ ] 登录用户匹配逻辑支持 `tenant_key + (user_id OR open_id)`——富的员工经关联组织共享登录后 tenant_key 是富的的，不能按「tenant_key 必为 FBIF」写死
- [ ] **任何权限白名单 / 管理员名单不得只按 `open_id` 匹配**——`open_id` 每个应用一套，换应用后会静默失效（人能登录、但所有受限功能都提示无权限，且日志无痕）。按 `user_id → union_id → open_id` 顺序匹配，见 `references/identifiers.md`
- [ ] **登录成功与权限被拒都要记日志**，带 `open_id` / `user_id` / `union_id` / 姓名——这些值不出现在任何界面上，管理员没有别的途径知道白名单该填什么
- [ ] **带新权限检查的代码上线前，先确认目标环境的授权名单已配置且非空**——代码能编译、测试能过、服务能起，都证明不了这一点
- [ ] 如果项目已有 IAM/session，已复用现有 session cookie、`/api/me`、logout 和 AuthRequired middleware
- [ ] session 是 30 天滑动续期（已登录请求重签，前端接住新令牌），且会话有效性不依赖飞书令牌
- [ ] 需要持续用户身份时：refresh_token 加密存储；后台保活在会话有效期内（`last_seen_at` 30 天内）约每 3 天轮换；刷新串行 + 重读 + CAS；按业务码区分需重新授权/临时故障；授权失效返回 `feishu_reauth_required` 且前端给「重新用飞书登录」链接；`references/session-and-token-renewal.md` 的 8 条必测用例都有
- [ ] 未启动通讯录/人事同步 worker
- [ ] OAuth callback 有「无 state cookie 但签名 state 有效」回归测试，且会继续进入 token exchange/session 创建
- [ ] session resolver 同时支持 cookie 与 `X-Session-Token`
- [ ] 前端会消费 `#session_token`、清理地址栏、后续同源请求自动带 `X-Session-Token`
- [ ] 已写清 scope/token 契约：需要 refresh token 时授权 URL 含 `offline_access`；不需要时 token 校验器不强求 refresh token
- [ ] 302 `Location` 自动测试断言了精确 scope；需要云文档搜索/导出时为 `offline_access drive:drive.search:readonly drive:export:readonly`
- [ ] token 响应缺 refresh token 时有明确、无敏感信息的诊断，不再只报「response incomplete」
- [ ] 用新浏览器 profile/清空 cookie 验证首次登录、刷新、`/api/me`、核心业务 API 都成功
- [ ] 已在正式域名真人走完授权页 → callback → `/api/me` → 姓名头像 → 刷新 → 下游用户身份 API，生产日志无新增登录错误
- [ ] 真实飞书侧边栏/LarkShell 或等价嵌入环境验证过，不只是在自己电脑普通浏览器验证
- [ ] 登录页位图全部是 WebP 且已在 `index.html` preload（网络面板里图紧跟 HTML、先于 JS；见「视觉规范」最后一条）

任何一项没过 → 修完再继续。

### Step 5: 输出待办清单

**核心原则**：用户的"待办"**只能**包含 AI 完全做不到的事（飞书 web 后台点击）。其他一切由 AI 完成。

用这个**精确格式**输出（不要改、不要发挥）：

```
✓ 已完成（AI 自己做的）：
  - 后端代码：<后端路径>（单应用 4 条 OAuth 路由 + logout + /api/me）
  - 前端代码：<前端路径>（如有，Su Design 登录卡：插画 + 单按钮「使用飞书登录」）
  - 静态资源：<project>/public/mascots/（door-login.webp + fbif-logo.png + feishu-mark.svg，如有前端）
  - .env 写入登录 App 凭证 + REDIRECT_BASE
  - .gitignore 确保 .env 在忽略列表
  - 主入口挂载 OAuth router
  - upsertLocalUser / createSession 已接入项目现有用户/会话体系
  - 路由 / 反代 / 部署 全部已就位

✓ 你只需要做这 3 件事（都在 FBIF 侧的飞书后台，web 操作，SSH/API 都代不了）：

【1】登录 FBIF 飞书开放平台，加 2 条 redirect URL 白名单
    打开 https://open.feishu.cn/app（用 FBIF 管理员账号）→ 你的登录 App → 安全设置 → 重定向 URL
    必须加这 2 条（字符级一致）：
        <REDIRECT_BASE>/auth/feishu/fbif/callback        ← 按钮模式
        <REDIRECT_BASE>/auth/feishu/fbif/qr-callback     ← 扫码模式

【2】配置「应用可用范围」
    FBIF 飞书后台 → 你的登录 App → 应用发布 → 可用范围
    按需选 FBIF 全员或指定成员

【3】开「关联组织应用共享」，把这个 App 共享给富的
    飞书管理后台 https://admin.feishu.cn（FBIF 管理员）→ 关联组织 → 应用共享
    把登录 App 共享给「富的文化传媒（上海）有限公司」
    （前提：两家企业的关联组织关系已建立——FBIF 和富的早已互为关联组织；
     具体入口以飞书后台为准，参考官方《关联组织功能实践》：
     https://www.feishu.cn/hc/zh-CN/articles/762346821295）
    共享后富的员工点同一个「使用飞书登录」按钮即可登录，富的后台零操作。

✗ 不需要你做的事（曾经的待办，AI 接管了）：
  - 不用改 .env / 不用填 FEISHU_ALLOWED_TENANT_KEYS（默认关闭）
  - 不用挂 router（已写到主入口）
  - 不用补 TODO 函数（已接入现有用户/会话）
  - 不用加 /login 路由（如有需要 AI 已加）
  - 不用动富的的飞书后台（v4 单应用：白名单、可用范围、凭证都只在 FBIF 侧）

🔒 安全提醒（仅信息，不需要你做）：
    本次接入用到的 App Secret 已写入项目 .env 和 iCloud 密钥仓库
    （~/Library/Mobile Documents/com~apple~CloudDocs/密钥/FBIF登录应用APPid和密钥/）。
    如果接入过程中 Secret 进入了本会话 transcript（FBIF App 通常会），
    建议去 FBIF 飞书后台 → 凭证与基础信息 → 重置 Secret，
    新值告诉我，我自己改远程 .env、回写密钥仓库、重新部署。
    富的 App Secret 来自密钥仓库（多项目共享），泄漏时由 garyzheng 统一轮换。

🌐 反代提醒（AI 自检，不需要你做）：
    AI 已检查过 /auth/feishu/* 反代到后端、/auth/callback 由前端 SPA 接管。

验证：
    # 按钮模式
    curl -i http://<host>:<port>/auth/feishu/fbif/login
    期望：302 + Location 含 accounts.feishu.cn/.../authorize?client_id=<登录App ID>...

    # 扫码模式
    curl -i http://<host>:<port>/auth/feishu/fbif/qr-config
    期望：200 + JSON 含 goto (passport.feishu.cn) + state

    # 前端 callback 不能 404
    curl -i http://<host>:<port>/auth/callback
    期望：200 + 返回前端 index.html，不是后端 404

    用未登录浏览器访问 /login：
    应看到 Su Design 登录卡：宽屏左侧门+小黄人插画、右侧 FBIF logo +「使用飞书登录」按钮（带飞书三色标记）+「或」+ 账号、密码、「登录」按钮
    没有项目名 / 副标题 / 教程 / 问号 / 游客链接 / 扫码角标
    随便填个账号密码点「登录」→ 密码下面显示「账号或密码错误」（接口回 401，不是 404/500）
    点按钮 → 跳飞书 → 跳回 → 顶栏头像

    双企业都要真人验证（同一个按钮）：
    - FBIF 员工登录一次 → 成功
    - 富的员工登录一次 → 成功（依赖待办【3】关联组织共享已开；失败先查共享是否生效）
    - 从后端日志记录两个真实 tenant_key（FBIF 一个、富的一个），检查 users 表 tenant_key 与之一致
    - 如果报 USER_NOT_PROVISIONED，先排查 tenant_key / user_id / open_id 匹配

碰到错误？读 references/error-codes.md
登录范围怎么配？读下面「登录范围控制」一节
想理解 OAuth 工作原理？读 references/explainer.md（仅 AI 自学用）
```

---

## 登录范围控制（v4 单应用：都在 FBIF 侧配）

### 默认接入对象（**不要问用户**）

- **登录 App 可用范围 = FBIF 全员（或指定成员）**，在 FBIF 侧配置
- **富的员工 = 靠「关联组织应用共享」进来**（Step 5 待办【3】），富的后台零操作

> 沿革：v2 用过"关联组织"、v3 改成双独立 App、**v4 回归单应用 + 关联组织共享**（用户 2026-07-06 裁决：初衷本来就是两家都用同一个应用登录；生产 feed.foodtalks.cn 已验证）。

### 第一层：飞书后台「应用可用范围」+「关联组织共享」（**用户必须自己点 web UI**）

这是飞书系统级别的拦截，不在范围里的账号点登录会看到飞书自带的"无权限"提示页。SSH 不到飞书后台、API 也代不了，**必须由 FBIF 飞书管理员在 web UI 点击**。

AI 给用户的指令在 Step 5 待办【2】【3】里。

### 第二层：代码层 `.env` 白名单 —— **默认关闭**，AI 不要 push

`FEISHU_ALLOWED_TENANT_KEYS` 默认留空 = 关闭。注意单应用下 FBIF 和富的员工登录后是**两个不同的 tenant_key**——要开白名单就两个都填，只填 FBIF 的会把富的员工全拦掉。

仅当用户**明确**说"飞书后台被改了我也要拦"或"安全合规要求双保险"时才打开。打开方式（**AI 自己执行**）：
1. 让一个 FBIF 真实账号 + 一个富的真实账号各登录一次
2. AI **自己 SSH 到生产**读日志，抽出 2 个真实 tenant_key
3. AI **自己改远程 `.env`、自己重新部署**

---

## 开放模式与场景

**两种互斥的「开放模式」（Step 2 用 AskUserQuestion 二选一，不要默认）**：

- **B · 浏览器也可访问（默认）** → `references/scenarios/oauth-web.md`：单按钮「使用飞书登录」OAuth，登录页默认无扫码入口。覆盖大多数对外 Web 应用。
- **A · 仅飞书客户端内打开** → `references/scenarios/feishu-only.md`：浏览器访问被拦截页挡住（带一键唤起飞书 AppLink 按钮）+ 端内零点击免登 + 移动端沉浸式 + 后端非飞书 UA 硬拦（双层拦截）。适合内部 HR / 财务 / 审批等敏感系统。完整 UI + 前后端代码提炼自生产项目 Simba HR System，可直接照搬。

**模式 B 内部的细分场景**：

- **飞书工作台端内免登**：后端加一个 H5 回调路由，前端按 `references/scenarios/h5-in-feishu.md` 改
- **确需扫码入口**：登录页默认没有扫码入口。v8 起所有项目登录页一样、项目里不改模板，确需扫码先问用户；同意了就改本 skill 的模板（所有项目同步），扫码入口用 Su Design `Button`、二维码区域不写色值尺寸，不得设为默认视图；照 `references/scenarios/qr-code.md`（后端扫码路由已保留，用 passport.feishu.cn + v1 token）
- **账号密码登录（所有项目都带，与飞书登录并存）**：v8 登录页已自带表单，路线 A 后端已带；v4 项目按 `references/scenarios/account-password.md` 补后端（复用 users 表虚拟 open_id u-va-<username> + bcrypt + 同一 session/门禁，零迁移；含 SVG 动画/审美/图片性能踩坑）
- **维护 legacy 双 App 项目**（stenographer 等 v3 时代接入的存量项目）：`references/scenarios/dual-app-legacy.md`（双按钮 primary/secondary、fude 路由、4 条白名单、双 secret 防混）——**只用于维护，新接入禁止走这条**

---

## 反模式（绝对不要）

1. **不要在登录页写任何色值、尺寸，不改 SignInCard**（颜色、字号、按钮高度、logo 尺寸、圆角、阴影、卡片布局、插画位置都来自 Su Design；文案也不改，不加项目名、副标题；`FeishuSignInPage` 不收参数）。视觉要改就去 Su Design 改组件。
2. **不要换路由路径**。10 条路径（8 OAuth + 2 共享）跨项目一致，不要自由发挥。
3. **不要在扫码模式用 `accounts.feishu.cn` authorize 端点**。必须用 `passport.feishu.cn/suite/passport/oauth/authorize`。
4. **不要在扫码模式用 v2 token 接口换 code**。passport.feishu.cn 拿到的 code 必须用 v1 流程。
5. **不要替用户在飞书后台点按钮**。Web UI 操作，给精确指令、让用户自己做。
6. **不要把 user_access_token 给前端**。
7. **不要在主流程教用户 OAuth 原理**。
8. **不要假装支持的栈有模板**。没有就直说。
9. **不要分阶段问问题**。Step 2 一次性收集。
10. **不要省略飞书 SDK 的 matchOrigin / matchData 校验**。
11. **不要把 `/auth/*` 整段反代到后端**。只反代 `/auth/feishu/*`。
12. **登录页不含扫码入口（v6 起沿用至 v8）**。确有扫码需求先问用户，同意后改本 skill 的模板、所有项目同步，且不得设为默认视图。
13. **不要把 `upsertLocalUser/createSession` TODO 留作上线实现**。
14. **不要用 `file://` 页面验证登录**。
15. **不要在登录接入时启动通讯录/人事同步 worker**。
16. **永远不要让用户改 `.env` 或动任何文件**。
17. **不要在面对用户的话里堆术语**。`tenant_key`、`CSRF`、`state cookie`、`redirect_uri`、`app_access_token`、`OAuth`、`callback`、`session`、`HttpOnly`——这些只在内部用。
18. **`FEISHU_ALLOWED_TENANT_KEYS` 默认留空 = 关闭**。
19. **不要假定用户会做工程师动作**。
20. **（legacy 双 App 项目适用）不要混用 FBIF 和 富的 的 secret**。混了 = `99991663`。v4 单应用只有一组 secret，此坑不存在。
21. **不要给富的单独加 logo**。OAuth 视图顶部只有 FBIF logo，体现"这是 FBIF 系统"。v4 单按钮下富的身份完全隐形（同一个按钮登录），更不要加。
22. **不要在登录页加教程链接、问号 icon 或任何"帮助"控件**。v3.0 短暂加过都被定稿删除——抢主体视觉、违反极简原则。教程文档存在于 `https://foodtalks.feishu.cn/docx/KBkCd2pPYolTSPxGhRoc9UcJnsd` 但**不出现在登录 UI 里**，由其他渠道（飞书群、说明文档、入职 onboarding）分享给用户。
23. **不要在按钮上加 inline 标签**（"主企业 / 关联企业"等）。v4 单按钮无企业区分；legacy 双按钮靠 primary / secondary 表达主次——都不需要文字标签。
24. **（legacy 双 App 项目适用）Tab 切换器只在扫码视图出现**。v4 单应用连 Tab 都没有（`tenants` 单元素时组件自动隐藏）。
25. **v4 反转：单应用 + 关联组织共享是默认路线，不要再按 v3 教条新建双 App**。v3 曾规定"每企业独立 App、不提关联组织"，已被 2026-07-06 用户裁决推翻（初衷本来就是两家用同一个应用登录；生产 feed.foodtalks.cn 验证可行）。如果用户问"为什么不用双 App"，回答"单应用一组凭证、一个后台、一个按钮，富的靠关联组织共享进来，运维减半"。维护存量双 App 项目见 dual-app-legacy.md。
26. **（legacy 双 App 项目适用）不要把 富的 按钮也做成 primary**。FBIF 用 `variant="primary"`、富的用默认 secondary，形成主次（见 dual-app-legacy.md）。
27. **永远不要把 `http://localhost:xxxx` 写进 `.env` 的 `FEISHU_REDIRECT_BASE`**，**也永远不要在交付清单里把 redirect URL 写成 `http://localhost:xxxx/auth/feishu/...`**。飞书 OAuth 服务器（accounts.feishu.cn / passport.feishu.cn）回调时必须能从公网解析到一个真实可达的地址——localhost 不可达、白名单也加不了 localhost（飞书后台会拒绝或认为字符级不一致），加了就 4401。Step 2 必须显式问真实部署 URL；不要从 `PORT` env、vite proxy `target`、`go run -port` 等本地开发线索"推断"成 localhost。即使用户接入时项目还没部署、还没拿到生产域名——**先停下来要域名**，不要先用 localhost 占位再叫用户"以后改"。这条规则在 2026-05 因 AI 把 `FEISHU_REDIRECT_BASE=http://localhost:19091` 写进 .env 并把 localhost 路径输出到飞书白名单待办里被用户痛骂过一次，再犯等于没看 SKILL.md。
28. **不要把飞书用户令牌放进多维表格、集成平台或任何跨项目共享存储**，也不要让两个系统刷新同一份 refresh_token（2026-10-15 用户问过，结论不做，原因见 `references/session-and-token-renewal.md`）。不要把 refresh 失败兜底成「服务暂不可用」。
29. **不要把“登录失败”第一时间改成“绕过登录”**。除非用户明确要求去登录化，否则必须先查 OAuth 回调、state、cookie、token exchange、session 创建、前端鉴权请求这条链路。
30. **不要把 state cookie 当成唯一真相**。只测本机 cookie 正常路径会漏掉客户电脑、飞书内嵌浏览器、隐私设置、第三方 cookie 限制。
31. **不要删除失败日志或把错误藏起来**。失败日志是定位根因的证据；应该补 requestId 和关键阶段日志，不是清理掉让页面看起来干净。
32. **不要只用“开发机登录成功”证明登录完成**。必须有无 cookie callback 测试、新 profile 测试、刷新保持登录测试、嵌入环境验证。
33. **不要让终端用户看到内部 JSON 错误页**。登录失败也要回到登录页/错误页，给重新登录动作；内部错误只进日志。
34. **不要再实现已删除的 v5 卡片版登录页**（浅色渐变背景 + 420px 卡片 + 实心蓝按钮 + pill shell + 扫码角标），**也不要再实现已作废的 v6 Mascot 版**（组件里写死色值、圆角、阴影的双栏卡片，见「写登录前端代码前必须先看视觉真相」的沿革），**也不要再做 v7 那种只有飞书按钮、带副标题的登录页**。v8 Su Design 登录卡（`SignInCard` + `FeishuSignIn.tsx.template`，飞书按钮 + 账号密码表单）是唯一视觉真相。2026-07-06 曾因旧模板未删导致新项目上线旧版登录页被用户纠正——再犯等于没看 SKILL.md。
35. **不要让 token 校验契约和授权 scope 脱节**。后端要求 refresh token 却没请求 `offline_access`，或授权 URL 请求了权限但飞书后台没开通/没发布，都是 P0 登录故障。
36. **不要用 302、测试通过或“云文档已连接”文案代替真人验收**。正式环境必须真实授权、回跳、显示身份、刷新和调用下游用户身份 API；用户重复报告失败时更不得继续声称完成。

---

## 最小完成标准

**路线 A（v5 默认）**：只有同时满足这些，才能说接入完成——
- 合规测试 `conformance/run.mjs` 全部通过（`--protected` 列全所有受保护接口，含下载、导出、长连接；有敏感接口时带 `--fresh`，共 68 项；没有敏感接口不带，共 67 项；项目声明了 `Features` 的带 `--feature <key>=<列名>` 和 `--feature-route`——「敏感接口当场核对」这一项只在带 `--fresh` 时跑），结果 JSON 存进项目 `docs/`。
- 集成平台 SSO 应用的回调地址、offline_access、可访问成员、富的关联组织访问控制已配好；App Secret 在密钥仓库。
- 「统一登录」项目「接入项目通知地址」已加这一行；项目服务器的出口 IP 在停用名单读取的白名单里；服务器日志有启动时的 `sso: blocklist revision …`，手动跑一次「定时对账」后再出现一次。
- 线上用户在飞书里打开一次零点击进入，`/api/me` 返回本人；旧的 v4 登录入口已下线（不并存）。

**v4（存量维护）**：只有同时满足这些条件，才能说登录接入完成：

- `/login` 显示 v8 Su Design 登录卡：宽屏左插画右表单（窄屏单栏），上面「使用飞书登录」按钮（Su Design `Button` + 飞书三色标记），「或」分隔，下面账号、密码、「登录」按钮；没有项目名、副标题、企业名、教程链接、问号 icon、游客链接、扫码角标；`src/lib/feishuSignIn.tsx` 与模板逐字一致，登录页代码里没有写死的色值、尺寸。
- `POST /auth/account/login` 已接上：错的账号密码回 401 `auth_failed`，页面显示「账号或密码错误」；配好的账号能登录进去。
- 插画与 logo 已在 `index.html` preload（图先于 JS 下载）。
- `/auth/feishu/fbif/login` 返回 302，Location 是 `accounts.feishu.cn` + `client_id=<登录 App ID>`。
- `/auth/feishu/fbif/qr-config` 返回 200，goto 是 `passport.feishu.cn` + 含登录 App client_id。
- 2 条 redirect URL 已加入 FBIF 飞书后台白名单。
- 「关联组织应用共享」已开（待办【3】），富的员工可从同一按钮登录。
- 后端成功跳转到 `/auth/callback`。
- `/auth/callback` 由前端 SPA 接管。
- `/api/me` 未登录返回 401，登录后返回当前用户。
- OAuth scope 与 token 契约一致：需要 refresh token 时显式包含 `offline_access`；云文档搜索/导出时包含精确的 `drive:drive.search:readonly`、`drive:export:readonly`。
- 302 授权 Location、缺失 refresh token 分支和 refresh token 轮换都有自动测试。
- 登录后刷新仍保持登录态。
- 登录态是 30 天滑动续期，会话不依赖飞书令牌寿命。
- 需要持续用户身份的项目：飞书授权由后台保活自动续期（一周不用飞书功能也不失效），只有飞书明确拒绝时才提示重新登录。
- OAuth callback 在没有 state cookie、但签名 state 有效时仍能完成登录。
- session cookie 不可用时，`#session_token` → `X-Session-Token` 兜底链路可用，且 URL hash 会被前端立即清理。
- `requireAuth`/`/api/me`/核心业务 API 在 cookie 和 header 两种登录态下都通过。
- FBIF 真实账号 + 富的 真实账号都从**同一个按钮**验证过登录链路。
- 数据库 tenant_key 与飞书真实 tenant_key 一致（两家企业各自的 tenant_key，都不能写死成 FBIF 的）。
- 正式域名真人授权页出现预期权限，回跳后姓名头像可见，至少一个下游用户身份 API 成功，生产日志无新增登录错误。
- 线上真实浏览器 + 新 profile/清空 cookie + 飞书侧边栏/LarkShell 或等价嵌入环境验证通过。

---

## 资源清单

```
SKILL.md                                 ← 你正在读
assets/
  mascots/
    door-login.webp                      ← 门+小黄人插画（SignInCard 的 art，部署到项目 public/mascots/）
    fbif-logo.png                        ← FBIF logo（SignInCard 的 logo）
    feishu-mark.svg                      ← 飞书三色标记（「使用飞书登录」按钮里的图标）
  secrets/                               ← symlink → iCloud Drive 密钥仓库（git ignored）
    feishu-app-credentials.md            ← App ID + Secret 总表（按租户分节）
references/
  api-reference.md                       ← 飞书 OAuth 接口速查（v2 + v1 两套）
  error-codes.md                         ← 错误码与排查
  security-checklist.md                  ← 交付前安全清单
  session-and-token-renewal.md           ← 登录态 30 天滑动 + 飞书授权后台保活（refresh_token 7 天/一次性）
  explainer.md                           ← OAuth 工作原理（AI 自学用）
  scenarios/
    oauth-web.md                         ← 模式 B 默认场景（v4 单按钮 OAuth，登录页默认无扫码入口）
    qr-code.md                           ← 扫码登录技术细节 + 确需扫码时怎么在登录卡里加入口
    h5-in-feishu.md                      ← 飞书端内免登差异
    feishu-only.md                       ← 模式 A：仅飞书内登录（浏览器拦截 + AppLink 唤起 + 端内免登 + 沉浸式，提炼自 Simba HR）
    dual-app-legacy.md                   ← v3 双 App 双按钮模式（仅维护存量项目用，新接入禁止）
  official-docs/                         ← 飞书开放平台原始文档保真存档（真相来源）
    INDEX.md                             ← 速查索引，从这里进
    guide/                               ← 网页应用开发指南 5 步（含免登）
    web-meta/                            ← 移动端容器行为定制（屏幕方向/导航栏等 9 篇）
    config/                              ← redirect URL + 移动端主页性能
    extensions/                          ← 应用角标 / 加号菜单 / 消息快捷操作 等
    troubleshooting/                     ← iOS WKWebview 跨域 cookie 等
templates/
  backend/
    anycross-sso/                            ← **v5 路线 A 统一接入模板（新项目只用这个）**
      README.md                              ← 契约 7 件事、接入步骤、环境变量、账号密码、集成平台实测行为
      go/sso.go.template                     ← Go net/http 实现（go-oidc + oauth2）
      node/sso.ts.template                   ← Node/TS 实现（openid-client@6，Express 或原生 http）
      conformance/run.mjs + fake-idp.mjs     ← 合规测试（假集成平台，任何语言通用）
      conformance/selftest.sh                ← 改模板后跑：两个模板各 68 项
      conformance/mutants.mjs                ← 改测试后跑：70 个故意改坏的版本都要被抓到
      scripts/account-hooks.mjs              ← 生成账号表的两条自动化（接入时跑一次，Features 改了再跑）
    go-net-http/feishu_oauth.go.template     ← v4：FBIF + 富的 共 8 条路由
    go-gin/feishu_oauth.go.template          ← 同上
    node-express/feishuOauth.ts.template     ← 同上
    python-fastapi/feishu_oauth.py.template  ← 同上
  frontend/
    react-vite/FeishuSignIn.tsx.template     ← **v8 登录页**：FeishuSignInPage（Su Design SignInCard，飞书按钮 + 账号密码表单，不收参数）+ useCurrentUser/RequireAuth/FeishuUserBadge
    react-vite/session.ts.template           ← session 兜底通道（#session_token 消费 + apiFetch 带 X-Session-Token）
    react-vite/README.md                     ← 前端接入步骤（Su Design 前提/装组件/资产/preload/路由）
```

---

## 学习记录

每次完成接入后，追加一行到 `learnings.jsonl`：

```json
{"date":"YYYY-MM-DD","stack":"go-gin","scenario":"oauth-dual+qr-tab","time_minutes":<数字>,"stuck_at":"null|<问题>"}
```

如果同一个 `stuck_at` 出现 3 次，提炼成新规则补到对应位置。
