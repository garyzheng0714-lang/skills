# React + Vite 飞书登录前端模板（v8 · Su Design 登录卡）

> ⚠️ v8（2026-10-11 用户裁决）：所有项目的登录页一模一样，不出现项目名，必须能用账号密码登录——飞书按钮 +「或」+ 账号密码表单，`FeishuSignInPage` 不收参数，原样复制、一个字都不改；要改只改这份模板再同步到所有项目。
> v7（2026-09-28 用户裁决）起：所有项目的设计只有一个标准——Su Design 的 DESIGN.md。登录页用 Su Design 的登录卡 `@su/sign-in-card`，保留门+小黄人插画；颜色、圆角、阴影、间距、深浅色全部来自 Su Design 设计变量。模板 = `FeishuSignIn.tsx.template`。v6 Mascot 版（写死色值的双栏卡片）已作废、模板已删除；更早的 v5 卡片版（渐变背景 + 420px 卡片 + 实心蓝按钮 + 扫码角标）已彻底删除，禁止再实现。

## 前提：项目已接入 Su Design

- 看 `components.json` 里有没有 `@su`、有没有装 `@su/theme`。
- 没接：先让用户说「用 su-design」，由 su-design 技能 / MCP 的 `setup_project` 接入（领 Key、配 `@su`、装主题），接好再回来。不要自己装一套 Tailwind 或手写登录页。
- 不是 React + Tailwind v4 的项目：按 DESIGN.md §B 先告诉用户这个项目不在统一技术栈上（第一建议整体迁移），不要把模板翻译成 Vue / Svelte 或别的写法。

## 写在哪

- `FeishuSignIn.tsx.template` → `<project>/src/lib/feishuSignIn.tsx`
- `session.ts.template` → `<project>/src/lib/session.ts`

原样复制，不做占位符替换，一个字都不改。

## 装组件

```bash
npx shadcn@latest add @su/sign-in-card @su/button @su/field @su/input @su/separator @su/avatar --overwrite
```

## 静态资产（必做）

```bash
mkdir -p <project>/public/mascots
cp /Users/simba/.claude/skills/feishu-login-guide/assets/mascots/door-login.webp \
   /Users/simba/.claude/skills/feishu-login-guide/assets/mascots/fbif-logo.png \
   /Users/simba/.claude/skills/feishu-login-guide/assets/mascots/feishu-mark.svg \
   <project>/public/mascots/
```

`index.html` 加 preload（图必须先于 JS 下载）：

```html
<link rel="preload" as="image" href="/mascots/door-login.webp" media="(min-width: 576px)" />
<link rel="preload" as="image" href="/mascots/fbif-logo.png" />
```

插画的 `media` 是 `(min-width: 576px)`：登录卡在可用宽度 ≥ 576 时才出现插画，窄屏不显示就不下载。

## 用法

```tsx
import { FeishuSignInPage } from './lib/feishuSignIn';
import { consumeSessionTokenFromHash } from './lib/session';

// /login 路由
<Route path="/login" element={<FeishuSignInPage />} />

// /auth/callback 路由：消费 #session_token 后跳首页
useEffect(() => { consumeSessionTokenFromHash(); navigate('/', { replace: true }); }, []);

// 受保护路由 + 顶栏
import { RequireAuth, FeishuUserBadge, useCurrentUser } from './lib/feishuSignIn';
```

- 所有项目都带账号密码表单，后端要有 `POST /auth/account/login`（200 / 401 `auth_failed` / 429 `rate_limited`）：路线 A 模板已带；v4 后端按 `references/scenarios/account-password.md` 补上，否则表单点了必失败。
- 登录页**无扫码入口、无游客链接、无教程链接、无问号图标、无项目名或副标题**；确有扫码需求先问用户，同意后改这份模板、所有项目同步，且不得设为默认视图。
- **不在登录页写任何色值、尺寸、圆角、阴影，不改 `SignInCard`，不改项目里的 `feishuSignIn.tsx`**。视觉要改就去 Su Design 改组件，部署后在项目里重新 `npx shadcn@latest add @su/sign-in-card --overwrite`。
