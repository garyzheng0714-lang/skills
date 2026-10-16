#!/usr/bin/env node
// 证明合规测试真能抓到问题：把 Go 模板故意改坏一处，每个坏版本都必须被测试判失败。
// 改了 run.mjs 后跑：node mutants.mjs（全部并行，约 4 分钟）；node mutants.mjs <名字里的几个字> 只跑名字含它的
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
  ['换令牌失败就重试', '\tif err != nil {\n\t\tfail("failed", "换令牌失败", "exchange: %s", oauthErr(err))', '\tif err != nil {\n\t\ttok, err = s.oauth.Exchange(ctx, q.Get("code"), oauth2.VerifierOption(t.Verifier))\n\t}\n\tif err != nil {\n\t\tfail("failed", "换令牌失败", "exchange: %s", oauthErr(err))'],
  ['只看刷新、不调用户信息', '_, uiErr := s.userInfo(ctx, nt.AccessToken, cur.Identity.Sub)', 'var uiErr error'],
  ['提醒不比版本号', 'hint.Revision == 0 || hint.Revision > local', 'true || local > hint.Revision'],
  ['名单没读全也照用', 'if !*got.Complete {', 'if false {'],
  ['同步名单不踢人', 'kicked, err := s.store.DeleteSessionsBySub(ctx, next.Entries)', 'var kicked []Session'],
  ['登录不查名单（建会话前后两处都不查）', '\tif e != nil {\n\t\treturn e.Reason, true', '\tif false && e != nil {\n\t\treturn e.Reason, true'],
  ['名单没同步过也放人', 'if !synced {\n\t\treturn "停用名单还没同步成功过", true', 'if !synced && false {\n\t\treturn "停用名单还没同步成功过", true'],
  ['旧名单能盖掉新名单', 'if !prev.SyncedAt.IsZero() && b.Revision < prev.Revision {', 'if false {'],
  ['集成平台故障时每个请求都刷新', 's.retryAfter.Store(sess.IDHash, time.Now().Add(outageBackoff))', '_ = outageBackoff'],
  ['把集成平台的 4xx 当临时故障', 'return errors.As(err, &re) && re.Response != nil && re.Response.StatusCode >= 400 && re.Response.StatusCode < 500', 'return errors.As(err, &re) && re.Response != nil && re.Response.StatusCode == 400'],
  ['退出不撤销 refresh_token', '\t\tgone, err := s.endSession(ctx, hashID(c.Value))\n\t\tcancel()', '\t\tgone, err := s.store.DeleteSession(ctx, hashID(c.Value))\n\t\tcancel()'],
  ['会话 cookie 不加 HttpOnly', 'HttpOnly: true, Secure: true', 'HttpOnly: false, Secure: true'],
  ['next 不过滤外站', 'if !strings.HasPrefix(next, "/") || strings.HasPrefix(next, "//")', 'if !strings.HasPrefix(next, "/") || false'],
  ['飞书登录失败不记日志', '\t\tev.Event, ev.Reason = eventLoginFail, reason\n\t\ts.record(ev)\n\t\thttp.Redirect', '\t\tev.Event, ev.Reason = eventLoginFail, reason\n\t\thttp.Redirect'],
  ['被收回不记日志', '\ts.record(s.sessionEvent(ev, sess, eventRevoked, reason))', '\t_ = ev'],
  ['账号密码不限连错次数', 'known, ok, locked := s.reserveAttempt(name)', 'known, ok, locked := false, true, false'],
  ['同时猜密码能绕过连错上限（查表前不占名额）', 'if f.n+f.inflight >= accountFailLimit {', 'if false {'],
  ['锁住了不写回「已锁定」', '{func(f rowFacts) bool { return !f.lockedUntil.IsZero() }, statusLocked,', '{func(f rowFacts) bool { return false }, statusLocked,'],
  ['账号密码登录不限 JSON', 'mt != "application/json" {', 'false && mt != "application/json" {'],
  ['账号会话也找集成平台核对', '\tif sess.Account {\n\t\t// 敏感接口', '\tif false && sess.Account {\n\t\t// 敏感接口'],
  ['账号会话能进敏感接口', '\t\tif fresh {\n\t\t\treturn nil, http.StatusForbidden', '\t\tif false {\n\t\t\treturn nil, http.StatusForbidden'],
  ['账号区分大小写', 'name := normalizeUsername(in.Username)', 'name := strings.TrimSpace(in.Username)'],
  ['账号重复也放人', 'case len(rows) > 1:\n\t\treturn nil, "账号重复"', 'case false:\n\t\treturn nil, "账号重复"'],
  ['不查缺密码', 'if stored == "" {\n\t\treturn row, "配置有误：缺密码"', 'if false {\n\t\treturn row, "配置有误：缺密码"'],
  ['账号状态不是「启用」也能登', 'if row.Enabled != enabledValue {\n\t\treturn row, enabledRefusal(row.Enabled)', 'if false {\n\t\treturn row, enabledRefusal(row.Enabled)'],
  ['查表失败当成密码不对（401）', 'deny(http.StatusServiceUnavailable, "login_service_unavailable", "查表失败")', 'deny(http.StatusUnauthorized, "auth_failed", "查表失败")'],
  ['账号表的列有问题也照读出来的值踢人、拒登、改状态', 'once.Do(func() { ok = s.checkAccountColumns(ctx) && !s.accountColumnsBroken() })', 'once.Do(func() { ok = true })'],
  ['账号密码登录不按 IP 限速', 'if !s.loginsPerIP.allow(ev.IP) {', 'if false {'],
  ['账号密码登录不限查表次数', 'if !s.lookups.allow("") {', 'if false {'],
  ['没查到的账号原样写进日志', 'ev.Account = maskAccount(typed)', 'ev.Account = clip(typed, 100)'],
  ['按账号名认人而不是记录 ID', 'id := Identity{CompanyCode: accountCompanyCode, Sub: row.ID,', 'id := Identity{CompanyCode: accountCompanyCode, Sub: normalizeUsername(row.Username),'],
  ['账号停用了不踢在线会话', 'if row.Enabled != enabledValue {\n\t\treturn "账号已停用"', 'if false {\n\t\treturn "账号已停用"'],
  ['改了密码不踢旧会话', 'if s.credential(row.Password) != credential {', 'if false {'],
  ['删了这一行不踢在线会话', 'if errors.Is(err, errRecordNotFound) {\n\t\ts.accountsRead(nil)', 'if false && errors.Is(err, errRecordNotFound) {\n\t\ts.accountsRead(nil)'],
  ['核对时不更新功能', 'next.Features = s.checkedFeatures(row)\n\tif err := s.store.UpdateSession(ctx, next, cur.Version)', 'next.Features = cur.Features\n\tif err := s.store.UpdateSession(ctx, next, cur.Version)'],
  ['账号会话拿到全部功能', 'all := s.allFeatures()\n\tif !sess.Account {', 'all := s.allFeatures()\n\tif true {'],
  ['飞书登录的人没有功能', 'all := s.allFeatures()\n\tif !sess.Account {\n\t\treturn all', 'all := s.allFeatures()\n\tif !sess.Account {\n\t\treturn []string{}'],
  ['功能列不对也不关功能', '\t\t\tbroken[k] = true', '\t\t\t_ = k'],
  ['没声明的复选框也算故障', 'return !strings.HasPrefix(p, "warn_") })', 'return true })'],
  ['启动对账不报缺密码', '\t{func(f rowFacts) bool { return strings.TrimSpace(f.row.Password) == "" }, statusMisconfigured, fixedNote("缺密码")},\n', ''],
  ['写回也碰人填的列', 'colStatus: statusOK, colNote: "", colLastLogin: now.UnixMilli()}', 'colStatus: statusOK, colNote: "", colLastLogin: now.UnixMilli(), colEnabled: enabledValue}'],
  ['登录日志里写了密码', 'ev.Account = maskAccount(typed)', 'ev.Account = maskAccount(typed)\n\tev.Next = in.Password'],
  ['日志表写不进去就挡登录', '\ts.record(ev)\n\twriteJSON(w, http.StatusOK, map[string]any{"ok": true})\n}', '\ts.record(ev)\n\tif s.feishu.batchCreate(ctx, *s.logTable, []map[string]any{{"事件": eventLoginOK}}) != nil {\n\t\twriteJSON(w, http.StatusServiceUnavailable, map[string]any{"error": "login_service_unavailable"})\n\t\treturn\n\t}\n\twriteJSON(w, http.StatusOK, map[string]any{"ok": true})\n}'],
  ['待写队列不落盘', 'raw, _ := json.Marshal(ob.items)', 'raw, _ := json.Marshal([]outboxItem{})'],
  ['落盘时攥着锁（磁盘慢就拖住登录）', '\tgen := ob.gen\n\tob.mu.Unlock()\n\terr := writeSynced(ob.path, raw)\n\tob.mu.Lock()\n', '\tgen := ob.gen\n\terr := writeSynced(ob.path, raw)\n'],
  ['账号表变更提醒不踢人', '\t\t\ts.settleAccountSession(ctx, sess, row, columnsOK)\n', '\t\t\t_ = row\n'],
  ['变更提醒处理完再来一遍不占名额', 'if !s.changing[id] || !s.changeQuota.allow("") {', 'if !s.changing[id] {'],
  ['变更提醒每次都查表结构', 'if time.Since(s.schemaEventAt) < schemaEventGap {', 'if false {'],
  ['启动时不先对一轮', 'func (s *SSO) reconcileLoop() {\n\tfor {\n', 'func (s *SSO) reconcileLoop() {\n\tfor {\n\t\ttime.Sleep(s.reconcileEvery)\n'],
  ['去掉兜底循环（只在启动时对一轮）', '\t\ttime.Sleep(s.reconcileEvery)\n\t}\n}', '\t\treturn\n\t}\n}'],
  ['兜底对账不收回会话', 'if sess.CheckedAt.After(readAt) {', 'if sess.CheckedAt.After(readAt) || true {'],
  ['兜底对账按核对周期跑', '\t\ttime.Sleep(s.reconcileEvery)\n\t}\n}', '\t\ttime.Sleep(s.checkEvery)\n\t}\n}'],
  ['普通 GET 也记请求日志', 'if !(status == http.StatusUnauthorized || status == http.StatusForbidden', 'if false && !(status == http.StatusUnauthorized || status == http.StatusForbidden'],
  ['401 不记请求日志', 'if !(status == http.StatusUnauthorized || status == http.StatusForbidden', 'if !(status == http.StatusForbidden'],
  ['请求日志路径带查询串', 'clip(r.URL.Path, 500)', 'clip(r.URL.RequestURI(), 500)'],
  ['一样的请求不合并', 'case it.Merge != "" && e.Merge == it.Merge:', 'case false:'],
  ['一样的登录失败不合并', 'e.mergeKey = strings.Join([]string{rowLoginFail,', '_ = strings.Join([]string{rowLoginFail,'],
  ['合并过的行写出去后马上又新起一行（没有 10 秒窗口）', 'it.Hold = sendAt', '_ = sendAt'],
  ['请求日志、登录失败日志不限量', 'if !b.limit.allow("") {', 'if false {'],
  ['登录失败日志和请求日志共用额度', 'rowLoginFail: {limit: newPerMinute(loginFailRowsPerMinute)}}', 'rowLoginFail: {limit: newPerMinute(requestRowsPerMinute)}}'],
  ['认访客自己写的 X-Real-IP', 'if peer, err := netip.ParseAddr(host);', 'if v := strings.TrimSpace(r.Header.Get("X-Real-IP")); v != "" {\n\t\treturn v, "X-Real-IP"\n\t}\n\tif peer, err := netip.ParseAddr(host);'],
  ['认 X-Forwarded-For 最左边（访客能伪造）', 'hops[len(hops)-1]', 'hops[0]'],
  ['日志不带项目', '"项目": []string{s.projectRec}, ', ''],
  ['没配项目记录 ID 也能启动', 'if logTable != nil && !recordIDFormat.MatchString(projectRec) {', 'if false {'],
  ['日志表超了不删', 'if total <= s.logMaxRows {', 'if true {'],
  ['删旧日志不分类型（先删了登录成功等行）', 'var logTrimOrder = []any{\n', 'var logTrimOrder = []any{\n\tnil,\n'],
  ['删旧日志只删请求行（被删不掉的行塞满）', 'var logTrimOrder = []any{\n\tmap[string]any{"conjunction": "and", "conditions": []any{\n\t\tmap[string]any{"field_name": "类型", "operator": "is", "value": []string{typeLogin}},\n\t\tmap[string]any{"field_name": "结果", "operator": "is", "value": []string{resultFail}},\n\t}},\n', 'var logTrimOrder = []any{\n'],
];

const prep = mkdtempSync(join(tmpdir(), 'sso-mutants-'));
cpSync(join(here, 'selftest/go/main.go'), join(prep, 'main.go'));
mkdirSync(join(prep, 'internal/auth'), { recursive: true });
writeFileSync(join(prep, 'internal/auth/sso.go'), template);
const go = (args, cwd) => execFileSync('go', args, { cwd, stdio: 'pipe' });
go(['mod', 'init', 'selftest'], prep);
go(['get', 'github.com/coreos/go-oidc/v3@v3.21.0', 'golang.org/x/oauth2@v0.37.0'], prep);
go(['mod', 'tidy'], prep);

const only = process.argv[2];
const runs = mutants.filter(([name]) => !only || name.includes(only)).map(([name, from, to], i) => {
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
    const p = spawn('node', [join(here, 'run.mjs'), '--start', join(dir, 'app'), '--cwd', dir, '--protected', '/api/me,/api/export', '--fresh', '/api/sensitive', '--feature', 'export=导出', '--feature-route', '/api/export-sheet', '--audit-route', '/api/download', '--error-route', '/api/boom', '--report', join(dir, 'report.json')], { stdio: 'ignore' });
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
