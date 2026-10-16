# 聊天框「+」菜单（加号菜单）

> 来源：飞书开放平台官方文档。原文保真存档。

## 什么是聊天框「+」菜单

允许应用在飞书会话输入框的「+」中配置入口，提供便捷的交互路径。**小程序应用、网页应用均可开启**（网页应用从 **3.39 版本**开始支持）。

## 配置流程

### 1. 创建应用并设计承接页

- 先开启[小程序](https://open.feishu.cn/document/home/develop-a-gadget-in-5-minutes/create-a-custom-app)或[网页](https://open.feishu.cn/document/home/integrating-web-apps-in-5-minutes/create-app-and-configuration)能力。
- 基于小程序或网页应用设计专属承接页：
  - 问卷工具 → 问卷创建页
  - 提醒工具 → 提醒任务设置页
  - 天气查询 → 搜索查询页

### 2. 启用能力

[开发者后台](https://open.feishu.cn/app) → 小程序或网页应用能力配置页 → 添加场景：**聊天框「+」菜单**。

填写对应承载页的 AppLink 协议。

**桌面端必须用 sidebar 模式**：
- 小程序：`mode=sidebar-semi`
  ```
  https://applink.feishu.cn/client/mini_program/open?appId=xxx&mode=sidebar-semi&path=pages%2Fplus%2Findex
  ```
- 网页应用：`mode=sidebar`
  ```
  https://applink.feishu.cn/client/web_app/open?appId=xxx&mode=sidebar
  ```

启用能力并发布新版本后，具备该应用可见性的用户即可在会话加号菜单内看到入口。

## 场景判断

判断是通过加号菜单打开应用：

### 小程序

```js
const options = tt.getLaunchOptionsSync()
const isFromPlusMenu = (options.scene == 1509 || options.scene == 1510)
```

### 网页应用

```js
const searchParams = new URLSearchParams(location.search)
const launchAbility = searchParams.get('required_launch_ability')
const from = searchParams.get('from')
let isFromPlus = false

if (fromMobile && launchAbility) {
  isFromPlus = launchAbility === 'chat_action'
}
if (fromPc && from) {
  isFromPlus = from === 'plus_menu_p2p' || from === 'plus_menu_group'
}
```

## 发送卡片

### 小程序

#### 1. 获取 triggerCode

```js
tt.getHostLaunchQuery({
  success(res) {
    const triggerCode = JSON.parse(decodeURIComponent(res.launchQuery)).__trigger_id__
  },
})
```

#### 2. 发送卡片

```js
tt.sendMessageCard({
  triggerCode: 'abc',
  openChatIDs: ['xxxx', 'xxxx'],   // triggerCode 和 openChatIDs 二选一
  cardContent: {
    update_multi: false,
    card: { /* card content */ },
  },
})
```

⚠️ iOS 注意：5.26 之前优先使用 `triggerCode`，5.26 及之后优先使用 `openChatIDs`。

#### 3. 拿目标会话

```js
tt.getTriggerContext({
  triggerCode: 'abc',
  success(res) {
    const openChatId = res.openChatId
  },
})
```

调用 `getTriggerContext` 前需先[登录](https://open.feishu.cn/document/uYjL24iN/uYzMuYzMuYzM)。

### 网页应用

#### 1. 接口鉴权

调用 H5 接口前需先完成鉴权（`h5sdk.config`，签名生成方法见 H5JSSDK 鉴权接口）。

生成签名时必须**携带页面 URL 的 query**（`?` 及其后的全部内容）。

#### 2. 获取 triggerCode

```js
let launchQuery = new URLSearchParams(location.search).get("bdp_launch_query")
if (!launchQuery) return
launchQuery = JSON.parse(launchQuery)
const triggerCode = launchQuery.__trigger_id__
```

#### 3. 发送卡片

跟小程序一致，使用 `tt.sendMessageCard`。

⚠️ PC 端网页应用的侧边栏模式在 **3.37+** 才能正常使用。

## 完整网页应用示例（节选）

```js
window.h5sdk.ready(() => {
  let launchQuery = new URLSearchParams(location.search).get("bdp_launch_query")
  if (!launchQuery) return
  launchQuery = JSON.parse(launchQuery)
  const triggerCode = launchQuery.trigger_id

  // 方式一：直接用 triggerCode 发送
  tt.sendMessageCard({
    triggerCode,
    cardContent: { update_multi: false, card: { /* ... */ } },
  })

  // 方式二：先拿 openChatId 再发
  tt.getTriggerContext({
    triggerCode,
    success(res) {
      tt.sendMessageCard({
        openChatIDs: [res.openChatId],
        cardContent: { update_multi: false, card: { /* ... */ } },
      })
    },
  })
})
```
