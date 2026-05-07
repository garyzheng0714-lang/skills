# 飞书登录错误码与排查

按"在哪一步报错"组织。用户遇到错误时，先确认报错出在哪一步，再来这里查。

## 一、用户在飞书授权页就报错（还没回到你的服务器）

| 报错文案 | 大概率原因 | 怎么修 |
|---|---|---|
| **"请求非法"** | `redirect_uri` 没配白名单，或与白名单字符级不一致 | 去开放平台 → 安全设置 → 重定向 URL，对照代码里的 `redirect_uri` 一字一字检查（斜杠、http/https、端口、大小写） |
| **"4401 应用暂不可用"** | 同上 | 同上 |
| **"应用未发布"** | 自建应用必须发布版本才能被授权 | 开放平台 → 版本管理与发布 → 创建版本并申请发布（企业管理员审核） |
| **"无权限使用此应用"** | 应用没把当前用户加入"可用范围" | 开放平台 → 应用发布 → 可用范围，加上当前用户或全员 |

---

## 二、回调到你的服务器，但 `code` 换 token 失败

接口：`POST /authen/v2/oauth/token`，响应里 `code` 字段非 0。

| `code` | HTTP | 含义 | 排查 |
|---|---|---|---|
| 20001 | 400 | 缺必要参数 | 检查 body：`grant_type`、`client_id`、`client_secret`、`code` 是否都传了。`Content-Type: application/json` 是否正确 |
| 20002 | 400 | client_secret 无效 | App Secret 错了，或者你不小心泄露后被换了。回开放平台 → 凭证与基础信息，重新复制 |
| 20003 | 400 | 授权码无效或已使用 | code 只能用一次。常见诱因：用户刷新回调页、前端发了两次回调请求、重放调试。**回调要写成幂等**：第二次同 code 进来直接走"已登录"分支 |
| 20004 | 400 | 授权码已过期 | code 5 分钟有效。如果用户停留太久，让前端引导他重新点登录 |
| 20010 | 400 | 用户无应用使用权限 | 这个用户不在应用的"可用范围"里。让管理员去 应用发布 → 可用范围 加上 |
| 20049 | 400 | PKCE 校验失败 | 用了 PKCE 流程但 `code_verifier` 跟 `code_challenge` 对不上。本 skill 默认不用 PKCE，如果用了请检查 verifier 计算 |
| 20067 | 400 | scope 列表含重复项 | 把 scope 去重（空格分隔） |
| 20068 | 400 | scope 含未授权权限 | scope 必须是申请授权码时 scope 的子集；最简单办法是不传 scope（用应用默认） |
| 20050 | 500 | 飞书内部错 | 重试。持续报错就提工单 |

---

## 三、token 换到了，但拿用户信息失败

接口：`GET /authen/v1/user_info`，HTTP 401/403/4xx。

| 现象 | 原因 | 修法 |
|---|---|---|
| 401 Unauthorized | `Authorization` 头格式错 | 必须是 `Bearer <token>`，注意：`Bearer` 后面有**一个空格**，不能漏 |
| 401，但 header 格式对 | token 已过期 | 用 refresh_token 换新的，再试 |
| 用户信息里某些字段（email/mobile/user_id）是空 | 应用没申请对应 scope | 开放平台 → 权限管理 → 申请 `contact:user.email:readonly` / `contact:user.phone:readonly` / `contact:user.id:readonly`，再发版 |
| 99991663 等 | 见 https://open.feishu.cn/document/error-codes/ | 同上 |

---

## 四、典型整体故障的快速诊断

### "我点登录按钮，跳到飞书页，点同意，跳回我的服务器，但 500 报错"

按这个顺序查：

1. 后端日志里有 panic / unhandled error 吗？通常是 token 接口返回非 0 时代码没处理
2. token 接口实际返回是什么？把响应 body log 出来对照本文 #二
3. `redirect_uri` 是不是回调里又拼了一次（导致 token 接口的 `redirect_uri` 跟授权时不一致）？
4. App Secret 是不是从环境变量读到的（而不是空字符串）？

### "在我电脑上能跑，部署到生产挂了"

99% 是这两个之一：

1. 生产域名没加到飞书白名单 → 阶段 2 重做
2. 生产用 https，本地用 http，但代码里 redirect_uri 写死 http → 用环境变量配 redirect_uri

### "登录成功了，但刷新页面就跳回登录"

不是飞书的问题，是你的 session 没存住：

1. 你设的 cookie 是不是 `SameSite=Lax`（不能设 `Strict`，那样 302 回调时 cookie 不会带过来）
2. 跨域时是不是漏了 `credentials: 'include'`
3. cookie 域名是不是设错了（比如设了 `.your.com` 但实际访问 `app.your.com` 没匹配上）

---

## 五、调试技巧

### 把请求和响应都 log 出来

后端在三处加 log：
1. 跳 authorize 前：log 完整 URL（含 state）
2. 收到回调：log 整个 query string、cookie 里的 state
3. token 接口、user_info 接口的 response body（**别 log token 本身**，只 log 是否成功）

### 用 curl 单独测每一步

```bash
# 测 token 接口
curl -X POST https://open.feishu.cn/open-apis/authen/v2/oauth/token \
  -H "Content-Type: application/json" \
  -d '{"grant_type":"authorization_code","client_id":"cli_xxx","client_secret":"yyy","code":"<刚拿到的code>","redirect_uri":"http://localhost:8080/auth/feishu/callback"}'

# 测 user_info 接口
curl https://open.feishu.cn/open-apis/authen/v1/user_info \
  -H "Authorization: Bearer <token>"
```

`code` 只有 5 分钟，所以拿到立刻测。
