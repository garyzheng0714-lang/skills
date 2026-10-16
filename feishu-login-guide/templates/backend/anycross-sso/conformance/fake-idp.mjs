// 假的飞书集成平台：照 2026-10-15 实测的集成平台行为做，供合规测试用。
// 实测行为：刷新会轮换 refresh_token 但旧的仍可用；刷新后上一个 access_token 立即 401；
// 刷新不返回 id_token；被「禁止访问」的人刷新照样成功、调用户信息 403；授权码重放会作废第一次发的令牌。
// 账号表（POST /accounts）照账号读取工作流的约定：按请求里的 system 只给那个项目的账号；
// 停用的不给，到期的照给（到期由项目自己判）。
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
    // 账号表：测试直接改这几项。accountsBody 不为 null 时原样回它（模拟坏 JSON、complete:false）
    accountsSystem: '',
    accountList: [],
    accountsStatus: 200,
    accountsBody: null,
    accountsDelayMs: 0,
    accountsPulls: 0,
    accountsRequests: [],

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
      case 'POST /accounts': {
        idp.accountsPulls += 1;
        let system = null;
        try {
          system = JSON.parse(raw).system;
        } catch {}
        idp.accountsRequests.push({ contentType: req.headers['content-type'] || '', system });
        if (idp.accountsDelayMs) await new Promise((r) => setTimeout(r, idp.accountsDelayMs));
        if (idp.accountsStatus !== 200) return send(res, idp.accountsStatus, { error: 'down' });
        if (idp.accountsBody !== null) return send(res, 200, idp.accountsBody);
        return send(res, 200, { complete: true, accounts: system === idp.accountsSystem ? idp.accountList : [] });
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
