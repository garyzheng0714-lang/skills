# 隐藏底部导航栏（showBottomNavBar）

> 来源：飞书开放平台官方文档。原文保真存档。基于 web-meta 实现，先看 `00-web-meta.md`。

控制是否隐藏页面底部的导航栏。

## 支持情况

| 是否需要鉴权 | Android | iOS | PC |
|---|---|---|---|
| 不需要 | V7.7 | V7.7 | **X** |

## 参数

| 名称 | 类型 | 必填 | 描述 |
|---|---|---|---|
| `name` | String | 是 | 固定值：`showBottomNavBar` |
| `content` | String | 是 | `true`（显示）/ `false`（隐藏） |

不配置时默认显示底部导航栏。

## 示例

`<meta>`：
```html
<meta name="showBottomNavBar" content="false" lk-config>
```

URL（page-meta）：
```
https://feishu.cn/?lk_meta=%7B%22page-meta%22%3A%7B%22showBottomNavBar%22%3A%22false%22%7D%7D
```

URL（view-meta）：
```
https://feishu.cn/?lk_meta=%7B%22view-meta%22%3A%7B%22showBottomNavBar%22%3A%22false%22%7D%7D
```
