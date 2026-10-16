# web-meta（网页元数据）

> 来源：飞书开放平台官方文档。原文保真存档。

web-meta 是网页的元数据，用于定义网页特性。**飞书中运行的网页**支持通过 web-meta 定制网页容器的表现，即使该网页不是网页应用。本系列文档介绍 web-meta 的所有属性和两种能力：**page-meta** 和 **view-meta**。

## 支持情况

| 能力 | Android | iOS | PC |
|---|---|---|---|
| page-meta | V5.15 | V5.15 | **X** |
| view-meta | V5.16 | V5.16 | **X** |

⚠️ **PC 端不支持 web-meta**。

## 通用属性

| 属性 | 类型 | 描述 |
|---|---|---|
| `name` | String | web-meta 的数据名，标识 web-meta 类型 |
| `content` | String | web-meta 数据值 |
| `lk-config` | String | web-meta 的数据配置 |

## page-meta

**只作用于当前页面**。网页容器内页面切换时，将重新应用新页面的 page-meta 配置或重置为默认。

### 方式一：`<meta>` 标签定义

```html
<html>
  <head>
    <meta name="orientation" content="landscape" lk-config>
    <script type="text/javascript" src="https://lf1-cdn-tos.bytegoofy.com/goofy/lark/op/h5-js-sdk-1.5.23.js"></script>
  </head>
</html>
```

要求：
- 在 `<head>` 中引入，且必须携带 `lk-config` 属性。
- JSSDK 必须在所有 `<meta>` 标签**之后**引入。

### 方式二：URL 参数定义 page-meta

每次 URL 变化时重新应用。**过长 URL 可能有兼容性问题**，长配置建议用 `<meta>` 标签。

1. 配置内容（JSON）：
   ```json
   {"page-meta":{"orientation":"landscape"}}
   ```
2. JSON 去掉换行后 URLEncode，用 `lk_meta` 作为参数名加到 URL：
   ```
   https://feishu.cn/?lk_meta=%7B%22page-meta%22%3A%7B%22orientation%22%3A%22landscape%22%7D%7D
   ```

## view-meta

**作为网页容器内所有页面的默认配置**。

- 当某页面已定义明确的 page-meta 时，page-meta **优先级高于** view-meta。
- `window.open` 等方式可能打开新网页容器，此时前一个容器的 view-meta **不会在新容器中生效**。
- 只支持 URL 参数定义。对一个网页容器，**只有首次加载的 URL 中的 view-meta 是有效的**。

### URL 参数定义 view-meta

```
https://feishu.cn/?lk_meta=%7B%22view-meta%22%3A%7B%22orientation%22%3A%22landscape%22%7D%7D
```

## 同时使用 meta 标签和 URL 参数定义同一 name

系统**优先使用 `<meta>` 标签的值**。

## 同系列文档

- `screen-orientation.md` — 设置屏幕方向（orientation）
- `hide-menu-items.md` — 隐藏更多菜单的功能项（hideMenuItems）
- `slide-to-close.md` — 侧滑关闭应用（slideToClose）
- `nav-color.md` — 设置导航栏颜色（navFgColor / navBgColor）
- `hide-nav-bar.md` — 隐藏导航栏（showNavBar）
- `hide-nav-buttons.md` — 隐藏导航栏左右按钮（showNavLBarBtn / showNavRBarBtn）
- `hide-bottom-nav.md` — 隐藏底部导航栏（showBottomNavBar）
- `jump-to-browser.md` — 配置网页跳转浏览器打开（URL 参数，非 web-meta 但同主题）
