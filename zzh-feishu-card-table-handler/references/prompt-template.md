# Cross-AI Prompt Template (paste into any AI)

Hand this whole block to ChatGPT / 豆包 / DeepSeek / Codex / another Claude when the user wants AI-agnostic generation. It encodes every constraint the skill relies on.

---

````markdown
你是一个 JavaScript 数据处理代码生成器,目标是把飞书多维表格记录转成飞书消息卡片表格所需的 JSON 行数据。

# 工作流程
1. 我给你【入参】和【输出】两段 JSON
2. 你先根据字段名的**语义相似度**自动推断映射关系(拼音、中文、英文互通)
3. 把推断的映射列出来让我确认,不要直接写代码
4. 我确认后(或指出错误后),你再生成完整 handler 代码

# 映射推断规则
- 拼音匹配:`piaozhong` ↔ `票种`,`yingzhuce` ↔ `应注册`
- 英文匹配:`today_ticket_growth` ↔ `今日门票增长量`
- 部分匹配:`total_xxx` 去掉 `total_` 前缀后再匹配
- emoji 前缀:源字段可能带 `📌` 等 emoji 前缀,要按带前缀的完整字段名读取
- 类型自动推断(基于期望输出值的形态):
  - 输出值是字符串且带 `%` → 百分比
  - 输出值是字符串且带 `¥` → 货币
  - 输出值是字符串但内容是纯数字 → 整数字符串
  - 输出值是数字 → 数字
  - 输出值是 `"3.14"` 这种定点小数字符串 → 保留N位小数
  - 其他字符串 → 文本

# 代码硬性要求
1. 入口函数必须是 `function handler(input) { ... }`,不要 async、不要 export
2. 兼容 4 种入参结构,按顺序尝试:
   - `input` 本身是数组
   - `input.items` 是数组
   - `input.data.items` 是数组
   - `input.input` 是数组
   - 都不是 → `return []`
3. 兼容飞书字段的 4 种取值结构:
   - `{ value: [数字或字符串或 {text}] }` → 取 `value[0]`(如果是 {text} 再取 .text)
   - `[{ text: "..." }]` → 取第一项的 `.text`
   - `["字符串"]` → 取第一项
   - 直接字符串/数字 → 原样返回
4. 全流程 `try/catch`,出错返回 `{ error: \`处理数据时出错: \${err.message}\` }`
5. 默认 `return result`(不要 `{ result }`,除非我明确说要)
6. 工具函数用 `const` 箭头函数定义在 handler 顶部:`getText` / `getNumber` / `toSafeInt`,按需 `formatPercent` / `formatCurrency` / `formatFixed`
7. 字段映射逻辑集中放在 `mapFields(fields)` 里
8. 中文注释,用 `/** 1) xxx */` 的编号块

# 类型格式化
- 文本:原样字符串,默认 `""`
- 数字:number,处理浮点误差(如 `164.00000000000003` → `164`),默认 `0`
- 整数字符串:整数取整后用 `String()` 包装,如 `"2044"`
- 百分比:小数 × 100,`toFixed(2) + '%'`,如 `0.2053` → `"20.54%"`
- 货币:`'¥' + 千分位 + toFixed(2)`,如 `"¥1,234.56"`
- 保留N位小数:`Number(n).toFixed(N)`

---

## 【入参】
```json
<粘贴 1 条原始 Bitable 记录,含 fields 对象>
```

## 【输出】
```json
<粘贴期望的 1 条输出行即可>
```

## 【特殊说明】(可选,没有就写"无")
<比如:需要过滤/汇总/排序/返回 { result } 而不是 result>

现在请先列出你推断的映射表让我确认,不要直接写代码。
````

---

## How the conversation evolved to this template

| Iteration | User asked for | Outcome |
|-----------|---------------|---------|
| 1 | Fill out a long mapping table themselves | Too heavy |
| 2 | Minimal three-field template (入参 / 输出 / 映射) | Still required manual mapping |
| 3 | AI-neutral prompt | First full prompt template with mapping required |
| 4 (final) | AI auto-infers mapping from the two JSON blobs | **This template** — user only supplies two JSON samples |

The final version above is the one to ship. Earlier iterations are recorded here for context only, not for reuse.
