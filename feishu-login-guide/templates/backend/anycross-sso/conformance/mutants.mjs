#!/usr/bin/env node
// 证明合规测试真能抓到问题：把 Go 模板故意改坏一处，每个坏版本都必须被测试判失败。
// 改了 run.mjs 后跑：node mutants.mjs（全部并行，约 4 分钟）
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const template = readFileSync(join(here, '../go/sso.go.template'), 'utf8');

const mutants = [
  ['不校验 nonce', 'if idt.Nonce != nonce {', 'if false && idt.Nonce != nonce {'],
  ['不校验 company_code', 'if !allowedCompanyCodes[claims.CompanyCode] {', 'if false {'],
  ['也接受 HS256', 'SupportedSigningAlgs: []string{oidc.RS256}', 'SupportedSigningAlgs: []string{oidc.RS256, "HS256"}, InsecureSkipSignatureCheck: true'],
  ['换令牌失败就重试', '\tif err != nil {\n\t\tfail("failed", "exchange: %s", oauthErr(err))', '\tif err != nil {\n\t\ttok, err = s.oauth.Exchange(ctx, q.Get("code"), oauth2.VerifierOption(t.Verifier))\n\t}\n\tif err != nil {\n\t\tfail("failed", "exchange: %s", oauthErr(err))'],
  ['只看刷新、不调用户信息', '_, uiErr := s.userInfo(ctx, nt.AccessToken, cur.Identity.Sub)', 'var uiErr error'],
  ['提醒不比版本号', 'hint.Revision == 0 || hint.Revision > local', 'true || local > hint.Revision'],
  ['名单没读全也照用', 'if !*got.Complete {', 'if false {'],
  ['同步名单不踢人', 'kicked, err := s.store.DeleteSessionsBySub(ctx, next.Entries)', 'var kicked []Session'],
  ['登录不查名单（建会话前后两处都不查）', '\tif e != nil {\n\t\treturn e.Reason, true', '\tif false && e != nil {\n\t\treturn e.Reason, true'],
  ['名单没同步过也放人', 'if !synced {\n\t\treturn "停用名单还没同步成功过", true', 'if !synced && false {\n\t\treturn "停用名单还没同步成功过", true'],
  ['旧名单能盖掉新名单', 'if !prev.SyncedAt.IsZero() && b.Revision < prev.Revision {', 'if false {'],
  ['集成平台故障时每个请求都刷新', 's.retryAfter.Store(sess.IDHash, time.Now().Add(outageBackoff))', '_ = outageBackoff'],
  ['把集成平台的 4xx 当临时故障', 'return errors.As(err, &re) && re.Response != nil && re.Response.StatusCode >= 400 && re.Response.StatusCode < 500', 'return errors.As(err, &re) && re.Response != nil && re.Response.StatusCode == 400'],
  ['退出不撤销 refresh_token', '\t\terr := s.endSession(ctx, hashID(c.Value))\n\t\tcancel()', '\t\t_, err := s.store.DeleteSession(ctx, hashID(c.Value))\n\t\tcancel()'],
  ['会话 cookie 不加 HttpOnly', 'HttpOnly: true, Secure: true', 'HttpOnly: false, Secure: true'],
  ['next 不过滤外站', 'if !strings.HasPrefix(next, "/") || strings.HasPrefix(next, "//")', 'if !strings.HasPrefix(next, "/") || false'],
  ['账号密码不限连错次数', 'return f == nil || f.n < accountFailLimit || time.Since(f.first) > accountLockFor', 'return true || f == nil'],
  ['账号密码登录不限 JSON', 'mt != "application/json" {', 'false && mt != "application/json" {'],
  ['账号会话也找集成平台核对', '\tif sess.Account {\n\t\t// 敏感接口', '\tif false && sess.Account {\n\t\t// 敏感接口'],
  ['账号会话能进敏感接口', '\t\tif fresh {\n\t\t\treturn nil, http.StatusForbidden', '\t\tif false {\n\t\t\treturn nil, http.StatusForbidden'],
  ['账号停用了不踢在线会话', 'if !active {', 'if false && !active {'],
  ['账号到期了还能用', 'return a.expiresAt == nil || time.Now().Before(*a.expiresAt)', 'return true'],
  ['重置密码不踢旧会话', 'return ok && a.usable() && credentialOf(a.passwordHash) == credential, nil', 'return ok && a.usable(), nil'],
  ['账号表 complete 不是 true 也照用', 'if !*got.Complete {\n\t\treturn nil, errors.New("accounts incomplete', 'if false {\n\t\treturn nil, errors.New("accounts incomplete'],
  ['拉账号表不带本项目的源', 'map[string]string{"system": ra.system}', 'map[string]string{"system": ""}'],
  ['账号表拉不到就不用上一份', '\t} else {\n\t\tra.lastErr = err\n', '\t} else {\n\t\tra.lastErr = err\n\t\tra.fetchedAt = time.Time{}\n'],
  ['账号表拉过一次就不再拉', 'ra.inflight == nil && time.Since(ra.triedAt) >= ra.maxAge', 'ra.inflight == nil && ra.triedAt.IsZero()'],
  ['并发登录各拉各的账号表', 'if ra.inflight == nil && time.Since(ra.triedAt) >= ra.maxAge {', 'if time.Since(ra.triedAt) >= ra.maxAge {'],
  ['明文存的密码也认', '\tm := passwordHashFormat.FindStringSubmatch(encoded)\n', '\tif encoded == password {\n\t\treturn true\n\t}\n\tm := passwordHashFormat.FindStringSubmatch(encoded)\n'],
  ['账号表里的账号名不去空格', 'name := strings.ToLower(strings.TrimSpace(a.Username))', 'name := strings.ToLower(a.Username)'],
];

const prep = mkdtempSync(join(tmpdir(), 'sso-mutants-'));
cpSync(join(here, 'selftest/go/main.go'), join(prep, 'main.go'));
mkdirSync(join(prep, 'internal/auth'), { recursive: true });
writeFileSync(join(prep, 'internal/auth/sso.go'), template);
const go = (args, cwd) => execFileSync('go', args, { cwd, stdio: 'pipe' });
go(['mod', 'init', 'selftest'], prep);
go(['get', 'github.com/coreos/go-oidc/v3@v3.21.0', 'golang.org/x/oauth2@v0.37.0'], prep);
go(['mod', 'tidy'], prep);

const runs = mutants.map(([name, from, to], i) => {
  if (!template.includes(from)) return Promise.resolve({ name, verdict: '改不动：模板里找不到要改的那行（更新 mutants.mjs）' });
  const dir = join(prep, `m${i}`);
  mkdirSync(join(dir, 'internal/auth'), { recursive: true });
  for (const f of ['main.go', 'go.mod', 'go.sum']) cpSync(join(prep, f), join(dir, f));
  writeFileSync(join(dir, 'internal/auth/sso.go'), template.replace(from, to));
  try {
    go(['build', '-o', 'app', '.'], dir);
  } catch (e) {
    return Promise.resolve({ name, verdict: '编译失败：' + String(e.stderr).slice(0, 200) });
  }
  return new Promise((resolve) => {
    const p = spawn('node', [join(here, 'run.mjs'), '--start', join(dir, 'app'), '--cwd', dir, '--protected', '/api/me,/api/export', '--fresh', '/api/sensitive', '--report', join(dir, 'report.json')], { stdio: 'ignore' });
    p.on('exit', (code) => {
      if (code === 0) return resolve({ name, verdict: '没抓到' });
      const failed = JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8')).results.filter((r) => !r.ok).map((r) => r.name);
      resolve({ name, verdict: '抓到', failed });
    });
  });
});

const results = await Promise.all(runs);
for (const r of results) console.log(`${r.verdict === '抓到' ? '✓' : '✗'} ${r.name}：${r.verdict}${r.failed ? '（' + r.failed.join('；') + '）' : ''}`);
const missed = results.filter((r) => r.verdict !== '抓到');
console.log(`\n${results.length - missed.length}/${results.length} 个坏版本被抓到`);
process.exit(missed.length ? 1 : 0);
