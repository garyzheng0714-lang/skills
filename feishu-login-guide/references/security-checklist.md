# 飞书登录接入安全清单

交付前一项一项过完。任何一项打 ✗ 都不能上线。

## 凭证管理

- [ ] **App Secret 不在 git 里**。`grep -r "FEISHU_APP_SECRET=" .git/` 应为空。检查 `.env`、配置文件、源代码、commit history
- [ ] **Secret 通过环境变量注入**，开发期用 `.env`（已在 `.gitignore`），生产期用部署平台的密钥管理（如 K8s Secret、AWS Secrets Manager）
- [ ] **Secret 不写日志**。code review 时检查所有 `log.*`、`fmt.Print*`、`console.log` 不会输出 secret
- [ ] **Secret 泄露后能立即轮换**。开放平台 → 凭证与基础信息 → 重置 App Secret 知道在哪

## state 参数（CSRF 防护）

- [ ] **state 是密码学随机生成**。用 `crypto/rand`、`secrets.token_urlsafe`、`crypto.randomBytes` 之类，不是 `Math.random()` 或时间戳
- [ ] **state 长度 ≥ 16 字节** base64 后约 22 字符
- [ ] **state 存在服务器侧或 HttpOnly cookie**，不是 URL 参数明文带回前端
- [ ] **回调第一件事核对 state**，不一致直接 403，不要"宽容"放过
- [ ] **state 一次性**，校验通过后立即从 cookie/redis 删掉，防重放

## redirect_uri

- [ ] **生产用 HTTPS**，开发期 localhost 可以 http
- [ ] **redirect_uri 完整精确匹配开放平台白名单**，不依赖前缀匹配（飞书白名单本身就是精确匹配，但你写代码时不要假设有兼容性）
- [ ] **redirect_uri 不接受用户输入参数**。比如不要支持 `?return_to=xxx` 直接 302 到任意 URL —— 这会变成 open redirect 漏洞。如果要 return_to，用白名单或相对路径

## token 处置

- [ ] **`user_access_token` 永远不下发到前端**。grep 你的代码确保没有把 token 通过 cookie / response body / localStorage 传给浏览器
- [ ] **token 在后端存放短时**：内存/redis 里存（带 TTL），不要写数据库长期持有；过期前调 refresh
- [ ] **`refresh_token` 也不下发前端**。它是长期凭证，泄露损失更大
- [ ] **服务端日志不打 token 原文**。log 里要么完全不出现 token，要么 mask 成 `u-xxx****yyy`
- [ ] **应用退出时撤销 token**（可选）。调飞书的撤销接口 `POST /authen/v1/oidc/access_token/revoke`

## 你自己的 session cookie

- [ ] **`HttpOnly`** —— JS 读不到，防 XSS 偷
- [ ] **`Secure`** —— 仅 HTTPS（生产）；开发期 localhost http 可以暂时不设
- [ ] **`SameSite=Lax`** —— OAuth 回调的 302 跳转能带上 cookie；不要设 `Strict`（会断回调）；只在跨域确实需要时设 `None`（且必须搭配 `Secure`）
- [ ] **session ID 是密码学随机**，不是顺序自增
- [ ] **session TTL 合理**（典型 24h，敏感操作再走 step-up）

## 用户身份关联

- [ ] **本地用户表用 `open_id` 做外键**，不是用 email/mobile（这俩可能改）
- [ ] **首次登录建用户时，记录 `open_id` + `union_id` + `tenant_key`**，多应用打通时用得上
- [ ] **不信任 `email` / `mobile` 可证明身份** —— 这俩是飞书侧用户自己填的，可改、可重复

## 错误处理

- [ ] **state 不匹配** → 403，不要把详情泄露给前端（"state 不匹配" 太具体，攻击者拿来定位漏洞）
- [ ] **token 接口失败** → 400/500，记日志，不要把 `client_secret`、错误堆栈暴露给前端
- [ ] **用户拒绝授权** → 友好回到登录页，不要 500

## 端到端实测

把这五条用真实浏览器跑过：

1. **正常登录**：隐身窗口 → 点登录 → 飞书授权 → 回应用 → 显示用户名
2. **state 篡改**：登录中途，把回调 URL 的 state 参数手动改一位 → 应该 403
3. **重放 code**：拿到 code 后，故意重新发起回调请求两次 → 第一次成功，第二次走"已登录"分支或返回错误，不能两次都成功登
4. **session 持久**：登录后刷新页面 → 仍登录态
5. **退出**：清 cookie 后再访问 → 自动跳飞书

---

> 这份清单不是飞书 OAuth 特有 —— 大部分是 OAuth 2.0 通用安全要求。如果做过 GitHub/Google 登录，应该眼熟。差别是飞书白名单要求字符级一致，这点比一些其他 IDP 严。
