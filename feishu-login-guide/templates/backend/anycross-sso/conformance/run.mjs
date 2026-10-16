#!/usr/bin/env node
// 路线 A 合规测试：起一个假的集成平台，把被测项目指过去，像浏览器一样走登录、核对、名单提醒、退出。
// 用法见 ../README.md「合规测试」。任何语言写的项目都用这一套，上线前跑一遍、结果存档。
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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
    feature: { type: 'string', multiple: true },
    'feature-route': { type: 'string' },
    'audit-route': { type: 'string' },
    'error-route': { type: 'string' },
  },
});
if (!args.start) {
  console.error('用法：node run.mjs --start "<启动被测项目的命令>" [--protected /api/me,/api/export] [--fresh /api/敏感接口] [--feature 功能key=复选框列名（声明了几个给几个） --feature-route /api/要第一个功能的接口] [--audit-route /api/调了 Audit 的 GET 接口] [--error-route /api/会回 5xx 的 GET 接口] [--report 结果.json]');
  process.exit(2);
}

const CHECK_INTERVAL_MS = 2000;
// 兜底对账的测试间隔；平时按默认（6 小时）跑，只在兜底对账那两条里调短。
const RECONCILE_MS = 3000;
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
const outboxPath = join(dataDir, 'sso-outbox.json');

// 账号密码（外部供应商、兼职）：账号表、日志表是假飞书开放平台里的两张多维表格，列名照真表。
const fsk = idp.feishu;
fsk.appId = 'cli_conformance0001';
fsk.appSecret = randomBytes(16).toString('hex');
const BASE = 'bascnConformance0001';
const ACCT = 'tblConformAcct01';
const LOGT = 'tblConformLog001';
// 项目声明的全部功能；勾选、去掉列这些行为拿第一个测。
const featurePairs = (args.feature ?? []).map((v) => v.split('='));
const [featureKey, featureColumn] = featurePairs[0] ?? [null, null];
const allKeys = featurePairs.map(([k]) => k);
// 总账本「系统」表里本项目那一行（日志「项目」列关联到它）
const PROJECT_REC = 'recConformProj01';
// 日志表总行数上限，测试时调小
const LOG_MAX_ROWS = 3000;
fsk.createTable(BASE, ACCT, [
  ['账号', 1], ['密码', 1], ['备注', 1], ['账号状态', 3, ['启用', '禁用']], ['状态', 3, ['正常', '已禁用', '已锁定', '配置有误']],
  ['状态说明', 1], ['最近登录', 5], ...featurePairs.map(([, col]) => [col, 7]), ['临时勾选', 7],
], 2);
fsk.createTable(BASE, LOGT, [
  ['摘要', 1], ['时间', 5], ['项目', 18], ['类型', 3, ['登录', '退出', '被收回', '请求']], ['结果', 3, ['成功', '失败']], ['原因', 1],
  ['登录方式', 3, ['飞书', '账号密码']], ...['公司', '用户标识', '姓名', '邮箱', '账号', '记录ID', '权限'].map((n) => [n, 1]),
  ['方法', 3, ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']], ['路径', 1], ['状态码', 2], ['耗时毫秒', 2], ['次数', 2],
  ...['IP', 'IP来源', '浏览器', '登录后去哪', '会话'].map((n) => [n, 1]),
]);
// 测试里出现过的密码、令牌、state、cookie 都记下来，最后查它们没进日志、队列文件、健康检查。
const secrets = new Set([fsk.appSecret]);
const pw = (label = 'Pw') => {
  const p = `${label}-${randomBytes(9).toString('base64url')}`;
  secrets.add(p);
  return p;
};
const account = (name, cells = {}) => {
  const row = { 账号: name, 密码: pw(), 账号状态: '启用', 备注: '合规测试', ...cells };
  for (const k of Object.keys(row)) if (row[k] === null) delete row[k];
  return { id: fsk.addRow(ACCT, row), name: name.trim(), password: row.密码 ?? '' };
};
const acct = {
  test: account('Vendor-Test'),
  lock: account('vendor-lock'),
  off: account('vendor-off', { 账号状态: null }),
  disabled: account('vendor-disabled', { 账号状态: '禁用' }),
  unknown: account('vendor-unknown', { 账号状态: '已启用' }),
  nopw: account('vendor-nopw', { 密码: null }),
  dup1: account('vendor-dup'),
  dup2: account('Vendor-Dup'),
  nouser: account('', { 账号: null }),
  spaced: account('  vendor-space '),
  kickOff: account('vendor-kick-off'),
  kickDel: account('vendor-kick-del'),
  kickPw: account('vendor-kick-pw'),
  rename: account('vendor-rename'),
  feature: account('vendor-feature', { [featureColumn ?? '临时勾选']: true }),
  writeback: account('vendor-writeback'),
  down: account('vendor-down'),
  restart: account('vendor-restart'),
  // 兜底对账用：改了表、不发变更提醒
  bgOff: account('vendor-bg-off'),
  bgDel: account('vendor-bg-del'),
  bgPw: account('vendor-bg-pw'),
  bgKeep: account('vendor-bg-keep'),
  bgRestart: account('vendor-bg-restart'),
};
const blankRow = fsk.addRow(ACCT, {});
// 「事件」是测试里拼出来的简写（登录成功、登录失败、退出、被收回、请求），表里是「类型」+「结果」两列。
const eventOf = (f) => (f.类型 === '登录' ? (f.结果 === '成功' ? '登录成功' : '登录失败') : f.类型);
const logRows = () => fsk.rows(LOGT).map((r) => ({ ...r.fields, 事件: eventOf(r.fields), record_id: r.record_id }));
const requestRows = () => logRows().filter((r) => r.类型 === '请求');
const accountsChanged = (recordId) => new Browser().post('/internal/auth/accounts-changed', JSON.stringify({ record_id: recordId }));
const feishuCalls = () => fsk.calls.length;
const waitLog = async (pred, ms = 15000) => {
  let hit = null;
  await eventually(() => (hit = logRows().find(pred) ?? null), ms);
  return hit;
};
const accountWrites = () => fsk.writes.filter((w) => w.table === ACCT && w.kind === 'update').flatMap((w) => w.records);
const healthBodies = [];
const outboxSnapshots = [];
const health = async () => {
  const r = await fetch(base + '/internal/auth/health');
  const text = await r.text();
  healthBodies.push(text);
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {}
  return { status: r.status, body, text };
};

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
  // 一个按浏览器地址栏的链接给，一个按 <app_token>/<table_id> 给，两种写法都要认。
  SSO_ACCOUNTS_TABLE: `https://foodtalks.feishu.cn/base/${BASE}?table=${ACCT}&view=vewConform01`,
  SSO_LOG_TABLE: `${BASE}/${LOGT}`,
  SSO_FEISHU_APP_ID: fsk.appId,
  SSO_FEISHU_APP_SECRET: fsk.appSecret,
  SSO_FEISHU_API: idp.url,
  SSO_OUTBOX_FILE: outboxPath,
  SSO_LOG_PROJECT_RECORD: PROJECT_REC,
  SSO_LOG_MAX_ROWS: String(LOG_MAX_ROWS),
};
secrets.add(appEnv.SSO_TOKEN_KEY).add(clientA.secret);

let app;
let appLog = '';
async function startApp(patch = {}) {
  app = spawn('sh', ['-c', args.start], { cwd: args.cwd, env: { ...appEnv, ...patch }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
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

// 配置写错的项目应启动失败：另起一个，看它 20 秒内是退出了还是听上了端口。
async function startBroken(patch) {
  const p2 = await freePort();
  const env = { ...appEnv, ...patch, PORT: String(p2), CONFORMANCE_DATA_DIR: mkdtempSync(join(tmpdir(), 'sso-broken-')) };
  const child = spawn('sh', ['-c', args.start], { cwd: args.cwd, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  let exited = false;
  child.once('exit', () => (exited = true));
  let listening = false;
  for (let i = 0; i < 80 && !exited && !listening; i++) {
    await sleep(250);
    listening = await fetch(`http://127.0.0.1:${p2}/api/me`).then(() => true, () => false);
  }
  if (!exited) {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {}
  }
  return { exited, listening, log };
}

class Browser {
  constructor() {
    this.jar = new Map();
    this.headers = { 'User-Agent': 'SSO-Conformance/1.0' };
  }
  cookieHeader() {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  async request(url, init = {}) {
    const res = await fetch(url, { ...init, redirect: 'manual', headers: { ...this.headers, ...(init.headers || {}), Cookie: this.cookieHeader() } });
    for (const sc of res.headers.getSetCookie()) {
      const [pair, ...attrs] = sc.split(';');
      const i = pair.indexOf('=');
      const name = pair.slice(0, i).trim();
      const value = pair.slice(i + 1).trim();
      const gone = attrs.some((a) => /^\s*max-age=\s*(0|-\d+)\s*$/i.test(a)) || value === '';
      if (gone) this.jar.delete(name);
      else this.jar.set(name, value);
      if (!gone && name === '__Host-fbif_sid') secrets.add(value);
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
    b.headers = { ...this.headers };
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
  for (const k of ['state', 'nonce', 'code_challenge']) secrets.add(new URL(authUrl).searchParams.get(k));
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

  await check('启动时先对一轮账号表：缺账号、账号前后有空格、缺密码、账号重复、不认识的账号状态、没选、禁用、正常都写对，空行不碰；到下一轮兜底对账之前，没有请求也没有提醒就一次都不调飞书接口', async () => {
    const want = [
      [acct.test, '正常', ''],
      [acct.off, '已禁用', '账号状态没选，选「启用」才能登录'],
      [acct.disabled, '已禁用', ''],
      [acct.unknown, '配置有误', '账号状态的值不认识：已启用'],
      [acct.nopw, '配置有误', '缺密码'],
      [acct.dup1, '配置有误', '账号重复'],
      [acct.dup2, '配置有误', '账号重复'],
      [acct.nouser, '配置有误', '缺账号'],
      [acct.spaced, '配置有误', '账号前后有空格'],
    ];
    const bad = () => want.filter(([a, st, note]) => fsk.row(ACCT, a.id).状态 !== st || (fsk.row(ACCT, a.id).状态说明 ?? '') !== note);
    await eventually(() => bad().length === 0, 15000);
    const wrong = bad().map(([a, st, note]) => `${a.name || '(空账号)'} 应为 ${st}/${note}，实际 ${fsk.row(ACCT, a.id).状态}/${fsk.row(ACCT, a.id).状态说明 ?? ''}`);
    expect(!wrong.length, '启动时没把状态写对：' + wrong.join('；'));
    expect(Object.keys(fsk.row(ACCT, blankRow)).length === 0, `空行被写了：${JSON.stringify(fsk.row(ACCT, blankRow))}`);
    await eventually(async () => (await health()).body?.outbox_pending === 0);
    for (let n = -1, i = 0; n !== feishuCalls() && i < 20; i++) {
      n = feishuCalls();
      await sleep(500);
    }
    const before = feishuCalls();
    await sleep(3 * CHECK_INTERVAL_MS);
    const extra = fsk.calls.slice(before);
    expect(!extra.length, `没有请求也没有提醒的 ${(3 * CHECK_INTERVAL_MS) / 1000} 秒里还调了 ${extra.length} 次飞书接口（兜底对账默认 6 小时一轮，两轮之间不该调）：${extra.slice(0, 3).map((c) => c.method + ' ' + c.path).join('、')}`);
  });

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

  const protectedPaths = args.protected.split(',').map((x) => x.trim()).filter(Boolean);
  const loginOk = async (a, typed = a.name, password = a.password) => {
    const b = new Browser();
    const r = await b.accountLogin(typed, password);
    expect(r.status === 200, `账号 ${typed} 登录失败：HTTP ${r.status}`);
    return b;
  };
  const featureStatus = async (b) => (args['feature-route'] ? (await b.get(args['feature-route'])).status : null);
  const sameList = (a, b) => JSON.stringify([...(a ?? [])].sort()) === JSON.stringify([...b].sort());

  await check('账号密码登录：当场查账号表，对了发会话 cookie；账号不分大小写，密码前后的空白不算', async () => {
    const b = new Browser();
    const res = await b.accountLogin('vendor-test', acct.test.password);
    expect(res.status === 200, `账号密码对了却返回 HTTP ${res.status}`);
    const sc = res.setCookies.find((c) => c.startsWith('__Host-fbif_sid='));
    expect(sc && /httponly/i.test(sc) && /secure/i.test(sc) && /path=\//i.test(sc), `账号登录没有下发 HttpOnly + Secure 的会话 cookie：${sc}`);
    const me = await b.meBody();
    expect(me?.company_code === 'account' && me?.name === 'Vendor-Test', `账号登录后 /api/me 不对（name 应是表里的账号）：${JSON.stringify(me)}`);
    expect(Array.isArray(me.features), `/api/me 没有 features 数组：${JSON.stringify(me)}`);
    for (const p of protectedPaths) {
      const r = await b.get(p);
      expect(r.status === 200, `账号登录后 ${p} 返回 HTTP ${r.status}`);
    }
    const c = new Browser();
    expect((await c.accountLogin('  VENDOR-TEST ', ` ${acct.test.password}\n`)).status === 200, '账号大小写不同、密码前后带空白就登不上');
    expect((await c.meBody())?.id === me.id, '同一行账号两次登录，用户 ID 不一样');
  });

  await check('账号不存在、密码不对、没填密码：一律 401 且回得一样，真实原因只写进登录日志', async () => {
    const wrong = await new Browser().accountLogin('vendor-test', pw('Wrong'));
    const unknown = await new Browser().accountLogin('nobody-here', acct.test.password);
    const empty = await new Browser().accountLogin('vendor-test', '');
    expect([wrong, unknown, empty].every((r) => r.status === 401), `应都是 401，实际 ${wrong.status}/${unknown.status}/${empty.status}`);
    const [wb, ub, eb] = [await wrong.text(), await unknown.text(), await empty.text()];
    expect(wb === ub && ub === eb, `几种失败回的不一样，能探出哪些账号存在：${wb} / ${ub} / ${eb}`);
    expect(!wrong.setCookies.some((c) => c.startsWith('__Host-fbif_sid=') && !/max-age=0/i.test(c)), '密码错也下发了会话 cookie');
    expect(await waitLog((r) => r.事件 === '登录失败' && r.账号 === 'nobody-here' && r.原因 === '账号不存在'), '登录日志里没有「账号不存在」');
    expect(await waitLog((r) => r.事件 === '登录失败' && r.账号 === 'vendor-test' && r.原因 === '密码不对' && r.记录ID === acct.test.id), '登录日志里没有带记录 ID 的「密码不对」');
    await loginOk(acct.test, 'vendor-test');
  });

  await check('账号状态只有一字不差的「启用」能登录：空的、禁用、不认识的值都拒绝，改回启用就能登', async () => {
    for (const [a, reason] of [[acct.off, '账号已停用'], [acct.disabled, '账号已停用'], [acct.unknown, '账号状态的值不认识：已启用']]) {
      const r = await new Browser().accountLogin(a.name, a.password);
      expect(r.status === 401, `账号状态是「${fsk.row(ACCT, a.id).账号状态 ?? ''}」却返回 HTTP ${r.status}`);
      expect(await waitLog((x) => x.事件 === '登录失败' && x.账号 === a.name && x.原因 === reason), `${a.name} 的日志原因应是「${reason}」`);
    }
    fsk.setCell(ACCT, acct.off.id, '账号状态', '启用');
    const r = await new Browser().accountLogin(acct.off.name, acct.off.password);
    fsk.setCell(ACCT, acct.off.id, '账号状态', null);
    await accountsChanged(acct.off.id);
    expect(r.status === 200, `改回启用后登不上：HTTP ${r.status}`);
  });

  await check('账号重复、缺密码：拒绝登录，日志写明原因', async () => {
    const dup = await new Browser().accountLogin('vendor-dup', acct.dup1.password);
    const nopw = await new Browser().accountLogin('vendor-nopw', pw('Any'));
    expect(dup.status === 401 && nopw.status === 401, `账号重复/缺密码应 401，实际 ${dup.status}/${nopw.status}`);
    expect(await waitLog((x) => x.账号 === 'vendor-dup' && x.原因 === '账号重复'), '日志原因应是「账号重复」');
    expect(await waitLog((x) => x.账号 === 'vendor-nopw' && x.原因 === '配置有误：缺密码'), '日志原因应是「配置有误：缺密码」');
  });

  await check('同一账号连错 5 次锁住：密码对了也 429，表里当场写回「已锁定」，别的账号不受影响', async () => {
    const t0 = Date.now();
    for (let i = 0; i < 5; i++) {
      const r = await new Browser().accountLogin('vendor-lock', pw('Wrong'));
      expect(r.status === 401, `第 ${i + 1} 次密码错返回 HTTP ${r.status}`);
    }
    const locked = await new Browser().accountLogin('vendor-lock', acct.lock.password);
    expect(locked.status === 429, `连错 5 次后密码对了返回 HTTP ${locked.status}，应 429`);
    await loginOk(acct.test, 'vendor-test');
    expect(await waitLog((x) => x.账号 === 'vendor-lock' && x.原因 === '已锁定'), '锁住后的尝试没记「已锁定」');
    const row = () => fsk.row(ACCT, acct.lock.id);
    expect(await eventually(() => row().状态 === '已锁定'), `表里状态没写回「已锁定」：${row().状态}`);
    const m = /^连续输错 5 次，(\d\d):(\d\d) 后自动解锁$/.exec(row().状态说明 ?? '');
    expect(m, `状态说明不对：${row().状态说明}`);
    const unlock = new Date(t0 + 15 * 60_000 + 8 * 3600_000);
    const diff = Math.abs(Number(m[1]) * 60 + Number(m[2]) - (unlock.getUTCHours() * 60 + unlock.getUTCMinutes()));
    expect(diff <= 1 || diff >= 1439, `解锁时间 ${m[1]}:${m[2]} 不是第一次输错后 15 分钟（北京时间）`);
  });

  await check('账号密码登录只收 JSON（跨站表单发不过来）', async () => {
    for (const type of ['application/x-www-form-urlencoded', 'text/plain', 'multipart/form-data; boundary=x']) {
      const b = new Browser();
      const body = type.startsWith('application/x') ? `username=vendor-test&password=${encodeURIComponent(acct.test.password)}` : JSON.stringify({ username: 'vendor-test', password: acct.test.password });
      const r = await b.post('/auth/account/login', body, type);
      expect(r.status >= 400 && (await b.me()) === 401, `${type} 也登进来了：HTTP ${r.status}`);
    }
    const g = new Browser();
    await g.get('/auth/account/login?username=vendor-test&password=' + encodeURIComponent(acct.test.password));
    expect((await g.me()) === 401, 'GET 带账号密码也登进来了');
  });

  await check('账号会话不找集成平台核对；表里改成禁用并收到变更提醒：不等核对周期当场下线，日志记「被收回：账号已停用」；提醒不回数据、乱给的 record_id 无害', async () => {
    const b = await loginOk(acct.kickOff);
    const before = idp.refreshCalls + idp.userinfoCalls;
    await sleep(CHECK_INTERVAL_MS + 500);
    expect((await b.me()) === 200, '核对周期过了账号会话就失效了');
    expect(idp.refreshCalls + idp.userinfoCalls === before, '账号会话去找集成平台刷新/查用户信息了');
    // 上一行 /api/me 刚核对过，下一次按周期核对要等 CHECK_INTERVAL：这期间下线只能是提醒触发的。
    const checkedAt = Date.now();
    fsk.setCell(ACCT, acct.kickOff.id, '账号状态', '禁用');
    const hook = await accountsChanged(acct.kickOff.id);
    expect(hook.status === 202 && (await hook.text()) === '', `变更提醒应回 202 且不带数据：HTTP ${hook.status}`);
    let after = 200;
    while (Date.now() - checkedAt < CHECK_INTERVAL_MS - 400 && after !== 401) {
      after = await b.me();
      if (after !== 401) await sleep(100);
    }
    for (const body of [JSON.stringify({ record_id: 'recDoesNotExist01' }), JSON.stringify({ record_id: '../../x' }), 'not json']) {
      const r = await new Browser().post('/internal/auth/accounts-changed', body);
      expect(r.status === 202 && (await r.text()) === '', `乱给的变更提醒应回 202 且不带数据：HTTP ${r.status}`);
    }
    const again = await new Browser().accountLogin(acct.kickOff.name, acct.kickOff.password);
    expect(after === 401, `禁用并提醒后 ${CHECK_INTERVAL_MS - 400}ms 内会话仍是 HTTP ${after}（不应等核对周期）`);
    expect(again.status === 401, `禁用的账号还能登录：HTTP ${again.status}`);
    expect(await waitLog((x) => x.事件 === '被收回' && x.记录ID === acct.kickOff.id && x.原因 === '账号已停用'), '日志里没有「被收回：账号已停用」');
  });

  await check('表里删掉这一行（自动化没有「删除」触发，不提醒）：用户的下一个请求过了核对周期就下线，日志记「被收回：账号已删除」', async () => {
    const b = await loginOk(acct.kickDel);
    fsk.deleteRow(ACCT, acct.kickDel.id);
    await sleep(CHECK_INTERVAL_MS + 500);
    expect((await b.me()) === 401, '删了这一行，登着的会话还在');
    expect(await waitLog((x) => x.事件 === '被收回' && x.记录ID === acct.kickDel.id && x.原因 === '账号已删除'), '日志里没有「被收回：账号已删除」');
  });

  await check('表里改了密码：一个核对周期内下线，旧密码登不上、新密码能登，日志记「被收回：密码已改」', async () => {
    const b = await loginOk(acct.kickPw);
    const newPassword = pw('New');
    fsk.setCell(ACCT, acct.kickPw.id, '密码', newPassword);
    await sleep(CHECK_INTERVAL_MS + 500);
    const after = await b.me();
    const oldPw = await new Browser().accountLogin(acct.kickPw.name, acct.kickPw.password);
    expect(after === 401, `改密码一个核对周期后旧会话仍是 HTTP ${after}`);
    expect(oldPw.status === 401, `改密码后旧密码还能登录：HTTP ${oldPw.status}`);
    const fresh = await loginOk(acct.kickPw, acct.kickPw.name, newPassword);
    expect((await fresh.me()) === 200, '新密码登录后 /api/me 不是 200');
    expect(await waitLog((x) => x.事件 === '被收回' && x.记录ID === acct.kickPw.id && x.原因 === '密码已改'), '日志里没有「被收回：密码已改」');
  });

  await check('改账号名：登着的会话不掉（认的是记录 ID），名字跟着变；旧名登不上、新名能登且是同一个人', async () => {
    const b = await loginOk(acct.rename);
    const before = await b.meBody();
    fsk.setCell(ACCT, acct.rename.id, '账号', 'vendor-renamed');
    await sleep(CHECK_INTERVAL_MS + 500);
    const after = await b.meBody();
    expect(after?.id === before.id, `改账号名后会话掉了或换了人：${JSON.stringify(after)}`);
    expect(after.name === 'vendor-renamed', `改账号名后 /api/me 的名字没跟着变：${after.name}`);
    expect((await new Browser().accountLogin('vendor-rename', acct.rename.password)).status === 401, '旧账号名还能登录');
    const c = await loginOk(acct.rename, 'vendor-renamed');
    expect((await c.meBody())?.id === before.id, '新账号名登进来是另一个用户 ID');
  });

  await check(
    featureKey ? `勾上「${featureColumn}」才有 ${featureKey}：/api/me 带上；取消勾选一个核对周期内去掉；没声明的复选框不起作用` : '没声明的复选框不起作用：/api/me 的 features 为空，健康检查只提醒',
    async () => {
      const b = await loginOk(acct.feature);
      const plain = await loginOk(acct.test, 'vendor-test');
      if (featureKey) {
        expect(sameList((await b.meBody()).features, [featureKey]), `勾了「${featureColumn}」，/api/me 的 features 不是 [${featureKey}]`);
        expect(sameList((await plain.meBody()).features, []), '没勾的人 /api/me 也有功能');
        if (args['feature-route']) {
          expect((await featureStatus(b)) === 200, `勾了的人访问 ${args['feature-route']} 没有放行`);
          expect((await featureStatus(plain)) === 403, `没勾的人访问 ${args['feature-route']} 返回 HTTP ${await featureStatus(plain)}，应 403`);
        }
        fsk.setCell(ACCT, acct.feature.id, featureColumn, false);
        await sleep(CHECK_INTERVAL_MS + 500);
        expect(sameList((await b.meBody())?.features, []), '取消勾选一个核对周期后功能还在');
        if (args['feature-route']) expect((await featureStatus(b)) === 403, '取消勾选后接口还放行');
        fsk.setCell(ACCT, acct.feature.id, featureColumn, true);
        await sleep(CHECK_INTERVAL_MS + 500);
        expect(sameList((await b.meBody())?.features, [featureKey]), '重新勾上一个核对周期后功能没回来');
      } else {
        expect(sameList((await b.meBody()).features, []), '勾了没声明的复选框，/api/me 却有功能');
      }
      const ok = await eventually(async () => {
        const h = await health();
        return h.status === 200 && h.body?.ok === true && h.body.problems.includes('warn_undeclared_checkbox:临时勾选');
      });
      expect(ok, `没声明的复选框应只在健康检查里提醒（warn_undeclared_checkbox:临时勾选，ok 仍为 true）：${(await health()).text}`);
    },
  );

  await check('飞书登录的人有全部功能', async () => {
    const b = new Browser();
    await login(b, users.alice);
    const me = await b.meBody();
    expect(sameList(me?.features, allKeys), `飞书登录的 features 应是 ${JSON.stringify(allKeys)}：${JSON.stringify(me)}`);
    if (args['feature-route']) expect((await featureStatus(b)) === 200, `飞书登录的人访问 ${args['feature-route']} 没有放行`);
  });

  await check('状态写回：正常、已禁用、已锁定、配置有误（缺账号、账号前后有空格、缺密码、账号重复、不认识的账号状态）都写对；空行不碰', async () => {
    const want = [
      [acct.test, '正常', ''],
      [acct.off, '已禁用', null],
      [acct.disabled, '已禁用', null],
      [acct.lock, '已锁定', null],
      [acct.nopw, '配置有误', '缺密码'],
      [acct.dup1, '配置有误', '账号重复'],
      [acct.dup2, '配置有误', '账号重复'],
      [acct.unknown, '配置有误', '账号状态的值不认识：已启用'],
      [acct.nouser, '配置有误', '缺账号'],
      [acct.spaced, '配置有误', '账号前后有空格'],
    ];
    const bad = () => want.filter(([a, st, note]) => {
      const row = fsk.row(ACCT, a.id);
      return row.状态 !== st || (note !== null && (row.状态说明 ?? '') !== note);
    });
    await eventually(() => bad().length === 0, 15000);
    const wrong = bad().map(([a, st, note]) => `${a.name || '(空账号)'} 应为 ${st}/${note ?? '…'}，实际 ${fsk.row(ACCT, a.id).状态}/${fsk.row(ACCT, a.id).状态说明 ?? ''}`);
    expect(!wrong.length, wrong.join('；'));
    expect(Object.keys(fsk.row(ACCT, blankRow)).length === 0, `空行被写了：${JSON.stringify(fsk.row(ACCT, blankRow))}`);
    const last = fsk.row(ACCT, acct.test.id).最近登录;
    expect(typeof last === 'number' && Math.abs(Date.now() - last) < 10 * 60_000, `登录成功后「最近登录」没写成毫秒时间：${last}`);
    expect(fsk.row(ACCT, acct.dup1.id).最近登录 === undefined, '没登录成功过的行也写了「最近登录」');
  });

  await check('写回只碰「状态」「状态说明」「最近登录」三列，最近登录只在登录成功时写', async () => {
    const writes = accountWrites();
    expect(writes.length > 0, '一次写回都没有');
    const allowed = new Set(['状态', '状态说明', '最近登录']);
    const touched = [...new Set(writes.flatMap((r) => Object.keys(r.fields)))].filter((k) => !allowed.has(k));
    expect(!touched.length, `写回碰了人填的列：${touched.join('、')}`);
    const okIds = new Set(logRows().filter((r) => r.事件 === '登录成功' && r.登录方式 === '账号密码').map((r) => r.记录ID));
    const stray = writes.filter((r) => '最近登录' in r.fields && !okIds.has(r.record_id));
    expect(!stray.length, `没登录成功的行写了「最近登录」：${stray.map((r) => r.record_id).join('、')}`);
  });

  await check('写回账号表失败不挡登录：照样 200，健康检查看得到积压，恢复后补写上', async () => {
    fsk.down[ACCT] = 'writes';
    try {
      await loginOk(acct.writeback);
      expect(await eventually(async () => (await health()).body?.outbox_pending > 0), '写回失败时健康检查的 outbox_pending 不涨');
      await sleep(1500);
      expect(fsk.row(ACCT, acct.writeback.id).最近登录 === undefined, '假的写回故障没生效');
    } finally {
      fsk.down[ACCT] = null;
    }
    expect(await eventually(() => typeof fsk.row(ACCT, acct.writeback.id).最近登录 === 'number', 40000), '写回恢复后 40 秒内没补写上');
  });

  await check('表结构不对：健康检查报出来并回 503，恢复后好了' + (featureKey ? `；功能列「${featureColumn}」没了，${featureKey} 对所有人（含飞书登录）关掉` : ''), async () => {
    const f = new Browser();
    await login(f, users.alice);
    const a = await loginOk(acct.feature);
    fsk.removeField(ACCT, '状态说明');
    if (featureKey) fsk.removeField(ACCT, featureColumn);
    const wantCodes = ['accounts_column:状态说明', ...(featureKey ? [`feature_column:${featureKey}`] : [])];
    try {
      // 没有定时巡检：表结构在启动、账号表变更提醒、写不进去的时候查。
      await accountsChanged(acct.feature.id);
      const shown = await eventually(async () => {
        const h = await health();
        return h.status === 503 && h.body?.ok === false && wantCodes.every((c) => h.body.problems.includes(c));
      });
      expect(shown, `健康检查没报出 ${wantCodes.join('、')}：${(await health()).text}`);
      const h = await health();
      expect(![BASE, ACCT, LOGT].some((x) => h.text.includes(x)), '健康检查里带了表 ID');
      if (featureKey) {
        expect(sameList((await f.meBody())?.features, allKeys.slice(1)), '功能列没了，飞书登录的人还有这个功能（或别的功能也没了）');
        await sleep(CHECK_INTERVAL_MS + 500);
        expect(sameList((await a.meBody())?.features, []), '功能列没了，账号登录的人还有这个功能');
        if (args['feature-route']) expect((await featureStatus(f)) === 403, '功能列没了，接口还放行');
      }
    } finally {
      fsk.addField(ACCT, '状态说明', 1);
      if (featureKey) {
        fsk.addField(ACCT, featureColumn, 7);
        fsk.setCell(ACCT, acct.feature.id, featureColumn, true);
      }
    }
    await accountsChanged(acct.feature.id);
    const back = await eventually(async () => {
      const h = await health();
      return h.status === 200 && !h.body.problems.some((p) => wantCodes.includes(p));
    });
    expect(back, `表结构恢复后健康检查没好：${(await health()).text}`);
    if (featureKey) expect(sameList((await f.meBody())?.features, allKeys), '表结构恢复后飞书登录的人功能没回来');
  });

  await check('账号表查不了（报错、超时）：新登录 503，日志记「查表失败」；登着的人宽限期内照常用；恢复后能登', async () => {
    const online = await loginOk(acct.down);
    const statuses = [];
    try {
      fsk.down[ACCT] = 'error';
      statuses.push((await new Browser().accountLogin(acct.down.name, acct.down.password)).status);
      await sleep(CHECK_INTERVAL_MS + 500);
      expect((await online.me()) === 200, '账号表查不了时登着的人被踢了（应有 15 分钟宽限）');
      fsk.down[ACCT] = 'timeout';
      statuses.push((await new Browser().accountLogin(acct.down.name, acct.down.password)).status);
    } finally {
      fsk.down[ACCT] = null;
    }
    expect(statuses.every((x) => x === 503), `账号表报错/超时，新登录应 503，实际 ${statuses.join('/')}`);
    expect(await waitLog((x) => x.事件 === '登录失败' && x.账号 === acct.down.name && x.原因 === '查表失败'), '日志里没有「查表失败」');
    expect(await eventually(async () => (await new Browser().accountLogin(acct.down.name, acct.down.password)).status === 200, 15000), '账号表恢复后登不上');
  });

  await check('登录日志：账号密码、飞书各有登录成功、登录失败、退出、被收回，该填的列都填了', async () => {
    const okBefore = logRows().filter((x) => x.事件 === '登录成功' && x.记录ID === acct.test.id).length;
    const a = await loginOk(acct.test, 'vendor-test');
    await eventually(() => logRows().filter((x) => x.事件 === '登录成功' && x.记录ID === acct.test.id).length > okBefore);
    const tagA = logRows().filter((x) => x.事件 === '登录成功' && x.记录ID === acct.test.id).at(-1)?.会话;
    await a.post('/auth/feishu/logout', '{}');
    const f = new Browser();
    f.headers['X-Forwarded-For'] = '203.0.113.7, 10.0.0.1';
    await login(f, users.alice, { next: '/after-login' });
    await f.post('/auth/feishu/logout', '{}');
    const r = new Browser();
    r.headers['X-Real-IP'] = '198.51.100.9';
    r.headers['X-Forwarded-For'] = '203.0.113.8';
    await r.accountLogin('nobody-real-ip', pw('Wrong'));
    await sleep(1500);
    const rows = logRows();
    const need = (label, pred, cols) => {
      const row = [...rows].reverse().find(pred);
      expect(row, `日志里没有「${label}」`);
      const missing = ['摘要', '时间', '类型', '登录方式', '项目', ...cols].filter((c) => row[c] === undefined || row[c] === '');
      expect(!missing.length, `「${label}」缺这些列：${missing.join('、')}（${JSON.stringify(row)}）`);
      expect(typeof row.时间 === 'number' && Math.abs(Date.now() - row.时间) < 3600_000, `「${label}」的时间不是毫秒数：${row.时间}`);
      return row;
    };
    const ok = need('账号密码 登录成功', (x) => x.事件 === '登录成功' && x.登录方式 === '账号密码' && x.记录ID === acct.test.id, ['公司', '用户标识', '姓名', '账号', '记录ID', 'IP', 'IP来源', '浏览器', '会话']);
    expect(ok.公司 === 'account' && ok.用户标识 === acct.test.id && ok.浏览器 === 'SSO-Conformance/1.0' && /^[0-9a-f]{12}$/.test(ok.会话), `账号登录成功那行不对：${JSON.stringify(ok)}`);
    need('账号密码 登录失败', (x) => x.事件 === '登录失败' && x.登录方式 === '账号密码', ['原因', '账号', 'IP', 'IP来源', '浏览器']);
    const out = need('账号密码 退出', (x) => x.事件 === '退出' && x.登录方式 === '账号密码', ['公司', '用户标识', '姓名', '记录ID', '会话']);
    expect(tagA && rows.some((x) => x.事件 === '退出' && x.会话 === tagA), '退出那行的会话和登录那行对不上');
    expect(out.公司 === 'account', '账号退出那行公司不是 account');
    need('账号密码 被收回', (x) => x.事件 === '被收回' && x.登录方式 === '账号密码', ['原因', '公司', '用户标识', '姓名', '记录ID', '会话']);
    const fo = need('飞书 登录成功', (x) => x.事件 === '登录成功' && x.登录方式 === '飞书' && x.用户标识 === users.alice.sub && x.IP === '203.0.113.7', ['公司', '用户标识', '姓名', '邮箱', 'IP', 'IP来源', '浏览器', '登录后去哪', '会话']);
    expect(fo.公司 === users.alice.company_code && fo.邮箱 === users.alice.email && fo.IP来源 === 'X-Forwarded-For' && fo.登录后去哪 === '/after-login', `飞书登录成功那行不对：${JSON.stringify(fo)}`);
    if (featureKey) expect(sameList((fo.权限 ?? '').split('、'), featurePairs.map(([, col]) => col)), `飞书登录成功那行的权限应是「${featurePairs.map(([, col]) => col).join('、')}」：${fo.权限}`);
    need('飞书 登录失败', (x) => x.事件 === '登录失败' && x.登录方式 === '飞书', ['原因', 'IP', 'IP来源', '浏览器']);
    need('飞书 退出', (x) => x.事件 === '退出' && x.登录方式 === '飞书', ['公司', '用户标识', '姓名', '会话']);
    need('飞书 被收回', (x) => x.事件 === '被收回' && x.登录方式 === '飞书', ['原因', '公司', '用户标识', '会话']);
    const ri = need('X-Real-IP 优先', (x) => x.账号 === 'nobody-real-ip', ['IP', 'IP来源']);
    expect(ri.IP === '198.51.100.9' && ri.IP来源 === 'X-Real-IP', `有 X-Real-IP 时应记它：${ri.IP} / ${ri.IP来源}`);
    const wantResult = { 登录: ['成功', '失败'], 退出: ['成功'], 被收回: [undefined], 请求: ['成功', '失败'] };
    const bad = rows.filter((x) => JSON.stringify(x.项目) !== JSON.stringify([PROJECT_REC]) || !(x.类型 in wantResult) || !wantResult[x.类型].includes(x.结果) || typeof x.次数 !== 'number' || (x.类型 !== '请求' && x.次数 !== 1));
    expect(!bad.length, `这些行的项目、类型、结果、次数不对（项目应是 ["${PROJECT_REC}"]）：${JSON.stringify(bad.slice(0, 3))}`);
  });

  await check('飞书登录每种失败都记一行「登录失败」并写明原因（缺 state、state 不对、集成平台报错、换令牌失败、租户不对、ID 令牌不对、停用名单、禁止访问）', async () => {
    const count = () => logRows().filter((x) => x.登录方式 === '飞书' && x.事件 === '登录失败' && x.原因).length;
    const scenarios = [
      ['缺 state', () => new Browser().get('/auth/feishu/fbif/callback?code=whatever')],
      ['state 不对', async () => {
        const b = new Browser();
        const { callbackUrl } = await login(b, users.alice, { stopAt: 'callback' });
        const u = new URL(callbackUrl);
        u.searchParams.set('state', u.searchParams.get('state').slice(0, -2) + 'xx');
        await b.get(u.toString());
      }],
      ['集成平台报错', async () => {
        const b = new Browser();
        const { callbackUrl } = await login(b, users.alice, { stopAt: 'callback' });
        const u = new URL(callbackUrl);
        u.searchParams.set('error', 'access_denied');
        await b.get(u.toString());
      }],
      ['换令牌失败', () => ((idp.failNextTokenExchange = true), login(new Browser(), users.alice))],
      ['租户不对', () => ((idp.tamper = 'company'), login(new Browser(), users.alice))],
      ['ID 令牌签名不对', () => ((idp.tamper = 'bad_sig'), login(new Browser(), users.alice))],
      ['停用名单', () => login(new Browser(), users.carol)],
      ['禁止访问', async () => {
        idp.denied.add(users.bob.sub);
        await login(new Browser(), users.bob).finally(() => idp.denied.delete(users.bob.sub));
      }],
    ];
    const missed = [];
    for (const [label, run] of scenarios) {
      const before = count();
      await run();
      if (!(await eventually(() => count() > before, 8000))) missed.push(label);
    }
    expect(!missed.length, `这些失败没记日志：${missed.join('、')}`);
  });

  await check('日志表写不进去：登录照样 200，健康检查看得到积压；重启后接着写，恢复后日志补上', async () => {
    fsk.down[LOGT] = 'error';
    try {
      await loginOk(acct.restart, 'VENDOR-RESTART');
      expect(await eventually(async () => (await health()).body?.outbox_pending > 0), '日志写不进去时健康检查的 outbox_pending 不涨');
      const saved = existsSync(outboxPath) ? readFileSync(outboxPath, 'utf8') : '';
      outboxSnapshots.push(saved);
      expect(saved.includes('VENDOR-RESTART'), '日志没先落到 SSO_OUTBOX_FILE 就去写了');
      await stopApp();
      await startApp();
    } finally {
      fsk.down[LOGT] = null;
    }
    expect(await waitLog((x) => x.事件 === '登录成功' && x.账号 === 'VENDOR-RESTART', 40000), '重启并恢复后 40 秒内日志没补上');
    expect(await eventually(async () => (await health()).body?.outbox_pending === 0, 40000), '恢复后积压没清空');
  });

  const plainGet = protectedPaths.find((p) => p !== '/api/me' && p !== args['audit-route']);
  const tag = randomBytes(4).toString('hex');
  const hasRow = (pred) => requestRows().some(pred);
  // 没登录的人打一下：有普通受保护接口就 GET 它（401），没有就 POST 一个不存在的路径（改数据的请求一律记）。
  const anonHit = (b) => (plainGet ? b.get(plainGet) : b.post(`/conformance-anon-${tag}`, '{}'));
  const anonStatus = plainGet ? 401 : null;

  await check('请求日志：普通 GET 200、404 不记；POST、401、403、5xx' + (args.fresh ? '、敏感接口' : '') + (args['audit-route'] ? '、调了 Audit 的接口' : '') + ' 各记一行，路径不带查询串，记了是谁', async () => {
    const q = 'qv' + randomBytes(9).toString('hex');
    secrets.add(q);
    const f = new Browser();
    f.headers['X-Real-IP'] = '198.51.100.31';
    await login(f, users.alice);
    const missing = `/conformance-missing-${tag}`;
    const posted = `/conformance-post-${tag}`;
    const want = []; // [说明, 判定, 要不要记是谁（飞书登录的测试甲）]
    if (plainGet) expect((await f.get(`${plainGet}?q=${q}`)).status === 200, `登录后 ${plainGet} 不是 200`);
    await f.get(`${missing}?q=${q}`);
    const pr = await f.request(`${base}${posted}?token=${q}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: q }) });
    want.push(['POST', (x) => x.方法 === 'POST' && x.路径 === posted && x.状态码 === pr.status && x.IP === '198.51.100.31', true]);
    if (plainGet) {
      const anon = new Browser();
      anon.headers['X-Real-IP'] = '198.51.100.32';
      expect((await anon.get(`${plainGet}?q=${q}`)).status === 401, `没登录访问 ${plainGet} 不是 401`);
      want.push(['401', (x) => x.路径 === plainGet && x.状态码 === 401 && x.原因 === '没登录' && x.结果 === '失败' && x.IP === '198.51.100.32', false]);
    }
    if (args['feature-route']) {
      const a = await loginOk(acct.test, 'vendor-test');
      expect((await a.get(args['feature-route'])).status === 403, `没勾功能的账号访问 ${args['feature-route']} 不是 403`);
      want.push(['403', (x) => x.路径 === args['feature-route'] && x.状态码 === 403 && x.原因 === '没有权限' && x.记录ID === acct.test.id && x.登录方式 === '账号密码' && !!x.账号, false]);
    }
    if (args['error-route']) {
      const r = await f.get(`${args['error-route']}?q=${q}`);
      expect(r.status >= 500, `${args['error-route']} 没回 5xx：HTTP ${r.status}`);
      want.push(['5xx', (x) => x.路径 === args['error-route'] && x.状态码 === r.status && x.原因 === '服务出错' && x.IP === '198.51.100.31', true]);
    }
    if (args.fresh) {
      const r = await f.get(args.fresh);
      want.push(['敏感接口', (x) => x.路径 === args.fresh && x.方法 === 'GET' && x.状态码 === r.status && x.IP === '198.51.100.31', true]);
    }
    if (args['audit-route']) {
      expect((await f.get(`${args['audit-route']}?q=${q}`)).status === 200, `${args['audit-route']} 不是 200`);
      want.push(['Audit', (x) => x.路径 === args['audit-route'] && x.状态码 === 200 && x.结果 === '成功' && x.IP === '198.51.100.31', true]);
    }
    await eventually(() => want.every(([, pred]) => hasRow(pred)), 10000);
    const lacking = want.filter(([, pred]) => !hasRow(pred)).map(([label]) => label);
    expect(!lacking.length, `这些请求没记日志：${lacking.join('、')}`);
    for (const [label, pred, mine] of want) {
      const row = requestRows().find(pred);
      expect(typeof row.耗时毫秒 === 'number' && row.次数 >= 1 && /^(GET|POST)$/.test(row.方法) && JSON.stringify(row.项目) === JSON.stringify([PROJECT_REC]), `${label} 那行的方法、耗时、次数或项目不对：${JSON.stringify(row)}`);
      if (mine) expect(row.用户标识 === users.alice.sub && row.公司 === users.alice.company_code && row.登录方式 === '飞书' && /^[0-9a-f]{12}$/.test(row.会话 ?? ''), `${label} 那行没记是谁：${JSON.stringify(row)}`);
    }
    await sleep(1000);
    expect(!hasRow((x) => x.路径 === missing), `GET 404 也记了：${missing}`);
    if (plainGet) expect(!hasRow((x) => x.路径 === plainGet && x.方法 === 'GET' && x.状态码 === 200), `普通成功的 GET ${plainGet} 也记了`);
    expect(!requestRows().some((x) => String(x.路径).includes('?')), '路径带了查询串');
  });

  await check('日志表写不进去（超时）时请求和登录照常；还没写出去的一样的请求合成一行：50 次一样的' + (plainGet ? ' 401 ' : '请求') + '恢复后只有一行、次数 50', async () => {
    fsk.down[LOGT] = 'timeout';
    try {
      const prime = new Browser();
      prime.headers['X-Real-IP'] = '198.51.100.40';
      const creates = () => fsk.calls.filter((c) => c.path.endsWith('/records/batch_create')).length;
      const c0 = creates();
      await anonHit(prime);
      expect(await eventually(() => creates() > c0, 5000), '日志表的写入没去试');
      const burst = new Browser();
      burst.headers['X-Real-IP'] = '198.51.100.41';
      const t0 = Date.now();
      const rs = await Promise.all(Array.from({ length: 50 }, () => anonHit(burst)));
      expect(Date.now() - t0 < 4000, `日志表卡住时 50 个请求用了 ${Date.now() - t0}ms，请求在等日志`);
      if (anonStatus) expect(rs.every((r) => r.status === anonStatus), `日志表写不进去时请求没照常回 ${anonStatus}`);
      await loginOk(acct.test, 'vendor-test');
    } finally {
      fsk.down[LOGT] = null;
    }
    const rowsFor = () => requestRows().filter((x) => x.IP === '198.51.100.41');
    expect(await eventually(() => rowsFor().length > 0, 40000), '恢复后 40 秒内请求日志没补上');
    await sleep(500);
    expect(rowsFor().length === 1 && rowsFor()[0].次数 === 50, `50 次一样的请求应合成一行、次数 50：${JSON.stringify(rowsFor().map((x) => x.次数))}`);
  });

  await check(`日志表超过 ${LOG_MAX_ROWS} 行（启动时、每写 500 行查一次）：只删最旧的「请求」行，删到 90%；登录、退出、被收回一行不删`, async () => {
    const old = Date.now() - 30 * 86400_000;
    for (let i = 0; i < 50; i++) fsk.addRow(LOGT, { 摘要: '旧登录', 时间: old + i, 项目: ['recOtherProjec01'], 类型: '登录', 结果: '成功', 次数: 1 });
    while (fsk.rows(LOGT).length < LOG_MAX_ROWS + 500) fsk.addRow(LOGT, { 摘要: '旧请求', 时间: old + 100 + fsk.rows(LOGT).length, 项目: ['recOtherProjec01'], 类型: '请求', 结果: '失败', 次数: 1 });
    const keep = logRows().filter((x) => x.类型 !== '请求').map((x) => x.record_id);
    const reqBefore = requestRows().map((x) => [x.record_id, x.时间]);
    await stopApp();
    await startApp();
    expect(await eventually(() => fsk.rows(LOGT).length <= LOG_MAX_ROWS * 0.9, 20000), `重启后日志表没删到 ${LOG_MAX_ROWS * 0.9} 行以下：${fsk.rows(LOGT).length}`);
    const now = new Set(fsk.rows(LOGT).map((r) => r.record_id));
    const lost = keep.filter((id) => !now.has(id));
    expect(!lost.length, `删了 ${lost.length} 行登录/退出/被收回`);
    const gone = reqBefore.filter(([id]) => !now.has(id)).map(([, t]) => t);
    const kept = reqBefore.filter(([id]) => now.has(id)).map(([, t]) => t);
    expect(gone.length > 0 && (!kept.length || Math.max(...gone) <= Math.min(...kept)), '删的不是最旧的请求行');
  });

  // 「几秒内」是相对兜底对账的间隔说的：变更提醒那条已经证明提醒到了不等核对周期。
  const reconcileEnv = { SSO_RECONCILE_INTERVAL: `${RECONCILE_MS / 1000}s` };
  /** 等到 since 之后兜底对账整表读过一次账号表，再多等一会儿让这一轮做完 */
  const roundDone = async (since) => {
    const ok = await eventually(() => fsk.calls.some((c) => c.at >= since && c.full && c.path.includes(`/tables/${ACCT}/`)), 15000);
    await sleep(500);
    return ok;
  };

  await check(`事件丢了（改了表、不发变更提醒）：兜底对账（测试里每 ${RECONCILE_MS / 1000} 秒一轮）一轮内收回删了、禁用、改了密码的会话，再登录被拒；对不上的「状态」被补写；没改的人不受影响`, async () => {
    await stopApp();
    const t0 = Date.now();
    await startApp(reconcileEnv);
    expect(await roundDone(t0), '启动后没有整表读账号表（兜底对账的第一轮）');
    const [off, del, chpw, keep] = [await loginOk(acct.bgOff), await loginOk(acct.bgDel), await loginOk(acct.bgPw), await loginOk(acct.bgKeep)];
    // 登录之后谁都不再请求：下线只能是兜底对账做的，不是用户请求时的核对。
    fsk.setCell(ACCT, acct.bgOff.id, '账号状态', '禁用');
    fsk.deleteRow(ACCT, acct.bgDel.id);
    fsk.setCell(ACCT, acct.bgPw.id, '密码', pw('Bg'));
    fsk.setCell(ACCT, acct.bgKeep.id, '状态', '已禁用');
    fsk.setCell(ACCT, acct.bgKeep.id, '状态说明', '有人手改了');
    const within = RECONCILE_MS + 4000;
    for (const [a, reason] of [[acct.bgOff, '账号已停用'], [acct.bgDel, '账号已删除'], [acct.bgPw, '密码已改']]) {
      expect(await waitLog((x) => x.事件 === '被收回' && x.记录ID === a.id && x.原因 === reason, within), `${within / 1000} 秒内日志里没有 ${a.name}「被收回：${reason}」（兜底对账没收回）`);
    }
    expect(await eventually(() => fsk.row(ACCT, acct.bgKeep.id).状态 === '正常' && !fsk.row(ACCT, acct.bgKeep.id).状态说明, within), `被人改错的「状态」没补写回正常：${JSON.stringify(fsk.row(ACCT, acct.bgKeep.id))}`);
    expect(await eventually(() => fsk.row(ACCT, acct.bgOff.id).状态 === '已禁用', within), `禁用的那一行「状态」没写成已禁用：${fsk.row(ACCT, acct.bgOff.id).状态}`);
    const statuses = [await off.me(), await del.me(), await chpw.me()];
    expect(statuses.every((x) => x === 401), `收回后会话仍能用：${statuses.join('/')}`);
    expect((await keep.me()) === 200, '没改的人被下线了');
    const again = [await new Browser().accountLogin(acct.bgOff.name, acct.bgOff.password), await new Browser().accountLogin(acct.bgPw.name, acct.bgPw.password)];
    expect(again.every((r) => r.status === 401), `禁用的、旧密码还能登录：${again.map((r) => r.status).join('/')}`);
  });

  await check('服务重启后兜底对账照常：重启被测服务，不发任何事件，下一轮照样收回改了密码的会话', async () => {
    const b = await loginOk(acct.bgRestart);
    await stopApp();
    const t0 = Date.now();
    await startApp(reconcileEnv);
    expect(await roundDone(t0), '重启后没有整表读账号表');
    // 重启后的第一轮已经做完，这时才改表：只有之后按间隔跑的那一轮能收回。
    fsk.setCell(ACCT, acct.bgRestart.id, '密码', pw('Restart'));
    expect(await waitLog((x) => x.事件 === '被收回' && x.记录ID === acct.bgRestart.id && x.原因 === '密码已改', RECONCILE_MS + 4000), `重启后 ${(RECONCILE_MS + 4000) / 1000} 秒内没收回改了密码的会话（兜底对账重启后没接着跑）`);
    expect((await b.me()) === 401, '收回后会话仍能用');
    await stopApp();
    await startApp();
  });

  await check('多维表格配置写错启动就失败并说清是哪个变量：知识库（wiki）链接、缺 SSO_FEISHU_APP_SECRET、缺 SSO_OUTBOX_FILE、缺 SSO_LOG_PROJECT_RECORD', async () => {
    for (const [label, patch, mention] of [
      ['wiki 链接', { SSO_ACCOUNTS_TABLE: 'https://foodtalks.feishu.cn/wiki/AbCdEfGh12345678?table=tblAbcd1234' }, 'SSO_ACCOUNTS_TABLE'],
      ['缺 SSO_FEISHU_APP_SECRET', { SSO_FEISHU_APP_SECRET: '' }, 'SSO_FEISHU_APP_SECRET'],
      ['缺 SSO_OUTBOX_FILE', { SSO_OUTBOX_FILE: '' }, 'SSO_OUTBOX_FILE'],
      ['缺 SSO_LOG_PROJECT_RECORD', { SSO_LOG_PROJECT_RECORD: '' }, 'SSO_LOG_PROJECT_RECORD'],
    ]) {
      const r = await startBroken(patch);
      expect(!r.listening, `${label}：照样启动了`);
      expect(r.exited, `${label}：20 秒内既没启动也没退出`);
      expect(r.log.includes(mention), `${label}：报错里没提 ${mention}：${r.log.slice(-300)}`);
    }
  });

  await check('账号会话：退出后旧 cookie 作废' + (args.fresh ? '，敏感接口只认飞书身份' : ''), async () => {
    const b = await loginOk(acct.test, 'vendor-test');
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

  await check('请求日志限量：一个进程一分钟最多新增 200 行，多的丢掉；健康检查看得到丢了多少，ok 不受影响', async () => {
    // 一批 20 个并发：一次 260 个连接会超过 macOS 默认的 listen 队列（128），连接直接被拒。
    for (let start = 0; start < 260; start += 20) {
      await Promise.all(Array.from({ length: Math.min(20, 260 - start) }, (_, k) => {
        const i = start + k;
        const b = new Browser();
        b.headers['X-Real-IP'] = `198.18.${Math.floor(i / 200)}.${i % 200}`;
        return anonHit(b);
      }));
    }
    await eventually(async () => (await health()).body?.outbox_pending === 0, 15000);
    const added = requestRows().filter((x) => String(x.IP).startsWith('198.18.')).length;
    expect(added <= 200 && added >= 150, `一分钟里 260 个不同的人各打一次，应记 150～200 行：${added}`);
    const h = await health();
    expect(h.status === 200 && h.body?.ok === true && h.body.dropped_request_rows >= 60 && h.body.problems.includes('warn_request_rows_dropped'), `健康检查应 ok、dropped_request_rows ≥ 60、带 warn_request_rows_dropped：${h.text}`);
  });

  await check('登录日志、待写队列文件、健康检查里没有密码、令牌、授权码、state、cookie', async () => {
    if (existsSync(outboxPath)) outboxSnapshots.push(readFileSync(outboxPath, 'utf8'));
    await health();
    const hay = [JSON.stringify(logRows()), ...outboxSnapshots, ...healthBodies].join('\n');
    const all = [...secrets, ...idp.refresh.keys(), ...idp.access.keys(), ...idp.codes.keys(), ...fsk.tokens.keys()].filter((x) => typeof x === 'string' && x.length >= 8);
    const leaked = all.filter((x) => hay.includes(x));
    expect(logRows().length >= 20, `日志行太少（${logRows().length}），这条查不出东西`);
    expect(!leaked.length, `泄露了 ${leaked.length} 个：${leaked.map((x) => x.slice(0, 6) + '…').join('、')}`);
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
