# 飞书登录相关接口速查

> 这是给 Claude 和用户做"我忘了那个接口什么样"速查用的。代码模板里已经写好调用，**不需要每次重新查这份文档**。

## 1. 构造授权链接（让用户跳到飞书授权页）

**形式**：浏览器 302 跳转，不需要后端发请求。

```
GET https://accounts.feishu.cn/open-apis/authen/v1/authorize
```

**Query 参数**：

| 参数 | 必填 | 说明 |
|---|---|---|
| `client_id` | 是 | 应用 App ID（`cli_xxx`） |
| `redirect_uri` | 是 | 回调 URL，**urlencoded**，必须与开放平台白名单字符级一致 |
| `response_type` | 是 | 固定 `code` |
| `state` | 强烈推荐 | CSRF 防护用，回调时原样回传 |
| `scope` | 视业务而定 | 空格分隔的用户身份权限。只要代码要求/保存/刷新 `refresh_token`，就必须显式包含 `offline_access`；飞书后台「已开通」不会自动把权限放进本次授权 |

**示例**（urlencoded 后）：

```
https://accounts.feishu.cn/open-apis/authen/v1/authorize?client_id=cli_a1b2c3d4&redirect_uri=https%3A%2F%2Fapp.example.com%2Fauth%2Ffeishu%2Ffbif%2Fcallback&response_type=code&scope=offline_access&state=xK9aB2pQ
```

scope/token 契约：

- 只在 callback 当次读取用户资料、之后不调用飞书用户身份 API：可以不请求 `offline_access`，但也不得强制要求响应包含 `refresh_token`。
- callback 后还要持续调用飞书 API：必须请求 `offline_access`，并追加对应接口的最小用户身份 scope。
- 云文档搜索 + 导出：`offline_access drive:drive.search:readonly drive:export:readonly`。
- 授权 URL 的 scope 必须写自动测试，断言 302 `Location` 中的权限精确、去重。

**回调（飞书把用户跳回你的服务器）**：

```
GET <redirect_uri>?code=<5分钟有效的一次性code>&state=<你给的state原样回来>
```

如果用户拒绝授权或出错：

```
GET <redirect_uri>?error=access_denied&error_description=...&state=<state>
```

---

## 2. 用 code 换 user_access_token

```
POST https://open.feishu.cn/open-apis/authen/v2/oauth/token
```

**Header**：

```
Content-Type: application/json; charset=utf-8
```

**Body**（JSON）：

| 字段 | 必填 | 值 |
|---|---|---|
| `grant_type` | 是 | 固定 `authorization_code` |
| `client_id` | 是 | App ID |
| `client_secret` | 是 | App Secret |
| `code` | 是 | 上一步拿到的 code |
| `redirect_uri` | 否 | 必须与构造授权链接时一致（**强烈建议传，避免 secret 泄露后被滥用**） |

**响应**（成功）：

```json
{
  "code": 0,
  "access_token": "u-xxx...",
  "expires_in": 7200,
  "refresh_token": "ur-xxx...",
  "refresh_token_expires_in": 604800,
  "token_type": "Bearer",
  "scope": "..."
}
```

| 字段 | 说明 |
|---|---|
| `access_token` | user_access_token，调后续接口用 |
| `expires_in` | access_token 有效期（秒），**用响应值，不要硬编码** |
| `refresh_token` | 仅在授权 URL 请求并获批 `offline_access` 时返回；刷新 token 用，**仅能使用一次**（用过就要换新的） |
| `refresh_token_expires_in` | refresh_token 有效期（秒）。官方示例 604800（约 7 天），**非固定值，以响应为准**；2026-10 实测 7 天 |
| `token_type` | 固定 `Bearer` |

**频率限制**：1000 次/分钟、50 次/秒。

---

## 3. 用 user_access_token 拿用户信息

```
GET https://open.feishu.cn/open-apis/authen/v1/user_info
```

**Header**：

```
Authorization: Bearer <user_access_token>
```

**响应**（成功）：

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "name": "张三",
    "en_name": "Zhang San",
    "avatar_url": "https://...",
    "avatar_thumb": "https://...",
    "avatar_middle": "https://...",
    "avatar_big": "https://...",
    "open_id": "ou_aaa...",
    "union_id": "on_bbb...",
    "user_id": "ccc...",
    "email": "...",
    "enterprise_email": "...",
    "mobile": "+86138...",
    "tenant_key": "ddd..."
  }
}
```

| 字段 | 用途 |
|---|---|
| `open_id` | **本应用内**用户的唯一 ID。**关联本地用户表用这个**。 |
| `union_id` | 同一企业、跨应用统一身份。多个自家应用想共享用户身份用这个。 |
| `user_id` | 企业内部 ID，需要应用有 `contact:user.id:readonly` 权限才返回。 |
| `tenant_key` | 企业唯一 ID。多租户场景关联企业用。 |
| `email` / `mobile` | 需要对应 scope 才返回。 |

> 哪些字段需要哪个 scope，参考飞书开放平台「权限管理」页：https://open.feishu.cn/document/server-docs/application-scope/introduction

---

## 4. 刷新 user_access_token

当 access_token 过期，用 refresh_token 换新的：

前提：最初的 authorize URL 已显式请求 `offline_access`，并且该权限已在飞书后台开通、发布且由用户授权。否则 token 响应不会有 `refresh_token`；这不是 App Secret 或 callback 错误。

```
POST https://open.feishu.cn/open-apis/authen/v2/oauth/token
```

**Body**：

```json
{
  "grant_type": "refresh_token",
  "client_id": "...",
  "client_secret": "...",
  "refresh_token": "<上一次拿到的 refresh_token>"
}
```

**响应**：和 #2 一样的结构。**注意 refresh_token 也是一次性的**——响应里会给一个新的 refresh_token，必须替换旧的；旧的立即作废。连续授权满 365 天后必须重新授权。

**失败**：业务错误放在 **HTTP 400** 的响应体里（如 `{"code":20037,"error":"invalid_grant","error_description":"..."}`），HTTP 客户端必须照样解析 JSON 取 `code`：

| code | HTTP | 含义 | 处理 |
|---|---|---|---|
| 20026 | 400 | refresh_token 无效 | 需重新授权 |
| 20037 | 400 | refresh_token 已过期 | 需重新授权 |
| 20064 | 400 | refresh_token 已被撤销 | 需重新授权 |
| 20073 | 400 | refresh_token 已被使用 | 先重读库里是否已被别人换成新令牌；没有才需重新授权 |
| 20024 | 400 | 令牌与 client_id 不匹配 | 需重新授权（多半换过登录应用） |
| 20050 | 500 | 飞书内部错误 | 临时故障，保留旧令牌稍后重试 |
| 20072 | 503 | 服务暂不可用 | 临时故障，保留旧令牌稍后重试 |

refresh_token 约 7 天就过期：需要持续用户身份的项目要在会话有效期内由服务端后台定期轮换，见 `session-and-token-renewal.md`。

---

## 5. 三种 token 别搞混

飞书有三种"凭证"，OAuth 登录流程**只用 user_access_token**：

| 凭证 | 谁的身份 | 怎么获取 | 用在哪 |
|---|---|---|---|
| `user_access_token` | 已登录的用户 | 用 code 换（本流程） | 拿用户信息、以用户身份调 API |
| `app_access_token` | 应用自己 | 用 App ID + Secret 直接换 | 应用级 API（不需要用户登录） |
| `tenant_access_token` | 企业（租户） | 用 App ID + Secret 直接换 | 企业级 API（读企业通讯录、发企业消息等） |

**本登录流程不需要 app/tenant_access_token**。如果有人告诉你登录要用 tenant_access_token，那是搞错了。

---

## 频率与限额

- 换 token 接口：1000/分钟、50/秒
- user_info 接口：飞书未公开具体限额，但单用户登录场景远低于阈值，正常使用不用担心

---

## 接口域名汇总

| 用途 | 域名 |
|---|---|
| 按钮模式授权链接（用户浏览器访问） | `accounts.feishu.cn` |
| **扫码模式授权链接**（QR SDK 嵌入用） | **`passport.feishu.cn`** |
| 服务端 API（换 token、拿用户信息等） | `open.feishu.cn` |

---

## 6. 扫码模式专用：v1 OAuth 流程

> 飞书 LarkSSOSDKWebQRCode SDK 官方文档原话："**暂不支持新版登录流程，请参考旧版登录流程**"。所以扫码模式必须走 v1，跟按钮模式（v2）独立。

### 6.1 授权链接（扫码 SDK 的 goto）

```
https://passport.feishu.cn/suite/passport/oauth/authorize
  ?client_id=<APP_ID>
  &redirect_uri=<REDIRECT_URI 编码后>
  &response_type=code
  &state=<密码学随机串>
```

> 来源：飞书《二维码 SDK 接入文档》"使用方法"章节官方示例。

回调到 redirect_uri 时携带 `?code=xxx&state=xxx`，跟按钮模式格式一样，但 **code 不能用 v2 token 接口换**——必须走下面的 v1 两步流程。

### 6.2 第一步：换 app_access_token

```
POST https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal
Content-Type: application/json; charset=utf-8

{"app_id": "<APP_ID>", "app_secret": "<APP_SECRET>"}
```

响应：

```json
{
  "code": 0,
  "msg": "ok",
  "app_access_token": "t-xxx",
  "expire": 7200,
  "tenant_access_token": "t-xxx"
}
```

### 6.3 第二步：用 app_access_token + code 换 user_access_token

```
POST https://open.feishu.cn/open-apis/authen/v1/access_token
Authorization: Bearer <app_access_token>
Content-Type: application/json; charset=utf-8

{"grant_type": "authorization_code", "code": "<code>"}
```

响应：

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "access_token": "u-xxx",
    "token_type": "Bearer",
    "expires_in": 7200,
    "refresh_token": "ur-xxx",
    "refresh_expires_in": 2592000,
    "open_id": "ou_xxx",
    "tenant_key": "xxx",
    ...
  }
}
```

> 注意 v1 把 user info 字段也直接塞在 `data` 里，但其完整性受 scope 影响。模板里仍然单独调 `/authen/v1/user_info` 拿全量信息（与 v2 流程对齐）。

### 6.4 注意事项

- `code` 5 分钟有效，且只能使用一次
- `state` 必须由服务端签发并存 cookie，回调时核对——SDK 不会替你做这件事
- `redirect_uri` 在飞书后台白名单里要**单独加一条**（v3 起每企业有 fbif/fude 两条独立路径，按钮和扫码各一条 = 共 4 条；模板路径 `/auth/feishu/{tenant}/qr-callback`）
