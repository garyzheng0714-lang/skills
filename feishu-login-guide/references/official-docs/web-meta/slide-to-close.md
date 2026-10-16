# 侧滑关闭应用（slideToClose）

> 来源：飞书开放平台官方文档。原文保真存档。基于 web-meta 实现，先看 `00-web-meta.md`。

开启后，屏幕边缘右滑手势或点击左侧导航返回按钮时，**直接关闭网页应用**，而不是在会话历史中返回上一页。

## 支持情况

| 是否需要鉴权 | Android | iOS | PC |
|---|---|---|---|
| 不需要 | V5.31 | V5.31 | **X** |

## 默认行为

不配置时，侧滑返回会话历史中的上一级页面；若没有上一页则关闭网页应用。

## 参数

| 名称 | 类型 | 必填 | 描述 |
|---|---|---|---|
| `name` | String | 是 | 固定值：`slideToClose` |
| `content` | String | 是 | `true`（关闭应用）/ `false`（返回上一级） |

## 示例

### `<meta>` 标签（page-meta）
```html
<meta name="slideToClose" content="true" lk-config>
```

### URL 参数（page-meta）
```
https://feishu.cn/?lk_meta=%7B%22page-meta%22%3A%7B%22slideToClose%22%3A%22true%22%7D%7D
```

### URL 参数（view-meta）
```
https://feishu.cn/?lk_meta=%7B%22view-meta%22%3A%7B%22slideToClose%22%3A%22true%22%7D%7D
```

## 注意

page-meta 方式生效需在**次级页面**设置，而非主页。若会话历史不存在上一页，侧滑或点击返回按钮均退出应用。
