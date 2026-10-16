> ⚠️ **v4（2026-07-06）默认单应用统一登录**：只用 fbif tenant（一组凭证、2 条白名单、单按钮「使用飞书登录」，富的靠关联组织共享）。本文/模板保留的双 App（fude）能力仅供维护 legacy 存量项目，见 SKILL.md「v4 路线定调」与 references/scenarios/dual-app-legacy.md。

# 场景 B：扫码登录（确需扫码的项目单独加）

> v6 起登录页**默认没有扫码入口**（后端 `qr-config` / `qr-callback` 路由保留）。确需扫码的项目照下面「加扫码入口」自己加，且不得设为默认视图；[FBIF | 富的] Tab 只在 legacy 双 App 项目里有。本文档同时作为扫码的 troubleshooting 参考。

## 加扫码入口（确需扫码的项目）

登录页是 `FeishuSignInPage`（`src/lib/feishuSignIn.tsx`，Su Design 的 `SignInCard`）。扫码入口加在 `SignInCard` 的 children 里，不改 `SignInCard`，不写任何色值、尺寸、圆角、阴影：

- 默认视图不变：只有「使用飞书登录」按钮。它下面加一个 Su Design `Button`（`variant="ghost"`，文案「飞书扫码登录」）切到扫码视图；扫码视图里一个 `Button`（`variant="ghost"`，文案「返回」）切回来。两个视图在同一张卡里换内容，不弹窗、不跳页。
- 二维码区域：只放一个给 QR SDK 挂载的容器（`useRef` + 动态 id），容器只用 Su Design 语义类（如 `grid place-items-center`）。二维码的像素大小是 QR SDK 的 `width` / `height` 入参，不在样式里写。
- 进入扫码视图时拉 `/auth/feishu/fbif/qr-config`（v4 单应用只有 fbif），用返回的 `goto` 初始化 SDK；SDK 脚本加载完再调 `window.QRLogin`；离开扫码视图或组件卸载时清掉容器 innerHTML 和 message 监听。
- （legacy 双 App 项目）扫码视图顶部有 [FBIF | 富的] Tab 切换器，FBIF 默认选中；切 Tab 时重新拉对应企业的 `/auth/feishu/{tenant}/qr-config`，二维码刷新。

扫码后的链路：

- 用户用对应企业的飞书 App 扫码并同意 → SDK postMessage 返回 `tmp_code` → 浏览器跳到 `${goto}&tmp_code=xxx` → 飞书 OAuth 服务再 302 到 `/auth/feishu/{tenant}/qr-callback?code=xxx&state=xxx` → 后端用 v1 token 流程（**用对应企业的 secret**）换 user_access_token → 拿 user info → 设 session → 跳首页

## 关键技术约束（写扫码入口前必读）

### 1. 扫码必须用旧版 v1 OAuth 端点

飞书 QR SDK（`LarkSSOSDKWebQRCode-1.0.3.js`）的官方文档明确写：

> goto: 授权页面地址。**暂不支持新版登录流程，请参考旧版登录流程**

所以扫码模式的 goto 必须是：
```
https://passport.feishu.cn/suite/passport/oauth/authorize?client_id=...&redirect_uri=...&response_type=code&state=...
```

**不要用 `accounts.feishu.cn/.../authorize`**（那是 v2 新版，QR SDK 不认）。

### 2. 扫码 callback 必须用 v1 token 流程

passport.feishu.cn 拿到的 code **不能用 v2 token 接口（`/authen/v2/oauth/token`）兑换**。必须分两步走旧版：

```
Step 1: app_id + app_secret → app_access_token
   POST https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal
   Content-Type: application/json
   Body: {"app_id": "...", "app_secret": "..."}
   Resp: {"app_access_token": "..."}

Step 2: app_access_token + code → user_access_token
   POST https://open.feishu.cn/open-apis/authen/v1/access_token
   Authorization: Bearer {app_access_token}
   Content-Type: application/json
   Body: {"grant_type": "authorization_code", "code": "..."}
   Resp: {"data": {"access_token": "u-...", ...}}
```

模板已实现 `getAppAccessToken()` + `exchangeCodeV1()` 两个函数。

### 3. 必须校验 postMessage origin + data

```ts
const handler = (event: MessageEvent) => {
  if (!QRLoginObj.matchOrigin(event.origin)) return;  // 必须
  if (!QRLoginObj.matchData(event.data)) return;      // 必须
  const tmp_code = (event.data as any).tmp_code;
  if (!tmp_code) return;
  window.location.href = `${goto}&tmp_code=${encodeURIComponent(tmp_code)}`;
};
window.addEventListener('message', handler);
```

加扫码入口时必须写上，**不要省略 matchOrigin / matchData 校验**。

### 4. 4 条 redirect_uri 都要白名单（v3 起每企业 2 条）

**FBIF 飞书后台 → 你的 App → 安全设置 → 重定向 URL：**

| 模式 | redirect_uri |
|---|---|
| 按钮 | `<部署URL>/auth/feishu/fbif/callback` |
| 扫码 | `<部署URL>/auth/feishu/fbif/qr-callback` |

**富的 飞书后台 → App `cli_a975bf6e72b95bc9` → 安全设置 → 重定向 URL：**

| 模式 | redirect_uri |
|---|---|
| 按钮 | `<部署URL>/auth/feishu/fude/callback` |
| 扫码 | `<部署URL>/auth/feishu/fude/qr-callback` |

漏一条对应模式直接挂。**注意 FBIF App 不能用富的的路径，反之亦然**——飞书会校验 redirect_uri 必须在该 App 自己的白名单里。

## 常见问题

### 二维码不显示
- SDK 没加载完就调 `window.QRLogin`：等 SDK 脚本 onload 之后再初始化
- `/auth/feishu/{tenant}/qr-config` 返 500：检查对应企业的环境变量（`FEISHU_FBIF_APP_SECRET` / `FEISHU_FUDE_APP_SECRET`）是否注入
- 容器 div 的 id 跟 QRLogin 入参 id 不一致：用 `useRef` + 动态 id（legacy 双 App 项目含 tenant 隔离）
- 切回按钮视图（legacy 项目切 Tab）后旧 QR 没清：cleanup 里清掉容器 innerHTML 和 message handler

### 扫码后浏览器不跳
- `postMessage` origin 不是 `passport.feishu.cn`：被 matchOrigin 拒了，正常情况
- 用户飞书账号不在「应用可用范围」：飞书自己拦截，给"无权限"页

### 跳到 qr-callback 后报 "state mismatch"
- 用户在多个标签页同时打开扫码 → 后开的标签覆盖了 cookie state，先开的扫码失败
- HTTPS / HTTP 不一致导致 cookie Secure 属性错配
- cookie path 不对：模板里 path 设为 `/auth/feishu`，确保 callback 路径在这个 path 下

### "4401 该应用暂不可用"
- 扫码用的 `<部署URL>/auth/feishu/{tenant}/qr-callback` 没加白名单，或路径有差异
- 只加了 FBIF App 的 2 条，漏了 富的 App 的 2 条（或反之）
- 把 FBIF 的 redirect_uri 加到了 富的 App 后台（白名单分属各 App）
- 用 curl 看 qr-config 返回的 goto，复制 redirect_uri 参数对比对应企业飞书后台白名单字符级一致

### "99991663 app_access_token failed"
- 后端用 FBIF 的 secret 调了富的的 token 接口（或反之）。检查 `_tenant_secret(t)` 选的 secret 跟 `_app_id(t)` 是否对得上
- 富的 secret fallback 已被覆盖且 `FEISHU_FUDE_APP_SECRET` 错了
- secret 被重置过，旧值仍在 .env 里

### tmp_code 拿到了但 callback 报 "v1 token api code=xxxxx"
- code 已经用过一次（5 分钟有效 + 一次性）
- app_access_token 拿不到：检查 app_id / app_secret 是否正确
- 飞书后台「应用可用范围」没把当前用户加进去 → 用户其实没拿到合法 code
