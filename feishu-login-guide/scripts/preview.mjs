#!/usr/bin/env node
// 统一登录页本地预览：node scripts/preview.mjs [端口，默认 5390]
//
// 把本 skill 的登录页模板原件（FeishuSignIn.tsx.template + session.ts.template + mascots 资产）原样拷进
// Su-Design/scratchpad/unified-login/（已被 Su 仓库 .gitignore 忽略），用 Su 仓库里最新的组件源码起一个 Vite 开发服务。
// 改模板前后都用它看效果：看到的就是所有项目会拿到的那一页。
//
// 自带一个模拟后端，两条登录路都能真点通（只在本机预览里存在，不是任何项目的后端）：
//   POST /auth/account/login   账号 demo / 密码 demo1234 → 成功；其它 → 401；同一账号连错 5 次 → 429
//   GET  /auth/feishu/fbif/login 等 0.9 秒（模拟跳飞书）后直接算登录成功，回到 next 或首页
//   GET  /api/me、POST /auth/feishu/logout
// 出错状态直接开 /login?error=denied | unauthorized_tenant | disabled | expired。

import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL = dirname(dirname(fileURLToPath(import.meta.url)));
const SU = process.env.SU_DESIGN_DIR ?? '/Users/simba/Agentic-Engineering/Su-Design';
const port = Number(process.argv[2] ?? 5390);
const dir = join(SU, 'scratchpad', 'unified-login');

if (!existsSync(join(SU, 'registry/default/ui/sign-in-card.tsx'))) {
  console.error(`找不到 Su Design 仓库：${SU}（可用 SU_DESIGN_DIR 指定）`);
  process.exit(1);
}

mkdirSync(join(dir, 'src/lib'), { recursive: true });
mkdirSync(join(dir, 'public/mascots'), { recursive: true });
const tpl = join(SKILL, 'templates/frontend/react-vite');
copyFileSync(join(tpl, 'FeishuSignIn.tsx.template'), join(dir, 'src/lib/feishuSignIn.tsx'));
copyFileSync(join(tpl, 'session.ts.template'), join(dir, 'src/lib/session.ts'));
for (const f of ['door-login.webp', 'fbif-logo.png', 'feishu-mark.svg']) {
  copyFileSync(join(SKILL, 'assets/mascots', f), join(dir, 'public/mascots', f));
}

writeFileSync(join(dir, 'index.html'), `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>登录</title>
    <link rel="preload" as="image" href="/mascots/door-login.webp" media="(min-width: 576px)" />
    <link rel="preload" as="image" href="/mascots/fbif-logo.png" />
    <script>
      try {
        const t = localStorage.getItem("ds-theme")
        const dark = t === "dark" || (t !== "light" && matchMedia("(prefers-color-scheme: dark)").matches)
        document.documentElement.dataset.theme = dark ? "dark" : "light"
      } catch {}
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`);

writeFileSync(join(dir, 'src/app.css'), `@import "tailwindcss";
@import "tw-animate-css";
@import "../../../registry/default/styles/ds-theme.css";
@source "../../../registry/default/ui";
@source "./";

html,
body {
  background: var(--ds-canvas);
  color: var(--ds-fg);
}
`);

writeFileSync(join(dir, 'src/main.tsx'), `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';

import '@/src/site/fonts';
import './app.css';
import { SPRINGS } from '@/registry/default/ui/ease';
import { FeishuSignInPage, FeishuUserBadge, RequireAuth, useCurrentUser } from './lib/feishuSignIn';
import { consumeSessionTokenFromHash } from './lib/session';

function Home() {
  const { user } = useCurrentUser();
  return user ? (
    <main className="grid min-h-dvh place-items-center bg-canvas p-inset">
      <FeishuUserBadge user={user} />
    </main>
  ) : null;
}

const path = location.pathname.replace(/\\/$/, '');
if (path === '/auth/callback') {
  consumeSessionTokenFromHash();
  location.replace('/');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user" transition={SPRINGS.moderate}>
      {path === '/login' ? <FeishuSignInPage /> : <RequireAuth><Home /></RequireAuth>}
    </MotionConfig>
  </StrictMode>,
);
`);

writeFileSync(join(dir, 'vite.config.ts'), `import path from 'path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const SU = ${JSON.stringify(SU)};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sessions = new Map<string, string>();
const fails = new Map<string, number>();

function readBody(req: any): Promise<string> {
  return new Promise((resolve) => {
    let s = '';
    req.on('data', (c: Buffer) => (s += c));
    req.on('end', () => resolve(s));
  });
}
function cookieOf(req: any): string | undefined {
  return /(?:^|;\\s*)preview_session=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];
}
function json(res: any, status: number, body: unknown, cookie?: string) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  if (cookie !== undefined) res.setHeader('Set-Cookie', cookie);
  res.end(JSON.stringify(body));
}
function newSession(name: string) {
  const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
  sessions.set(token, name);
  return token;
}
function safeNext(next: string | null) {
  return next && /^\\/(?![\\/\\\\])/.test(next) && !/^\\/(login|auth)/.test(next) ? next : '/';
}

// 只在本机预览里存在的模拟后端
const mockBackend: Plugin = {
  name: 'unified-login-mock-backend',
  configureServer(server) {
    server.middlewares.use(async (req: any, res: any, next: () => void) => {
      const url = new URL(req.url, 'http://preview');
      if (url.pathname === '/auth/account/login' && req.method === 'POST') {
        await sleep(600);
        let body: any = {};
        try { body = JSON.parse(await readBody(req)); } catch {}
        const user = String(body.username ?? '');
        if ((fails.get(user) ?? 0) >= 5) return json(res, 429, { error: 'rate_limited' });
        if (user !== 'demo' || body.password !== 'demo1234') {
          fails.set(user, (fails.get(user) ?? 0) + 1);
          return json(res, 401, { error: 'auth_failed' });
        }
        fails.delete(user);
        const token = newSession('账号用户 demo');
        return json(res, 200, { session_token: token }, \`preview_session=\${token}; Path=/; HttpOnly; SameSite=Lax\`);
      }
      if (url.pathname === '/auth/feishu/fbif/login') {
        await sleep(900);
        const token = newSession('飞书用户');
        res.statusCode = 302;
        res.setHeader('Set-Cookie', \`preview_session=\${token}; Path=/; HttpOnly; SameSite=Lax\`);
        res.setHeader('Location', safeNext(url.searchParams.get('next')));
        return res.end();
      }
      if (url.pathname === '/api/me') {
        const token = (req.headers['x-session-token'] as string | undefined) ?? cookieOf(req);
        const name = token ? sessions.get(token) : undefined;
        return name ? json(res, 200, { name }) : json(res, 401, { error: 'login_required' });
      }
      if (url.pathname === '/auth/feishu/logout') {
        const token = cookieOf(req);
        if (token) sessions.delete(token);
        return json(res, 200, { ok: true }, 'preview_session=; Path=/; Max-Age=0');
      }
      next();
    });
  },
};

export default defineConfig({
  root: __dirname,
  plugins: [react(), tailwindcss(), mockBackend],
  resolve: {
    alias: [
      { find: /^@\\/components\\/ui\\//, replacement: SU + '/registry/default/ui/' },
      { find: /^@\\//, replacement: SU + '/' },
    ],
  },
  server: { port: ${port}, strictPort: true },
});
`);

console.log(`统一登录页预览：http://localhost:${port}/login`);
console.log(`模拟账号：demo / demo1234（只在本机预览里有效）`);
const vite = spawn(join(SU, 'node_modules/.bin/vite'), ['--config', join(dir, 'vite.config.ts')], { cwd: dir, stdio: 'inherit' });
vite.on('exit', (code) => process.exit(code ?? 0));
