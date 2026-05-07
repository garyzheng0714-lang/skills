# OAuth 工作原理（AI 自学用）

> 这份文件不是给用户看的，是给 AI 在写代码时遇到不确定时查的。
> 用户不需要懂 OAuth 才能用 skill；AI 也不应该主动给用户讲这些原理。
> 但 AI 写代码时如果对"为什么必须这样做"有疑问，看这里。

## 整体 token 流

```
[用户浏览器]               [你的后端]              [飞书开放平台]
     |                        |                        |
     |--1. 点登录按钮--------->|                        |
     |                        |                        |
     |<--2. 302 → 跳 authorize URL（client_id, redirect_uri, state）|
     |                                                 |
     |--3. 用户在飞书页面点"授权"--------------------->|
     |                                                 |
     |<--4. 302 → 跳回 redirect_uri?code=xxx&state=xxx-|
     |                        |                        |
     |--5. 带 code 回到你后端->|                        |
     |                        |--6. POST /authen/v2/oauth/token-->|
     |                        |   body: code+id+secret |
     |                        |<--7. user_access_token + refresh--|
     |                        |                        |
     |                        |--8. GET /authen/v1/user_info----->|
     |                        |   header: Bearer <token>|
     |                        |<--9. open_id+name+email+avatar----|
     |                        |                        |
     |                        |--10. 在你库里 upsert 用户 →|
     |                        |   生成你自己的 session  |
     |<--11. 302 → 首页 + Set-Cookie: session=xxx-----|
```

## 关键概念

### `code` 不是身份

只是一次性授权券，5 分钟过期、用一次失效。任何把 code 当身份用的代码都是错的。

### `user_access_token` 才是身份凭证

但**绝不能下发到浏览器**。它只活在后端。如果你看到代码里把 token 通过 cookie / response body / localStorage 给前端 —— 那是 critical bug，必须修。

### 浏览器拿的是你自己的 session cookie，不是飞书的 token

飞书登录只是"身份认证那一下"。之后的会话由你自己管（建立 session，颁发自己的 cookie）。

### `state` 防 CSRF

如果不带 state，攻击者可以把自己的 code 让受害者完成回调，导致受害者本地账号被绑定到攻击者的飞书。state 是受害者自己生成的随机串，攻击者不知道，回调时核对，不一致直接 403。

## 三种 token 别搞混

飞书有三种"凭证"，OAuth 登录流程**只用 user_access_token**：

| 凭证 | 谁的身份 | 怎么获取 |
|---|---|---|
| `user_access_token` | 已登录的用户 | 用 code 换（本流程） |
| `app_access_token` | 应用自己 | 用 App ID + Secret 直接换 |
| `tenant_access_token` | 企业（租户） | 用 App ID + Secret 直接换 |

如果代码里把 `app_access_token` 或 `tenant_access_token` 用在登录流程，那是搞错了。

## 为什么 redirect_uri 必须字符级一致

OAuth 安全模型的核心 —— 飞书只把 code 发给白名单里的 URL，攻击者无法把 code 重定向到自己的服务器。如果支持模糊匹配/前缀匹配，攻击面立即扩大。

实现端注意：不要在代码里动态拼 redirect_uri（比如 `${request.host}/auth/feishu/callback`），因为 host 可能被反向代理改写。**用环境变量写死全 URL**。

## 为什么回调要做幂等

用户浏览器可能：
- 网络抖动重发请求
- 用户手动刷新回调页
- 并发的两个标签都收到回调（不常见但可能）

第二次请求时 code 已经被消费过（飞书会返回 20003）。回调代码看到这种情况应该走"已登录"分支（如果用户已经有 session 了）或返回友好错误（让用户重登）。**绝不要 panic / 500**。

## 为什么 SameSite 必须是 Lax 不能 Strict

OAuth 回调是从飞书域名 302 跳回你的域名 —— 这是跨站导航。`SameSite=Strict` 的 cookie 在跨站导航时不会发送，导致回调拿不到 state cookie（因此 state 校验失败、403）。`Lax` 允许 GET 顶级导航发送 cookie，正好适合 OAuth 回调。

## 为什么 redirect_uri 不能接受用户输入参数

如果你支持 `?return_to=xxx` 在登录后跳到任意 URL，攻击者构造 `return_to=http://evil.com`，登录成功后用户会被跳到钓鱼站。这叫 "open redirect"。如果一定要支持 return_to，用白名单或仅接受相对路径。

---

## 参考资料

- 飞书官方：https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/authentication-management
- OAuth 2.0 RFC：https://www.rfc-editor.org/rfc/rfc6749
- OAuth 2.0 Threat Model：https://www.rfc-editor.org/rfc/rfc6819
