# 场景：「仅飞书内登录」（浏览器禁止访问 + 端内零点击免登）

> 应用**只允许在飞书客户端内打开**。普通浏览器访问时不显示登录页，而是显示一张「请在飞书客户端内打开」拦截页，并给一个一键唤起飞书客户端的按钮。在飞书里打开时，零点击自动免登。

适用：内部 HR / 财务 / 审批等敏感系统，明确「就是不让员工在飞书外用浏览器访问」，登录入口收口到飞书工作台。

这是与默认 OAuth 单按钮模式**并列的另一种登录开放模式**，由 Step 2 的 AskUserQuestion 让用户选定。两者不混用：
- **浏览器也可访问**（默认）→ 走 `scenarios/oauth-web.md`（单按钮「使用飞书登录」，FBIF 和富的员工共用）。
- **仅飞书内登录**（本文件）→ 浏览器拦截 + 端内免登 + 沉浸式。

> 真相来源：本模式提炼自生产项目 **Simba HR System** 的 `frontend/js/auth.js` + `backend/internal/auth/auth.go`，下面的流程与后端代码可直接照搬，命名/文案保持一致。界面部分按 v7 改用 Su Design（Simba HR 原版是纯 JS 拼 HTML、写死色值，那部分不照搬）。

---

## 这套模式由三个开关组成（后端 config，默认全开）

| 开关 | 默认 | 含义 |
|---|---|---|
| `feishu_only` | `1` | 仅飞书客户端内打开；浏览器被拦截页挡住，后端也禁用浏览器 OAuth |
| `h5_login` | `1` | 飞书端内零点击免登（JSSDK 拿 code 静默换 session） |
| `immersive` | `1` | 移动端沉浸式（隐藏飞书自带的冗余导航栏） |

三者独立可关：只想拦浏览器不要免登，就 `feishu_only=1` + `h5_login=0`；只想免登不想拦浏览器，那其实就是默认 OAuth + `scenarios/h5-in-feishu.md`，不是本场景。

---

## 核心设计原则（务必照做）

1. **双层拦截，不能只拦前端**。前端拦截页是体验，后端中间件 `feishu_only && 非飞书 UA → 403` 才是真正的安全边界。只做前端拦页 = 改个 UA 或直接打 API 就绕过。
2. **fail-closed（默认阻断）**。前端拉 `/api/auth/h5-config` 失败时，默认按 `feishu_only:'1'` 处理，宁可错拦也不漏放。
3. **拦截页要给出路**。不是冷冰冰一句"请在飞书内打开"，而是带一个 **AppLink 按钮**一键唤起飞书客户端并落回当前页。
4. **dev_mode 是唯一例外**。本地联调时 `dev_mode=1` 跳过所有飞书 UA 校验，但 dev_mode 由**后端权威下发**，前端不能自己声明。

---

## UI 设计

整套「仅飞书内登录」只有两屏 UI，外加一个移动端无形的沉浸式注入。两屏都用 Su Design：外观只来自 `SignInCard` 和设计变量，**不写任何色值、尺寸、圆角、阴影**。

### 屏 A：浏览器拦截页（`feishuOnlyBlockPage`）

非飞书环境唯一能看到的页面。页面 `grid min-h-dvh place-items-center bg-canvas p-inset`，里面一张 `SignInCard`：

- 不给 `art`（拦截页不放插画，单栏）
- `logo`：FBIF logo（`/mascots/fbif-logo.png`，与登录页同一份资产）
- `subtitle`：「请在飞书客户端内打开」
- children：主按钮「在飞书中打开」（Su Design `Button variant="primary" size="lg"`，整宽）→ 点击唤起 AppLink；按钮下一行脚注「若未自动跳转，请从飞书工作台搜索「<应用名>」打开。」（`text-xs text-fg-muted`）

### 屏 B：登录页回退（`simbaLoginPage`）

只在「在飞书里打开但免登失败」或 `feishu_only=0` 时出现。就是默认登录页：直接用 `FeishuSignInPage`（v8 统一登录页：飞书按钮 + 账号密码表单，不收参数）。dev_mode 下在 `SignInCard` 的 children 里多一块「开发快速登录」（Su Design `Select` + `Button`，仅本地）。同样不写色值、尺寸。

### 移动端沉浸式（`applyImmersive`）

无可见 UI，只在飞书移动端注入两条 `lk-config` meta，隐藏飞书自带导航栏。

---

## 前端实现（流程照搬；界面用 React + Su Design）

### 1. 飞书环境检测

```js
function isInFeishu(){
  const ua = navigator.userAgent.toLowerCase();
  return ua.indexOf('lark') >= 0 || ua.indexOf('feishu') >= 0;
}
```

### 2. 主门禁 `ensureLogin`（页面入口第一件事）

```js
export async function ensureLogin(){
  await consumeBootstrap(); // OAuth 回跳带回的一次性 token → 换正式会话（见下）

  // fail-closed：配置拉取失败默认按 feishu_only 处理，避免漏拦
  const cfg = await fetch('/api/auth/h5-config')
    .then(r => r.ok ? r.json() : { feishu_only:'1' })
    .catch(() => ({ feishu_only:'1' }));

  const inFeishu = isInFeishu();
  const devMode  = cfg.dev_mode === '1'; // 后端权威下发，前端不能自封

  // ① 浏览器拦截（仅端内 + 非飞书 + 非 dev）→ 拦截页 + 抛错中断后续看板加载
  if(cfg.feishu_only === '1' && !inFeishu && !devMode){
    feishuOnlyBlockPage(cfg.app_id);
    throw new Error('feishu-only');
  }

  // ② 移动端沉浸式
  if(cfg.immersive === '1' && inFeishu) applyImmersive();

  // ③ 已登录直接放行
  let me = await fetch('/api/auth/me');
  if(me.status !== 401) return;

  // ④ 端内零点击免登
  if(inFeishu && cfg.h5_login === '1' && cfg.app_id && await loadH5SDK()){
    if(await h5Login(cfg.app_id)){ me = await fetch('/api/auth/me'); if(me.status !== 401) return; }
  }

  // ⑤ 兜底登录页（免登失败 / feishu_only=0）
  const admins = devMode ? await fetch('/api/auth/dev-admins').then(r => r.ok ? r.json() : []).catch(() => []) : [];
  simbaLoginPage(devMode, admins);
  throw new Error('unauthenticated');
}
```

### 3. 浏览器拦截页 + AppLink 唤起（React + Su Design）

拦截页用 Su Design 的 `SignInCard` 渲染（组件页 https://su.xzzj.party/components/sign-in-card ，需登录；别的项目里经 MCP `su-design` 的 `read_page('/components/sign-in-card')` 读）。前提同默认登录页：项目已接入 Su Design，已 `npx shadcn@latest add @su/sign-in-card @su/button`，`/mascots/fbif-logo.png` 已拷进 `public/mascots/`。写到 `src/lib/feishuOnlyBlock.tsx`：

```tsx
import { createRoot } from 'react-dom/client';

import { Button } from '@/components/ui/button';
import { SignInCard } from '@/components/ui/sign-in-card';

const APP_NAME = '<应用名>';

function appLink(appId?: string) {
  // 有 appId → web_app（以自建应用形式打开，复用免登 + 沉浸式）；否则降级 web_url（以网页形式打开当前页）。
  // lk_target_url / url 带上当前完整 URL，确保唤起后落回同一页面。
  return appId
    ? 'https://applink.feishu.cn/client/web_app/open?appId=' + encodeURIComponent(appId) + '&mode=window&lk_target_url=' + encodeURIComponent(location.href)
    : 'https://applink.feishu.cn/client/web_url/open?mode=window&url=' + encodeURIComponent(location.href);
}

function FeishuOnlyBlock({ appId }: { appId?: string }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas p-inset">
      <SignInCard
        logo={<img src="/mascots/fbif-logo.png" alt="FBIF" draggable={false} className="h-12 w-auto select-none" />}
        subtitle="请在飞书客户端内打开"
      >
        <Button variant="primary" size="lg" className="w-full" onClick={() => { location.href = appLink(appId); }}>
          在飞书中打开
        </Button>
        <p className="text-center text-xs text-fg-muted">若未自动跳转，请从飞书工作台搜索「{APP_NAME}」打开。</p>
      </SignInCard>
    </main>
  );
}

// ensureLogin 原样调用：把拦截页渲染进应用根节点；ensureLogin 随后抛错，<App /> 不再渲染
export function feishuOnlyBlockPage(appId?: string) {
  createRoot(document.getElementById('root')!).render(<FeishuOnlyBlock appId={appId} />);
}
```

> `ensureLogin` 放在 `main.tsx` 里、`createRoot(...).render(<App />)` 之前调用（原文就是「页面入口第一件事」），这样拦截页和 `<App />` 不会抢同一个根节点。

### 4. 加载飞书 JSSDK + 端内免登

```js
function loadH5SDK(){
  return new Promise(res => {
    if(window.h5sdk) return res(true);
    const s = document.createElement('script');
    s.src = 'https://lf1-cdn-tos.bytegoofy.com/goofy/lark/op/h5-js-sdk-1.5.30.js';
    s.onload = () => res(true); s.onerror = () => res(false); document.head.appendChild(s);
  });
}

// requestAccess(新) → requestAuthCode(旧) → POST /api/auth/h5-callback
function h5Login(appID){
  return new Promise(resolve => {
    function send(code){
      fetch('/api/auth/h5-callback', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ code }) })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if(d && d.session_token){ try{ localStorage.setItem('<app>_session_token', d.session_token) }catch(e){} } resolve(!!(d && d.ok)); })
        .catch(() => resolve(false));
    }
    function authCode(){ if(window.tt && window.tt.requestAuthCode){ window.tt.requestAuthCode({ appId: appID, success: r => send(r.code), fail: () => resolve(false) }) } else resolve(false); }
    try{
      window.h5sdk.ready(() => {
        if(window.tt && window.tt.requestAccess){
          window.tt.requestAccess({ appID: appID, scopeList: [],
            success: r => send(r.code),
            fail: err => { if(err && err.errno === 103){ authCode() } else { resolve(false) } } });
        } else { authCode(); }
      });
    }catch(e){ resolve(false); }
  });
}
```

> `requestAccess` 的 `errno === 103` 表示当前客户端不支持新 API，降级到旧的 `requestAuthCode`。

### 5. 移动端沉浸式注入

```js
function applyImmersive(){
  [['showNavBar','false'], ['showBottomNavBar','false']].forEach(([n,c]) => {
    if(document.querySelector('meta[name="' + n + '"]')) return;
    const m = document.createElement('meta'); m.setAttribute('name', n); m.setAttribute('content', c); m.setAttribute('lk-config', ''); document.head.appendChild(m);
  });
}
```

> meta 必须在 h5sdk 之前注入才生效，所以 `applyImmersive()` 在 `ensureLogin` 里排在加载 SDK 之前。详见 `references/official-docs/web-meta/`。

---

## 后端实现（Go，可直接照搬）

### 1. 服务端 UA 边界（最关键，不能省）

```go
// 中间件 RequireAuth 第一道：feishu_only 时，非飞书 UA（普通浏览器/curl）即便持有合法会话也拒绝。
// 这才让「浏览器打开就用不了」成为服务端边界，而不只是前端拦页。开发模式例外。
if !a.devMode && a.st.GetConfigVal("feishu_only") == "1" && !isFeishuUA(r) {
    writeErr(w, 403, "该应用仅支持在飞书客户端内打开")
    return
}

func isFeishuUA(r *http.Request) bool {
    ua := strings.ToLower(r.Header.Get("User-Agent"))
    return strings.Contains(ua, "lark") || strings.Contains(ua, "feishu")
}
```

### 2. 禁用浏览器 OAuth

```go
// Login（浏览器 OAuth 入口）：feishu_only 时直接拒绝——端内只走 h5-callback 免登，浏览器没有合法入口。
if !a.devMode && a.st.GetConfig()["feishu_only"] == "1" {
    writeErr(w, 403, "该应用仅支持在飞书客户端内打开")
    return
}
```

### 3. 端内免登回调 `POST /api/auth/h5-callback`

接收 `{ code }` → 换 `user_access_token`（`/authen/v1/oidc/access_token`）→ 取 `user_info` → 建 session。与浏览器 OAuth callback 的唯一区别：**端内调用不存在跨站伪造，不校验 state**，其余 token 交换、用户匹配、session 建立完全一致。详见 `scenarios/h5-in-feishu.md`。

### 4. 配置下发 `GET /api/auth/h5-config`（白名单字段）

```go
out := map[string]string{
    "app_id":      a.appID,         // 非机密，前端唤起 AppLink / JSSDK 用
    "feishu_only": cfg["feishu_only"],
    "h5_login":    cfg["h5_login"],
    "immersive":   cfg["immersive"],
}
if a.devMode { out["dev_mode"] = "1" } // dev_mode 由后端权威下发
```

> **只下发白名单字段**，不要把整个 config map 透出——避免以后往 config 里塞了敏感项被一起泄露。

---

## 自检清单（仅飞书内登录模式）

- [ ] 后端中间件有 `feishu_only && 非飞书 UA → 403`（不是只靠前端拦页）
- [ ] 浏览器 OAuth `Login` 入口在 feishu_only 时返回 403
- [ ] 前端 `/api/auth/h5-config` 拉取失败时 fail-closed（默认 feishu_only:'1'）
- [ ] 拦截页有 AppLink「在飞书中打开」按钮，且 `lk_target_url` 带当前 URL
- [ ] 拦截页和回退登录页都用 `SignInCard` + Su Design `Button`，代码里没有写死的色值、尺寸
- [ ] 端内 `requestAccess` 失败（errno 103）能降级 `requestAuthCode`
- [ ] 沉浸式 meta 在加载 h5sdk 之前注入
- [ ] dev_mode 由后端下发，前端不自封；本地联调可绕过 UA 校验
- [ ] 用**普通浏览器**直接访问 → 看到拦截页；直接 `curl /api/<受保护接口>` → 403
- [ ] 在**飞书客户端**内打开 → 零点击进入，不出现登录按钮

---

## 与其他文档的关系

- `scenarios/h5-in-feishu.md`：端内免登的 token 交换细节（本场景复用它的后端回调）。
- `scenarios/oauth-web.md`：另一种开放模式（浏览器单按钮 OAuth），与本场景互斥。
- `official-docs/web-meta/`：沉浸式 / 隐藏导航栏等移动端容器行为的官方依据。
- `official-docs/config/redirect-urls.md` + `official-docs/guide/`：AppLink、端内免登的官方说明。
