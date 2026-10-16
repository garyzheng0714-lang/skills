#!/usr/bin/env node
// 路线 A 合规测试：起一个假的集成平台，把被测项目指过去，像浏览器一样走登录、核对、名单提醒、退出。
// 用法见 ../README.md「合规测试」。任何语言写的项目都用这一套，上线前跑一遍、结果存档。
import { spawn } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { startFakeIdp } from './fake-idp.mjs';

const { values: args } = parseArgs({
  options: {
    start: { type: 'string' },
    cwd: { type: 'string', default: process.cwd() },
    protected: { type: 'string', default: '/api/me' },
    fresh: { type: 'string' },
    report: { type: 'string' },
  },
});
if (!args.start) {
  console.error('用法：node run.mjs --start "<启动被测项目的命令>" [--protected /api/me,/api/export] [--fresh /api/敏感接口] [--report 结果.json]');
  process.exit(2);
}

const CHECK_INTERVAL_MS = 2000;
const SYNC_SETTLE_MS = 7000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () =>
  new Promise((resolve) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

const idp = await startFakeIdp();
const port = await freePort();
const base = `http://127.0.0.1:${port}`;
const clientA = { id: 'project-a', secret: randomBytes(16).toString('hex'), redirect: `${base}/auth/feishu/fbif/callback` };
const clientB = { id: 'project-b', secret: randomBytes(16).toString('hex'), redirect: 'http://127.0.0.1:1/b/callback' };
idp.addClient(clientA.id, clientA.secret, clientA.redirect);
idp.addClient(clientB.id, clientB.secret, clientB.redirect);

const dataDir = mkdtempSync(join(tmpdir(), 'sso-conformance-'));
// 账号密码（外部供应商、兼职）：账号表由假的集成平台 POST /accounts 给，密码哈希是 hmac-sha256$<盐>$<hex>。
const hashPassword = (password) => {
  const salt = randomBytes(12).toString('base64url');
  return `hmac-sha256$${salt}$${createHmac('sha256', salt).update(password).digest('hex')}`;
};
const vendorPassword = 'Vendor-' + randomBytes(6).toString('hex');
const vendor = (username, name, extra = {}) => ({ username, name, password_hash: hashPassword(vendorPassword), expires_at: null, ...extra });
idp.accountsSystem = new URL(clientA.redirect).origin;
idp.accountList = [
  vendor('vendor-test', '测试供应商'),
  vendor('vendor-lock', '测试供应商二'),
  vendor('vendor-reset', '测试供应商三'),
  vendor('vendor-expiring', '测试供应商四'),
  vendor('vendor-concurrent', '测试供应商五'),
  // 表里的账号名带大小写和空格，也按去空格、小写认
  vendor('  Vendor-Case ', '大小写'),
  // 已到期的照样在表里，项目自己判
  vendor('vendor-expired', '已到期', { expires_at: new Date(Date.now() - 60_000).toISOString() }),
  // 别的格式（这里是明文）一律不认，密码对也不行
  { username: 'vendor-plain', name: '明文', password_hash: vendorPassword, expires_at: null },
];
const accountByName = (name) => idp.accountList.find((a) => a.username === name);
const appEnv = {
  ...process.env,
  PORT: String(port),
  CONFORMANCE_DATA_DIR: dataDir,
  SSO_ISSUER: idp.url,
  SSO_CLIENT_ID: clientA.id,
  SSO_CLIENT_SECRET: clientA.secret,
  SSO_REDIRECT_URL: clientA.redirect,
  SSO_BLOCKLIST_URL: idp.url + '/blocklist',
  SSO_TOKEN_KEY: randomBytes(32).toString('base64'),
  SSO_CHECK_INTERVAL: `${CHECK_INTERVAL_MS / 1000}s`,
  SSO_SYNC_MIN_GAP: '5s',
  SSO_ACCOUNTS_URL: idp.url + '/accounts',
};

let app;
let appLog = '';
async function startApp() {
  app = spawn('sh', ['-c', args.start], { cwd: args.cwd, env: appEnv, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  app.stdout.on('data', (d) => (appLog += d));
  app.stderr.on('data', (d) => (appLog += d));
  let exited = false;
  app.once('exit', () => (exited = true));
  for (let i = 0; i < 240 && !exited; i++) {
    try {
      await fetch(base + '/api/me');
      return;
    } catch {
      await sleep(250);
    }
  }
  throw new Error(exited ? '被测项目启动后退出了' : '被测项目 60 秒内没起来');
}
async function stopApp() {
  if (!app) return;
  const exited = new Promise((r) => app.once('exit', r));
  try {
    process.kill(-app.pid, 'SIGTERM');
  } catch {}
  await Promise.race([exited, sleep(5000)]);
  app = null;
}

class Browser {
  constructor() {
    this.jar = new Map();
  }
  cookieHeader() {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  async request(url, init = {}) {
    const res = await fetch(url, { ...init, redirect: 'manual', headers: { ...(init.headers || {}), Cookie: this.cookieHeader() } });
    for (const sc of res.headers.getSetCookie()) {
      const [pair, ...attrs] = sc.split(';');
      const i = pair.indexOf('=');
      const name = pair.slice(0, i).trim();
      const value = pair.slice(i + 1).trim();
      const gone = attrs.some((a) => /^\s*max-age=\s*(0|-\d+)\s*$/i.test(a)) || value === '';
      if (gone) this.jar.delete(name);
      else this.jar.set(name, value);
    }
    res.setCookies = res.headers.getSetCookie();
    return res;
  }
  get(path) {
    return this.request(path.startsWith('http') ? path : base + path);
  }
  post(path, body, contentType = 'application/json') {
    return this.request(base + path, { method: 'POST', headers: { 'Content-Type': contentType }, body });
  }
  accountLogin(username, password) {
    return this.post('/auth/account/login', JSON.stringify({ username, password }));
  }
  async me() {
    return (await this.get('/api/me')).status;
  }
  async meBody() {
    const res = await this.get('/api/me');
    return res.status === 200 ? res.json() : null;
  }
  clone() {
    const b = new Browser();
    b.jar = new Map(this.jar);
    return b;
  }
}

const users = {
  alice: { sub: 'on_alice00000000000000000000000001', company_code: 'FJY632B9P3E', name: '测试甲', email: 'a@example.com' },
  bob: { sub: 'on_bob0000000000000000000000000002', company_code: 'FJY632B9P3E', name: '测试乙', email: '' },
  carol: { sub: 'on_carol000000000000000000000000003', company_code: 'FMZYRL01RNE', name: '测试丙', email: '' },
  aliceAtFude: { sub: 'on_alice00000000000000000000000001', company_code: 'FMZYRL01RNE', name: '测试甲', email: '' },
};

// 走一遍登录，返回 { authUrl, callbackUrl, final }；stopAt='callback' 时不访问回调
async function login(browser, user, { next = '/after-login', stopAt } = {}) {
  idp.user = user;
  const start = await browser.get('/auth/feishu/fbif/login?next=' + encodeURIComponent(next));
  const authUrl = start.headers.get('location');
  if (start.status !== 302 || !authUrl?.startsWith(idp.url + '/auth')) throw new Error(`登录入口没有跳到集成平台：HTTP ${start.status} ${authUrl}`);
  const back = await fetch(authUrl, { redirect: 'manual' });
  const callbackUrl = back.headers.get('location');
  if (!callbackUrl?.startsWith(clientA.redirect)) throw new Error(`集成平台拒绝了授权请求：HTTP ${back.status} ${await back.text()}`);
  if (stopAt === 'callback') return { authUrl, callbackUrl, startRes: start };
  const final = await browser.get(callbackUrl);
  return { authUrl, callbackUrl, final, startRes: start, location: final.headers.get('location') || '' };
}
const lastFamily = (sub) => [...idp.logins].reverse().find((l) => l.sub === sub && l.clientId === clientA.id)?.family;
const hint = (revision, raw) => new Browser().post('/internal/auth/blocklist-changed', raw ?? JSON.stringify({ revision }));

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ✓ ${name}`);
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
    console.log(`  ✗ ${name}\n      ${e.message}`);
  }
}
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
// 名单同步在后台跑，机器忙时慢一点：最多等 ms 毫秒等条件成立
async function eventually(fn, ms = 8000) {
  for (let i = 0; i < ms / 250; i++) {
    if (await fn()) return true;
    await sleep(250);
  }
  return false;
}

try {
  idp.blocklistStatus = 500;
  await startApp();
  console.log(`被测项目：${args.start}\n`);

  await check('停用名单从没同步成功过：拒绝登录，同步上了才放人', async () => {
    const b = new Browser();
    const { location } = await login(b, users.alice);
    expect(!b.jar.has('__Host-fbif_sid') && location.startsWith('/login?error='), `名单还没拉到就放人了：${location}`);
    idp.blocklistStatus = 200;
    const ok = await eventually(async () => {
      const c = new Browser();
      await login(c, users.alice);
      return (await c.me()) === 200;
    }, 20000);
    expect(ok, '名单恢复后 20 秒内仍登不进来');
  });

  await check('没登录访问受保护接口一律被拒', async () => {
    for (const path of args.protected.split(',').map((s) => s.trim()).filter(Boolean)) {
      const anon = await new Browser().get(path);
      expect([401, 403].includes(anon.status), `${path} 没登录返回 HTTP ${anon.status}`);
      const forged = new Browser();
      forged.jar.set('__Host-fbif_sid', randomBytes(32).toString('base64url'));
      const f = await forged.get(path);
      expect([401, 403].includes(f.status), `${path} 带伪造会话返回 HTTP ${f.status}`);
    }
  });

  const aliceX = new Browser();
  await check('正常登录：授权码 + PKCE + state + nonce，会话只是随机 cookie', async () => {
    const { authUrl, final, location } = await login(aliceX, users.alice);
    const q = new URL(authUrl).searchParams;
    expect(q.get('code_challenge_method') === 'S256' && q.get('code_challenge'), '没有用 PKCE S256');
    expect((q.get('state') || '').length >= 16 && (q.get('nonce') || '').length >= 16, 'state 或 nonce 太短或缺失');
    expect((q.get('scope') || '').split(' ').includes('openid') && q.get('scope').includes('offline_access'), `scope 缺 openid/offline_access：${q.get('scope')}`);
    expect(final.status === 302 && location === '/after-login', `回调后应跳回 next，实际 HTTP ${final.status} ${location}`);
    const sc = final.setCookies.find((c) => c.startsWith('__Host-fbif_sid='));
    expect(sc, '回调没有下发 __Host-fbif_sid 会话 cookie');
    expect(/;\s*HttpOnly/i.test(sc) && /;\s*Secure/i.test(sc) && /;\s*SameSite=Lax/i.test(sc) && /;\s*Path=\//i.test(sc) && !/;\s*Domain=/i.test(sc), `会话 cookie 属性不对：${sc}`);
    const sid = aliceX.jar.get('__Host-fbif_sid');
    expect(sid.length >= 32 && !sid.includes('.'), '会话 cookie 不像随机串（疑似放了令牌或 JWT）');
    const me = await aliceX.get('/api/me');
    const body = await me.json();
    expect(me.status === 200 && body.name === users.alice.name, `/api/me 不对：HTTP ${me.status} ${JSON.stringify(body)}`);
    const text = JSON.stringify(body);
    expect(!/refresh|access_token|id_token/.test(text), '/api/me 泄露了令牌字段');
  });

  await check('登录后只回本站路径', async () => {
    const b = new Browser();
    const { location } = await login(b, users.alice, { next: 'https://evil.example.com/x' });
    expect(location === '/', `next 是外站时应回 /，实际 ${location}`);
    const { location: l2 } = await login(new Browser(), users.alice, { next: '//evil.example.com' });
    expect(l2 === '/', `next 是 //外站 时应回 /，实际 ${l2}`);
    const { final: f3, location: l3 } = await login(new Browser(), users.alice, { next: '/a\r\nSet-Cookie: x=1' });
    expect(f3.status === 302 && l3 === '/', `next 带换行时应回 /，实际 HTTP ${f3.status} ${l3}`);
  });

  await check('回调链接换个浏览器打开登不进去（state 绑定浏览器）', async () => {
    const { callbackUrl } = await login(new Browser(), users.alice, { stopAt: 'callback' });
    const other = new Browser();
    const res = await other.get(callbackUrl);
    expect(!other.jar.has('__Host-fbif_sid'), '另一个浏览器拿到了会话');
    expect(res.status === 302 && /error=/.test(res.headers.get('location') || ''), `应跳到登录页带错误，实际 HTTP ${res.status} ${res.headers.get('location')}`);
    expect((await other.me()) === 401, '另一个浏览器 /api/me 不是 401');
  });

  await check('state 被改过就拒绝', async () => {
    const b = new Browser();
    const { callbackUrl } = await login(b, users.alice, { stopAt: 'callback' });
    const u = new URL(callbackUrl);
    u.searchParams.set('state', u.searchParams.get('state').slice(0, -2) + 'xx');
    await b.get(u.toString());
    expect(!b.jar.has('__Host-fbif_sid'), 'state 被改后仍然登录成功');
  });

  for (const [mode, label] of [
    ['bad_iss', '签发方不对'],
    ['bad_aud', '受众不是本项目'],
    ['bad_sig', '签名不对'],
    ['hs256', '用 HS256 签名'],
    ['bad_nonce', 'nonce 对不上'],
    ['expired', '已过期'],
  ]) {
    await check(`id_token ${label}：拒绝登录`, async () => {
      const b = new Browser();
      idp.tamper = mode;
      const { location } = await login(b, users.alice);
      expect(!b.jar.has('__Host-fbif_sid') && (await b.me()) === 401, `id_token ${label}仍然登录成功`);
      expect(/^\/login\?error=/.test(location), `应跳 /login?error=…，实际 ${location}`);
    });
  }

  await check('不是 FBIF/富的的租户：拒绝登录', async () => {
    for (const mode of ['company', 'no_company']) {
      const b = new Browser();
      idp.tamper = mode;
      const { location } = await login(b, users.alice);
      expect(!b.jar.has('__Host-fbif_sid'), `company_code ${mode} 仍然登录成功`);
      expect(location === '/login?error=unauthorized_tenant', `应跳 /login?error=unauthorized_tenant，实际 ${location}`);
    }
  });

  await check('按 company_code + sub 认人：富的账号无邮箱也能登；同一 sub 换了租户是另一个人', async () => {
    const b = new Browser();
    await login(b, users.carol);
    const carol = await b.meBody();
    expect(carol?.name === users.carol.name, '富的账号登录失败');
    const a1 = await (async () => { const x = new Browser(); await login(x, users.alice); return x.meBody(); })();
    const a2 = await (async () => { const x = new Browser(); await login(x, users.alice); return x.meBody(); })();
    const af = await (async () => { const x = new Browser(); await login(x, users.aliceAtFude); return x.meBody(); })();
    expect(a1?.id && a1.id === a2?.id, `同一个人两次登录，用户 ID 不一样：${a1?.id} / ${a2?.id}`);
    expect(af?.id && af.id !== a1.id, `sub 相同但租户不同，被认成了同一个人：${af?.id}`);
    expect(carol.id !== a1.id, '不同的人被认成了同一个用户');
  });

  for (const [mode, label] of [
    ['userinfo_sub', '用户信息里的 sub 和 id_token 对不上'],
    ['no_refresh', '没给 refresh_token（没勾 offline_access）'],
  ]) {
    await check(`${label}：拒绝登录`, async () => {
      const b = new Browser();
      idp.tamper = mode;
      await login(b, users.alice);
      expect(!b.jar.has('__Host-fbif_sid') && (await b.me()) === 401, `${label}仍然登录成功`);
    });
  }

  await check('换令牌失败不重试（重放会作废令牌）', async () => {
    const b = new Browser();
    idp.failNextTokenExchange = true;
    const { callbackUrl } = await login(b, users.alice);
    const code = new URL(callbackUrl).searchParams.get('code');
    expect(idp.tokenCallsByCode.get(code) === 1, `同一个授权码换了 ${idp.tokenCallsByCode.get(code)} 次`);
    expect(!b.jar.has('__Host-fbif_sid'), '换令牌失败却建了会话');
  });

  await check('用户信息返回 403：最多一个核对周期内下线，并撤销 refresh_token', async () => {
    const b = new Browser();
    await login(b, users.bob);
    const family = lastFamily(users.bob.sub);
    expect((await b.me()) === 200, '登录后 /api/me 不是 200');
    const oldCookie = b.clone();
    idp.denied.add(users.bob.sub);
    await sleep(CHECK_INTERVAL_MS + 500);
    const status = await b.me();
    idp.denied.delete(users.bob.sub);
    expect(status === 401, `被禁止访问后 /api/me 仍是 HTTP ${status}`);
    expect(idp.latestRevoked(family), '没有撤销这个会话最新的 refresh_token');
    expect((await oldCookie.me()) === 401, '移出禁止名单后拿旧 cookie 还能用（应重新登录）');
    await login(b, users.bob);
    expect((await b.me()) === 200, '移出禁止名单后重新登录失败');
  });

  await check('refresh_token 被集成平台拒绝（JSON 400 或纯文本 403）：会话作废', async () => {
    const b = new Browser();
    await login(b, users.bob);
    idp.expireFamily(lastFamily(users.bob.sub));
    await sleep(CHECK_INTERVAL_MS + 500);
    expect((await b.me()) === 401, 'refresh_token 失效（400 invalid_grant）后会话仍然有效');
    const c = new Browser();
    await login(c, users.bob);
    idp.refreshMode = 'text403';
    await sleep(CHECK_INTERVAL_MS + 500);
    const status = await c.me();
    idp.refreshMode = null;
    expect(status === 401, `刷新回纯文本 403 后会话仍是 HTTP ${status}`);
  });

  await check('集成平台故障：普通接口照常用，且不是每个请求都去刷新', async () => {
    const b = new Browser();
    await login(b, users.bob);
    idp.refreshMode = '500';
    await sleep(CHECK_INTERVAL_MS + 500);
    const before = idp.refreshCalls;
    const statuses = [await b.me(), await b.me(), await b.me(), await b.me()];
    const calls = idp.refreshCalls - before;
    idp.refreshMode = null;
    expect(statuses.every((x) => x === 200), `故障宽限期内普通接口没放行：${statuses}`);
    expect(calls <= 1, `故障期间 4 个请求刷新了 ${calls} 次，应退避`);
  });

  if (args.fresh) {
    await check('敏感接口当场核对，不等核对周期', async () => {
      const b = new Browser();
      await login(b, users.bob);
      const okRes = await b.get(args.fresh);
      expect(okRes.status === 200, `正常用户访问敏感接口返回 HTTP ${okRes.status}`);
      idp.denied.add(users.bob.sub);
      const res = await b.get(args.fresh);
      idp.denied.delete(users.bob.sub);
      expect([401, 403].includes(res.status), `被禁止访问后敏感接口返回 HTTP ${res.status}`);
    });
  }

  const bobB = new Browser();
  const carolB = new Browser();
  await check('假提醒：收下返回 202，只多读一次名单，谁都不受影响', async () => {
    await login(bobB, users.bob);
    await login(carolB, users.carol);
    await sleep(SYNC_SETTLE_MS);
    const before = idp.blocklistPulls;
    const res = await hint(987654321);
    expect(res.status === 202, `提醒返回 HTTP ${res.status}，应为 202`);
    await sleep(1500);
    expect(idp.blocklistPulls === before + 1, `假提醒后读名单 ${idp.blocklistPulls - before} 次，应为 1 次`);
    expect((await bobB.me()) === 200 && (await carolB.me()) === 200 && (await aliceX.me()) === 200, '假提醒踢掉了人');
    const junk = await hint(null, 'not json');
    expect(junk.status < 500, `坏请求体返回 HTTP ${junk.status}`);
  });

  await check('名单加人：几秒内踢掉他所有会话、撤销 refresh_token、再登录被拒，别人不受影响', async () => {
    await sleep(SYNC_SETTLE_MS);
    const family = lastFamily(users.bob.sub);
    idp.blocklist = { revision: 10, entries: [{ sub: users.bob.sub, reason: '离职', since: '2026-10-15' }], complete: true };
    expect((await hint(10)).status === 202, '提醒没返回 202');
    expect(await eventually(() => idp.latestRevoked(family)), '名单同步后没有主动撤销被停用者最新的 refresh_token（不能等他下次访问）');
    expect((await bobB.clone().me()) === 401, '停用后会话仍然有效（拿旧 cookie 重放）');
    expect((await aliceX.me()) === 200 && (await carolB.me()) === 200, '误踢了别人');
    const again = new Browser();
    const { location } = await login(again, users.bob);
    expect(!again.jar.has('__Host-fbif_sid') && location === '/login?error=disabled', `停用的人重新登录应跳 /login?error=disabled，实际 ${location}`);
  });

  await check('重复的和更旧的提醒：不去读名单', async () => {
    await sleep(SYNC_SETTLE_MS);
    const before = idp.blocklistPulls;
    await hint(10);
    await hint(5);
    await sleep(SYNC_SETTLE_MS);
    expect(idp.blocklistPulls === before, `重复/旧提醒触发了 ${idp.blocklistPulls - before} 次读名单`);
  });

  await check('revision 为 0：无条件重读', async () => {
    const before = idp.blocklistPulls;
    await hint(0);
    await sleep(1500);
    expect(idp.blocklistPulls === before + 1, `revision 0 读名单 ${idp.blocklistPulls - before} 次，应为 1 次`);
  });

  await check('名单没读全：保留旧名单，停用的人仍然进不来', async () => {
    await sleep(SYNC_SETTLE_MS);
    idp.blocklist = { revision: 20, entries: [], complete: false };
    const before = idp.blocklistPulls;
    await hint(20);
    await sleep(1500);
    expect(idp.blocklistPulls > before, '没有去读名单');
    const b = new Browser();
    const { location } = await login(b, users.bob);
    expect(location === '/login?error=disabled', `按半份名单放人了：${location}`);
  });

  await check('管理员恢复后：本人重新登录即可，旧会话不复活', async () => {
    idp.blocklist = { revision: 30, entries: [], complete: true };
    await sleep(SYNC_SETTLE_MS * 3);
    await hint(30);
    expect((await bobB.me()) === 401, '旧会话复活了（拿旧 cookie 重放）');
    expect(
      await eventually(async () => {
        const b = new Browser();
        await login(b, users.bob);
        return (await b.me()) === 200;
      }),
      '恢复后重新登录失败',
    );
  });

  await check('名单落盘：重启后读不到集成平台也照样拒绝停用的人', async () => {
    await sleep(SYNC_SETTLE_MS);
    idp.blocklist = { revision: 40, entries: [{ sub: users.carol.sub, reason: '手动', since: '2026-10-15' }], complete: true };
    await hint(40);
    expect(await eventually(async () => (await carolB.me()) === 401), '停用后富的账号会话仍然有效');
    idp.blocklistStatus = 500;
    await stopApp();
    await startApp();
    const b = new Browser();
    const { location } = await login(b, users.carol);
    idp.blocklistStatus = 200;
    expect(location === '/login?error=disabled', `重启后停用的人登进来了：${location}`);
  });

  await check('晚到的旧名单（版本号更小）不能盖掉新名单', async () => {
    await sleep(SYNC_SETTLE_MS);
    idp.blocklist = { revision: 35, entries: [], complete: true };
    const before = idp.blocklistPulls;
    await hint(0);
    expect(await eventually(() => idp.blocklistPulls > before), '没有去读名单');
    await sleep(1000);
    const b = new Browser();
    const { location } = await login(b, users.carol);
    idp.blocklist = { revision: 40, entries: [{ sub: users.carol.sub, reason: '手动', since: '2026-10-15' }], complete: true };
    expect(location === '/login?error=disabled', `旧名单盖掉了新名单，停用的人登进来了：${location}`);
  });

  await check('退出只退这个项目这个浏览器：同一人的其他浏览器、其他项目都不受影响', async () => {
    const x = new Browser();
    const y = new Browser();
    await login(x, users.alice);
    const famX = lastFamily(users.alice.sub);
    await login(y, users.alice);
    const famY = lastFamily(users.alice.sub);
    const otherProjectRT = await idp.loginAsOtherProject(clientB.id, clientB.secret, clientB.redirect);
    const oldCookie = x.clone();
    const out = await x.post('/auth/feishu/logout', '{}');
    expect(out.status < 400, `退出返回 HTTP ${out.status}`);
    expect((await oldCookie.me()) === 401, '退出后拿旧 cookie 重放仍能用（服务端没作废会话）');
    expect((await y.me()) === 200, '同一个人在另一个浏览器的会话被一起退出了');
    expect(idp.latestRevoked(famX), '退出没有撤销本会话最新的 refresh_token');
    expect(!idp.latestRevoked(famY), '退出撤销了另一个浏览器的 refresh_token');
    const b = await idp.tokenRequest(clientB.id, clientB.secret, { grant_type: 'refresh_token', refresh_token: otherProjectRT });
    expect(b.status === 200, 'B 项目的 refresh_token 被一起作废了');
  });

  await check('退出不接受 GET（防止被链接触发）', async () => {
    const x = new Browser();
    await login(x, users.alice);
    await x.get('/auth/feishu/logout');
    expect((await x.me()) === 200, 'GET 退出生效了');
  });

  await check('账号密码登录：对了发会话 cookie，错了一律 401 且不说错在哪', async () => {
    const b = new Browser();
    const res = await b.accountLogin('vendor-test', vendorPassword);
    expect(res.status === 200, `账号密码对了却返回 HTTP ${res.status}`);
    const sc = res.setCookies.find((c) => c.startsWith('__Host-fbif_sid='));
    expect(sc && /httponly/i.test(sc) && /secure/i.test(sc) && /path=\//i.test(sc), `账号登录没有下发 HttpOnly + Secure 的会话 cookie：${sc}`);
    const me = await b.meBody();
    expect(me?.company_code === 'account' && me?.name === '测试供应商', `账号登录后 /api/me 不对：${JSON.stringify(me)}`);
    for (const p of args.protected.split(',').filter(Boolean)) {
      const r = await b.get(p);
      expect(r.status === 200, `账号登录后 ${p} 返回 HTTP ${r.status}`);
    }
    expect((await new Browser().accountLogin('VENDOR-TEST', vendorPassword)).status === 200, '账号名大小写不同就登不上');
    expect((await new Browser().accountLogin('vendor-case', vendorPassword)).status === 200, '账号表里写成「  Vendor-Case 」的账号用 vendor-case 登不上');
    const wrong = await new Browser().accountLogin('vendor-test', vendorPassword + 'x');
    const unknown = await new Browser().accountLogin('nobody-here', vendorPassword);
    const plain = await new Browser().accountLogin('vendor-plain', vendorPassword);
    expect(wrong.status === 401 && unknown.status === 401, `密码错/没这个账号应 401，实际 ${wrong.status}/${unknown.status}`);
    const [wb, ub] = [await wrong.text(), await unknown.text()];
    expect(wb === ub, `密码错和没这个账号回的不一样，能探出哪些账号存在：${wb} / ${ub}`);
    expect(plain.status === 401, `账号表里存的是明文密码也放行了：HTTP ${plain.status}`);
    expect(!wrong.setCookies.some((c) => c.startsWith('__Host-fbif_sid=') && !/max-age=0/i.test(c)), '密码错也下发了会话 cookie');
  });

  await check('拉账号表时带上本项目的源（system = 登录回调地址的 scheme://host:port），只发 JSON', async () => {
    const reqs = idp.accountsRequests;
    expect(reqs.length > 0, '账号登录没有去拉账号表（SSO_ACCOUNTS_URL）');
    const bad = reqs.find((r) => r.system !== idp.accountsSystem || !r.contentType.startsWith('application/json'));
    expect(!bad, `拉账号表的请求不对：Content-Type ${bad?.contentType}，system ${JSON.stringify(bad?.system)}，应为 ${JSON.stringify(idp.accountsSystem)}`);
  });

  await check('同一账号连错 5 次锁住：密码对了也进不去，别的账号不受影响', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await new Browser().accountLogin('vendor-lock', 'wrong-' + i);
      expect(r.status === 401, `第 ${i + 1} 次密码错返回 HTTP ${r.status}`);
    }
    const locked = await new Browser().accountLogin('vendor-lock', vendorPassword);
    expect(locked.status === 429, `连错 5 次后密码对了返回 HTTP ${locked.status}，应 429`);
    const other = await new Browser().accountLogin('vendor-test', vendorPassword);
    expect(other.status === 200, `别的账号被一起锁了：HTTP ${other.status}`);
  });

  await check('账号密码登录只收 JSON（跨站表单发不过来）', async () => {
    for (const type of ['application/x-www-form-urlencoded', 'text/plain', 'multipart/form-data; boundary=x']) {
      const b = new Browser();
      const body = type.startsWith('application/x') ? `username=vendor-test&password=${encodeURIComponent(vendorPassword)}` : JSON.stringify({ username: 'vendor-test', password: vendorPassword });
      const r = await b.post('/auth/account/login', body, type);
      expect(r.status >= 400 && (await b.me()) === 401, `${type} 也登进来了：HTTP ${r.status}`);
    }
    const g = new Browser();
    await g.get('/auth/account/login?username=vendor-test&password=' + encodeURIComponent(vendorPassword));
    expect((await g.me()) === 401, 'GET 带账号密码也登进来了');
  });

  await check('账号会话不找集成平台核对；停用（从账号表里去掉）最多一个核对周期内下线、再登录被拒', async () => {
    const b = new Browser();
    expect((await b.accountLogin('vendor-test', vendorPassword)).status === 200, '账号登录失败');
    const before = idp.refreshCalls + idp.userinfoCalls;
    await sleep(CHECK_INTERVAL_MS + 500);
    expect((await b.me()) === 200, '核对周期过了账号会话就失效了');
    expect(idp.refreshCalls + idp.userinfoCalls === before, '账号会话去找集成平台刷新/查用户信息了');
    const saved = idp.accountList;
    idp.accountList = saved.filter((a) => a.username !== 'vendor-test');
    await sleep(CHECK_INTERVAL_MS + 500);
    const after = await b.me();
    const again = await new Browser().accountLogin('vendor-test', vendorPassword);
    idp.accountList = saved;
    expect(after === 401, `账号停用一个核对周期后会话仍是 HTTP ${after}`);
    expect(again.status === 401, `停用的账号还能登录：HTTP ${again.status}`);
  });

  await check('管理员重置密码：登着的会话最多一个核对周期内下线，旧密码登不上，新密码能登', async () => {
    const b = new Browser();
    expect((await b.accountLogin('vendor-reset', vendorPassword)).status === 200, '账号登录失败');
    const newPassword = 'Reset-' + randomBytes(6).toString('hex');
    accountByName('vendor-reset').password_hash = hashPassword(newPassword);
    await sleep(CHECK_INTERVAL_MS + 500);
    const after = await b.me();
    const oldPw = await new Browser().accountLogin('vendor-reset', vendorPassword);
    const fresh = new Browser();
    const newPw = await fresh.accountLogin('vendor-reset', newPassword);
    expect(after === 401, `重置密码一个核对周期后旧会话仍是 HTTP ${after}`);
    expect(oldPw.status === 401, `重置后旧密码还能登录：HTTP ${oldPw.status}`);
    expect(newPw.status === 200 && (await fresh.me()) === 200, `重置后新密码登不上：HTTP ${newPw.status}`);
  });

  await check('账号到期：到期的登不上，登着的会话到期后最多一个核对周期内下线', async () => {
    const expired = await new Browser().accountLogin('vendor-expired', vendorPassword);
    expect(expired.status === 401, `已到期的账号还能登录：HTTP ${expired.status}`);
    const until = Date.now() + 2 * CHECK_INTERVAL_MS + 1000;
    accountByName('vendor-expiring').expires_at = new Date(until).toISOString();
    await sleep(CHECK_INTERVAL_MS + 500);
    const b = new Browser();
    expect((await b.accountLogin('vendor-expiring', vendorPassword)).status === 200, '还没到期的账号登不上');
    await sleep(until - Date.now() + CHECK_INTERVAL_MS + 500);
    const after = await b.me();
    const again = await new Browser().accountLogin('vendor-expiring', vendorPassword);
    expect(after === 401, `账号到期一个核对周期后会话仍是 HTTP ${after}`);
    expect(again.status === 401, `到期后还能登录：HTTP ${again.status}`);
  });

  await check('账号表过了有效期，并发登录只拉一次', async () => {
    await sleep(CHECK_INTERVAL_MS + 500);
    idp.accountsDelayMs = 500;
    const before = idp.accountsPulls;
    const all = await Promise.all(Array.from({ length: 5 }, () => new Browser().accountLogin('vendor-concurrent', vendorPassword)));
    idp.accountsDelayMs = 0;
    const pulls = idp.accountsPulls - before;
    expect(all.every((r) => r.status === 200), `并发登录有失败的：${all.map((r) => r.status)}`);
    expect(pulls === 1, `5 个并发登录拉了 ${pulls} 次账号表，应为 1 次`);
  });

  await check('账号表拉不到（500、坏 JSON、complete 不是 true）：用上一份照常登录', async () => {
    const b = new Browser();
    expect((await b.accountLogin('vendor-test', vendorPassword)).status === 200, '账号登录失败');
    for (const [label, set] of [
      ['HTTP 500', () => (idp.accountsStatus = 500)],
      ['坏 JSON', () => (idp.accountsBody = 'not json')],
      ['complete:false', () => (idp.accountsBody = { complete: false, accounts: [] })],
    ]) {
      set();
      const before = idp.accountsPulls;
      await sleep(CHECK_INTERVAL_MS + 500);
      const r = await new Browser().accountLogin('vendor-test', vendorPassword);
      const me = await b.me();
      const pulled = idp.accountsPulls > before;
      idp.accountsStatus = 200;
      idp.accountsBody = null;
      expect(pulled, `${label}：账号表过了有效期也没去重拉`);
      expect(r.status === 200 && me === 200, `${label}：上一份账号表还在有效期内，登录却返回 HTTP ${r.status}、登着的会话 HTTP ${me}`);
    }
  });

  await check('账号会话：退出后旧 cookie 作废' + (args.fresh ? '，敏感接口只认飞书身份' : ''), async () => {
    const b = new Browser();
    expect((await b.accountLogin('vendor-test', vendorPassword)).status === 200, '账号登录失败');
    if (args.fresh) {
      const r = await b.get(args.fresh);
      expect([401, 403].includes(r.status), `账号密码会话进了敏感接口：HTTP ${r.status}`);
      expect((await b.me()) === 200, '访问敏感接口被拒后普通会话也没了');
    }
    const old = b.clone();
    const out = await b.post('/auth/feishu/logout', '{}');
    expect(out.status < 400, `退出返回 HTTP ${out.status}`);
    expect((await old.me()) === 401, '退出后拿旧 cookie 重放仍能用');
  });
} catch (e) {
  results.push({ name: '测试中断', ok: false, error: e.message });
  console.log(`  ✗ 测试中断：${e.message}`);
} finally {
  await stopApp();
  await idp.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
if (failed.length) console.log('\n被测项目日志（最后 3000 字）：\n' + appLog.slice(-3000));
if (args.report) writeFileSync(args.report, JSON.stringify({ at: new Date().toISOString(), start: args.start, results }, null, 2));
process.exit(failed.length ? 1 : 0);
