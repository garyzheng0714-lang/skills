// 假的飞书集成平台：照 2026-10-15 实测的集成平台行为做，供合规测试用。
// 实测行为：刷新会轮换 refresh_token 但旧的仍可用；刷新后上一个 access_token 立即 401；
// 刷新不返回 id_token；被「禁止访问」的人刷新照样成功、调用户信息 403；授权码重放会作废第一次发的令牌。
// 同一个服务器上还有假的飞书开放平台多维表格接口（/open-apis/…），照 2026-10-16 实测：
// 查询（search）里文本格子是分段数组、空格子不出现、「是」完全相等但不分大小写；按 ID 取（get）文本是纯字符串、
// 空格子是 null、行不在回 1254043；batch_update 只改给了的列；datetime 是毫秒数。
import { createHash, createHmac, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { createServer } from 'node:http';

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const rand = () => randomBytes(24).toString('base64url');

export async function startFakeIdp() {
  // 集成平台的签名公钥是 1024 位 RSA（2026-10-15 实测 jwks.json）；有些库拒绝 2048 位以下，这里照真的来。
  const key = generateKeyPairSync('rsa', { modulusLength: 1024 });
  const otherKey = generateKeyPairSync('rsa', { modulusLength: 1024 });
  const kid = '3dd10f6f-229c-4e2d-9bec-7a16d421f663';

  const idp = {
    url: '',
    clients: new Map(),
    user: null,
    denied: new Set(),
    tamper: null,
    failNextTokenExchange: false,
    refreshMode: null,
    refreshCalls: 0,
    userinfoCalls: 0,
    latestRefresh: new Map(),
    blocklist: { revision: 1, entries: [], complete: true },
    blocklistStatus: 200,
    codes: new Map(),
    refresh: new Map(),
    access: new Map(),
    logins: [],
    tokenCallsByCode: new Map(),
    revoked: [],
    blocklistPulls: 0,
    feishu: fakeFeishu(),

    addClient(id, secret, redirectUri) {
      this.clients.set(id, { secret, redirectUri });
    },
    familyOf(refreshToken) {
      return this.refresh.get(refreshToken)?.family;
    },
    // 这次登录最后发出的那枚 refresh_token 是否已被撤销（项目只存最新的，只需撤它）
    latestRevoked(family) {
      return this.revoked.includes(this.latestRefresh.get(family));
    },
    expireFamily(family) {
      for (const r of this.refresh.values()) if (r.family === family) r.revoked = true;
      for (const a of this.access.values()) if (a.family === family) a.valid = false;
    },
    // 测试自己扮演 B 项目，走一遍授权码登录，返回 B 的 refresh_token
    async loginAsOtherProject(clientId, secret, redirectUri) {
      const verifier = rand();
      const challenge = b64u(createHash('sha256').update(verifier).digest());
      const auth = new URL(this.url + '/auth');
      Object.entries({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri, scope: 'openid offline_access', state: 's', nonce: 'n', code_challenge: challenge, code_challenge_method: 'S256' }).forEach(([k, v]) => auth.searchParams.set(k, v));
      const res = await fetch(auth, { redirect: 'manual' });
      const code = new URL(res.headers.get('location')).searchParams.get('code');
      const tok = await this.tokenRequest(clientId, secret, { grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: verifier });
      return tok.body.refresh_token;
    },
    async tokenRequest(clientId, secret, form) {
      const res = await fetch(this.url + '/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + Buffer.from(`${clientId}:${secret}`).toString('base64') },
        body: new URLSearchParams(form),
      });
      return { status: res.status, body: await res.json().catch(() => ({})) };
    },
  };

  const jwt = (claims, mode) => {
    const alg = mode === 'hs256' ? 'HS256' : 'RS256';
    const head = b64u(JSON.stringify({ alg, kid, typ: 'JWT' }));
    const body = b64u(JSON.stringify(claims));
    const input = `${head}.${body}`;
    let sig;
    if (alg === 'HS256') sig = createHmac('sha256', idp.clients.get(claims.aud).secret).update(input).digest();
    else sig = sign('RSA-SHA256', Buffer.from(input), mode === 'bad_sig' ? otherKey.privateKey : key.privateKey);
    return `${input}.${b64u(sig)}`;
  };

  const idToken = (clientId, user, nonce) => {
    const mode = idp.tamper;
    idp.tamper = null;
    const now = Math.floor(Date.now() / 1000);
    const claims = { iss: idp.url, aud: clientId, sub: user.sub, iat: now, exp: now + 600, nonce, company_code: user.company_code, name: user.name };
    if (mode === 'bad_iss') claims.iss = idp.url + '/other';
    if (mode === 'bad_aud') claims.aud = 'someone-else';
    if (mode === 'bad_nonce') claims.nonce = 'not-the-nonce';
    if (mode === 'expired') claims.exp = now - 3600;
    if (mode === 'company') claims.company_code = 'NOT_FBIF';
    if (mode === 'no_company') delete claims.company_code;
    return jwt(claims, mode === 'userinfo_sub' || mode === 'no_refresh' ? null : mode);
  };

  const clientFromBasic = (req) => {
    const m = /^Basic (.+)$/.exec(req.headers.authorization || '');
    if (!m) return null;
    const [id, secret] = Buffer.from(m[1], 'base64').toString().split(':').map(decodeURIComponent);
    const c = idp.clients.get(id);
    return c && c.secret === secret ? id : null;
  };

  const issueTokens = (clientId, user, family) => {
    const at = rand();
    const rt = rand();
    for (const a of idp.access.values()) if (a.family === family) a.valid = false;
    idp.access.set(at, { sub: user.sub, family, valid: true });
    idp.refresh.set(rt, { clientId, user, family, revoked: false });
    idp.latestRefresh.set(family, rt);
    return { access_token: at, refresh_token: rt, token_type: 'Bearer', expires_in: 7200 };
  };

  const readBody = (req) =>
    new Promise((resolve) => {
      let data = '';
      req.on('data', (c) => (data += c));
      req.on('end', () => resolve(data));
    });

  const send = (res, status, body, headers = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  };

  const server = createServer(async (req, res) => {
    const u = new URL(req.url, idp.url);
    const raw = await readBody(req);
    if (u.pathname.startsWith('/open-apis/')) return idp.feishu.handle(req.method, u, req.headers.authorization, raw, (status, body) => send(res, status, body));
    const form = new URLSearchParams(raw);
    switch (`${req.method} ${u.pathname}`) {
      case 'GET /.well-known/openid-configuration':
        return send(res, 200, {
          issuer: idp.url,
          authorization_endpoint: idp.url + '/auth',
          token_endpoint: idp.url + '/token',
          userinfo_endpoint: idp.url + '/userinfo',
          revocation_endpoint: idp.url + '/revoke',
          jwks_uri: idp.url + '/jwks',
          scopes_supported: ['openid', 'offline_access', 'profile', 'email', 'phone'],
          response_types_supported: ['code'],
          grant_types_supported: ['authorization_code', 'refresh_token'],
          subject_types_supported: ['public'],
          id_token_signing_alg_values_supported: ['HS256', 'RS256'],
        });
      case 'GET /jwks':
        return send(res, 200, { keys: [{ ...key.publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' }] });
      case 'GET /auth': {
        const q = u.searchParams;
        const c = idp.clients.get(q.get('client_id'));
        if (!c || c.redirectUri !== q.get('redirect_uri')) return send(res, 400, { error: 'invalid_request', error_description: 'redirect_uri' });
        if (q.get('response_type') !== 'code' || q.get('code_challenge_method') !== 'S256' || !q.get('code_challenge')) return send(res, 400, { error: 'invalid_request', error_description: 'pkce' });
        if (!idp.user) return send(res, 400, { error: 'login_required' });
        const code = rand();
        idp.codes.set(code, { clientId: q.get('client_id'), redirectUri: q.get('redirect_uri'), challenge: q.get('code_challenge'), nonce: q.get('nonce'), scope: q.get('scope') || '', user: idp.user, used: false, family: null });
        const back = new URL(q.get('redirect_uri'));
        back.searchParams.set('code', code);
        back.searchParams.set('state', q.get('state') || '');
        res.writeHead(302, { Location: back.toString() });
        return res.end();
      }
      case 'POST /token': {
        const clientId = clientFromBasic(req);
        if (!clientId) return send(res, 401, { error: 'invalid_client' });
        if (form.get('grant_type') === 'authorization_code') {
          const code = form.get('code');
          idp.tokenCallsByCode.set(code, (idp.tokenCallsByCode.get(code) || 0) + 1);
          const c = idp.codes.get(code);
          if (!c || c.clientId !== clientId || c.redirectUri !== form.get('redirect_uri')) return send(res, 400, { error: 'invalid_grant' });
          if (c.used) {
            if (c.family) idp.expireFamily(c.family);
            return send(res, 400, { error: 'invalid_grant', error_description: 'code reused' });
          }
          c.used = true;
          if (idp.failNextTokenExchange) {
            idp.failNextTokenExchange = false;
            return send(res, 500, { error: 'server_error' });
          }
          const verifier = form.get('code_verifier') || '';
          if (b64u(createHash('sha256').update(verifier).digest()) !== c.challenge) return send(res, 400, { error: 'invalid_grant', error_description: 'pkce' });
          c.family = rand();
          idp.logins.push({ family: c.family, sub: c.user.sub, clientId });
          const mode = idp.tamper;
          const toks = issueTokens(clientId, c.user, c.family);
          if (!c.scope.split(' ').includes('offline_access') || mode === 'no_refresh') delete toks.refresh_token;
          if (mode === 'userinfo_sub') idp.access.get(toks.access_token).subOverride = 'on_someone_else';
          return send(res, 200, { ...toks, id_token: idToken(clientId, c.user, c.nonce) });
        }
        if (form.get('grant_type') === 'refresh_token') {
          idp.refreshCalls += 1;
          if (idp.refreshMode === '500') return send(res, 500, { error: 'server_error' });
          if (idp.refreshMode === 'text403') return send(res, 403, 'Forbidden by gateway', { 'Content-Type': 'text/plain' });
          const r = idp.refresh.get(form.get('refresh_token'));
          if (!r || r.revoked || r.clientId !== clientId) return send(res, 400, { error: 'invalid_grant' });
          return send(res, 200, issueTokens(clientId, r.user, r.family));
        }
        return send(res, 400, { error: 'unsupported_grant_type' });
      }
      case 'GET /userinfo':
      case 'POST /userinfo': {
        idp.userinfoCalls += 1;
        const at = /^Bearer (.+)$/.exec(req.headers.authorization || '')?.[1];
        const a = at && idp.access.get(at);
        if (!a || !a.valid) return send(res, 401, { error: 'invalid_token' }, { 'WWW-Authenticate': 'Bearer error="invalid_token"' });
        if (idp.denied.has(a.sub)) return send(res, 403, 'Forbidden', { 'Content-Type': 'text/plain' });
        const user = [...idp.refresh.values()].find((r) => r.family === a.family).user;
        return send(res, 200, { sub: a.subOverride || user.sub, name: user.name, email: user.email || '', picture: user.picture || '' });
      }
      case 'POST /revoke': {
        if (!clientFromBasic(req)) return send(res, 401, { error: 'invalid_client' });
        const t = form.get('token');
        idp.revoked.push(t);
        const r = idp.refresh.get(t);
        if (r) r.revoked = true;
        return send(res, 200, {});
      }
      case 'POST /blocklist':
        idp.blocklistPulls += 1;
        if (idp.blocklistStatus !== 200) return send(res, idp.blocklistStatus, { error: 'down' });
        return send(res, 200, idp.blocklist);
      default:
        return send(res, 404, { error: 'not_found' });
    }
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  idp.url = `http://127.0.0.1:${server.address().port}`;
  idp.close = () => new Promise((resolve) => server.close(resolve));
  return idp;
}

// ---------- 假的飞书开放平台（多维表格） ----------

const FIELD_TYPES = { text: 1, number: 2, select: 3, datetime: 5, checkbox: 7, link: 18 };

function fakeFeishu() {
  const fs = {
    appId: '',
    appSecret: '',
    tokens: new Map(), // tenant_access_token → 过期时间
    tables: new Map(), // table_id → { app, fields: [{field_name, type, field_id, property}], rows: Map(record_id → {列名: 值}) }
    // 按表注入故障：'error' 回 500、'timeout' 拖 8 秒、'writes' 只让写入（含删除）失败
    down: {},
    // 按表加延迟（毫秒）：让项目的处理慢一点，测并发和重跑
    latency: {},
    writes: [], // 每次写成功：{ table, kind: 'update'|'create'|'delete', records }
    calls: [], // 每次调开放平台接口（含换 token、失败的）：{ at, method, path, full }
    seq: 0,

    // pageCap：查询每页最多回几行（真接口 500），账号表设得很小逼项目翻页
    createTable(app, tableId, columns, pageCap = 500) {
      const fields = columns.map(([name, type, options]) => ({ field_name: name, type, field_id: 'fld' + (++fs.seq), property: options ? { options: options.map((o) => ({ name: o })) } : null }));
      fs.tables.set(tableId, { app, fields, rows: new Map(), pageCap });
    },
    addRow(tableId, cells) {
      const id = 'rec' + randomBytes(5).toString('hex');
      fs.tables.get(tableId).rows.set(id, { ...cells });
      return id;
    },
    setCell(tableId, id, name, value) {
      const row = fs.tables.get(tableId).rows.get(id);
      if (value === undefined || value === null || value === '' || value === false) delete row[name];
      else row[name] = value;
    },
    deleteRow(tableId, id) {
      fs.tables.get(tableId).rows.delete(id);
    },
    removeField(tableId, name) {
      const t = fs.tables.get(tableId);
      t.fields = t.fields.filter((f) => f.field_name !== name);
      for (const row of t.rows.values()) delete row[name];
    },
    renameField(tableId, from, to) {
      const t = fs.tables.get(tableId);
      t.fields.find((f) => f.field_name === from).field_name = to;
      for (const row of t.rows.values()) {
        if (from in row) {
          row[to] = row[from];
          delete row[from];
        }
      }
    },
    addField(tableId, name, type) {
      fs.tables.get(tableId).fields.push({ field_name: name, type, field_id: 'fld' + (++fs.seq), property: null });
    },
    row(tableId, id) {
      return fs.tables.get(tableId).rows.get(id);
    },
    rows(tableId) {
      return [...fs.tables.get(tableId).rows.entries()].map(([record_id, fields]) => ({ record_id, fields }));
    },

    async handle(method, u, authorization, raw, send) {
      const ok = (data) => send(200, { code: 0, msg: 'success', data });
      // full：不带筛选条件的整表查询（兜底对账）。
      fs.calls.push({ at: Date.now(), method, path: u.pathname, full: u.pathname.endsWith('/records/search') && !safeJson(raw)?.filter });
      if (method === 'POST' && u.pathname === '/open-apis/auth/v3/tenant_access_token/internal') {
        const body = safeJson(raw);
        if (body?.app_id !== fs.appId || body?.app_secret !== fs.appSecret) return send(200, { code: 10014, msg: 'app secret invalid' });
        const token = 't-' + randomBytes(16).toString('hex');
        fs.tokens.set(token, Date.now() + 7200_000);
        return send(200, { code: 0, msg: 'ok', tenant_access_token: token, expire: 7200 });
      }
      const m = /^\/open-apis\/bitable\/v1\/apps\/([^/]+)\/tables\/([^/]+)\/(fields|records)(?:\/([^/]+))?$/.exec(u.pathname);
      if (!m) return send(404, { code: 404, msg: 'not found' });
      const [, app, tableId, kind, rest] = m;
      const auth = /^Bearer (.+)$/.exec(authorization ?? '')?.[1];
      if (!auth || !(fs.tokens.get(auth) > Date.now())) return send(400, { code: 99991663, msg: 'Invalid access token for authorization' });
      const t = fs.tables.get(tableId);
      if (!t || t.app !== app) return send(200, { code: 1254004, msg: 'WrongTableId' });
      const isWrite = rest === 'batch_update' || rest === 'batch_create' || rest === 'batch_delete';
      if (fs.latency[tableId]) await new Promise((r) => setTimeout(r, fs.latency[tableId]));
      const mode = fs.down[tableId];
      if (mode === 'timeout') await new Promise((r) => setTimeout(r, 8000));
      if (mode === 'error' || mode === 'timeout' || (mode === 'writes' && isWrite)) return send(500, { code: 1255001, msg: 'InternalError' });
      const byName = new Map(t.fields.map((f) => [f.field_name, f]));
      const body = safeJson(raw) ?? {};

      if (kind === 'fields' && method === 'GET') return ok({ items: t.fields.map((f) => ({ ...f })), has_more: false, page_token: '', total: t.fields.length });

      if (method === 'POST' && rest === 'search') {
        let items = [...t.rows.entries()];
        for (const c of body.filter?.conditions ?? []) {
          const f = byName.get(c.field_name);
          if (!f) return send(200, { code: 1254045, msg: 'FieldNameNotFound' });
          if (c.operator !== 'is') return send(200, { code: 1254018, msg: 'InvalidFilter' });
          const want = String(c.value?.[0] ?? '');
          items = items.filter(([, row]) => (f.type === FIELD_TYPES.text ? String(row[c.field_name] ?? '').toLowerCase() === want.toLowerCase() : row[c.field_name] === want));
        }
        for (const s of [...(body.sort ?? [])].reverse()) {
          items.sort(([, a], [, b]) => ((a[s.field_name] ?? 0) < (b[s.field_name] ?? 0) ? -1 : (a[s.field_name] ?? 0) > (b[s.field_name] ?? 0) ? 1 : 0) * (s.desc ? -1 : 1));
        }
        const size = Math.min(Number(u.searchParams.get('page_size') || 20), 500, t.pageCap);
        const start = Number(u.searchParams.get('page_token') || 0);
        const page = items.slice(start, start + size);
        const more = start + size < items.length;
        return ok({ items: page.map(([id, row]) => ({ record_id: id, fields: searchCells(t, row) })), has_more: more, page_token: more ? String(start + size) : '', total: items.length });
      }

      if (method === 'POST' && rest === 'batch_delete') {
        const ids = Array.isArray(body.records) ? body.records : [];
        if (!ids.length || ids.length > 500) return send(200, { code: 1254001, msg: 'WrongRequestBody' });
        for (const id of ids) t.rows.delete(id);
        fs.writes.push({ table: tableId, kind: 'delete', records: ids });
        return ok({ records: ids.map((id) => ({ deleted: true, record_id: id })) });
      }

      if (method === 'GET' && kind === 'records' && rest) {
        const row = t.rows.get(rest);
        if (!row) return send(200, { code: 1254043, msg: 'RecordIdNotFound' });
        return ok({ record: { record_id: rest, fields: getCells(t, row) } });
      }

      if (method === 'POST' && isWrite) {
        const records = Array.isArray(body.records) ? body.records : [];
        if (!records.length || records.length > 500) return send(200, { code: 1254001, msg: 'WrongRequestBody' });
        for (const r of records) {
          if (rest === 'batch_update' && !t.rows.has(r.record_id)) return send(200, { code: 1254043, msg: 'RecordIdNotFound' });
          for (const [name, value] of Object.entries(r.fields ?? {})) {
            const f = byName.get(name);
            if (!f) return send(200, { code: 1254045, msg: 'FieldNameNotFound' });
            const okType =
              f.type === FIELD_TYPES.datetime || f.type === FIELD_TYPES.number ? typeof value === 'number'
              : f.type === FIELD_TYPES.checkbox ? typeof value === 'boolean'
              : f.type === FIELD_TYPES.link ? Array.isArray(value) && value.every((v) => typeof v === 'string' && v.startsWith('rec'))
              : typeof value === 'string';
            if (!okType) return send(200, { code: 1254060, msg: `TextFieldConvFail ${name}` });
          }
        }
        for (const r of records) {
          if (rest === 'batch_update') for (const [name, value] of Object.entries(r.fields)) fs.setCell(tableId, r.record_id, name, value);
          else fs.addRow(tableId, Object.fromEntries(Object.entries(r.fields).filter(([, v]) => v !== '' && v !== null)));
        }
        fs.writes.push({ table: tableId, kind: rest === 'batch_update' ? 'update' : 'create', records: structuredClone(records) });
        return ok({ records });
      }
      return send(404, { code: 404, msg: 'not found' });
    },
  };
  return fs;
}

// 查询接口的格子：文本是分段数组（4 个字以上拆成两段，逼项目拼起来），空格子不出现。
function searchCells(t, row) {
  const out = {};
  for (const f of t.fields) {
    const v = row[f.field_name];
    if (v === undefined || v === '' || v === false) continue;
    out[f.field_name] = f.type === FIELD_TYPES.text ? (v.length >= 4 ? [{ type: 'text', text: v.slice(0, 2) }, { type: 'text', text: v.slice(2) }] : [{ type: 'text', text: v }]) : v;
  }
  return out;
}

// 按 ID 取的格子：文本是纯字符串，空格子是 null。
function getCells(t, row) {
  const out = {};
  for (const f of t.fields) {
    const v = row[f.field_name];
    out[f.field_name] = f.type === FIELD_TYPES.checkbox ? v === true : v === undefined || v === '' ? null : v;
  }
  return out;
}

function safeJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
