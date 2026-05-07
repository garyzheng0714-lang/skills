# React + Vite 飞书登录前端模板

## 写在哪

`src/lib/feishuLogin.tsx`

## 用法

### 登录页

```tsx
import { FeishuLoginButton } from './lib/feishuLogin';

export function LoginPage() {
  return (
    <div>
      <h1>登录</h1>
      <FeishuLoginButton />
    </div>
  );
}
```

### 受保护路由

```tsx
import { RequireAuth } from './lib/feishuLogin';

<RequireAuth>
  <Dashboard />
</RequireAuth>
```

### 顶栏显示当前用户

```tsx
import { useCurrentUser } from './lib/feishuLogin';

function Header() {
  const user = useCurrentUser();
  if (!user) return <a href="/auth/feishu/login">登录</a>;
  return <span>欢迎，{user.name}</span>;
}
```

## 后端约定

模板假设后端实现了一个 `/api/me`，返回 JSON：

```json
{ "name": "张三", "email": "...", "avatar_url": "..." }
```

未登录时返 `401`。这个端点不在 SKILL.md 主流程的 5 个阶段里——你需要在阶段 4 写后端时顺手加上：

```go
// 伪代码
GET /api/me  →  从 session cookie 拿 localUserID → 查库 → 返 user JSON
```

## 跨域 / cookie 注意

如果前端和后端是**同源**部署（生产推荐），`fetch` 用 `credentials: 'include'` 即可（模板已包含）。

如果前后端**跨域**：
1. 后端要设 `Access-Control-Allow-Origin: <前端域名>` + `Access-Control-Allow-Credentials: true`
2. cookie 要 `SameSite=None; Secure`
3. 仅生产 https 能用（http 跨域 cookie 不带）

> 强烈建议生产用同源——把前端构建产物挂在后端的某个路径下，省所有跨域麻烦。
