# 飞书登录接入安全清单

交付前一项一项过完。任何一项打 ✗ 都不能上线。

## 凭证管理

- [ ] **FBIF App Secret 不在 git 里**。`grep -r "FEISHU_FBIF_APP_SECRET=" .git/` 应为空。检查 `.env`、配置文件、源代码、commit history
- [ ] **Secret 通过环境变量注入**，开发期用 `.env`（已在 `.gitignore`），生产期用部署平台的密钥管理（如 K8s Secret、AWS Secrets Manager）
- [ ] **Secret 不写日志**。code review 时检查所有 `log.*`、`fmt.Print*`、`console.log` 不会输出 secret
- [ ] **Secret 泄露后能立即轮换**。开放平台 → 凭证与基础信息 → 重置 App Secret 知道在哪
- [ ] **富的 secret 来自密钥仓库**：v3.2 起 实际值（只在 `assets/secrets/feishu-app-credentials.md` 里）只存在 iCloud 密钥仓库 + 部署环境 `.env`，**不再写进任何 skill 文件 / 代码模板**。轮换流程：飞书后台重置 → 更新密钥仓库 markdown → 通知所有接入项目运维更新 `.env` → 重启
- [ ] **不要把 FBIF secret 当 富的 secret 用（反之亦然）**。模板内 `tenantSecret(t)` / `_tenant_secret(t)` 函数已经按 tenant 选 secret，不要"DRY 简化"成一份

## state 参数（CSRF 防护）

- [ ] **state 是密码学随机生成**。用 `crypto/rand`、`secrets.token_urlsafe`、`crypto.randomBytes` 之类，不是 `Math.random()` 或时间戳
- [ ] **state 长度 ≥ 16 字节** base64 后约 22 字符
- [ ] **state 存在服务器侧或 HttpOnly cookie**，不是 URL 参数明文带回前端
- [ ] **回调第一件事核对 state**，不一致直接 403，不要"宽容"放过
- [ ] **state 一次性**，校验通过后立即从 cookie/redis 删掉，防重放
- [ ] **每企业 × 每模式独立 state cookie**：`feishu_state_fbif_oauth` / `feishu_state_fbif_qr` / `feishu_state_fude_oauth` / `feishu_state_fude_qr`。不能复用一个 cookie——用户在多个 Tab/视图切换时会互相覆盖

## redirect_uri

- [ ] **生产用 HTTPS**，开发期 localhost 可以 http
- [ ] **redirect_uri 完整精确匹配开放平台白名单**，不依赖前缀匹配
- [ ] **4 条 URL 都已加入对应飞书后台白名单**（v3 起每企业 2 条）：
  - FBIF 后台：`<URL>/auth/feishu/fbif/callback` + `<URL>/auth/feishu/fbif/qr-callback`
  - 富的 后台：`<URL>/auth/feishu/fude/callback` + `<URL>/auth/feishu/fude/qr-callback`
- [ ] **不要交叉**：FBIF App 的白名单不能放 fude 路径，反之亦然
- [ ] **redirect_uri 不接受用户输入参数**。比如不要支持 `?return_to=xxx` 直接 302 到任意 URL —— 这会变成 open redirect 漏洞。如果要 return_to，用白名单或相对路径

## token 处置

- [ ] **`user_access_token` 永远不下发到前端**。grep 你的代码确保没有把 token 通过 cookie / response body / localStorage 传给浏览器
- [ ] **token 在后端存放短时**：内存/redis 里存（带 TTL），不要写数据库长期持有；过期前调 refresh
- [ ] **`refresh_token` 也不下发前端**。它是长期凭证，泄露损失更大
- [ ] **服务端日志不打 token 原文**。log 里要么完全不出现 token，要么 mask 成 `u-xxx****yyy`
- [ ] **应用退出时撤销 token**（可选）。调飞书的撤销接口 `POST /authen/v1/oidc/access_token/revoke`

## OAuth scope 与 token 契约

- [ ] **先列出登录后要调用的飞书 API，再确定最小用户身份 scope**。不要只看飞书后台权限页
- [ ] **代码要求、保存或刷新 `refresh_token` 时，authorize URL 必须显式包含 `offline_access`**
- [ ] **只做 callback 当次身份识别时，不得因为缺少 `refresh_token` 判定登录失败**
- [ ] **云文档搜索 + 导出使用精确 scope**：`offline_access drive:drive.search:readonly drive:export:readonly`
- [ ] **飞书后台已开通并发布对应权限**。后台开权限和 authorize URL 请求 scope 两项缺一不可
- [ ] **302 `Location` 有自动测试**：scope 精确、去重，`redirect_uri` 字符级一致
- [ ] **token 响应有/无 refresh token 两条分支都有测试**；缺失时日志明确指出 `offline_access`，但不打印 token/Secret
- [ ] **refresh token 轮换是原子替换**。刷新成功后立即加密保存新 token，旧 token 不再使用

## 你自己的 session cookie

- [ ] **`HttpOnly`** —— JS 读不到，防 XSS 偷
- [ ] **`Secure`** —— 仅 HTTPS（生产）；开发期 localhost http 可以暂时不设
- [ ] **`SameSite=Lax`** —— OAuth 回调的 302 跳转能带上 cookie；不要设 `Strict`（会断回调）；只在跨域确实需要时设 `None`（且必须搭配 `Secure`）
- [ ] **session ID 是密码学随机**，不是顺序自增
- [ ] **session 默认 30 天滑动续期**：活跃请求续服务端 `expires_at` 和浏览器 cookie；连续 30 天不使用才重新登录

## 用户身份关联

- [ ] **本地用户匹配用 `tenant_key + (user_id OR open_id)`**，不是只用 email/mobile，也不是跨租户只看 open_id
- [ ] **首次登录建用户时，记录 `user_id` + `open_id` + `union_id` + `tenant_key`**。`user_id` 依赖权限可能为空，`open_id` 是稳定兜底
- [ ] **不信任 `email` / `mobile` 可证明身份** —— 这俩是飞书侧用户自己填的，可改、可重复
- [ ] **FBIF 和 富的 用户进同一张 users 表**，靠 `tenant_key` 区分。不要建两张表或两套用户体系

## 错误处理

- [ ] **state 不匹配** → 403，不要把详情泄露给前端（"state 不匹配" 太具体，攻击者拿来定位漏洞）
- [ ] **token 接口失败** → 400/500，记日志，不要把 `client_secret`、错误堆栈暴露给前端
- [ ] **用户拒绝授权** → 友好回到登录页，不要 500
- [ ] **`USER_NOT_PROVISIONED` 先查 tenant_key / user_id / open_id 匹配**，不要先改 OAuth 流程或误判为账号没建档

## 端到端实测

把这些用真实浏览器跑过，不能用 `file://` 页面代替：

1. **FBIF 按钮登录**：隐身窗口 → 点 FBIF 按钮 → 飞书授权 → 回应用 → 顶栏头像
2. **富的 按钮登录**：另一个隐身窗口 → 点 富的 按钮 → 飞书授权 → 回应用 → 顶栏头像（用户落在同一张 users 表，tenant_key 不同）
3. **扫码登录（仅确需扫码的项目）**：登录页默认无扫码入口，没加就跳过；按 `references/scenarios/qr-code.md` 加了入口的 → 点「飞书扫码登录」→ 用飞书 App 扫 → 跳回应用
4. **（legacy 双 App 项目）富的 扫码登录**：扫码视图点 富的 Tab → 二维码刷新 → 用 富的 飞书 App 扫 → 跳回应用
5. **state 篡改**：登录中途把回调 URL 的 state 参数手动改一位 → 应该 403
6. **重放 code**：拿到 code 后故意重新发起回调请求两次 → 第一次成功，第二次走"已登录"分支或返回错误
7. **跨企业互拒**：FBIF 员工点 富的 按钮（或反之）→ 飞书自带"无权限"页拦住，不能进我们后端
8. **session 持久**：登录后刷新页面 → 仍登录态
9. **退出**：清 cookie 后再访问 → 自动跳登录页
10. **反代边界**：`/auth/feishu/*` 到后端，`/auth/callback` 由前端 SPA 返回页面，不是后端 404
11. **滑动续期**：已登录请求后，服务端 session 过期时间和 `Set-Cookie` 都续到当前时间 + 30 天
12. **整站门禁总闸（若已接入 site-gate）**：未登录直接 `curl /api/articles` → 401 + `X-Login-Required: 1`；登录后同请求 → 200；清 cookie + 无效 token 刷新 → 跳登录页。**必须用「build 前端 + 后端 serve 静态」的生产形态验收**——vite dev 会绕过后端静态白名单，漏测如登录页插画 404 这类只在生产暴露的问题
13. **正式域名真人 OAuth 闭环**：真实按钮 → 授权页权限清单 → callback → `/api/me` → 姓名头像 → 刷新仍登录 → 至少一个下游用户身份 API 成功；同时确认生产日志没有新增 callback/token/refresh/session 错误

---

> 这份清单不是飞书 OAuth 特有 —— 大部分是 OAuth 2.0 通用安全要求。如果做过 GitHub/Google 登录，应该眼熟。差别是飞书白名单要求字符级一致，这点比一些其他 IDP 严。
