# 场景 A：网页 OAuth 跳转登录（默认）

> SKILL.md 主流程默认讲的就是这个场景。这份文件是对主流程的补充细节。

## 适用场景

- 标准 Web 应用，用户在浏览器访问
- 用户**不在飞书 App 里**（在 Chrome/Safari/Firefox）
- 想让用户体验是"点按钮 → 跳飞书页 → 授权 → 回应用"

## 用户体感流程（再贴一次便于讲解）

1. 用户访问应用 → 看到「使用飞书登录」按钮
2. 点按钮 → 浏览器跳转到 `accounts.feishu.cn` 的授权页
3. 飞书页面显示"____ 应用想要：读取你的基本信息、邮箱"，用户点同意
4. 浏览器跳回应用的 `/auth/feishu/callback?code=xxx&state=xxx`
5. 后端处理完，跳到首页，显示用户头像 + 名字

## 跟其他场景的差异点

| 维度 | 网页 OAuth | 扫码登录 | 端内免登 |
|---|---|---|---|
| 用户在哪 | 浏览器 | 浏览器 | 飞书 App 内 |
| 是否跳走 | 跳 accounts.feishu.cn | 不跳，二维码 SDK 嵌当前页 | 不跳，飞书 App 内直接拿 code |
| 用户操作 | 点按钮 + 在飞书页点同意 | 用飞书 App 扫码 + 同意 | 完全无感（首次有授权弹窗） |
| 后端 token 流程 | 同 | **同** | **同** |
| 适合 | PC 端 Web | PC 端 Web（更顺滑） | 飞书内嵌 H5 |

**重点：三种场景的后端 token 流程完全一样**。差异只在前端"怎么拿到 code"。

## 第一次接入时的常见疑问

### "为什么要 state？"

防 CSRF。如果不带 state，攻击者可以：

1. 在自己飞书账号上生成一个 code（点登录、拿到回调 URL 但不让浏览器跳完）
2. 把这个回调 URL 链接发给受害者（"快来抽奖→ http://yourapp.com/auth/feishu/callback?code=xxx"）
3. 受害者点开 → 你的服务器拿 code 换 token → 把**攻击者的飞书账号**绑定到**受害者的本地账号**上
4. 攻击者随后用自己的飞书登录，拿到受害者账号的所有数据

state 是受害者自己生成的随机串，攻击者不知道、放进 cookie，回调时核对 state 不一致直接拒绝。

### "为什么必须用 https?"

OAuth 2.0 的 redirect 是明文 query 参数。code 在 URL 里，如果走 http，中间人能截获 code，5 分钟内重放（即便 code 一次性，先用就先得）。生产必须 https，开发期 localhost 例外（localhost 在浏览器看来是安全上下文）。

### "为什么 redirect_uri 不能动态拼？"

如果 redirect_uri 接受用户参数（`?return_to=xxx`），变成 open redirect 漏洞 —— 攻击者构造 `redirect_uri=http://evil.com/auth/feishu/callback`，飞书校验白名单失败，但如果你的代码自己处理了 return_to，攻击者就能把 code 跳到 evil.com。

## 推荐的项目结构

```
your-project/
├── cmd/server/main.go          # 启动入口，挂载路由
├── internal/auth/feishu.go     # 飞书登录处理（来自 skill 模板）
├── internal/middleware/auth.go # 验 session cookie 的中间件
├── frontend/src/
│   ├── pages/Login.tsx         # 登录页（含飞书按钮）
│   └── lib/feishuLogin.ts      # 跳转 helper
└── .env.example                # FEISHU_APP_ID / FEISHU_APP_SECRET 等
```

## 关键端点（速查）

```
authorize: https://accounts.feishu.cn/open-apis/authen/v1/authorize
token:     POST https://open.feishu.cn/open-apis/authen/v2/oauth/token
user_info: GET  https://open.feishu.cn/open-apis/authen/v1/user_info
```

完整接口规格见 `references/api-reference.md`。
