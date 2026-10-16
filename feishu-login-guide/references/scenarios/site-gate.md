# 场景：整站门禁总闸（从「有登录页」升级到「不登录什么都看不到」）

> 提炼自 FBIF 资讯订阅生产项目（docs/46）。当一个项目已经有登录页 + session，但业务 API 仍裸奔（未登录可直接拉数据）时，按本手册补「整站门禁总闸」。这是登录功能真正闭环的最后一公里。

## 何时用

- 已接好飞书 OAuth / 账号密码登录，但 `/api/*` 没有强制鉴权。
- 需求是「不登录就什么数据都看不到」，而不仅仅是「有个登录页」。

## 后端：fail-closed 总闸（不是逐个路由加守卫）

**核心原则：默认拒绝。** 在 mux 最外层包一层中间件，锁住所有 `/api/*`，只放行精确白名单。这样**新增的任何 `/api` 路由自动受保护**，不会因为「忘了加守卫」漏出去。

```go
// 最外层：secureHeaders(gateAPI(mux))
func (s *Server) gateAPI(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if gatedAPIPath(r.URL.Path) && !s.authH.AuthorizeAPI(w, r) {
			return
		}
		next.ServeHTTP(w, r)
	})
}

// 白名单极简：登录态自查、外部 webhook（无 cookie）、admin 密码入口（自带密码门）。
// 非 /api 路径（/auth/* /health 静态资源）一律放行——由前端 AuthGate 决定显示登录页还是 App。
func gatedAPIPath(p string) bool {
	if !strings.HasPrefix(p, "/api/") {
		return false
	}
	switch p {
	case "/api/me", "/api/jintiankansha/webhook", "/api/settings-auth":
		return false
	}
	return true
}
```

`AuthorizeAPI` 校验 session + 滑动续期，未登录写 401：

```go
func (h *Handler) AuthorizeAPI(w http.ResponseWriter, r *http.Request) bool {
	u, ok := h.CurrentUser(r)
	if !ok {
		w.Header().Set("X-Login-Required", "1") // ← 关键，见教训 2
		writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "login_required"})
		return false
	}
	h.renew(w, r, u.FeishuOpenID)
	return true
}
```

## 前端：统一出口 apiFetch（收口所有 fetch）

飞书内嵌 / 客户机 / 隐私浏览器里 cookie 会丢，所以**每个**业务请求都要带 `X-Session-Token` 兜底。做一个唯一出口，把散落的 `fetch` 全部收口：

```ts
export function authHeaders(): Record<string, string> {
  const t = getSessionToken()
  return t ? { 'X-Session-Token': t } : {}
}

export async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    credentials: 'include',
    headers: { ...authHeaders(), ...init?.headers },
  })
  if (res.status === 401 && res.headers.get('X-Login-Required') === '1') {
    onSessionExpired() // 清 token + reload → AuthGate 回登录页
  }
  return res
}
```

收口范围：`apiJSON`、每个组件自带的 `getJSON/sendJSON` 小封装、所有裸 `fetch('/api/...')`。**SSE 流式接口也要收口**——它用 `fetch` + `response.body.getReader()`（不是 `EventSource`），所以能正常带 header；EventSource 不能带自定义 header，遇到要改用 fetch 流。

## session：用标准 JWT 库，别手写 HMAC

手写 `HMAC-SHA256 签名 + base64` 自包含 token 本质就是 JWT HS256，但要用经审计的标准库（Go: `github.com/golang-jwt/jwt/v5`）。`keyFunc` 必须强制 HMAC 算法，拒绝 `alg=none` 与非对称混淆攻击：

```go
func (h *Handler) keyFunc(t *jwt.Token) (any, error) {
	if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
		return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
	}
	return h.secret, nil
}
// 解析必带 jwt.WithValidMethods([]string{"HS256"})；测试可注入 jwt.WithTimeFunc 控制 now。
```

迁移时只换 `issueSession/parseSession/issueState/verifyState` 四个函数的内部实现，签名不变 → 调用方零改动。**注意：token 格式变了，部署后所有在线用户需重新登录一次（一次性，可接受）。**

## 测试：authed() 包装器零侵入让既有测试过门禁

门禁一加，几十个既有业务测试（不带登录调 `/api/*`）会全部 401。不要逐个改——用一个包装 handler 在 `ServeHTTP` 时自动注入有效 session，再把测试里的 `NewHandler(...)` 批量替换成 `authed(t, NewHandler(...), state)`，业务断言一行不改：

```go
type authedHandler struct{ inner http.Handler; token string }
func (a authedHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if _, err := r.Cookie("fbif_user_session"); err != nil {
		r.AddCookie(&http.Cookie{Name: "fbif_user_session", Value: a.token})
	}
	a.inner.ServeHTTP(w, r)
}
```

token 自包含 + 同进程 secret 固定 → 全进程签一次复用（`sync.Once`），但每个 store 都要 seed 那个用户（门禁查 store 的 status）。另写 4 个门禁专项测试验证真实行为：未登录 401+header、白名单放行、登录放行、停用即时拒绝。

## 踩过的坑（务必吸取）

1. **fail-closed，不是 fail-open。** 用「锁全部 + 精确白名单」，不是「逐个路由加守卫」。后者每加一个新 API 都可能忘记加守卫而漏数据。

2. **user 401 和「二级密码门」401 必须能区分。** 如果 admin/settings 还有独立密码门（也返 401），前端不能把它误判成「登录过期」而清 token。解法：user 门禁的 401 额外带 `X-Login-Required: 1` header，前端只对带该 header 的 401 清 token 跳登录。

3. **前端必须收口到一个出口。** 漏掉任何一个裸 `fetch('/api/...')`，在飞书内嵌（cookie 丢）环境下那个请求就会 401。逐文件 grep `fetch(` 确认无遗漏。

4. **生产静态资源白名单是 dev 看不到的雷。** 后端 serve 静态时若有 `isPublicAssetPath` 白名单，登录页用到的图片目录（如 `/mascots/`）必须放行，否则生产破图 404。**dev 用 vite 直接 serve public/，绕过这个白名单，所以 dev 一切正常、生产才暴露**——这类改动必须用「build 前端 + 后端 serve 静态」的生产形态验收，不能只看 vite dev。

5. **第一个用户的 bootstrap。** 若 vendor/管理账号的创建接口本身也 gated，会死锁（没账号无法登录 → 无法创建账号）。生产靠飞书 OAuth 作 bootstrap（员工首次登录无需预建）；本地验收靠直接走 store 层 seed（临时程序，验收后删）。

6. **JWT 无法服务端吊销 → 即时吊销靠每请求查 status。** 自包含 token 在过期前一直有效。停用/离职要即时生效，必须 `CurrentUser` 每次查 `users.status`。`logout` 只清 cookie；前端 `localStorage` 里的 token 也要清，否则 `X-Session-Token` 兜底会让「已登出」用户继续登录态。

## 端到端验收（真实浏览器，生产形态）

1. 未登录访问 → 登录页（含左侧插画，验证静态白名单）。
2. 登录 → 进站 + 业务数据加载（证明业务 API 带 token 过门禁）。
3. 清 cookie + 设无效 token + reload → 跳回登录页。
4. logout → 204 → `/api/me` 401。
5. curl 直接打 `/api/articles` 未登录 → 401 + `X-Login-Required: 1`。
