# Go + Gin 飞书 OAuth 模板

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
FEISHU_APP_SECRET=xxx go run ./cmd/server
curl -i http://localhost:8080/auth/feishu/login
```

期望 302 + `Location` 头跳到 `accounts.feishu.cn/open-apis/authen/v1/authorize?...`。
