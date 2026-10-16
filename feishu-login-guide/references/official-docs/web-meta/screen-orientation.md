# 设置屏幕方向（orientation）

> 来源：飞书开放平台官方文档。原文保真存档。基于 web-meta 实现，先看 `00-web-meta.md`。

设定网页在屏幕展示的方式：强制横屏 / 强制竖屏 / 跟随系统。

## 支持情况

| 是否需要鉴权 | Android | iOS | PC |
|---|---|---|---|
| 不需要 | V5.15 | V5.15 | **X** |

## 注意事项

- **不支持 Pad 设备**。
- 与网页内横竖屏切换按钮（锁定屏幕后旋转设备方向出现的按钮）功能无关。

## 参数

| 名称 | 类型 | 必填 | 描述 |
|---|---|---|---|
| `name` | String | 是 | 固定值：`orientation` |
| `content` | String | 是 | `default`（iOS 默认竖屏，其他端跟随系统）/ `portrait`（强制竖屏）/ `landscape`（强制横屏） |

如果不通过 web-meta 设定，默认跟随系统设置。

## 示例

### `<meta>` 标签（page-meta）
```html
<meta name="orientation" content="landscape" lk-config>
```

### URL 参数（page-meta）
```
https://feishu.cn/?lk_meta=%7B%22page-meta%22%3A%7B%22orientation%22%3A%22landscape%22%7D%7D
```

### URL 参数（view-meta，对整个应用生效）
```
https://feishu.cn/?lk_meta=%7B%22view-meta%22%3A%7B%22orientation%22%3A%22landscape%22%7D%7D
```
