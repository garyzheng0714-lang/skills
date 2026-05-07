# Go net/http 飞书 OAuth 模板使用说明

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

    // 挂飞书登录路由
    mux.Handle("/auth/feishu/", auth.NewFeishuHandler())

    // 你自己的业务路由
    mux.HandleFunc("/", indexHandler)
    mux.HandleFunc("/api/me", currentUserHandler)

    log.Fatal(http.ListenAndServe(":8080", mux))
}
```

## 占位符替换

模板里的两个占位符：

| 占位符 | 替换成什么 |
|---|---|
| `{{APP_ID}}` | 阶段 1 拿到的 App ID（`cli_xxx`） |
| `{{REDIRECT_URI}}` | 阶段 2 配的回调 URL，**必须字符级一致** |

两个占位符可以直接写代码，因为不是机密。

## 环境变量

`.env`（**确保已在 `.gitignore`**）：

```
FEISHU_APP_SECRET=<阶段1拿到的Secret>
```

## 你必须自己实现的两个函数

模板末尾有两个 `TODO`：

1. **`upsertLocalUser(*FeishuUser)`**：按 `OpenID` 关联本地用户表
2. **`createSession(w, localUserID)`**：建你自己的 session cookie

这两块没法通用——取决于你用什么数据库、什么 session 方案。模板里有示例代码可以参考。

## 验证

```bash
# 1. 启动服务
FEISHU_APP_SECRET=xxx go run ./cmd/server

# 2. 在另一个终端
curl -i http://localhost:8080/auth/feishu/login
```

期望看到：

```
HTTP/1.1 302 Found
Location: https://accounts.feishu.cn/open-apis/authen/v1/authorize?client_id=cli_xxx&redirect_uri=...&response_type=code&state=AbCd1234EfGh5678
Set-Cookie: feishu_oauth_state=AbCd1234EfGh5678; ...
```

如果看到这个返回，把 `Location` URL 复制到浏览器，应该跳到飞书授权页。
