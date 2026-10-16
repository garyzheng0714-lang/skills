# 配置更多菜单中的功能（hideMenuItems）

> 来源：飞书开放平台官方文档。原文保真存档。基于 web-meta 实现，先看 `00-web-meta.md`。

在网页「更多菜单」面板中，配置部分功能入口的启停状态（置灰）。例如屏蔽「转发」和「复制链接」。

## 支持情况

| 是否需要鉴权 | Android | iOS | PC |
|---|---|---|---|
| 不需要 | V5.27 | V5.27 | **X** |

## 注意事项

- **仅支持页面级别**，每次重新加载页面会读取最新配置。
- 想在页面加载前生效 → 用 page-meta 的 URL 方式。
- **不支持 view-meta URL 方式**。

## 参数

| 名称 | 类型 | 必填 | 描述 |
|---|---|---|---|
| `name` | String | 是 | 固定值：`hideMenuItems` |
| `content` | String | 是 | 期望屏蔽菜单功能项的唯一标识，逗号分隔。示例：`"sendToChat,shareViaOtherApp"` |

## 支持置灰的菜单项

| 标识 | 名称 | 功能 |
|---|---|---|
| `sendToChat` | 发送至会话 | 分享当前网页到会话 |
| `shareViaOtherApp` | 微信 | 分享网页链接至微信等三方应用 |
| `copyLink` | 复制链接 | 复制当前页面链接到系统剪贴板 |
| `openInBrowser` | 浏览器打开 | 在外部浏览器中打开当前页面 |

## 示例

### `<meta>` 标签（page-meta）
```html
<meta name="hideMenuItems" content="sendToChat,shareViaOtherApp" lk-config>
```

### URL 参数（page-meta）
```
https://feishu.cn/?lk_meta=%7B%22page-meta%22%3A%7B%22hideMenuItems%22%3A%22sendToChat%2CcopyLink%22%7D%7D
```
