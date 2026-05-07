# 场景 B：扫码登录（二维码 SDK）

> 跟"网页 OAuth 跳转"差别只在前端。后端 token 流程完全一样。

## 适用场景

- PC 端 Web 应用
- 想要更顺滑的体验（不跳走、不打断当前页）
- 用户大概率手机里装了飞书

## 用户体感

1. 用户访问登录页 → 页面里直接渲染一个二维码（不是按钮）
2. 用飞书 App 扫码 → App 里弹出"是否授权"
3. 用户在飞书 App 里点同意 → 浏览器页面自动跳到回调 URL，登录完成

中间没有"跳到飞书 PC 页"那一步。

## 前端怎么嵌（核心差异）

### 1. 引入飞书提供的 JS SDK

```html
<!-- index.html -->
<script src="https://lf-package-cn.feishucdn.com/obj/feishu-static/lark/passport/qrcode/LarkSSOSDKWebQRCode-1.0.3.js"></script>
```

> 版本号会更新，去 https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/authentication-management/login-state-management/web-app/scan-code-login 查最新。

### 2. 在登录页放一个 div 容器，调 SDK 渲染二维码

```typescript
// Login.tsx 片段
useEffect(() => {
  const QRLoginObj = window.QRLogin({
    id: 'qr-container',           // 容器 div 的 id
    goto: buildAuthorizeUrl(),    // 跟"OAuth 跳转"流程的 authorize URL 一模一样
    width: '300',
    height: '300',
    style: 'width: 300px;height: 300px;',
  });

  // 监听 SDK 发送的 postMessage —— 用户扫码 + 同意后，SDK 会把 redirect URL 通过 message 发出来
  const handler = (event: MessageEvent) => {
    if (event.origin !== 'https://passport.feishu.cn') return;
    const tmpCode = event.data.tmp_code;
    if (tmpCode) {
      // 拿 tmp_code 跳到 authorize URL，飞书会自动签发真正的 code
      window.location.href = `${QRLoginObj.matchOrigin}/suite/passport/oauth/authorize?client_id=...&tmp_code=${tmpCode}`;
    }
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}, []);
```

> 注意 SDK 的具体 API 可能版本变化，**写代码前去飞书官方文档对一下当前版本**。

### 3. 后端完全不变

回调还是 `/auth/feishu/callback?code=xxx&state=xxx`，code → token → user_info 流程跟"网页 OAuth 跳转"一字不差。

## 给用户的引导脚本（替换主流程的阶段 5 前端部分）

> 阶段 1-4 完全照走 SKILL.md 主流程。到阶段 5 写前端时，告诉用户：
>
> "你想要扫码体验，前端不是写一个按钮，而是在登录页放一个二维码容器。我读 `templates/frontend/react-vite/FeishuLogin.tsx.template` 给你看 OAuth 跳转版本的代码，然后我们改一下：把 `<button onClick=...>` 换成 `<div id="qr-container">` + 引入 LarkSSOSDKWebQRCode + 调 `window.QRLogin({...})`。"

后续 5 条联调验证里，第 1 条改成"用未登录浏览器访问 → 看到二维码 → 用飞书 App 扫 → 同意 → 浏览器自动跳到回调 URL，进入应用"。

## 常见问题

- **二维码不显示** → SDK 没加载完就调了 `window.QRLogin`。用 `useEffect` 等 SDK 加载完
- **扫码后浏览器不跳** → `postMessage` 监听挂错了，或 origin 校验把消息拒了
- **同时登多个标签页** → 每个标签生成自己的 state；不要全局共享
