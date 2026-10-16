# iOS 跨域场景无法正确存取 cookie

> 来源：飞书开放平台官方文档。原文保真存档。

## 问题表现

网页应用开发者在页面 A 中引用了页面 B（A 和 B 使用了不同域名），这时页面 B 被认为是第三方链接，产生跨域访问。在 B 页面中进行 cookie 读取或设置操作会失败。

常见场景：网页中内嵌了云文档链接、问卷链接等。

## 问题原因

飞书在 iOS 上使用 **WKWebview** 加载网页。苹果 2017 年发布的 [ITP 策略](https://webkit.org/blog/7675/intelligent-tracking-prevention/) 开始限制 WKWebview 上的第三方 cookie 使用；2020 年起[完全阻止第三方 cookie](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)。

iOS 系统设置 → Safari 浏览器 → 预留了关闭跨域 cookie 限制的开关，**但对其他 App 无效**。

## 解决方案

### 场景一：拥有跨域页面开发权限

一般是一个公司内的两个业务系统，域名不同但账号体系相同，开发者同时具有两个页面的代码权限。

**方案：通过服务端中转数据**——在页面 A 中将需要传递的数据存储在服务端，生成信息加密标识，通过页面间通信将加密标识传递给页面 B，然后页面 B 请求服务端直接获取信息。

#### postMessage

[window.postMessage()](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage) 可安全实现对象之间的跨域通信。

#### URL 传值

在页面 A 中生成一份加密的 `access_token`，加载 iframe 链接时通过 URL 查询参数带给 iframe；iframe 中代码拿着加密 token 请求服务端接口完成身份验证并获取数据。

### 场景二：跨域页面为第三方页面

产生跨域 cookie 问题的页面为第三方页面（自建应用想要内嵌展示云文档、问卷等）。

这类场景**无法通过修改内嵌页代码兼容**。

**方案：用新页面加载第三方页面**：
- [window.location.href](https://developer.mozilla.org/en-US/docs/Web/API/Location/href)
- [window.open()](https://developer.mozilla.org/en-US/docs/Web/API/Window/open)

## 与登录流程的关联

shorturl 项目的 v3.1.1 登录稳定性补丁里强调"OAuth state cookie 和 session cookie 都可能丢"，本质上就是飞书内嵌 + iOS WKWebview + 跨站 cookie 限制的连锁反应。处理思路一致：

- 不能把关键身份信息只挂在 cookie 上。
- 用签名 state 自包含、用 URL hash 兜底回传 session token、`X-Session-Token` header 多通道。
- 详见 SKILL.md「2026-05 登录事故复盘」。
