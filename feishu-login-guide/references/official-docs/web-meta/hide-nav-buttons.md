# 隐藏导航栏按钮（showNavLBarBtn / showNavRBarBtn）

> 来源：飞书开放平台官方文档。原文保真存档。基于 web-meta 实现，先看 `00-web-meta.md`。

隐藏页面顶部左右两侧的导航按钮。

## showNavLBarBtn — 左侧导航按钮

### 注意事项

⚠️ **仅针对主页生效**。进入次级页面会恢复显示，避免使用者误认为无法后退或关闭。

### 支持情况

| 是否需要鉴权 | Android | iOS | PC |
|---|---|---|---|
| 不需要 | V6.3 | V6.3 | **X** |

### 参数

| 名称 | 类型 | 必填 | 描述 |
|---|---|---|---|
| `name` | String | 是 | 固定值：`showNavLBarBtn` |
| `content` | String | 是 | `true`（显示）/ `false`（隐藏主页左侧按钮） |

### 示例

`<meta>`：
```html
<meta name="showNavLBarBtn" content="false" lk-config>
```

URL（page-meta）：
```
https://feishu.cn/?lk_meta=%7B%22page-meta%22%3A%7B%22showNavLBarBtn%22%3A%22false%22%7D%7D
```

URL（view-meta）：
```
https://feishu.cn/?lk_meta=%7B%22view-meta%22%3A%7B%22showNavLBarBtn%22%3A%22false%22%7D%7D
```

> 由于仅主页生效，page-meta 与 view-meta URL 方式效果一致。

## showNavRBarBtn — 右侧导航按钮

### 支持情况

| 是否需要鉴权 | Android | iOS | PC |
|---|---|---|---|
| 不需要 | V6.3 | V6.3 | **X** |

### 参数

| 名称 | 类型 | 必填 | 描述 |
|---|---|---|---|
| `name` | String | 是 | 固定值：`showNavRBarBtn` |
| `content` | String | 是 | `true`（显示）/ `false`（隐藏） |

### 示例

`<meta>`：
```html
<meta name="showNavRBarBtn" content="false" lk-config>
```

⚠️ Web 页面会先经 URL 导航再解析渲染，因此默认会显示导航按钮，`<meta>` 方式隐藏主页按钮会**闪烁出现**，请自主评估对用户体验的影响。

URL（page-meta）：
```
https://feishu.cn/?lk_meta=%7B%22page-meta%22%3A%7B%22showNavRBarBtn%22%3A%22false%22%7D%7D
```

URL（view-meta）：
```
https://feishu.cn/?lk_meta=%7B%22view-meta%22%3A%7B%22showNavRBarBtn%22%3A%22false%22%7D%7D
```
