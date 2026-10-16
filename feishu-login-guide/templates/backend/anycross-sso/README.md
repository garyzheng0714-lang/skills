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
| `conformance/mutants.mjs` | 改了合规测试后跑：把 Go 模板故意改坏 70 处，每处都必须被抓到 |
| `scripts/account-hooks.mjs` | 生成账号表的两条自动化（改了账号表就提醒项目），接入时跑一次 |

其他语言（Python、Rust）照 Go 模板逐条翻译，验收标准一样：合规测试全过。

## 每个项目必须做到的 7 件事（契约）

| # | 要求 | 模板里在哪 | 合规测试哪几条管它 |
|---|---|---|---|
| 1 | 登录走授权码 + PKCE(S256)；校验 state（绑定发起登录的浏览器）、nonce、签名（只认 RS256）、issuer、audience、有效期；`company_code` 只认 FBIF `FJY632B9P3E`、富的 `FMZYRL01RNE`；按「company_code + sub」认人（`sub` 是 union_id；富的账号邮箱为空，不能拿邮箱认人）；换令牌失败不重试 | `handleLogin` / `handleCallback` / `verifyLogin` | 正常登录、state、id_token 六种、租户、富的、不重试、只回本站路径 |
| 2 | 会话放服务端：浏览器里只有随机 cookie `__Host-fbif_sid`（Secure、HttpOnly、SameSite=Lax、不设 Domain）；库里只存它的 SHA-256；refresh_token 用 AES-256-GCM 加密存服务端，不下发前端；30 天没用才过期，用着就续 | `Session`、`seal`、`require` | 正常登录、没登录被拒 |
| 3 | 所有受保护接口都过 `RequireUser`，包括下载、导出、长连接；不信浏览器传来的用户 ID；HR、盖章、改权限、敏感导出用 `RequireFreshUser` | `RequireUser` / `RequireFreshUser` | 没登录被拒、敏感接口当场核对 |
| 4 | 用着的会话每 5 分钟用 refresh_token 换一次 access_token 并调用户信息：403 立即下线并撤销 refresh_token；refresh_token 被拒（任何 4xx，不管响应体是不是 JSON）也下线；用户信息 401 先看是不是别的实例刚刷新过（以库里为准），不直接踢人；集成平台超时或 5xx 普通接口最多再放行 15 分钟，期间每个会话 30 秒才重试一次，放行前重读会话，敏感接口不放行。没人用就不查 | `check` / `authenticate` | 用户信息 403、refresh_token 被拒、故障宽限、敏感接口 |
| 5 | 名单提醒接口 `POST /internal/auth/blocklist-changed`，收 `{"revision": N}`，立即回 202；N 比本地新或为 0 才去拉整份停用名单，一个实例每 30 秒最多拉一次（每次拉都算集成平台一次工作流运行）；名单 `complete` 不是 true 就保留旧名单；版本号比库里小的名单不写（多实例乱序）；先落库再踢人：作废名单里的人在本项目的全部会话（所有实例）、撤销他们的 refresh_token、之后再登录也拒绝；每个请求也查一次名单；**名单从没同步成功过就拒绝所有登录**；启动时和每轮兜底对账（默认 6 小时）各拉一次 | `handleBlocklistChanged` / `syncBlocklist` / `blocked` | 名单没同步过、假提醒、名单加人、重复/旧提醒、revision 0、没读全、恢复、重启后仍拒绝、旧名单不盖新名单 |
| 6 | 刷新加锁（同一会话同一时刻只刷新一个），写回按版本号比对；刷新和停用同时发生时停用优先，晚到的刷新结果不能把会话救回来（会话已没了就撤销晚到的新令牌）。同一个回调并发到达只换一次码。退出只退这个项目在这个浏览器里的会话（撤销本会话的 refresh_token；存储删不掉就报退出失败），飞书本身、同一人的其他浏览器、其他项目都不受影响；退出只接受 POST | `check` / `handleLogout` / `consumeState` | 退出两条（拿旧 cookie 重放） |
| 7 | 账号密码登录（2026-10-16 用户裁定「所有项目都带」：登录页各项目一样，都有账号密码表单）：给没有飞书的外部供应商、兼职用。`POST /auth/account/login` 只收 JSON `{username, password}`，当场查本项目的飞书多维表格账号表；对了 200 `{ok:true}` 并下发同一个会话 cookie，账号不存在、重复、缺密码、密码错、账号状态不是「启用」一律 401 `auth_failed`、回得一样；同一账号 15 分钟内连错 5 次（同时猜也凑不出第 6 次）回 429 `rate_limited` 并在表里写回「已锁定」；每个 IP 每分钟最多 10 次、整个进程每分钟最多查 60 次表，超了 429；表查不了、账号表的列有问题 503。账号会话 company_code 是 `account`，sub 是表里那一行的记录 ID，同样过 `OnLogin`；不找集成平台核对、不归停用名单管，改为每个核对周期按记录 ID 读一次那一行，删了、停用、改了密码就下线；敏感接口（`RequireFreshUser`）一律 403 `sso_required`。按人开关的功能用复选框列（`Features`）。事件优先：人改了账号表由表里的自动化 `POST /internal/auth/accounts-changed` 当场收回；事件丢了由进程内的兜底对账（默认 6 小时一轮）收回。每次登录、失败、退出、被收回和该记的请求写进总账本共用的「日志」表（持久待写队列，不挡登录），健康检查 `GET /internal/auth/health`。项目没配账号表时表单照样在，登录一律 401 | `handleAccountLogin` / `checkAccount` / `handleAccountsChanged` / `reconcileLoop` / `Middleware` / `outbox` | 从「账号密码登录：当场查账号表」起往后各条 |

## 路由（与现有登录页同路径，前端不用改）

| 路由 | 作用 |
|---|---|
| `GET /auth/feishu/fbif/login?next=<本站路径>` | 跳集成平台登录 |
| `GET /auth/feishu/fbif/callback` | 集成平台回调；失败跳 `/login?error=denied|unauthorized_tenant|disabled|expired|failed` |
| `POST /auth/account/login` | 账号密码登录，只收 JSON；200 `{ok:true}` / 401 `auth_failed` / 429 `rate_limited` |
| `POST /auth/feishu/logout` | 只退出本项目这个浏览器（账号密码会话也走它） |
| `GET /api/me` | `{id, name, avatar_url, company_code, features}`；没登录 401 `{error:"login_required", login_url}` |
| `POST /internal/auth/blocklist-changed` | 名单提醒，**必须公网可达、不能挡在登录中间件或网关鉴权后面** |
| `POST /internal/auth/accounts-changed` | 账号表变更提醒 `{"record_id":"rec…"}`，马上回 202、不回数据；账号表的自动化调它，**同样必须公网可达** |
| `GET /internal/auth/health` | 账号表、日志表、待写队列的健康状况，给监控读；有问题回 503 |

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
     mux.Handle("GET /api/export", sso.RequireUser(exportHandler)) // 导出、下载在 handler 里调 auth.Audit(r)，成功的也记一行
     mux.Handle("POST /api/hr/salary", sso.RequireFreshUser(salaryHandler))
     srv := &http.Server{Addr: addr, Handler: sso.Middleware(mux)} // 请求日志：包住整个 mux
     go srv.ListenAndServe()
     <-ctx.Done()                 // ctx 来自 signal.NotifyContext(…, SIGINT, SIGTERM)
     srv.Shutdown(shutdownCtx)    // 先不再收请求
     sso.Shutdown(shutdownCtx)    // 再把待写队列落盘，重启后接着写
     ```

     ```ts
     const sso = await createSso({ store: new FileStore('/data/sso.json'), onLogin });
     app.use(sso.logRequests);     // 请求日志：放在最前面
     app.use(sso.routes);          // 放在 express.json() 之前
     app.use(express.json());
     app.get('/api/export', sso.requireUser, (req, res) => { audit(req); /* … */ });
     app.post('/api/hr/salary', sso.requireFreshUser, salaryHandler);
     const server = app.listen(port);
     process.once('SIGTERM', () => { server.close(); void sso.shutdown().finally(() => process.exit(0)); }); // 退出前把待写队列落盘
     ```
   - 取当前用户：Go `auth.CurrentUser(r)`；Node `req.ssoUser`。
   - 账号密码：配 `SSO_ACCOUNTS_TABLE`、`SSO_LOG_TABLE` 等（见下面「账号密码」），没有外部账号就都不配，表单在、登录一律 401。项目有按人开关的功能就在 `Options.Features`（Node：`features`）里声明。`OnLogin` 会收到 company_code 为 `account` 的身份，项目不想放外部账号进来就对它返回 `ErrNotAllowed`。
4. **环境变量**（缺一个启动就失败）：

   | 变量 | 值 |
   |---|---|
   | `SSO_ISSUER` | `https://anycross.feishu.cn/sso/FJY632B9P3E` |
   | `SSO_CLIENT_ID` / `SSO_CLIENT_SECRET` | 第 1 步那个应用的 App ID / App Secret（从密钥仓库读） |
   | `SSO_REDIRECT_URL` | 第 1 步填的登录回调地址，路径必须是 `/auth/feishu/fbif/callback` |
   | `SSO_BLOCKLIST_URL` | 到集成平台「统一登录」项目里取：工作流「停用名单｜各项目读取」的网址触发器地址。**不写进代码、文档、Git**，只放服务器的环境文件 |
   | `SSO_TOKEN_KEY` | `openssl rand -base64 32` 生成，每个项目单独一把，放服务器环境文件 |

   可选：账号密码登录与日志的 `SSO_ACCOUNTS_TABLE`、`SSO_LOG_TABLE`、`SSO_LOG_PROJECT_RECORD`、`SSO_FEISHU_APP_ID`、`SSO_FEISHU_APP_SECRET`、`SSO_OUTBOX_FILE`、`SSO_LOG_MAX_ROWS`，兜底对账间隔 `SSO_RECONCILE_INTERVAL`，见下面「账号密码」。

   `SSO_CHECK_INTERVAL`、`SSO_SYNC_MIN_GAP`、`SSO_FEISHU_API` 只给合规测试用，生产留空（默认 5 分钟、30 秒）。
   名单地址只放行公司服务器出口 IP（具体 IP 问集成平台管理员）。**项目跑在别的服务器上，先在「停用名单｜各项目读取」的 IP 白名单里加上那台的出口 IP**，否则拉不到名单（日志会出现 `blocklist HTTP 403`）。
5. **登记通知地址**：集成平台「统一登录」项目 → 项目配置「接入项目通知地址」加一行 `https://<项目域名>/internal/auth/blocklist-changed`。新项目接入只改这一处，工作流不用动。配了账号表的，部署后再按「账号密码 → 账号表的自动化」建两条自动化。
6. **验收**（全部由 AI 做，不让用户测）：
   - 合规测试全过（带 `--fresh` 共 61 项；项目没有 `RequireFreshUser` 接口就不带，共 60 项，不要为了凑数加假接口），把 `--report` 的结果存进项目 `docs/`：

     ```bash
     node ~/.claude/skills/feishu-login-guide/templates/backend/anycross-sso/conformance/run.mjs \
       --start "<启动本项目的命令>" --protected /api/me,<所有受保护接口逗号分隔> \
       --fresh <一个 RequireFreshUser 接口> --report docs/sso-conformance.json
     ```

     被测项目要读 `PORT`（只听 127.0.0.1）和 `CONFORMANCE_DATA_DIR`（`FileStore` 放这里；用数据库的指向一个空的测试库），其余 `SSO_*` 由测试注入（含 `SSO_ACCOUNTS_TABLE`、`SSO_LOG_TABLE`、`SSO_FEISHU_API`：指向假飞书开放平台上的两张表，`SSO_OUTBOX_FILE` 放在 `CONFORMANCE_DATA_DIR` 里；兜底对账那两条会把 `SSO_RECONCILE_INTERVAL` 调成 3 秒重启被测项目）。项目声明了 `Features` 的，加 `--feature <key>=<列名>`（声明了几个给几个，勾选、去列这些行为拿第一个测），再给一个用 `HasFeature` 挡第一个功能的接口 `--feature-route <路径>`（没勾的人要 403）。有调了 `Audit` 的接口给 `--audit-route <GET 路径>`，有会回 5xx 的接口给 `--error-route <GET 路径>`（都没有就不给）。
   - 上线后：用户在飞书里打开项目一次（零点击进来）；`/api/me` 返回本人；服务器日志里有 `sso: blocklist revision …`（启动时拉过名单）；在集成平台手动运行一次「定时对账｜每 2 小时」，日志里再出现一次。

## 账号密码

账号放在**每个项目自己的**账号表里，管理员直接在表里加人、停用、改密码、勾功能；项目服务器用飞书开放平台接口（自建应用的 tenant_access_token）当场查表，集成平台只管飞书登录和停用名单。登录、退出、被收回和该记的请求都写进总账本里**所有项目共用的**「日志」表，按「项目」列区分。

### 接入约定（2026-10-16 用户裁定）

- 表都在现有的多维表格「总账本」里，不另建多维表格：每个项目加一张「项目名｜账号」（列照下面一字不差，不加「项目」列），在「系统」表里有本项目一行（它的 record_id 就是 `SSO_LOG_PROJECT_RECORD`）；日志统一写进共用的「日志」表。
- `SSO_FEISHU_APP_ID` / `SSO_FEISHU_APP_SECRET` 用「飞书云文档编辑助手」这个自建应用。它已是总账本的可编辑协作者，IP 白名单里有我们两台服务器（<服务器 IP，问管理员>、<服务器 IP，问管理员>），新项目不用再点任何权限；项目跑在别的服务器上，先把那台的出口 IP 加进这个应用的 IP 白名单。凭证在服务器的环境文件里（找管理员要）（`FEISHU_APP_ID` / `FEISHU_APP_SECRET`），抄进项目的环境文件；**密钥不写进代码、文档、Git**。
- 总账本**故意不开高级权限**：高级权限的角色里加不了应用，一开其他应用就读写不了总账本。代价是这个应用能读写整个总账本，包括每个项目的账号表（密码是明文）。

### 环境变量

| 变量 | 值 |
|---|---|
| `SSO_ACCOUNTS_TABLE` | 账号表：浏览器地址栏里的多维表格链接 `https://xxx.feishu.cn/base/<app_token>?table=<table_id>`（可带 `&view=`），或 `<app_token>/<table_id>`。**知识库（wiki）里的链接不行**，启动就失败：从知识库里点开多维表格、在新窗口里复制 `/base/` 开头的链接 |
| `SSO_LOG_TABLE` | 共用的「日志」表，格式同上：`https://foodtalks.feishu.cn/base/HR1ZbaMtHaE2cms3pMIc7MjNnje?table=tbl0W3rXNyE4MAA3` |
| `SSO_LOG_PROJECT_RECORD` | 配了日志表就必填：总账本「系统」表里本项目那一行的 record_id（`rec…`），写进日志的「项目」列 |
| `SSO_FEISHU_APP_ID` / `SSO_FEISHU_APP_SECRET` | 读写这些表的飞书自建应用：「飞书云文档编辑助手」（见上面「接入约定」）。密钥只放服务器环境文件 |
| `SSO_OUTBOX_FILE` | 待写队列文件，放持久盘（如 `/var/lib/<项目>/sso-outbox.json`）。写日志、写回账号表都先进这里再去写 |
| `SSO_LOG_MAX_ROWS` | 可选，日志表最多多少行（默认 45000，至少 100），见「日志表只留最新的」 |
| `SSO_RECONCILE_INTERVAL` | 可选，兜底对账间隔（默认 `6h`，最少 `10m`、最多 `24h`，写法如 `30m`、`2h`），见「事件优先，进程内定时兜底」 |
| `SSO_FEISHU_API` | 只给合规测试用，生产留空（默认 `https://open.feishu.cn`） |

两张表都不配：表单照样在，账号登录一律 401。配了任何一张，`SSO_FEISHU_APP_ID`、`SSO_FEISHU_APP_SECRET`、`SSO_OUTBOX_FILE` 必填，缺了启动就失败并说出是哪个变量。

### 账号表的列（列名一字不差）

| 列 | 类型 | 谁填 | 说明 |
|---|---|---|---|
| 账号 | 文本 | 管理员 | 登录名。不区分大小写；前后不能有空格 |
| 密码 | 文本 | 管理员 | 明文（2026-10-16 用户裁定接受）。管理员自己定、自己发给对方，系统不生成、不私信 |
| 账号状态 | 单选：启用 / 禁用 | 管理员 | 只有一字不差的「启用」能登录；空着、禁用、别的值都不行 |
| 备注 | 任意 | 管理员 | 系统不读 |
| 各功能列 | 复选框 | 管理员 | 列名是代码里 `Features` 声明的 `Column`；勾上才有这个功能 |
| 状态 | 单选：正常 / 已禁用 / 已锁定 / 配置有误 | 系统 | 登录、变更提醒、兜底对账时算一遍，对不上才写回 |
| 状态说明 | 文本 | 系统 | 为什么是这个状态，如「缺密码」「账号重复」「连续输错 5 次，14:05 后自动解锁」 |
| 最近登录 | 日期 | 系统 | 只在登录成功时写 |

系统只写「状态」「状态说明」「最近登录」三列，人填的列一个字都不碰。「状态」由下面的规则按顺序判，第一条对上的算数：缺账号 → 账号前后有空格 → 缺密码 → 账号重复 → 账号状态的值不认识 → 已禁用 → 已锁定 → 正常。整行人填的格子都空着的行不碰。

### 日志表的列（共用「日志」表）

摘要（文本，主列，如「账号 vendor-a 登录失败：密码不对」「未登录 GET /api/x 401：没登录」）、时间（日期）、项目（单向关联到「系统」，写 `SSO_LOG_PROJECT_RECORD`）、类型（单选：登录 / 退出 / 被收回 / 请求）、结果（单选：成功 / 失败；被收回不填）、原因、登录方式（单选：飞书 / 账号密码）、公司、用户标识、姓名、邮箱、账号、记录ID、权限、方法（单选：GET / POST / PUT / PATCH / DELETE）、路径、状态码（数字）、耗时毫秒（数字）、次数（数字）、IP、IP来源、浏览器、登录后去哪、会话（会话 ID 哈希前 12 位，同一会话的几行能串起来），除注明的都是文本。**密码（含输错的）、令牌、授权码、state、cookie、请求体、查询串的值、除 UA 外的请求头一律不写进日志、待写队列、健康检查。**

请求日志（Go `sso.Middleware(mux)`，Node `app.use(sso.logRequests)`）只记这几种，每种一行「类型=请求」：401、403；改数据的请求（POST/PUT/PATCH/DELETE，不管成没成；登录、退出、两个提醒这些本模板自己的路由除外）；敏感接口（`RequireFreshUser`）；调了 `auth.Audit(r)`（Node：`audit(req)`）的导出、下载；5xx。普通成功的 GET、404 的 GET 不记。路径不带查询串；有会话就记是谁。结果 2xx/3xx 是成功，其余失败；原因 401 是「没登录」、403「没有权限」、5xx「服务出错」。

不用登录就能造出来的两种行（请求、登录失败）合并、限量，防有人刷满共用的日志表（2026-10-16）：

- 一样的行合成一行，「次数」累加，时间留第一次，耗时取最大。请求按方法、路径、状态码、同一个人（没登录按 IP）算一样；登录失败（不带 state 的回调、被锁的账号、密码不对等）按登录方式、IP、账号、原因算一样。登录成功、退出、被收回从不合并、每次一行。
- 同一键 10 秒内最多新起一行：写出去后 10 秒内又来，先暂存到 10 秒满再写，期间再来的都并进这一行。所以刷 200 次一样的登录失败，日志表里是几行、次数加起来 200。
- 一个进程每分钟最多新增 200 行请求日志、30 行登录失败日志（各算各的），多的丢掉，stderr 记一行，健康检查 `dropped_request_rows` / `dropped_login_rows` 计数，15 分钟内带 `warn_request_rows_dropped` / `warn_login_rows_dropped`（只提醒，`ok` 不变）。
- 没在表里查到的账号（常有人把密码填进账号栏）只记开头一两个字、后面打码并写出总长，如 `ab***（12 字）`；查到了才记原文。

访客 IP（「IP」「IP来源」两列）：直连的是本机或内网地址（就是前面的反向代理）时，取 `X-Forwarded-For` **最右边**那个，那是反向代理自己加上的；左边的、`X-Real-IP` 都可能是访客自己写的，不认。直连的是公网地址时这些头一概不认，用直连地址。Caddy 用默认的 `reverse_proxy` 就对（它不信访客传来的 `X-Forwarded-For`，换成真实地址），什么都不用加；nginx 要 `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`。前面再有一层 CDN 时记到的是 CDN 的地址。

### 账号表的自动化（接入时跑一次）

人在表里加人、停用、改密码、勾功能后，表里的自动化马上 `POST https://<项目域名>/internal/auth/accounts-changed {"record_id":"rec…"}`。项目马上回 202（不回数据，乱给的 ID 无害；同一行并发只处理一次，处理期间又来了就处理完再来一遍；全局每分钟最多处理 60 次，再来的那一遍也算；顺带的表结构检查最多每分钟一次，兜底对账每轮照查），然后当场读那一行：删了、账号状态不是启用、密码改了，就收回绑在这一行上的全部会话并记「被收回」；否则更新名字和功能。最后把这一行（和同名的几行）的「状态」对一遍，对不上才写回。

用生成器建两条自动化，**接入时跑一次，代码里 `Features` 改了再跑一次**（换掉「改了…」那条）：

```bash
node ~/.claude/skills/feishu-login-guide/templates/backend/anycross-sso/scripts/account-hooks.mjs \
  --origin https://<项目域名> --base-token HR1ZbaMtHaE2cms3pMIc7MjNnje --table '<项目名>｜账号' \
  [--feature <功能列名> …] --out /tmp/<项目>-hooks
```

它写出两个 JSON 并打印 `lark-cli base +workflow-create --base-token <t> --json @<文件> --as user` 命令，脚本本身不调接口：一条「新增记录」触发（看「账号」），一条「修改记录」触发（只看账号、密码、账号状态和各功能列，不看系统写的状态、状态说明、最近登录，也不认开放接口的批量修改，所以系统自己的写回不会再触发它）。两条都调 HTTP 请求、不看回包。建好后用 `+workflow-enable` 启用。表里删行没有触发器，靠下面两层兜住。

### 事件优先，进程内定时兜底（2026-10-16 用户裁定）

- **事件**（主路径）：账号表靠上面的自动化，名单靠集成平台的名单提醒，日志和写回有东西进来就写。正常情况下改了表几秒内生效。
- **用户请求时**：账号会话每 5 分钟（核对周期）在用户的请求里按记录 ID 读一次那一行，删了、停用、改了密码就下线。没人用就不查。
- **兜底对账**（事件丢了也不会一直错下去）：项目进程里的一个循环（Go `reconcileLoop`，Node 同名），跟着服务启动，不靠集成平台或多维表格的定时触发器，也不用人续期。启动先跑一轮，之后每 `SSO_RECONCILE_INTERVAL`（默认 6 小时）一轮。每轮：重拉一次停用名单；待写队列有积压就马上排一次；查表结构；整表读账号表，收回已删除、已停用、改了密码的账号会话，「状态」「状态说明」对不上的行补写（只写对不上的）。读表失败按 1 秒起翻倍（最长 5 分钟）重试到成功。每轮一次整表读（几页）加一次名单拉取；调短前先算一下集成平台名单工作流的运行次数。
- 写回账号表只在这几处：登录（成功写「正常」和最近登录，失败把同名几行的状态对一遍，连错 5 次写「已锁定」）、变更提醒、兜底对账。

### 行为

- 登录：账号去空格转小写、密码去前后空白，按账号当场查表。查不到、重复、缺密码、密码不对、账号状态不是启用一律 401 `auth_failed`、回得一样，真实原因只写进日志；表查不了 503（不放人，也不算连错）。密码用定长比较。
- 同一账号 15 分钟内连错 5 次锁住：回 429，表里写回「已锁定」和解锁时间。查表前先占一次名额：连错次数加上正在查的凑满 5 次就直接 429（日志原因「同时尝试太多次」），同时猜 50 次也最多真查 5 次；查不了表、被限速的那次退回名额，不算连错。锁住后再来只在那一行「已锁定」的次数上加一。
- 限速（每次登录都要当场查一次表）：每个 IP 每分钟最多 10 次、整个进程每分钟最多查 60 次账号表，超了 429 `rate_limited`，日志原因「请求太频繁」（一样的合成一行记次数）。只在本实例内存里计数。
- 账号表的列有问题（`accounts_column:*`：有人改了列名、类型）时读回来的空值不能当真，按「表查不了」处理：新登录 503，登着的人不收回、照宽限期放行，兜底对账这一轮不碰会话，「状态」不写。要按读出来的值收回会话（停用、改了密码）、拒绝登录（缺密码、账号状态不是启用）、改「状态」之前，先当场查一次列确认没问题。
- 账号会话认的是表里那一行的记录 ID，改账号名不掉线；会话里只存密码指纹。读不到表时普通接口最多再放行 15 分钟。
- 功能：飞书登录的人有全部功能，账号登录的人只有勾上的。代码里 `Features: []auth.Feature{{Key: "export", Column: "导出"}}`（Node：`features: [{ key: 'export', column: '导出' }]`），接口里 `auth.HasFeature(r, "export")`（Node：`hasFeature(req, 'export')`）判断，`/api/me` 也带 `features`。启动、每轮兜底对账、每次变更提醒和写入失败后都核对表结构：声明的列不存在或不是复选框，这个功能对所有人（含飞书登录）关掉，健康检查报 `feature_column:<key>`；表里有没声明的复选框只提醒（`warn_undeclared_checkbox:<列>`，不算故障）。
- 写日志、写回账号表走持久的待写队列：进队列只改内存，落盘在后台（拍一份快照，锁外写临时文件、fsync、改名；同一时间只有一个在写，写的时候新来的改动攒着下一次一起落），磁盘慢、卡住也不拖慢登录；每批写出去之前先等这批落过盘，写成了才删；有东西进来马上写，写的时候新进来的攒着下一批一起写（一批最多 500 行）；失败才按 1 秒起翻倍、最长 5 分钟退避（日志表写满了也一样，登录和请求照常），重启接着写；同一行账号的写回在队列里合成一条（一批里同一行只有一条，后写的值为准）；判断「状态」要不要写时把还没写成的写回叠在表里读到的值上；日志最多积 1 万条（超了丢最旧的）。登录从不等它。队列文件坏了挪到一边、从空队列开始。进程退出前调 `sso.Shutdown(ctx)`（Node：`await sso.shutdown()`）把最后的改动落盘。
- `Store` 接口里 `AccountSessions` 返回全部账号密码会话，变更提醒和兜底对账用；自己实现 `Store` 的项目要实现它。

### 日志表只留最新的（2026-10-16 用户同意请求日志「只留最新的」）

日志表每写 500 行（和日志写入启动时）用 `page_size=1` 的查询读一次总行数；超过 `SSO_LOG_MAX_ROWS`（默认 45000）就删到上限的 90%（每次最多 500 行），每一类都按时间从旧到新：先删「登录失败」（不用登录就能造出来），不够再删「请求」，还不够才删别的（登录成功、退出、被收回）。所以表永远不会被删不掉的行塞满、写不进去，也不用人去清。日志表是共用的，删的是全表最旧的，不分项目。

### 健康检查

`GET /internal/auth/health`：`{ok, outbox_pending, oldest_pending_seconds, dropped_request_rows, dropped_login_rows, problems}`，有问题回 503，不带个人信息、表 ID、错误原文。问题码：`accounts_column:<列>`、`log_column:<列>`、`feature_column:<key>`、`accounts_unreachable`（最近一次读账号表失败）、`outbox_stale`（积压超过 15 分钟）、`outbox_backlog`（超过 1000 条）、`outbox_write_failed`（队列文件写不进去）；`warn_` 开头的只提醒、不让 `ok` 变 false：`warn_undeclared_checkbox:<列>`、`warn_request_rows_dropped`、`warn_login_rows_dropped`。具体原因看服务器 stderr。

不做注册、忘记密码、自己改密码：都由管理员在表里改。

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

- 两个模板行为一一对应，改一个就改另一个，然后 `bash conformance/selftest.sh`（约 5 分钟），两边都要 68/68。
- 改了合规测试，跑 `node conformance/mutants.mjs`，70 个坏版本都要被抓到；新加的规则也补一个坏版本。

## 有意没做的（模板里标了 `shortcut:`）

- 撤销 refresh_token 失败只记日志、不重试：会话已删、令牌只在服务端出现过，风险小。要做到必撤，就把加密令牌连同删会话一起写进待撤销表，后台重试。
- 防并发回调重复换码只在同一实例内有效；多实例要防，就把登录事务放进共享库原子消费。
- 账号密码连错次数、登录限速、日志额度只在本实例内存里计数，重启清零；多实例要严格限次，就把计数放进共享库。
- 没有跨实例的刷新锁：并发刷新靠版本号比对加「用户信息 401 先看库里」兜住，不会误踢人。
- 黑盒测不到的：多实例并发、存储写失败、「每写 500 行查一次日志表行数」（只测了启动时那次）、兜底对账叫醒退避中的待写队列。实现 `Store` 时自己给前两处写单元测试。
- 待写队列和名单只适合单实例（`FileStore`、本地队列文件）；多实例时每个实例各跑一份兜底对账，账号表多读几次，结果一样。
- 2026-10-15 交 Codex 对抗复核，提出 12 条：除「撤销失败重试」按上面说明暂不做，其余都已改完并补了测试或坏版本。
- 假的集成平台（`fake-idp.mjs`）照实测行为写；集成平台行为变了，先改它，再改模板。
