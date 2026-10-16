# 场景：账号密码登录（外部供应商）+ 飞书登录并存

> 内部员工走飞书 OAuth；**外部供应商 / 合作伙伴 / 兼职**没有本企业飞书，需账号密码登录。2026-10-16 用户裁定「所有项目都带」：路线 A 后端模板已带 `/auth/account/login`（见 `templates/backend/anycross-sso/README.md` 第 7 件事），不用看本文；**本文给还在 v4 的存量项目补后端用**。账号由管理员后台配置，**不开放注册、不做忘记密码**（都引导加微信）。账号密码与飞书登录**并存于同一登录页**，签发同一 session、走同一门禁。
> 参考实现（FBIF 资讯订阅，已测）：`internal/store/vendor.go`、`internal/auth/account_login.go`、`internal/api/vendor_admin.go`、`web/src/components/app/mascot-login.tsx`（v6 时代写死色值的登录页，已不用参考：前端一律用 v8 模板，见下文）。

## 核心设计：复用 users 表，零迁移

账号密码用户**不新建表**，复用飞书登录的 `users` 表：

| 字段 | 值 | 作用 |
|---|---|---|
| `feishu_open_id` | 虚拟占位 `u-va-<username>` | 让 `issueSession` / `CurrentUser` / 离职闸门**原样复用**——它们都按 open_id 工作 |
| `password_hash` | bcrypt（`golang.org/x/crypto/bcrypt`） | users 表自 v2 建表就有此列，**无需迁移**（先 `grep password_hash schema.go` 确认） |
| `role` | `vendor` | 区分飞书用户、过滤管理列表 |

🔴 登录身份 ≠ 订阅身份：vendor 同样只过整站门禁，feed/订阅仍恒挂 `DefaultUserID`。

## 后端（Go）

1. **store**（`vendor.go`）：`UpsertVendorAccount`（bcrypt 哈希，按虚拟 open_id upsert，新建必须给密码、改密空显示名要保留原值）、`VerifyVendorPassword`（统一返回 `ErrVendorAuthFailed` 防账号枚举，校验 status active）、`ListVendorAccounts`、`SetVendorStatus`、`DeleteVendorAccount`。
2. **登录路由**（`account_login.go`）：`POST /auth/account/login` JSON `{username,password}` → `VerifyVendorPassword` → `issueSession(user.FeishuOpenID)` → 写 cookie + 返回 `{session_token}`。失败统一 401 `auth_failed`（账号不存在、密码错、停用回得一样）；同一账号 15 分钟内连错 5 次回 429 `rate_limited`（与路线 A 一致，v8 登录页会显示「尝试次数过多」）。**复用飞书登录的 30 天滑动 session + CurrentUser**，不要另起 session 体系。
3. **后台配置接口**（`vendor_admin.go`，`requireSettingsAuth` 密码保护）：`/api/admin/vendor/{upsert,list,delete,status}`，让管理员随时开通/停用账号。
4. 路由注册：在 OAuth 的 `RegisterRoutes` 里加 `mux.HandleFunc("/auth/account/login", h.HandleAccountLogin)` + 通用 `/auth/logout`。

## 前端（React · v8 登录页已自带，不用再写）

2026-10-11 起（v8）所有项目的登录页一模一样，`FeishuSignIn.tsx.template` 里已经有账号密码表单：飞书按钮 →「或」→ 账号、密码、「登录」。**前端不用另写表单段**，原样复制模板即可（接法见 SKILL.md 3.2）。模板对后端的约定，补后端时照这个对：

- 请求：`POST /auth/account/login`，JSON `{username, password}`，走 `apiFetch`（带 cookie）。
- 成功：200；回包里有 `session_token` 就存起来（`setSessionToken`），没有也行（只用 cookie）。然后跳回 `next` 或首页。
- 失败：401 → 密码下面显示「账号或密码错误」；429 → 「尝试次数过多，请稍后再试」；其他 →「登录失败，请重新尝试」。所以后端失败一律回 401 `auth_failed`，限流回 429 `rate_limited`，别回 404/500。
- 模板不做注册、忘记密码、「保持登录」勾选框；要开通、找回账号由管理员在后台配。

> 沿革：v7 时只有纯内部系统以外的项目才加表单，写法是在 `FeishuSignInPage` 里 `SignInCard` 的 children 中自己拼 `Field` / `Input` / `Checkbox` / `Separator`，提交成功后 `localStorage` 存 token 再 `reload`。v8 已把表单收进模板，这套写法作废；存量项目迁移时删掉自加的表单段，换成原样复制的模板。

## 经验教训（这次踩的坑，务必避免重犯）

1. **SVG `<g>` 动画只能靠截图验证**：`getComputedStyle` 和 `getBoundingClientRect` 对被 transform/动画的 SVG `<g>` 返回**基础值（none / 未变换的 bbox）**，不反映真实渲染——曾因此误判动画坏了、绕了一大圈。HTML 元素无此问题。
2. **连续鼠标跟随用 CSS transform + transition，别用 `gsap.to`**：逐帧 mousemove 里 `gsap.to` 每次新建 tween（开销大）且在 React（StrictMode）集成有坑（onMove 触发但 tween 不作用）。GSAP 适合**状态切换**动画（hover 躲藏、入场），不适合**逐帧跟随**。
3. **审美必须基于用户提供的设计/原图**：自创装饰（紫渐变开门背景、程序化几何眼珠）连续被骂丑。"把图变成代码做动画" = 把图**分层**（矢量 image-trace 成 SVG 按色块分组，或切透明 PNG）再驱动，**不是手画 SVG 重画一遍**。
4. **布局必须问用户**：全屏铺满 / 居中卡片 / 左右拼接是三种不同方向，别假设——同一句"登录页"用户的预期可能反复变。（2026-06 当时的教训。v7 起登录页布局固定为 Su Design 的 `SignInCard`，v8 起所有项目同一份模板，不再问；窄屏只留右侧表单由 SignInCard 的容器查询负责，不在项目里写断点。）
5. **后端链路用测试验证胜过起完整 server**：账号密码登录的"登录→签发 session→CurrentUser 门禁放行→停用即拒→错密 401"用 `httptest` + 内存/临时库测，自动化可重复（见 `account_login_test.go` / `vendor_test.go`），比拉起整套采集服务跑浏览器更可靠。
6. **登录页插画必须 WebP + index.html preload，否则必然慢半拍**（2026-07-06，FBIF 资讯订阅实测）：
   - **格式**：扁平插画/吉祥物图用 PNG 是体积灾难——`door-login.png` 234KB → `cwebp -q 82` 转 WebP 后 24KB（缩 90%，PSNR 51dB 肉眼无损）。登录页所有位图一律 WebP。
   - **时序（更隐蔽的坑）**：门禁型登录页的插画排在「下载 JS → `/api/me` 返回 401 → React 渲染登录页」三级串行瀑布**之后**才开始下载，图再小也慢半拍。修法是 `index.html` 里 `<link rel="preload" as="image" href="/mascots/door-login.webp" media="(min-width: 576px)">`——HTML 一到就并行下图；`media` 对齐登录卡出现插画的宽度（SignInCard：可用宽度 ≥ 576 才出插画；窄屏不显示就不下载）。已登录用户首次多拿一次 24KB 后走缓存，可接受。
   - **验证**：DevTools/`read_network_requests` 看请求顺序，插画必须紧跟 HTML（第 2 位），排在所有 JS 与 `/api/me` 之前。
