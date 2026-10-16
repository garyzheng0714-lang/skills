# 配置重定向 URL

> 来源：飞书开放平台官方文档。原文保真存档。**对 shorturl 项目至关重要**：双租户登录回调必须在白名单内。

开放平台通过 OAuth 2.0 协议授权用户登录并向应用后台提供资源和信息。授权登录过程中开放平台会对网页进行安全校验，**只有配置在应用重定向 URL 列表内的网页地址可以通过校验**。

## 必须配置的场景

### 场景 1：服务端用 user_access_token 调 OpenAPI

需要先[获取授权码](https://open.feishu.cn/document/common-capabilities/sso/api/obtain-oauth-code)，再获取 `user_access_token`。获取授权码时必须传入 `redirect_uri`。

流程：
1. 请求授权登录 → 加载授权登录页面 → 用户授权。
2. 页面自动重定向到预设 `redirect_uri`，URL 的 query 携带登录预授权码 `code`：
   ```
   https://{redirect_uri}?code=1yxlUSU8Rf+7B32HY3HR7g
   ```

**说明**：可在网页应用中构建一个回调页面作为 `redirect_uri`。用户授权后前端页面自动重定向到回调页面，并将 `code` 传入应用后端获取 `user_access_token`。

为确保你的应用可以成功重定向并获取登录预授权码 `code`，**`redirect_uri` 参数值必须同步设置为应用的「重定向 URL」**。

不在重定向 URL 列表内的 URL 进行授权登录会重定向到失败页面：
```json
{
  "code": 2000,
  "message": "redirect_uri unmatch"
}
```

### 场景 2：前端调 requestAccess 获取临时登录凭证 code

任何需要调用 `tt.requestAccess` 获取临时登录凭证 `code` 的前端页面，开放平台都会校验合法性。**只有在重定向 URL 列表内的地址可以成功获取 code**。

## 操作步骤

1. 登录[开发者后台](https://open.feishu.cn/app)。
2. 进入需要配置的应用详情页。
3. 左侧导航点击 **安全设置**。
4. 在 **重定向 URL** 区域，输入 URL 并点击 **添加**。

**说明**：一个应用内最多可添加 **300 个** 重定向 URL。

## 常见问题

### URL 包含 `?` 或 `#` 后缀时如何设置

重定向 URL 列表内需要**完整路径**，但路径后的 `?` 或 `#` 后缀**可不包含**——这些后缀不会生效。例如 `http://www.example.com/#/index` 作为重定向 URL，实际生效的是 `http://www.example.com`。

示例：
- 调用「获取授权登录授权码」接口时 `redirect_uri=http://www.example.com/#/index` → 后台添加 `http://www.example.com` 即可。
- 客户端调 `requestAccess` 获取 code → 建议用 `window.location.href.split('?')[0].split('#')[0]` 获取重定向 URL。

### 是否支持配置动态路由下的 URL

**不支持。**

## 对 shorturl 项目的具体要求

FBIF 应用必须加：
- `https://shorturl.garyzheng.com/login`
- `https://shorturl.garyzheng.com/auth/feishu/fbif/callback`
- `https://shorturl.garyzheng.com/auth/feishu/fbif/qr-callback`

富的 应用必须加：
- `https://shorturl.garyzheng.com/login`
- `https://shorturl.garyzheng.com/auth/feishu/fude/callback`
- `https://shorturl.garyzheng.com/auth/feishu/fude/qr-callback`

⚠️ **`/login` 必须加入两个应用**，因为飞书内嵌的 `requestAccess` 会在 `/login` 页面调用，需要通过安全校验。
