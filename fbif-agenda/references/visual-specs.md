# FBIF2026 议程模板 — 视觉规格参考

## 论坛主题色（SOP 标准，不要随意更改）

| 论坛 | forumKey | 颜色 | 色调 |
|---|---|---|---|
| 乳品研发创新 | rupin | `#799FC4` | 浅蓝 |
| 饮料研发创新 | yinliao | `#2D9F91` | 青绿 |
| 零食与烘焙研发创新 | lingshi | `#F77F69` | 橙红 |
| 功能性食品研发创新 | gongneng | `#769687` | 灰绿 |
| 首席选品官论坛 | qudao | `#894B52` | 暗红 |
| 包装创新 | baozhuang | `#4B858E` | 深青 |
| 营销创新 | yingxiao | `#7564A0` | 紫 |
| 产品开发论坛 | chanpin | `#606A9A` | 藏蓝 |
| 全体大会 | quanti | `#005CB2` | 宝蓝 |
| Wow Food | wow | `#FFD100` | 亮黄 |

如需修改颜色，3 处都要改：
1. `body.forum-xxx { --forum-color-1: ... }`（议程页主题色）
2. `.guest-card.forum-xxx .guest-card-title { background: ... }`（嘉宾名单卡片）
3. `.footer-tab[data-forum="xxx"] { background: ... }`（底部导航）

## 字号规格

### 嘉宾名单页

| 元素 | 字号 | 字体 |
|---|---|---|
| 大标题"分享嘉宾名单" | 34pt | AlibabaPuHuiTi Bold |
| 卡片标题（论坛名） | 14pt | AlibabaPuHuiTi Bold |
| 嘉宾信息（姓名/职位/公司） | 7pt | AlibabaPuHuiTi R/B |

### 议程页

| 元素 | 字号 | 字体 |
|---|---|---|
| 论坛主标题 | 18pt | AlibabaPuHuiTi Bold |
| 副标题 | 16pt | AlibabaPuHuiTi Bold |
| 地址 | 14pt | AlibabaPuHuiTi Bold |
| 时间数字 | 14pt | Sk-Modernist（fallback 阿里普惠体 Medium）|
| 模块分类标签 | 14pt | AlibabaPuHuiTi Bold |
| 话题标题 | 11pt | AlibabaPuHuiTi Bold（反向缩放固定） |
| 描述正文 | 9pt | AlibabaPuHuiTi Regular |
| 嘉宾信息 | 9pt | AlibabaPuHuiTi R/B |

### 底部导航

| 元素 | 字号 | 字体 |
|---|---|---|
| 中文名 | 7pt | NotoSansHans Medium |
| 日期 | 5.5pt | NotoSansHans Medium |

## 页面尺寸

- A4 横版：297 × 210 mm
- 边距：0（出血到页面边缘）
- 顶部论坛色条：约 9 mm 高
- 底部导航栏：6 mm 高
- 内容区：约 195 mm 高

## 自适应缩放

- 缩放下限：0.70（最多缩到 70%）
- 缩放上限：1.00
- 话题标题反向缩放：保持视觉 11pt 固定
- 描述正文跟随整页缩放，最小约 6.3pt
- 可通过 `scaleOverride` 手动覆盖

## 字体系统

```
正常字体 (Regular): AlibabaPuHuiTi R → Noto Sans CJK SC → Microsoft YaHei
加粗字体 (Bold):    AlibabaPuHuiTi B → Noto Sans CJK SC Bold
中等字体 (Medium):  AlibabaPuHuiTi M → NotoSansHans Medium
时间字体:           Sk-Modernist → AlibabaPuHuiTi Medium (fallback)
```

模板已内置阿里云 CDN 字体引入，联网环境自动加载。离线环境需本地安装：
- Alibaba PuHuiTi 3.0 · 55 Regular
- Alibaba PuHuiTi 3.0 · 65 Medium
- Alibaba PuHuiTi 3.0 · 85 Bold

下载地址：https://www.alibabafonts.com/
