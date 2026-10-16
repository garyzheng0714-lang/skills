> ⚠️ **v4（2026-07-06）默认单应用统一登录**：只用 fbif tenant（一组凭证、2 条白名单、单按钮「使用飞书登录」，富的靠关联组织共享）。本文/模板保留的双 App（fude）能力仅供维护 legacy 存量项目，见 SKILL.md「v4 路线定调」与 references/scenarios/dual-app-legacy.md。

# Node + Express + TypeScript 飞书 OAuth 模板（v3，双企业 App）

## 依赖

```bash
npm i express cookie-parser
npm i -D @types/express @types/cookie-parser
```

> Node 18+ 内置 `fetch`，模板直接用。Node 16- 装 `node-fetch` 并 import。
> `crypto` 是 Node 标准库，不需要装。

## 写在哪

`src/middleware/feishuOauth.ts`

## 挂载

```typescript
import express from 'express';
import cookieParser from 'cookie-parser';
import { feishuRouter } from './middleware/feishuOauth';

const app = express();
app.use(cookieParser());
app.use(feishuRouter);  // 模板内部已包含 /auth/feishu 完整路径

app.get('/', (req, res) => res.send('hello'));
app.listen(8080);
```

## 占位符 / 环境变量 / 你要补的 TODO

参考 `templates/backend/go-net-http/README.md`。命名一致：
- `{{FBIF_APP_ID}}` 占位符
- `FEISHU_FBIF_APP_SECRET` / `FEISHU_FUDE_APP_SECRET` / `FEISHU_REDIRECT_BASE` 环境变量

## 验证

```bash
FEISHU_FBIF_APP_SECRET=xxx \
FEISHU_REDIRECT_BASE=http://localhost:8080 \
npx ts-node src/server.ts

curl -i http://localhost:8080/auth/feishu/fbif/login
curl -i http://localhost:8080/auth/feishu/fude/login
curl -i http://localhost:8080/auth/feishu/fbif/qr-config
curl -i http://localhost:8080/auth/feishu/fude/qr-config
```

每个按钮模式期望 302 + Location 跳到 `accounts.feishu.cn/.../authorize?client_id=<对应企业>...`，且 `Set-Cookie: feishu_state_<tenant>_oauth=...`。
