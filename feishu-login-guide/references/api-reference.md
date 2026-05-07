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
| `scope` | 否 | 权限缩减，留空用应用默认权限即可 |

**示例**（urlencoded 后）：

```
https://accounts.feishu.cn/open-apis/authen/v1/authorize?client_id=cli_a1b2c3d4&redirect_uri=http%3A%2F%2Flocalhost%3A8080%2Fauth%2Ffeishu%2Fcallback&response_type=code&state=xK9aB2pQ
```

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
  "refresh_token_expires_in": 2592000,
  "token_type": "Bearer",
  "scope": "..."
}
```

| 字段 | 说明 |
|---|---|
| `access_token` | user_access_token，调后续接口用 |
| `expires_in` | access_token 有效期（秒），**用响应值，不要硬编码** |
| `refresh_token` | 刷新 token 用，**仅能使用一次**（用过就要换新的） |
| `refresh_token_expires_in` | refresh_token 有效期（秒） |
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

**响应**：和 #2 一样的结构。**注意 refresh_token 也是一次性的**——响应里会给一个新的 refresh_token，必须替换旧的。

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
| 授权链接（用户浏览器访问） | `accounts.feishu.cn` |
| 服务端 API（换 token、拿用户信息等） | `open.feishu.cn` |

> 旧版文档里出现的 `passport.feishu.cn/suite/passport/oauth/*` 仍可用，但新接入推荐用上面的 v1/v2 端点。
