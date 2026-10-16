// 自测用的最小 Express 项目：照 README 的接法挂上模板，供 selftest.sh 跑合规测试。
import express from 'express';
import { join } from 'node:path';
import { audit, createSso, FileStore, hasFeature, identityKey } from './sso.ts';

const sso = await createSso({
  store: new FileStore(join(process.env.CONFORMANCE_DATA_DIR ?? '.', 'sso.json')),
  onLogin: async (id) => identityKey(id),
  // 账号表里「导出」这一列勾上的账号才能用导出表格。
  features: [{ key: 'export', column: '导出' }],
});

const app = express();
app.use(sso.logRequests);
app.use(sso.routes);
app.use(express.json());
app.get('/api/export', sso.requireUser, (req, res) => {
  res.send('export for ' + (req as typeof req & { ssoUser: { id: string } }).ssoUser.id);
});
app.get('/api/export-sheet', sso.requireUser, (req, res) => {
  if (!hasFeature(req, 'export')) {
    res.status(403).json({ error: 'feature_required' });
    return;
  }
  res.send('sheet');
});
app.get('/api/sensitive', sso.requireFreshUser, (_req, res) => {
  res.send('ok');
});
// 下载要留痕：调 audit，成功的 GET 也记进日志。
app.get('/api/download', sso.requireUser, (req, res) => {
  audit(req);
  res.send('file');
});
// 合规测试用来看 5xx 有没有记进日志。
app.get('/api/boom', (_req, res) => {
  res.status(500).send('boom');
});
const server = app.listen(Number(process.env.PORT), '127.0.0.1');
// 退出前把待写队列落盘：先不再收新请求，再等 sso.shutdown()。
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.once(sig, () => {
    server.close();
    void sso.shutdown().finally(() => process.exit(0));
  });
}
