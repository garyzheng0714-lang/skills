# 如何高效配置移动端主页

> 来源：飞书开放平台官方文档。原文保真存档。**核心建议：不要把主页 URL 设为 `open.feishu.cn/open-apis/authen/v1/authorize`，性能差。**

## 背景

把移动端主页设为 `https://open.feishu.cn/open-apis/authen/v1/authorize?app_id={APPID}&redirect_uri={REDIRECT_URI}&scope={SCOPE}&state={STATE}` 可快速实现免登访问。

涵盖两种场景：
1. 飞书客户端工作台中打开网页应用免登。
2. 浏览器打开网页应用免登。

**问题**：
- 用户每次打开都会发生一次重定向，且向 `open.feishu.cn` 域名发起接口请求 → **增加主页加载时间**。
- 重定向次数增加 → **整个页面加载链路出现异常的概率增大**。

## 推荐做法

### 1. 选择免登方式

- ✅ **推荐**：用 `requestAccess`（移动端、PC 端可用，浏览器不可用；V6.9.0 前用 `requestAuthCode`）。
- ❌ **不推荐**：用「获取授权登录授权码」接口（即主页配 `open.feishu.cn/open-apis/authen/v1/authorize`），仅适用于主页也需身份认证的场景。

### 2. 合理管理登录态

#### 移动端主页地址配置为应用自身的域名

直接配自身域名可降低重定向次数和接口请求次数。

#### 避免每次打开都请求临时授权码

如需获取飞书用户信息，**用 cookie 管理登录态**。在 cookie 有效期内只需首次打开应用时走免登逻辑，减少非首次访问的耗时。

飞书用户**切换租户或重新登录**时，会清空本地所有 cookie（应用上一次配置的 cookie 也会被清除）。用户打开网页应用时会重新走免登逻辑、配置新的业务 cookie——无需担心用户态信息有误。

#### 接口分离

建议检查登录态的接口和用于免登的 callback 接口做好接口分离，各自负责各自的业务逻辑。

## 总结

- 移动端首页地址直接配业务自身的域名。
- 无论选哪种免登方式，都要做好登录态管理，区分首次和非首次打开。

## 示例代码（节选）

### 后端：处理免登请求，返回 user_access_token

```js
const LJ_TOKEN_KEY = 'lk_token'

async function getUserAccessToken(ctx) {
  const accessToken = ctx.session.userinfo
  const lkToken = ctx.cookies.get(LJ_TOKEN_KEY) || ''
  if (accessToken && accessToken.access_token && lkToken === accessToken.access_token) {
    ctx.body = serverUtil.okResponse(accessToken)
    return
  }
  const code = ctx.query["code"] || ""

  // 1. 拿 app_access_token
  const internal = await axios.post(
    "https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal",
    { app_id: serverConfig.config.appId, app_secret: serverConfig.config.appSecret },
    { headers: { "Content-Type": "application/json" } }
  )
  const app_access_token = internal.data.app_access_token || ""

  // 2. 用 code 换 user_access_token
  const authenv1 = await axios.post(
    "https://open.feishu.cn/open-apis/authen/v1/access_token",
    { grant_type: "authorization_code", code },
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Authorization": "Bearer " + app_access_token,
      },
    }
  )

  const newAccessToken = authenv1.data.data
  if (newAccessToken) {
    ctx.session.userinfo = newAccessToken
    serverUtil.setCookie(ctx, LJ_TOKEN_KEY, newAccessToken.access_token || '')
  }
  ctx.body = serverUtil.okResponse(newAccessToken)
}
```

### 前端：免登处理

```js
const LJ_TOKEN_KEY = 'lk_token'

export async function handleUserAuth(complete) {
  let lj_tokenString = Cookies.get(LJ_TOKEN_KEY) || ""
  if (lj_tokenString.length > 0) {
    // 已登录，请求后端验证
    requestUserAccessToken("", complete)
  } else {
    if (!window.h5sdk) { complete(); return }
    window.h5sdk.ready(() => {
      if (window.tt.requestAccess) {
        window.tt.requestAccess({
          appID: clientConfig.appId,
          scopeList: [],
          success: (res) => {
            const { code } = res
            if (code) requestUserAccessToken(code, complete)
            else complete()
          },
          fail: (error) => {
            if (error.errno === 103) callRequestAuthCode(complete)
            else complete()
          },
        })
      } else {
        callRequestAuthCode(complete)
      }
    })
  }
}

function callRequestAuthCode(complete) {
  window.tt.requestAuthCode({
    appId: clientConfig.appId,
    success: (info) => {
      if (info.code) requestUserAccessToken(info.code, complete)
      else complete()
    },
    fail: () => complete(),
  })
}
```
