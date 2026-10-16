# 消息快捷操作

> 来源：飞书开放平台官方文档。原文保真存档。

## 消息快捷操作是什么

飞书的开放能力，可连接会话消息与应用。让自己的应用出现在消息操作菜单中，用户可通过消息操作菜单快速打开应用、并将消息内容传递给应用处理。

### 用法举例
- 将对话内容快速创建为待办任务。
- 将他人在对话中反馈的问题快速沉淀至工具。
- 将群中发布的图片快速同步至企业文化相册。
- 一次性选中多条对话消息作为上下文，同步至任务评论。

### 支持的消息类型
- **文本、富文本、图片、文件、视频、卡片消息**：开发者可获取完整消息内容。
- 其他消息类型：开发者可知悉用户触发了暂不支持的消息，进行清晰区分。

### 多选限制
一次最多 **20 条** 消息。

## 配置流程

### 1. 创建应用并设计承接页

- 先开启[小程序](https://open.feishu.cn/document/home/develop-a-gadget-in-5-minutes/create-a-custom-app)或[网页](https://open.feishu.cn/document/home/integrating-web-apps-in-5-minutes/create-app-and-configuration)能力。
- 设计专属承接页：
  - 工单工具 → 工单创建页（基于消息快速创建工单）
  - 提醒工具 → 提醒创建页（对消息设置稍后提醒）
- 在承接页中对用户传递的消息进行有效处理。

### 2. 启用能力

[开发者后台](https://open.feishu.cn/app) → 小程序或网页应用能力配置页 → 添加场景：**消息快捷操作**。

填写对应承载页的 AppLink 协议。

**桌面端必须用 sidebar 模式**：
- 小程序：`mode=sidebar-semi`
- 网页应用：`mode=sidebar`

⚠️ PC 端网页应用的侧边栏模式在 **3.37+** 才能正常使用。

### 3. 场景判断

#### 小程序

```js
const options = tt.getLaunchOptionsSync()
const isFromMessageAction = options.scene === 1516
```

#### 网页应用

```js
const launchAbility = new URLSearchParams(location.search).get('required_launch_ability')
const from = new URLSearchParams(location.search).get('from')
let isFromAction = false

if (fromMobile && launchAbility) {
  isFromAction = launchAbility === 'message_action'
}
if (fromPc && from) {
  isFromAction = from === 'message_action'
}
```

## 获取消息

### 小程序

#### 1. 获取 triggerCode

```js
tt.getHostLaunchQuery({
  success(res) {
    const triggerCode = JSON.parse(decodeURIComponent(res.launchQuery)).__trigger_id__
  },
})
```

#### 2. 获取内容详情

```js
tt.getBlockActionSourceDetail({
  triggerCode: '...',
  success(res) { /* ... */ },
  fail(res) { /* ... */ },
})
```

⚠️ `tt.getTriggerContext` 在消息快捷操作场景**不支持**。

#### 3. 处理建议

仅支持获取 6 类消息详情，处理 `messages` 时**优先判断 support 状态**：
- `support === true` → `content` 返回 JSON 串。
- `support === false` → `content` 返回字符串。

返回 false 时建议在应用承载页中以 toast、文案提醒等方式明确告知用户「触发的是暂不支持的消息类型」。

### 网页应用

#### 1. 接口鉴权

调用 H5 接口前需先完成鉴权（`h5sdk.config`）。生成签名时必须**携带页面 URL 的 query**（`?` 及其后的全部内容）。

#### 2. 获取 triggerCode

```js
let launchQuery = new URLSearchParams(location.search).get("bdp_launch_query")
if (!launchQuery) return
launchQuery = JSON.parse(launchQuery)
const triggerCode = launchQuery.__trigger_id__
```

#### 3. 获取内容详情

```js
tt.getBlockActionSourceDetail({
  triggerCode,
  success(res) { /* ... */ },
  fail(res) { /* ... */ },
})
```

⚠️ `tt.getTriggerContext` 在消息快捷操作场景**不支持**。

## 完整网页应用示例（节选）

```js
window.h5sdk.config({
  appId: res.appId,
  timestamp: +res.timestamp,
  nonceStr: res.noncestr,
  signature: res.signature,
  jsApiList: ['getBlockActionSourceDetail'],
})

window.h5sdk.ready(() => {
  let launchQuery = new URLSearchParams(location.search).get("bdp_launch_query")
  if (!launchQuery) return
  launchQuery = JSON.parse(launchQuery)
  const triggerCode = launchQuery.__trigger_id__

  tt.getBlockActionSourceDetail({
    triggerCode,
    success(res) { console.log('success', res) },
    fail(res) { console.log('fail', res) },
  })
})
```
