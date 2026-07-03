---
name: fbif-award-poster
description: Batch-generate FBIF WOW FOOD AWARDS 2026 获奖海报 + 获奖证书 using the template-editor server. Use when user asks to produce 获奖海报 / 奖项海报 / 获奖证书 / FBIF 海报 from a Feishu Bitable, or to write generated posters back into a Bitable attachment field.
---

# FBIF 获奖海报批量生成 — v18 规范（已定稿）

> **不要随意改 layout 数值。** v18 是用户验收过的最终版，再动需要明确指令。

## 服务前提

- `template-editor` 运行在 `:19090`，从仓库根 `cd /Users/simba/local_vibecoding/批量排版插件` 启动：`DATA_DIR=./data API_KEY=test-key-1 ./server-binary`
- 海报模板 `7ff26abd-abe5-49a3-90e7-a6f442179198` (FBIF 获奖海报 CH)
- 证书模板 `f98a2552-dcbd-4751-b5a0-6d62a8c361b0` (FBIF 获奖证书 CH v1)
- 服务器支持单次 `layout` 覆盖（`server/handlers/public_api.go`，v16 加的能力）
- JPEG 输出固定 q=95（v17 起，文件 350~1000KB，1556×2201 已足够清晰，用户验收过不需要 2x 升级）

## 海报模板（template id 7ff26abd...）

### 画布与底图固定区

- 画布 1556 × 2201；底图 `/uploads/full/f5735078-3109-4dcd-8a82-69b8cf99c8fa.png`
- 产品图 box：x=137, y=331, w=1281, h=990 (image bottom 不会越过 y=1321)
- **细黄线**（底图固有）：y ≈ 1568..1580
- **大黄色奖项条**（底图固有）：y = 1799..2088（高 289px）
- 底部黑条：y = 2088..2201

### 元素与变量

| ID | 类型 | 位置 (x,y,w,h) | 字体 | 变量 |
|---|---|---|---|---|
| var_产品图 | variable_image (scaleMode=smart) | 137, 331, 1281, 990 | — | `var_产品图` |
| t_product | variable_text (vAlign=middle, align=left) | 165, **动态 y**, 1100, 208 | Alibaba-PuHuiTi-Bold 87pt | `产品名` |
| t3 | variable_text (vAlign=middle, align=left) | 165, **1639**, 700, 100 | Alibaba-PuHuiTi-Regular 64pt | `品牌` |
| t_award | variable_text (vAlign=middle) | 165, 1799, 1015, 289 | Alibaba-PuHuiTi-Bold 100pt | `奖项名` |

### 上下居中规则

- **产品名**：上下居中在「图片底部 ↔ 细黄线（y=1568）」之间
  - 图片底部 = 331 + min(1281 × srcH/srcW, 990)
  - center_y = (image_bottom + 1568) / 2
  - t_product.y = int(center_y - 208/2) = int(center_y - 104)
  - 因 image_bottom 取决于源图比例，t_product.y 必须**逐张计算**
- **品牌**：上下居中在「细黄线 ↔ 大黄色块顶（y=1799）」之间
  - 模板里固定 y=1639, h=100, vAlign=middle → 文字中心 ≈ 1689 ✓
  - **位置固定，不随图片变化**

### 产品图 scaleMode=smart

`server/renderer/image.go` 的 `"smart"` 分支：按 box 宽度等比缩放、左上角对齐。
- 宽永远 = 1281
- 高 = 1281 × srcH/srcW，不超过 box height 990
- 顶/左/右零白边，底部留白（被 t_product 上方留白吃掉）

## 证书模板（template id f98a2552...）

- 画布 1904 × 2656
- 三个变量：`奖项名`(t_award) / `作品名`(t_product) / `公司名`(t_company)
- **字体配置（v18 验收锁定）：**
  | 元素 | 字体 | 字号 | 颜色 | bold |
  |---|---|---|---|---|
  | t_award (奖项) | Alibaba-PuHuiTi-Bold | **68pt** | #ba9e59 | true |
  | t_product (作品) | Alibaba-PuHuiTi-Bold | **56pt** | #000000 | true |
  | t_company (公司) | Alibaba-PuHuiTi-Regular | **36pt** | #000000 | false |

更新模板字体（PUT 必须带完整 template body）：
```python
t = requests.get(f'http://localhost:19090/api/templates/{tid}').json()
for el in t['elements']:
    if el['id']=='t_award': el['style']|={'fontSize':68,'fontFamily':'Alibaba-PuHuiTi-Bold','bold':True}
requests.put(f'http://localhost:19090/api/templates/{tid}', json=t)
```

## 文案分拆（`scripts/splitters.py` v18）

```python
SINGLE_LINE_AWARD = 11     # 100pt 奖项条单行字数
SINGLE_LINE_PRODUCT = 10   # 87pt 产品名单行字数；>10 触发 brand-pivot 或自然换行
```

### `split_award(award)` — v18 改为接收完整奖项名

> v17 之前签名 `split_award(category)` 拼 `年度创新{cat}奖`；v18 因为新表的「奖项」字段已是完整文本（如 `年度创新功能性食品奖（非胶囊类）`），改为直接接收并换行。

规则：
1. ≤11 字 → 单行
2. 含 `（` 或 `(` 且括号位于 ≤11 字内 → `head` / `(suffix)` 优先按括号切
3. 否则 floor(N/2) 附近找自然边界：
   - 优先在 `和 / 与 / 及` **前**切（连词归到第 2 行）
   - 其次普通标点 / 空格 / 括号
   - 最后退化到 target 整字切

典型输出：

| 输入 | 输出 |
|---|---|
| 年度创新调味品奖 (8) | 单行 |
| 年度创新功能性食品奖（非胶囊类） (16) | 年度创新功能性食品奖 / （非胶囊类） |
| 年度创新果蔬汁和果味饮料奖 (13) | 年度创新果蔬汁 / 和果味饮料奖 |
| 年度创新酸奶和乳酸菌饮料奖 (13) | 年度创新酸奶 / 和乳酸菌饮料奖 |

### `split_product_name(name, brand)` — v17 brand-pivot + v18 加 + 剥离

1. ≤10 字 → 单行
2. brand 前缀匹配 + 剩余 ≤10 → `{brand}\n{rest}`
3. 否则 floor(N/2) 附近找自然边界

剥离字符集：`' 　·-—/|、，+＋'` — **v18 加了 `+/＋`**，避免 `利斯科纳+低GI小麦轻食拉面` 切出 `利斯科纳` / `+低GI小麦轻食拉面` 这种瑕疵。

brand 候选优先级：`explicit brand` → `CJK-only(brand)` → `s.split(' ')[0]`

| 输入 | 输出 |
|---|---|
| 旺仔五子棋小馒头 (8) | 单行 |
| 加点滋味亚麻籽芝麻盐 (10) | 单行 |
| 吉香居咔吱脆风干萝卜干 (11) | 吉香居 / 咔吱脆风干萝卜干 |
| 利斯科纳+低GI小麦轻食拉面 (13) | 利斯科纳 / 低GI小麦轻食拉面 |
| NICEGROW益生菌油滴液 (14) | NICEGROW / 益生菌油滴液 |
| 食验室钻石牛奶脆巧（丝绒厚奶味） (16) | 食验室钻石牛奶脆巧 / （丝绒厚奶味） |

## 渲染请求（v18 必带 layout + 非空 品牌）

```python
import urllib.request, io
from PIL import Image

def fetch_dims(url):
    with urllib.request.urlopen(url, timeout=30) as r:
        return Image.open(io.BytesIO(r.read())).size  # (w, h)

def t_product_y(srcW, srcH):
    image_bottom = 331 + min(1281 * srcH / srcW, 990)
    return int((image_bottom + 1568) / 2 - 104)

sw, sh = fetch_dims(image_url)
raw_brand = brand.strip()
body = {
  "templateId": "7ff26abd-abe5-49a3-90e7-a6f442179198",
  "variables": {
    "var_产品图": {"url": image_url},
    "产品名":     split_product_name(name, raw_brand),
    "品牌":       raw_brand if raw_brand else " ",  # ⚠ v18: 服务端校验非空，空品牌传单空格
    "奖项名":     split_award(full_award_text),
  },
  "layout": {"t_product": {"y": t_product_y(sw, sh)}},
  "format": "jpeg"
}
```

⚠ **服务端校验**：`required` 变量为空字符串会返 400 `missing_required_variable:品牌`。空品牌时传 `' '` 占位。当业务上有「公司名」这类替代值时，建议用业务字段填充而不是空格（见下方）。

## Bitable 写回（视场景换 base/table/字段，不要硬绑定）

> ⚠ 不要把字段 ID 写死在 skill 里。 v17 用的旧表 `tblTdwpHgo8WO4nh`、海报字段 `fldbe2A8cU`，v18 切到的新表 `tbld0oo2nGHkS44P`(view `vewGa2pO3O` "gary用")、海报字段 `fldM6a7g8U`。每次开工先 `+field-list` 拿真名。

新表字段速查（base `LRdYbfi6NauOOesIdImcJ8sPn6h`）：

| 用途 | 字段名 | field_id | 类型 | 备注 |
|---|---|---|---|---|
| 海报 (写入) | `海报` | fldM6a7g8U | attachment | 通过 `--field-id 海报` 上传 |
| 奖项 (读取) | `奖项` | fld6AzZW3U | text | **完整奖项文本**，直接喂 split_award |
| 作品名 | `作品名称-中文` | fldhM4KsG5 | text | |
| 品牌 | `作品品牌名-中文` | fldiwE4VPT | text | 可能为空（58/262 无品牌） |
| 公司名 | `参赛公司-中文名` | fldudYbW10 | text | 无品牌时作为 t3 fallback |
| 封面图片 | `封面图片` | fldpO7aZW4 | text(URL style) | **markdown 包装** `[url](url)`，需正则解包 |

### 封面图片 markdown 解包

```python
def md_unwrap(s):
    if not s: return ''
    m = re.match(r'^\[([^\]]+)\]\([^)]+\)\s*$', s)
    return m.group(1) if m else s
```

### 上传命令（v18 修正）

```bash
lark-cli base +record-upload-attachment \
  --base-token LRdYbfi6NauOOesIdImcJ8sPn6h \
  --table-id tbld0oo2nGHkS44P \
  --record-id <rid> \
  --field-id 海报 \    # ⚠ 不是 --field（v18 实测踩坑）
  --file ./<rid>.jpg
```

`cwd` 必须是文件所在目录，`--file` 用相对路径。

### Lark CLI 坑（v18 累计）

- ⚠ 上传 flag 是 `--field-id`，**不是** `--field`（v18 这次踩坑）
- ⚠ 服务端要求所有 required 变量非空字符串，空品牌传 `' '`
- `+record-upsert` 写附件字段会被 lark-cli 拦截（"READONLY: attachment field cannot be written through OpenAPI"）
- **去重必须走 raw API**：`lark-cli api PUT /open-apis/bitable/v1/apps/{base}/tables/{table}/records/{rid} --data '{"fields":{"海报":[{"file_token":"...","name":"..."}]}}'`
- `+record-list` 返回的附件数组**不可靠**（可能截断或缓存延迟），用 raw API GET：`lark-cli api GET /open-apis/bitable/v1/apps/{base}/tables/{table}/records/{rid}` → `data.record.fields.海报`
- **附件数组顺序**：旧的在前，最新的在末尾（`posters[-1]` 是最新）
- 视图分页用 `--offset`，**不是** `page-token`，`has_more=true` 但 `page_token=null` 是正常的，按 offset 翻页

## 无品牌的 fallback

v18 新表里 58/262 条记录无品牌（多数是「最佳整合营销奖 / 最佳事件营销奖」类的 case study）。处理逻辑：

```python
raw_brand = (rec.get('作品品牌名-中文') or '').strip()
if not raw_brand:
    raw_brand = (rec.get('参赛公司-中文名') or '').strip()  # 用公司名替代
# 喂给 split_product_name 用 raw_brand（影响 brand-pivot），喂给 t3 也用 raw_brand
# 如果还是空，最后传 ' '
```

⚠ 公司名最长可达 39 字（碰到 `A.S. Strategy, Branding & Communication` 这类英文长名），t3 框 700px @ 64pt 会自动缩字。已验证可读。

## 批量架构

- 4 个 producer agent **并行**，每个 ~65 条
- 每个 producer 内部：sequential render（CDN 友好）+ 4 worker 并发上传
- 上传必触发 `rate_limit code 99991400`（4 agent 同时打 Bitable attachment endpoint），失败的全部走 sequential retry + 0.4~0.8s 延迟，必能恢复
- 共享脚本：`/tmp/producer_v18.py`（render+upload）、`/tmp/dedup_v18.py`（去重）、`/tmp/splitters.py`（splitter）
- 图片维度缓存：`/tmp/img_dim_cache.json` 避免重复 PIL 拉源图

## 单条试渲流程（强制，绝不能跳过）

任何 splitter / layout / 字体 / 模板字段调整后，**必须先单条试渲染** + 用户验收，再开 4 个 producer 并行。

抽样应包含：
- 1 条最长奖项 / 长产品名 / 最长公司名
- 1 条带括号的奖项
- 1 条无品牌的 case study
- 几条普通记录

我（主 agent）用 Read 工具直接看 `/tmp/v18_render/*.jpg` 抽检（Claude 多模态）。无 DOUBAO_API_KEY 时不必搭视觉模型。

## 验收清单（v18）

- [ ] 产品图全宽顶对齐，上/左/右零白边
- [ ] 产品名上下居中在「图片底 ↔ 细黄线」
- [ ] 品牌（或公司名）固定居中在「黄线 ↔ 大黄块」
- [ ] 大黄条奖项文字居中、字号 ≥80pt
- [ ] 不撞菠萝（图底 ≤ y=1321）
- [ ] 海报字段每条记录只有 1 张附件（最新的）
- [ ] 长括号奖项按 `（…）` 切两行
- [ ] 长产品名按 brand-pivot 或自然边界切两行，第 2 行不带 `+` 前缀

## 文件索引

- 渲染器：`server/renderer/{renderer.go,text.go,image.go,loader.go,types.go}`
- 公共 API：`server/handlers/public_api.go`（含 `LayoutOverride` + JPEG q=95）
- 模板存储：`templates` 表
- 本 skill：`scripts/splitters.py`
- 跑批脚本（参考实现）：`/tmp/producer_v18.py`、`/tmp/dedup_v18.py`、`/tmp/fetch_all.py`
