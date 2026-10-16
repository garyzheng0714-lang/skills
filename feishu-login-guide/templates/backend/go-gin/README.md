> ⚠️ **v4（2026-07-06）默认单应用统一登录**：只用 fbif tenant（一组凭证、2 条白名单、单按钮「使用飞书登录」，富的靠关联组织共享）。本文/模板保留的双 App（fude）能力仅供维护 legacy 存量项目，见 SKILL.md「v4 路线定调」与 references/scenarios/dual-app-legacy.md。

# Go + Gin 飞书 OAuth 模板（v3，双企业 App）

## 写在哪

`internal/auth/feishu_oauth.go`

## 挂载

```go
import "<your-module>/internal/auth"

func main() {
    r := gin.Default()
    auth.RegisterFeishuRoutes(r)
    r.GET("/", indexHandler)
    r.Run(":8080")
}
```

## 替换、环境变量、你要补的两个 TODO 函数

参考 `templates/backend/go-net-http/README.md`，逻辑完全一致，只是用 Gin 的 API（`c.Cookie`、`c.SetCookie`、`c.Redirect`）。

## 验证

```bash
FEISHU_FBIF_APP_SECRET=xxx \
FEISHU_REDIRECT_BASE=http://localhost:8080 \
go run ./cmd/server

# FBIF 按钮模式
curl -i http://localhost:8080/auth/feishu/fbif/login
# 期望 302 + Location 含 accounts.feishu.cn/.../authorize?client_id=<FBIF_APP_ID>...

# 富的 按钮模式
curl -i http://localhost:8080/auth/feishu/fude/login
# 期望 302 + Location 含 client_id=<富的 App ID>（从密钥仓库查）

# FBIF 扫码配置
curl -i http://localhost:8080/auth/feishu/fbif/qr-config
# 期望 200 + JSON 含 goto (passport.feishu.cn) + state

# 富的 扫码配置
curl -i http://localhost:8080/auth/feishu/fude/qr-config
```
