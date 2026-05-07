# 场景 C：飞书端内免登（h5sdk）

> 跟前两个场景差别最大：用户在飞书 App 里、连授权页都不跳，飞书把身份直接推给你。

## 适用场景

- 应用要嵌进飞书 App（工作台、机器人卡片打开的 H5）
- 用户体感"零点击登录"
- **仅在飞书 App 里有效**——同样的页面在浏览器打开必须降级到 OAuth 跳转

## 用户体感

1. 用户在飞书 App → 工作台 → 点你应用图标
2. 飞书 webview 打开你的 H5 → 你的前端调 `tt.requestAccess` → 飞书 App 直接给你一个 code（首次会弹一次"是否授权"，之后无感）
3. 前端把 code 发给后端 → 后端走完整 token 流程 → 回 session
4. 用户体感：**点开应用就直接是登录态**

## 接入步骤

### 1. 应用配置

开放平台 → 移动端/桌面端应用 → **网页应用** 区域：

- **桌面端主页**：你的应用 H5 的 URL
- **移动端主页**：同上
- 同时仍要在 **安全设置 → 重定向 URL** 加白名单（虽然端内免登不跳转，但"浏览器降级模式"会用到）

### 2. 前端引入 h5sdk

```html
<script src="https://lf1-cdn-tos.bytegoofy.com/goofy/lark/op/h5-js-sdk-1.5.30.js"></script>
```

> 版本去 https://open.feishu.cn/document/uYjL24iN/uYjMuYjL24iN24iN24iN 查最新。

### 3. 检测环境，分流逻辑

```typescript
// detectFeishuEnv.ts
export function isInFeishu(): boolean {
  const ua = navigator.userAgent.toLowerCase();
  return ua.includes('lark') || ua.includes('feishu');
}

// Login.tsx
useEffect(() => {
  if (!isInFeishu()) {
    // 浏览器：走 OAuth 跳转兜底
    window.location.href = '/auth/feishu/login';
    return;
  }

  // 飞书 App 内：用 h5sdk
  window.h5sdk.ready(() => {
    window.tt.requestAccess({
      appID: '<APP_ID>',
      scopeList: [],     // 空表示用应用默认权限
      success: (res) => {
        const code = res.code;
        // 把 code 发给后端，让后端走 token 流程
        fetch('/auth/feishu/h5-callback', {
          method: 'POST',
          credentials: 'include',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({code}),
        }).then(() => {
          window.location.href = '/';   // 登录成功，进首页
        });
      },
      fail: (err) => {
        console.error('h5sdk auth failed', err);
        // 降级走 OAuth 跳转
        window.location.href = '/auth/feishu/login';
      },
    });
  });
}, []);
```

### 4. 后端加一个 H5 回调路由

跟 OAuth 回调几乎一样，差别只是 code 从 POST body 来、不需要校 state：

```go
// 伪代码
POST /auth/feishu/h5-callback {code}
  → 调 token 接口换 user_access_token (跟 OAuth 流程一字不差)
  → 调 user_info 拿 open_id/name
  → upsert 用户、建 session
  → 返 200（前端自己跳首页）
```

> ⚠️ 没有 state，因为 h5sdk 是飞书 App 内调用，不存在跨站伪造 —— 但**仍然要求只接受同站 ajax**（带 `SameSite=Lax` 的请求才处理）

## 关键差异速查

| 维度 | OAuth 跳转 | h5 端内免登 |
|---|---|---|
| 入口 URL | `/auth/feishu/login`（302 跳走） | 前端 `tt.requestAccess` |
| 拿 code 的方式 | 浏览器 302 重定向带回 | h5sdk 回调 |
| 后端处理 | GET 回调 + state 校验 | POST H5 接口 + 不需要 state |
| 浏览器降级 | 不需要 | **需要**（不在飞书 App 里时跳 `/auth/feishu/login`） |
| token 流程 | 同 | 同 |

## 常见踩坑

- **`tt is not defined`** → h5sdk 没加载完。用 `window.h5sdk.ready(callback)` 等就绪
- **首次进入弹"是否授权"，第二次还弹** → 应用没发布版本（自建应用必须发版才有"记住授权"）
- **`success` 回调里 code 拿到了，但后端换 token 报 20003** → code 已用过。前端不要重复调 `tt.requestAccess`，每个 code 只能后端换一次
- **在浏览器测试 h5 流程报错** → 这是正常的，必须在飞书 App 里打开才能用 h5sdk。给前端加 `isInFeishu()` 分流降级
