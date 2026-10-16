> ⚠️ **v4（2026-07-06）默认单应用统一登录**：只用 fbif tenant（一组凭证、2 条白名单、单按钮「使用飞书登录」，富的靠关联组织共享）。本文/模板保留的双 App（fude）能力仅供维护 legacy 存量项目，见 SKILL.md「v4 路线定调」与 references/scenarios/dual-app-legacy.md。

# Python + FastAPI 飞书 OAuth 模板（v3，双企业 App）

## 依赖

```bash
pip install fastapi uvicorn httpx pydantic
```

## 写在哪

`app/middleware/feishu_oauth.py`

## 挂载

```python
from fastapi import FastAPI
from app.middleware.feishu_oauth import feishu_router

app = FastAPI()
app.include_router(feishu_router)

@app.get("/")
async def index():
    return {"hello": "world"}
```

## 占位符 / 环境变量 / TODO 函数

参考 `templates/backend/go-net-http/README.md`。命名一致：
- `{{FBIF_APP_ID}}` 占位符
- `FEISHU_FBIF_APP_SECRET` / `FEISHU_FUDE_APP_SECRET` / `FEISHU_REDIRECT_BASE` 环境变量

## 验证

```bash
FEISHU_FBIF_APP_SECRET=xxx \
FEISHU_REDIRECT_BASE=http://localhost:8080 \
uvicorn app.main:app --port 8080

curl -i http://localhost:8080/auth/feishu/fbif/login
curl -i http://localhost:8080/auth/feishu/fude/login
curl -i http://localhost:8080/auth/feishu/fbif/qr-config
curl -i http://localhost:8080/auth/feishu/fude/qr-config
```

每个按钮模式期望 302 + Location 跳到 `accounts.feishu.cn/.../authorize?client_id=<对应企业>...`，且 `Set-Cookie: feishu_state_<tenant>_oauth=...`。
