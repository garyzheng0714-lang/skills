# Python + FastAPI 飞书 OAuth 模板

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

参考 `templates/backend/go-net-http/README.md`。

## 验证

```bash
FEISHU_APP_SECRET=xxx uvicorn app.main:app --port 8080
curl -i http://localhost:8080/auth/feishu/login
```

期望 302 + `Location` 头 + `Set-Cookie: feishu_oauth_state=...`。
