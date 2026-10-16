// 自测用的最小 Express 项目：照 README 的接法挂上模板，供 selftest.sh 跑合规测试。
import express from 'express';
import { join } from 'node:path';
import { createSso, FileStore, identityKey } from './sso.ts';

const sso = await createSso({
  store: new FileStore(join(process.env.CONFORMANCE_DATA_DIR ?? '.', 'sso.json')),
  onLogin: async (id) => identityKey(id),
});

const app = express();
app.use(sso.routes);
app.use(express.json());
app.get('/api/export', sso.requireUser, (req, res) => {
  res.send('export for ' + (req as typeof req & { ssoUser: { id: string } }).ssoUser.id);
});
app.get('/api/sensitive', sso.requireFreshUser, (_req, res) => {
  res.send('ok');
});
app.listen(Number(process.env.PORT), '127.0.0.1');
