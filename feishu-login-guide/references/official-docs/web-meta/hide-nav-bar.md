# 隐藏导航栏（showNavBar）

> 来源：飞书开放平台官方文档。原文保真存档。基于 web-meta 实现，先看 `00-web-meta.md`。

控制是否在页面顶部隐藏导航栏。**顶部状态栏不在控制范围内**，遵循系统默认：iOS 状态栏与内容视图重叠；Android 状态栏在内容视图上方。

## 支持情况

| 是否需要鉴权 | Android | iOS | PC |
|---|---|---|---|
| 不需要 | V6.3 | V6.3 | **X** |

## 参数

| 名称 | 类型 | 必填 | 描述 |
|---|---|---|---|
| `name` | String | 是 | 固定值：`showNavBar` |
| `content` | String | 是 | `true`（显示）/ `false`（隐藏） |

不配置时默认显示导航栏。

## 示例

`<meta>`：
```html
<meta name="showNavBar" content="false" lk-config>
```

URL（page-meta）：
```
https://feishu.cn/?lk_meta=%7B%22page-meta%22%3A%7B%22showNavBar%22%3A%22false%22%7D%7D
```

URL（view-meta）：
```
https://feishu.cn/?lk_meta=%7B%22view-meta%22%3A%7B%22showNavBar%22%3A%22false%22%7D%7D
```
