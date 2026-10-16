# 路线 A：飞书集成平台（AnyCross）单点登录 · 统一接入模板

2026-10-15 定稿（方案与实测：`/Users/simba/Agentic-Engineering/FBIF-统一登录/docs/设计方案-v2.md`）。**新项目一律走这条路线；存量项目一次性切换，切完旧登录入口立即下线，不并存。**

所有项目都跳同一个集成平台核身份：飞书登着，打开任何项目都是自动跳一下就回来，不用扫码。每个项目在集成平台有自己的 SSO 应用（自己的 App ID 和密钥），谁能进在那个应用里配。离职、冻结、紧急下线由集成平台「统一登录」项目里的工作流推给各项目。

## 目录

| 文件 | 是什么 |
|---|---|
| `go/sso.go.template` | Go（net/http，Go 1.24+）实现，放到 `internal/auth/sso.go` |
| `node/sso.ts.template` | Node/TypeScript 实现（Express 或原生 http），放到 `src/auth/sso.ts` |
| `conformance/run.mjs` | 合规测试：起一个假的集成平台，任何语言的项目都用它验收 |
| `conformance/selftest.sh` | 改了模板后跑：把两个模板装进最小项目各跑一遍合规测试 |
| `conformance/mutants.mjs` | 改了合规测试后跑：把 Go 模板故意改坏 30 处，每处都必须被抓到 |

其他语言（Python、Rust）照 Go 模板逐条翻译，验收标准一样：合规测试全过。

## 每个项目必须做到的 7 件事（契约）

| # | 要求 | 模板里在哪 | 合规测试哪几条管它 |
|---|---|---|---|
| 1 | 登录走授权码 + PKCE(S256)；校验 state（绑定发起登录的浏览器）、nonce、签名（只认 RS256）、issuer、audience、有效期；`company_code` 只认 FBIF `FJY632B9P3E`、富的 `FMZYRL01RNE`；按「company_code + sub」认人（`sub` 是 union_id；富的账号邮箱为空，不能拿邮箱认人）；换令牌失败不重试 | `handleLogin` / `handleCallback` / `verifyLogin` | 正常登录、state、id_token 六种、租户、富的、不重试、只回本站路径 |
| 2 | 会话放服务端：浏览器里只有随机 cookie `__Host-fbif_sid`（Secure、HttpOnly、SameSite=Lax、不设 Domain）；库里只存它的 SHA-256；refresh_token 用 AES-256-GCM 加密存服务端，不下发前端；30 天没用才过期，用着就续 | `Session`、`seal`、`require` | 正常登录、没登录被拒 |
| 3 | 所有受保护接口都过 `RequireUser`，包括下载、导出、长连接；不信浏览器传来的用户 ID；HR、盖章、改权限、敏感导出用 `RequireFreshUser` | `RequireUser` / `RequireFreshUser` | 没登录被拒、敏感接口当场核对 |
| 4 | 用着的会话每 5 分钟用 refresh_token 换一次 access_token 并调用户信息：403 立即下线并撤销 refresh_token；refresh_token 被拒（任何 4xx，不管响应体是不是 JSON）也下线；用户信息 401 先看是不是别的实例刚刷新过（以库里为准），不直接踢人；集成平台超时或 5xx 普通接口最多再放行 15 分钟，期间每个会话 30 秒才重试一次，放行前重读会话，敏感接口不放行。没人用就不查 | `check` / `authenticate` | 用户信息 403、refresh_token 被拒、故障宽限、敏感接口 |
| 5 | 名单提醒接口 `POST /internal/auth/blocklist-changed`，收 `{"revision": N}`，立即回 202；N 比本地新或为 0 才去拉整份停用名单，一个实例每 30 秒最多拉一次（每次拉都算集成平台一次工作流运行）；名单 `complete` 不是 true 就保留旧名单；版本号比库里小的名单不写（多实例乱序）；先落库再踢人：作废名单里的人在本项目的全部会话（所有实例）、撤销他们的 refresh_token、之后再登录也拒绝；每个请求也查一次名单；**名单从没同步成功过就拒绝所有登录**；启动时拉一次 | `handleBlocklistChanged` / `syncBlocklist` / `blocked` | 名单没同步过、假提醒、名单加人、重复/旧提醒、revision 0、没读全、恢复、重启后仍拒绝、旧名单不盖新名单 |
| 6 | 刷新加锁（同一会话同一时刻只刷新一个），写回按版本号比对；刷新和停用同时发生时停用优先，晚到的刷新结果不能把会话救回来（会话已没了就撤销晚到的新令牌）。同一个回调并发到达只换一次码。退出只退这个项目在这个浏览器里的会话（撤销本会话的 refresh_token；存储删不掉就报退出失败），飞书本身、同一人的其他浏览器、其他项目都不受影响；退出只接受 POST | `check` / `handleLogout` / `consumeState` | 退出两条（拿旧 cookie 重放） |
| 7 | 账号密码登录（2026-10-16 用户裁定「所有项目都带」：登录页各项目一样，都有账号密码表单）：给没有飞书的外部供应商、兼职用。`POST /auth/account/login` 只收 JSON `{username, password}`；对了 200 `{ok:true}` 并下发同一个会话 cookie，账号不存在、密码错、停用、到期、哈希不是 `hmac-sha256$` 格式一律 401 `auth_failed`、回得一样；同一账号 15 分钟内连错 5 次回 429 `rate_limited`（密码对了也不行）。账号会话 company_code 是 `account`，同样过 `OnLogin`；不找集成平台核对、不归停用名单管，改为每个核对周期查一次账号还在不在、到没到期、密码重置过没有（会话里记登录时的密码指纹），有一样不对就下线；敏感接口（`RequireFreshUser`）一律 403 `sso_required`。账号表从集成平台工作流拉（`SSO_ACCOUNTS_URL`），内存快照最多用 1 分钟，同一时刻只拉一次；拉不到时用 15 分钟内拉成功过的上一份，再久登录回 503。项目没配账号时表单照样在，登录一律回「账号或密码错误」 | `handleAccountLogin` / `checkAccount` / `remoteAccounts` | 账号密码十条 |

## 路由（与现有登录页同路径，前端不用改）

| 路由 | 作用 |
|---|---|
| `GET /auth/feishu/fbif/login?next=<本站路径>` | 跳集成平台登录 |
| `GET /auth/feishu/fbif/callback` | 集成平台回调；失败跳 `/login?error=denied|unauthorized_tenant|disabled|expired|failed` |
| `POST /auth/account/login` | 账号密码登录，只收 JSON；200 `{ok:true}` / 401 `auth_failed` / 429 `rate_limited` |
| `POST /auth/feishu/logout` | 只退出本项目这个浏览器（账号密码会话也走它） |
| `GET /api/me` | `{id, name, avatar_url, company_code}`；没登录 401 `{error:"login_required", login_url}` |
| `POST /internal/auth/blocklist-changed` | 名单提醒，**必须公网可达、不能挡在登录中间件或网关鉴权后面** |

前端用 `templates/frontend/react-vite/FeishuSignIn.tsx.template`（v8，所有项目一样：飞书按钮 + 账号密码表单），和 `session.ts.template` 一起原样复制；飞书按钮、账号密码表单、回调错误提示、`RequireAuth`、退出都对得上上表。路线 A 只用 cookie：回调不在地址栏放 `#session_token`，账号登录也不回 `session_token`，`session.ts` 的兜底读不到东西，不影响。

## 接入步骤（AI 照做；只有第 1、5 步要在集成平台点，由 AI 在用户的 Chrome 里点，用户先同意一次）

1. **在集成平台建这个项目的 SSO 应用**：集成平台 → 身份集成 → 单点登录 → 应用管理 → 新建 SSO 应用（自建，OIDC）。
   - 登录回调地址：`https://<项目域名>/auth/feishu/fbif/callback`（字符级一致；本地开发另加一条 `http://localhost:<端口>/auth/feishu/fbif/callback`）。
   - 权限范围：openid（默认）、profile、email、**offline_access（必勾，否则没有 refresh_token，模板拒绝登录）**。
   - 可访问成员：默认全员；敏感项目（HR、盖章）只放指定的人或部门。关联组织访问控制里加上富的。
   - 记下 App ID 和 App Secret，存进密钥仓库（`assets/secrets/`，按项目名记一节），**不发在聊天里、不进 Git**。
2. **拷模板**：Go → `internal/auth/sso.go`，`go get github.com/coreos/go-oidc/v3 golang.org/x/oauth2`；Node → `src/auth/sso.ts`，`npm i openid-client@6`。原样复制，不改常量、不删校验。
3. **接到项目里**：
   - `OnLogin`：按 `Identity.Key()`（Node：`identityKey(id)`）找或建本项目用户，返回本项目用户 ID；本项目不让进就返回 `ErrNotAllowed`（Node：抛 `NotAllowedError`）。存量项目按 open_id 存人的，迁移时先用通讯录接口把 open_id 批量换成 union_id 对上。
   - `Store`：单实例小项目直接用 `FileStore`（放在持久盘上，不要放 /tmp）；多实例或已有数据库，用项目的库实现 `Store` 接口（会话表 + 名单表）。两处必须是数据库里的原子条件更新：`UpdateSession` 按版本号比对，`SaveBlocklist` 版本号比库里小就拒绝。写失败要返回错误，不能吞掉。
   - 挂路由：

     ```go
     sso, err := auth.New(ctx, auth.Options{Store: store, OnLogin: onLogin})
     sso.Register(mux)
     mux.Handle("GET /api/export", sso.RequireUser(exportHandler))
     mux.Handle("POST /api/hr/salary", sso.RequireFreshUser(salaryHandler))
     ```

     ```ts
     const sso = await createSso({ store: new FileStore('/data/sso.json'), onLogin });
     app.use(sso.routes);          // 放在 express.json() 之前
     app.use(express.json());
     app.get('/api/export', sso.requireUser, exportHandler);
     app.post('/api/hr/salary', sso.requireFreshUser, salaryHandler);
     ```
   - 取当前用户：Go `auth.CurrentUser(r)`；Node `req.ssoUser`。
   - 账号密码：默认用环境变量 `SSO_ACCOUNTS_URL`，从集成平台的账号读取工作流拉账号（见下面「账号密码」）；项目已有自己的供应商账号表，就实现 `Accounts` 接口传进 `Options.Accounts`（Node：`accounts`）。两样都没有也能跑：表单在，登录一律 401。`OnLogin` 会收到 company_code 为 `account` 的身份，项目不想放外部账号进来就对它返回 `ErrNotAllowed`。
4. **环境变量**（缺一个启动就失败）：

   | 变量 | 值 |
   |---|---|
   | `SSO_ISSUER` | `https://anycross.feishu.cn/sso/FJY632B9P3E` |
   | `SSO_CLIENT_ID` / `SSO_CLIENT_SECRET` | 第 1 步那个应用的 App ID / App Secret（从密钥仓库读） |
   | `SSO_REDIRECT_URL` | 第 1 步填的登录回调地址，路径必须是 `/auth/feishu/fbif/callback` |
   | `SSO_BLOCKLIST_URL` | 到集成平台「统一登录」项目里取：工作流「停用名单｜各项目读取」的网址触发器地址。**不写进代码、文档、Git**，只放服务器的环境文件 |
   | `SSO_TOKEN_KEY` | `openssl rand -base64 32` 生成，每个项目单独一把，放服务器环境文件 |

   可选 `SSO_ACCOUNTS_URL`：集成平台账号读取工作流的网址触发器地址，和名单地址一样**不写进代码、文档、Git**，只放服务器的环境文件；没有外部账号就不配。

   `SSO_CHECK_INTERVAL`、`SSO_SYNC_MIN_GAP` 只给合规测试用，生产留空（默认 5 分钟、30 秒）。
   名单地址只放行公司服务器出口 IP（具体 IP 问集成平台管理员）。**项目跑在别的服务器上，先在「停用名单｜各项目读取」的 IP 白名单里加上那台的出口 IP**，否则拉不到名单（日志会出现 `blocklist HTTP 403`）。
5. **登记通知地址**：集成平台「统一登录」项目 → 项目配置「接入项目通知地址」加一行 `https://<项目域名>/internal/auth/blocklist-changed`。新项目接入只改这一处，工作流不用动。
6. **验收**（全部由 AI 做，不让用户测）：
   - 合规测试全过（带 `--fresh` 共 41 项；项目没有 `RequireFreshUser` 接口就不带，共 40 项，不要为了凑数加假接口），把 `--report` 的结果存进项目 `docs/`：

     ```bash
     node ~/.claude/skills/feishu-login-guide/templates/backend/anycross-sso/conformance/run.mjs \
       --start "<启动本项目的命令>" --protected /api/me,<所有受保护接口逗号分隔> \
       --fresh <一个 RequireFreshUser 接口> --report docs/sso-conformance.json
     ```

     被测项目要读 `PORT`（只听 127.0.0.1）和 `CONFORMANCE_DATA_DIR`（`FileStore` 放这里；用数据库的指向一个空的测试库），其余 `SSO_*` 由测试注入（含 `SSO_ACCOUNTS_URL`：指向假集成平台的账号表。项目自己实现了 `Accounts` 的，测试时不传 `Options.Accounts`，让 `SSO_ACCOUNTS_URL` 生效）。
   - 上线后：用户在飞书里打开项目一次（零点击进来）；`/api/me` 返回本人；服务器日志里有 `sso: blocklist revision …`（启动时拉过名单）；在集成平台手动运行一次「定时对账｜每 2 小时」，日志里再出现一次。

## 账号密码

账号由管理员在飞书多维表格里维护（加人、停用、重置密码、设到期日），集成平台的账号读取工作流按项目给出去。项目和工作流之间的约定：

```text
POST <SSO_ACCOUNTS_URL>
Content-Type: application/json
{"system": "https://tools.fbif.com"}

200 {"complete": true, "accounts": [
  {"username": "vendor-a", "name": "某供应商 张三", "password_hash": "hmac-sha256$<盐>$<hex>", "expires_at": "2026-12-31T16:00:00.000Z"},
  {"username": "vendor-b", "name": "某供应商 李四", "password_hash": "hmac-sha256$<盐>$<hex>", "expires_at": null}
]}
```

- `system` 是 `SSO_REDIRECT_URL` 的源（scheme://host[:port]，不带路径、默认端口省掉）；工作流只回这个项目能用、没停用的账号，不在表里就是不让进。
- `complete` 不是 `true`、不是 200、不是 JSON、超过 1 MiB，都算没拉到。
- `expires_at` 为 `null` 是不过期；否则到这个时刻就不能用，由项目每次登录、核对时自己判（工作流不用先滤掉）。
- 账号名去空格、不区分大小写。表里同名的只认第一条，`expires_at` 写不对的那条跳过。
- 停用、到期、重置密码后，登着的人最晚一个核对周期加 1 分钟下线（生产约 6 分钟）。重置密码靠会话里记的密码指纹（`password_hash` 的 SHA-256 前 16 位）：哈希一变，旧会话就对不上。
- 集成平台挂了时用内存里上一份（15 分钟内拉成功过的），不落盘：集成平台挂了飞书登录也一起挂，存一份到盘上没多大用。

`password_hash` 格式：`hmac-sha256$<盐>$<hex>`，盐 8–64 位 `[A-Za-z0-9_-]`，hex 是以盐（UTF-8）为密钥、对密码（UTF-8）做 HMAC-SHA256 的 64 位小写十六进制。密码由系统随机生成（不少于 120 位），所以快速哈希就够了；别的格式一律不认。生成一个密码和它的哈希（第一行是密码，发给供应商；第二行进多维表格）：

```bash
node -e 'const c=require("crypto");const p=c.randomBytes(15).toString("base64url");const s=c.randomBytes(12).toString("base64url");console.log(p);console.log("hmac-sha256$"+s+"$"+c.createHmac("sha256",s).update(p).digest("hex"))'
```

不做注册、忘记密码、自己改密码：都由管理员在多维表格里改（或项目自己的账号表）。

## 集成平台的已知行为（2026-10-15 实测，模板已按此处理）

- 授权码 600 秒、access_token 2 小时、refresh_token 30 天；刷新会给新的 refresh_token，**旧的仍能用**，所以只存最新的、退出和踢人时主动撤销。
- 刷新后上一个 access_token 立即 401；刷新不返回 id_token，身份只在登录时给一次。
- 把人加进应用的「禁止访问成员」：约 1 分钟内新登录被拦；已登着的人**刷新照样成功、调用户信息才 403**，所以核对必须调用户信息。
- 同一个授权码第二次换会被拒，**第一次换到的令牌也被作废**：回调绝不重试换码。
- 没有公开的统一退出接口（服务发现文档里没有 end_session_endpoint）：退出只能各项目自己退。
- id_token 签名公钥是 **1024 位 RSA**。Go 的 go-oidc 能验；Node 的 openid-client 验签开关拒绝 2048 位以下的公钥，所以 Node 模板用 `node:crypto` 自己验签。换库前先看它接不接受 1024 位 RSA。
- 客户端认证用 HTTP Basic（`client_secret_basic`），已从服务器实测通过。
- 还没实测：撤销最新的 refresh_token 会不会连带作废轮换前的旧令牌。模板只存最新的一枚、旧的从不落盘，所以不依赖这一点。

## 改模板的规矩

- 两个模板行为一一对应，改一个就改另一个，然后 `bash conformance/selftest.sh`（约 4 分钟），两边都要 41/41。
- 改了合规测试，跑 `node conformance/mutants.mjs`，30 个坏版本都要被抓到；新加的规则也补一个坏版本。

## 有意没做的（模板里标了 `shortcut:`）

- 撤销 refresh_token 失败只记日志、不重试：会话已删、令牌只在服务端出现过，风险小。要做到必撤，就把加密令牌连同删会话一起写进待撤销表，后台重试。
- 防并发回调重复换码只在同一实例内有效；多实例要防，就把登录事务放进共享库原子消费。
- 账号密码连错次数只在本实例内存里计数，重启清零；多实例要严格限次，就把计数放进共享库。
- 没有跨实例的刷新锁：并发刷新靠版本号比对加「用户信息 401 先看库里」兜住，不会误踢人。
- 黑盒测不到的：多实例并发、存储写失败。实现 `Store` 时自己给这两处写单元测试。
- 2026-10-15 交 Codex 对抗复核，提出 12 条：除「撤销失败重试」按上面说明暂不做，其余都已改完并补了测试或坏版本。
- 假的集成平台（`fake-idp.mjs`）照实测行为写；集成平台行为变了，先改它，再改模板。
