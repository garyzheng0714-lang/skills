# 步骤二（可选）：鉴权调用 JSAPI

> 来源：飞书开放平台官方文档。原文保真存档。

如果 Web 项目需要调用 H5 JSAPI，需要先通过鉴权——飞书验证网页应用有权限访问的 JSAPI 范围。

## 鉴权流程

网页应用的 JSAPI 鉴权从应用页面发起。前端页面调用需要鉴权的 JSAPI 时，需在页面加载时向服务端发起请求，获取鉴权参数（`appId`、`timestamp`、`nonceStr`、`signature`）。通过这些参数前端调用 `config` 接口进行鉴权，成功后即可调用 JSAPI。

## 注意事项

- 除了 `requestAuthCode`、`closeWindow`、`requestAccess` 三个 API，**其它所有 JSAPI 在页面被调用时均需先完成鉴权**。
- 接入方前端调用 JSAPI 前的鉴权过程，需要接入方服务端配合完成。
- 接入方前端只能调用 JSAPI；如需调用服务端 API，请在接入方服务端调用。

## 鉴权策略历史

| 版本 | 策略 | 说明 |
|---|---|---|
| < V4.0 | 容器级别 | 同一容器内只需鉴权一次，整个容器生命周期内有效。 |
| V4.0 ≤ … < V5.1 | URL 级别 | URL 改变后需重新鉴权。 |
| ≥ V5.1 | 染色级别 | URL 基础上加染色机制：若当前页面的回退页面栈中出现过当前页面的父路径且该父路径鉴权通过，则该页面就可被染上同样的鉴权信息。 |

### 染色机制示例

**示例一**：pathA = `http://open.feishu.cn/home`，pathB = `http://open.feishu.cn/detail`

| 策略 | 打开 pathA | 打开 pathB |
|---|---|---|
| 容器级 | 获得 a1 | 仍可获得 a1（同容器） |
| URL 级 | 获得 a1 | **需重新鉴权**（URL 变化） |
| 染色级 | 获得 a1 | **需重新鉴权**（pathB 回退栈不含 pathB 的父路径） |

**示例二**：pathA = `http://open.feishu.cn/home`，pathC = `http://open.feishu.cn/home/route`

| 策略 | 打开 pathA | 打开 pathC |
|---|---|---|
| 容器级 | 获得 a1 | 仍可获得 a1 |
| URL 级 | 获得 a1 | **需重新鉴权** |
| 染色级 | 获得 a1 | 仍可获得 a1（pathC 回退栈含父路径 pathA） |

### 开启新容器的场景

所有策略都需确认容器是否唯一。常见开启新容器：

- 用 `openSchema` 打开新链接。
- 用 `AppLink` 打开新链接。
- `window.open(xxx, '_self')` 打开新页面时，iOS 端按浏览器标准开启新容器；Android 端在旧容器中渲染不开新容器。

## Config 接口错误码

### Errno 错误码

| errno | errString | 描述 |
|---|---|---|
| 102 | Internal error | 内部错误，咨询技术支持 |
| 104 | Invalid parameter | 参数错误，参考下面 1012 |
| 305 | Network failure | 网络失败 |
| 2601001 | Server-side data exception | 服务端数据异常 |
| 2601002 | Authentication failed | 鉴权失败，按下面 errorCode 排查 |

### errorCode 错误码

| code | 描述 | 排查建议 |
|---|---|---|
| 1012 | 参数类型错误 | 类型/值校验 |
| 1014 | 网络异常 | 检查设备网络 |
| 10001 | 网络请求失败 | 稍后重试 |
| 10002 | 网络请求返回数据格式错误 | — |
| 333430 | userId/appId 不合法 | — |
| 333440 | app 不存在 | 检查 appId |
| 333441 | **签名错误** | 见下方详细排查 |
| 333442 | 没找到有效 jsapi_ticket | 检查 appId 一致性或 ticket 过期 |
| 333443 | 签名重复 | 10 分钟内验签过，等 10 分钟 |
| 333444 | 签名过期 | 有效期 10 分钟，每次 config 前重新计算 |
| 333445 | JSAPI 未授权 | config 的 jsApiList 里添加 API |
| 333446 | JSAPI 不存在 | 查 H5 JSAPI 总览确认名字 |
| 333447 | 安全域名未设置 | 后台 → 安全设置 → H5 可信域名 |
| 333448 | 页面不在安全域名内 | 同上 |
| 333449 | 应用不可见 | 后台 → 版本管理 → 可见范围 |
| 333450 | 用户 open_id 不正确 | 检查 open_id |

### 333441 签名错误排查

实际报错示例：
```json
{
  "errorCode": 333441,
  "errorMessage": "invalid signature: signature: c872b****, jsticket: g1014****, nonce_str: zdcW****, url: https://www.example.com, timestamp: ..."
}
```

排查清单：
- `config` 内 `nonceStr` 必须**驼峰写法**。
- `nonceStr`、`timestamp` 必须与服务端生成签名时的 `noncestr`、`timestamp` **一致**。
- `appid` 必须与获取 `access_token` 时一致。
- URL 必须是页面完整 URL，包括 `http(s)://` 和 `?` 后面的 query，**不包括 `#` 后面**。**建议代码用 `location.href.split('#')[0]` 获取，不要手写**。
- 单页面应用使用 react-router/vue-router（pushState/replaceState）时，可尝试将最后一次非 router 跳转的页面 URL 传到当前页面鉴权。
- 确保 `access_token` 和 `jsapi_ticket` 没过期。
- sha1 算法。
- `verifyStr` 拼接顺序必须是：`jsapi_ticket、noncestr、timestamp、url`。
