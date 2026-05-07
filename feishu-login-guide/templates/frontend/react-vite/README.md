# React + Vite 飞书登录前端模板

## 写在哪

`src/lib/feishuLogin.tsx`

## 部署 FBIF logo（重要！必做）

模板里 `<FbifLogo />` 通过 `<img src="/fbif-logo.webp" />` 加载 logo。要让浏览器能拿到，需要：

```bash
# 把 skill 自带的 logo 拷到项目的 public/ 目录
cp /Users/simba/.claude/skills/feishu-login-guide/assets/fbif-logo.webp <project>/public/fbif-logo.webp
```

Vite/Next.js/Create React App 都默认把 `public/` 内的文件挂在根路径上，所以浏览器请求 `/fbif-logo.webp` 能拿到。

如果项目用的不是 `public/`（如 Astro 用 `public/`，11ty 用 `_site/`），按项目约定放到对应静态资源目录。

## 用法

### A. 整页登录（推荐 — 默认）

```tsx
// src/pages/Login.tsx
import { FeishuLoginPage } from '../lib/feishuLogin';

export default function LoginPage() {
  return <FeishuLoginPage />;
  // 默认文案是 FBIF 项目专用，如要复用：
  // <FeishuLoginPage appName="XXX" subtitle="..." cardSubtitle="..." />
}
```

### B. 受保护路由

```tsx
import { RequireAuth } from '../lib/feishuLogin';

<RequireAuth loginPath="/login">
  <Dashboard />
</RequireAuth>
```

### C. 顶栏当前用户

```tsx
import { FeishuUserBadge, useCurrentUser } from '../lib/feishuLogin';

function Header() {
  const user = useCurrentUser();
  return (
    <nav>
      ...
      {user ? <FeishuUserBadge /> : <a href="/login">登录</a>}
    </nav>
  );
}
```

### D. 按钮（自定义页用）

```tsx
import { FeishuLoginButton } from '../lib/feishuLogin';

<FeishuLoginButton size="lg" />
<FeishuLoginButton size="md" fullWidth />
<FeishuLoginButton label="使用其他飞书账号登录" />
```

## 后端要实现的端点

模板默认请求这几个端点：

| 端点 | 用途 | 后端实现 |
|---|---|---|
| `GET /auth/feishu/login` | 触发登录 | 后端 OAuth 模板已实现 |
| `GET /auth/feishu/callback` | 飞书回调 | 后端 OAuth 模板已实现 |
| `POST /auth/feishu/logout` | 退出 | **你需自己加**（清 session cookie） |
| `GET /api/me` | 当前用户 | **你需自己加**（从 session 拿用户、查库返回） |

后端 `/api/me` 返回 JSON：
```json
{ "name": "张三", "email": "...", "avatar_url": "...", "open_id": "ou_..." }
```

未登录返 401。

## 视觉规范

模板严格遵守 `assets/login-ui-spec.md` 的视觉值。**不要修改：**
- FBIF 蓝 `#145078`
- 按钮高度 44px (md) / 52px (lg)
- 文案"使用 FBIF 登录"
- Logo 尺寸 88px (登录页) / 20px (按钮内)

如果项目设计系统强制冲突，按视觉值保留色/字号，只换实现方式（如 inline → Tailwind class）。

## 验证

启动后浏览器访问登录页：

1. 看到 FBIF logo 顶部居中、蓝黄字标
2. 卡片浅色背景、清爽对比
3. 蓝色按钮"使用 FBIF 登录"含飞书 logo
4. 点按钮 → 跳到飞书授权页
5. 授权后跳回应用、登录态生效
