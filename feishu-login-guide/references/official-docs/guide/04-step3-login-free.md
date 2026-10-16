# 步骤三（可选）：配置应用免登流程

> 来源：飞书开放平台官方文档。原文保真存档。**本文档对 shorturl.garyzheng.com 项目最关键**——双租户飞书内嵌免登就是基于这条链路。

如果希望应用在飞书客户端内被访问时，可获取登录用户信息、实现免登访问，则可配置免登流程。

> **以用户身份调用 OpenAPI**：如果需要 `user_access_token` 调用 OpenAPI、代表该用户身份执行/访问数据，那么额外还涉及增量授权链路，参见「端内网页应用增量授权接入指南」。

## 免登流程

如果用户已登录飞书客户端，则可直接访问客户端内的网页应用，无需二次登录。

**流程说明**：
- App ID 和 App Secret 是整个流程仅需的输入。
- 飞书客户端和接入方服务端，与认证中心的数据交换通过 HTTP 请求完成（步骤 1~2、4~5、8~9、10~11）。
- 接入方前端与飞书客户端的数据交换（步骤 3~6）通过 JSAPI 调用完成。
- 接入方前端与接入方服务端的数据交换（步骤 7、12）在你的网页应用框架内自行完成。

## requestAccess 兼容示例代码

```js
if (window.tt.requestAccess) {
  window.tt.requestAccess({
    appID: "cli_xxx",          // 网页应用 App ID
    scopeList: [],
    success: (res) => {
      const { code } = res;    // 用户授权后返回预授权码
    },
    fail: (error) => {
      const { errno, errString } = error;
      if (errno === 103) {
        // 客户端版本过低，不支持 requestAccess，降级到 requestAuthCode
        callRequestAuthCode();
      } else {
        // 用户拒绝授权或者授权失败
      }
    },
  });
} else {
  // JSSDK 版本过低，不支持 requestAccess，降级
  callRequestAuthCode();
}

function callRequestAuthCode() {
  window.tt.requestAuthCode({
    appId: "cli_xxx",
    success: (res) => {
      const { code } = res;    // 免登后返回预授权码
    },
    fail: (error) => {
      const { errno, errString } = error;
    },
  });
}
```

## 关键点

- **网页应用前端**实现免登流程需要**服务端**配合。
- **优先用 `requestAccess`**，旧客户端（errno 103）降级到 `requestAuthCode`。
- 拿到 `code` 后必须传给后端，后端用 `app_access_token` + `code` 换 `user_access_token`，再调 `user_info` 拿 `open_id` 等。
- `code` 只能使用一次。
- `user_access_token` 不应下发到前端。

## 错误码（requestAccess / requestAuthCode）

最常见的：

| errno | 含义 | 处理 |
|---|---|---|
| 103 | 客户端版本过低不支持 `requestAccess` | 降级到 `requestAuthCode` |
| 用户拒绝授权 | — | 引导用户在「关于」页开启 |
| 网络/会话问题 | — | 提示重试，必要时跳浏览器 OAuth 兜底 |

## 与 shorturl.garyzheng.com 项目相关的注意

- 双租户：两个企业各建一个自建网页应用，每个应用的 `appID` 不同，前端拿到 `tenant` 参数后用对应的 `appID` 调 `requestAccess`。
- 服务端必须用对应租户的 `app_secret` 换 token。
- 必须在飞书后台「重定向 URL」白名单内加上 `/login` 路径（即使是端内免登也要加）。
- 必须发布版本，否则用户进不来。
