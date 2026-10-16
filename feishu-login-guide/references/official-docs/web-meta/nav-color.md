# 设置导航栏颜色（navFgColor / navBgColor）

> 来源：飞书开放平台官方文档。原文保真存档。基于 web-meta 实现，先看 `00-web-meta.md`。

- `navFgColor`：设置导航栏前景颜色（按钮、标题颜色）。
- `navBgColor`：设置导航栏背景颜色。

## 支持情况

| 能力 | Android | iOS | PC |
|---|---|---|---|
| navFgColor | V6.3 | V6.3 | **X** |
| navBgColor | V6.3 | V6.3 | **X** |

均不需要鉴权。

## navFgColor — 前景颜色

### 参数

| 名称 | 类型 | 必填 | 描述 |
|---|---|---|---|
| `name` | String | 是 | 固定值：`navFgColor` |
| `content` | String | 是 | 仅支持白色 / 黑色：白 `FFFFFFFF`、`FFFFFF`、`#FFFFFFFF`、`#FFFFFF`；黑 `FF000000`、`000000`、`#FF000000`、`#000000` |

**深色模式适配**：用 `浅色,深色` 格式，如 `FF000000,FFFFFFFF`。仅一个值则不随外观模式变化。

### 示例

`<meta>`：
```html
<meta name="navFgColor" content="FF000000,FFFFFFFF" lk-config>
```

URL（page-meta）：
```
https://feishu.cn/?lk_meta=%7B%22page-meta%22%3A%7B%22navFgColor%22%3A%22FF000000%2CFFFFFFFF%22%7D%7D
```

URL（view-meta）：
```
https://feishu.cn/?lk_meta=%7B%22view-meta%22%3A%7B%22navFgColor%22%3A%22FF000000%2CFFFFFFFF%22%7D%7D
```

## navBgColor — 背景颜色

### 参数

| 名称 | 类型 | 必填 | 描述 |
|---|---|---|---|
| `name` | String | 是 | 固定值：`navBgColor` |
| `content` | String | 是 | 十六进制颜色，格式 `AARRGGBB`/`RRGGBB`/`#AARRGGBB`/`#RRGGBB`。示例：`FF1456F0`、`1456F0`、`#FF1456F0`、`#1456F0` |

**深色模式**：`浅色,深色`，如 `FF1456F0,FF000000`。

### 示例

`<meta>`：
```html
<meta name="navBgColor" content="FF1456F0,FF000000" lk-config>
```

URL（page-meta）：
```
https://feishu.cn/?lk_meta=%7B%22page-meta%22%3A%7B%22navBgColor%22%3A%22FF1456F0%2CFF000000%22%7D%7D
```

URL（view-meta）：
```
https://feishu.cn/?lk_meta=%7B%22view-meta%22%3A%7B%22navBgColor%22%3A%22FF1456F0%2CFF000000%22%7D%7D
```
