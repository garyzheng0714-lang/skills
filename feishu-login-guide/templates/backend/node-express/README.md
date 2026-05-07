# Node + Express + TypeScript 飞书 OAuth 模板

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
app.use('/auth/feishu', feishuRouter);

app.get('/', (req, res) => res.send('hello'));
app.listen(8080);
```

## 占位符 / 环境变量 / 你要补的 TODO

参考 `templates/backend/go-net-http/README.md`。

## 验证

```bash
FEISHU_APP_SECRET=xxx npx ts-node src/server.ts
curl -i http://localhost:8080/auth/feishu/login
```

期望 302 + `Location` 头跳 `accounts.feishu.cn/open-apis/authen/v1/authorize?...`，且 `Set-Cookie: feishu_oauth_state=...`。
