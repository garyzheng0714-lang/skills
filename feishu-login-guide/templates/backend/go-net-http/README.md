> ⚠️ **v4（2026-07-06）默认单应用统一登录**：只用 fbif tenant（一组凭证、2 条白名单、单按钮「使用飞书登录」，富的靠关联组织共享）。本文/模板保留的双 App（fude）能力仅供维护 legacy 存量项目，见 SKILL.md「v4 路线定调」与 references/scenarios/dual-app-legacy.md。

# Go net/http 飞书 OAuth 模板使用说明（v3，双企业 App）

## 写在哪

把 `feishu_oauth.go.template` 重命名为 `feishu_oauth.go`，放在 `internal/auth/` 下：

```
your-project/
├── cmd/server/main.go
└── internal/
    └── auth/
        └── feishu_oauth.go
```

## 怎么挂上路由

在 `main.go` 里：

```go
import "<your-module>/internal/auth"

func main() {
    mux := http.NewServeMux()

    // 挂飞书登录路由（FBIF + 富的 共 8 条 OAuth + 1 条 logout）
    mux.Handle("/auth/feishu/", auth.NewFeishuHandler())

    // 你自己的业务路由
    mux.HandleFunc("/", indexHandler)
    mux.HandleFunc("/api/me", currentUserHandler)

    log.Fatal(http.ListenAndServe(":8080", mux))
}
```

## 占位符替换

模板里有 2 个占位符，**都从密钥仓库读**（`assets/secrets/feishu-app-credentials.md`）：

| 占位符 | 替换成什么 |
|---|---|
| `{{FBIF_APP_ID}}` | FBIF 主企业 App ID（`cli_xxx`），按项目名查 |
| `{{FUDE_APP_ID}}` | 富的 App ID（多项目共享同一个） |

> App Secret **不进代码**：永远从 env 读，缺则启动时报错。
> redirect_uri 自动从 `FEISHU_REDIRECT_BASE` + 路由路径派生。

## 环境变量

`.env`（**确保已在 `.gitignore`**）：

```
FEISHU_FBIF_APP_SECRET=<FBIF App Secret>
FEISHU_FUDE_APP_SECRET=<富的 App Secret，可选；默认用代码里的 fallback>
FEISHU_REDIRECT_BASE=http://localhost:8080
# FEISHU_ALLOWED_TENANT_KEYS=tenantkey1,tenantkey2  # 可选双保险
```

## 你必须自己实现的两个函数

模板末尾有两个 `TODO`：

1. **`upsertLocalUser(*FeishuUser)`**：复用项目现有 IAM/user service，按 `tenant_key + (UserID 或 OpenID)` 关联本地用户；不要另建平行用户体系。**FBIF 和 富的 用户都进同一张 users 表，靠 tenant_key 区分**。
2. **`createSession(w, localUserID)`**：调用项目现有 session/RBAC 登录逻辑，建你自己的 session cookie。

## 验证

```bash
# 1. 启动服务
FEISHU_FBIF_APP_SECRET=xxx \
FEISHU_REDIRECT_BASE=http://localhost:8080 \
go run ./cmd/server

# 2. 在另一个终端

# FBIF 按钮模式
curl -i http://localhost:8080/auth/feishu/fbif/login

# 富的 按钮模式
curl -i http://localhost:8080/auth/feishu/fude/login

# FBIF 扫码配置
curl -i http://localhost:8080/auth/feishu/fbif/qr-config

# 富的 扫码配置
curl -i http://localhost:8080/auth/feishu/fude/qr-config
```

每个按钮模式期望看到：

```
HTTP/1.1 302 Found
Location: https://accounts.feishu.cn/open-apis/authen/v1/authorize?client_id=<对应企业>&redirect_uri=<对应tenant路径>&response_type=code&state=...
Set-Cookie: feishu_state_<tenant>_oauth=...; ...
```

每个扫码配置期望看到：

```
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Set-Cookie: feishu_state_<tenant>_qr=...; ...

{"goto":"https://passport.feishu.cn/suite/passport/oauth/authorize?client_id=<对应企业>...","state":"...","expires_in":300}
```
