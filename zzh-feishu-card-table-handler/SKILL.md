---
name: zzh-feishu-card-table-handler
description: Generate the JavaScript `handler(input)` function that turns Feishu/Lark Bitable records into the exact JSON shape required by Feishu card message tables (飞书消息卡片表格). Use when the user provides a Bitable-style input JSON and an expected output JSON and needs a production-ready handler for the "JavaScript 代码编辑器" (Feishu 字段捷径 / card handler runtime). Covers automatic pinyin/中文/English field mapping inference, the four supported `input` shapes, Feishu field value structures, and the type-format rules (文本 / 数字 / 整数字符串 / 百分比 / 货币 / 保留N位小数).
---

# Feishu Card Table Handler (zzh)

Generate JavaScript `handler(input)` code that transforms Feishu/Lark Bitable records into the JSON array a 飞书消息卡片表格 expects. The generated code is pasted into the Feishu "JavaScript 代码编辑器" whose entry point is `function handler(input) { ... }`.

## When to Use

Trigger when the user provides two JSON blobs — raw Bitable records in, desired card-table rows out — and asks for handler / 字段映射 / 卡片表格 code. Typical phrasings:

- "帮我生成 handler 代码" / "飞书卡片表格数据处理"
- "这是入参 / 这是期望输出,帮我写转换代码"
- "字段映射给我做一下"

Do not use this skill for: generating the card message schema itself, sending messages, or generic JS utilities unrelated to Bitable → card-table shape.

## Workflow (do this in order)

1. **Collect two JSON blobs from the user.**
   - `【入参】` — one real Bitable record (with `fields`) is enough.
   - `【输出】` — one sample of the target row shape.
2. **Infer the field mapping automatically** using pinyin / 中文 / English semantic matching. See `references/prompt-template.md` for the inference rules.
3. **Show the inferred mapping table and ask for confirmation before writing code.** Never jump straight to code. Format:
   ```
   我推断的映射如下:
   - <output_field> ← <源字段名>(<类型>)
   ...
   确认无误请回复"确认",或指出需要修改的地方。
   ```
4. **After the user confirms (or corrects) the mapping, emit the full handler.** It MUST follow every rule in `references/handler-contract.md`.
5. **Self-verify against the sample:** mentally run the first input record through the generated handler and check the produced row equals the expected output shape (types, keys, formatting). Call out any intentional numeric drift (the input snapshot vs the expected-output snapshot may differ) instead of silently "fixing" the sample.

## Hard Constraints (non-negotiable)

1. Entry must be `function handler(input) { ... }` — no default export, no arrow replacement, no `async`.
2. Must accept all four `input` shapes (array, `input.items`, `input.data.items`, `input.input`) and fall back to `return []` when none match.
3. Must tolerate the four Feishu field-value shapes (`{ value: [...] }`, `[{ text }]`, `[string]`, raw scalar) — see `references/field-structures.md`.
4. All logic wrapped in `try/catch`. On catch, return `{ error: \`处理数据时出错: ${err.message}\` }` — this exact shape.
5. Default return is `return result` (bare array). Only return `{ result }` when the user explicitly asks.
6. Utility helpers (`getText`, `getNumber`, `toSafeInt`, plus any needed `formatPercent` / `formatCurrency` / `formatFixed`) are defined as `const` arrow functions at the top of `handler`, then reused in `mapFields(fields)`.
7. Comments are concise Chinese, numbered `/** 1) ... */`-style blocks as shown in `references/handler-contract.md`.

## Type & Formatting Rules

Every mapped field belongs to one of these types. Match the type from the expected output shape when the user doesn't state it — see `references/type-formatting.md` for the inference heuristics and formatter code.

| 类型 | 说明 | 输出示例 |
|------|------|---------|
| 文本 | 字符串原样,默认 `""` | `"渠道对接会门票"` |
| 数字 | number,处理浮点误差后,默认 `0` | `2493` |
| 整数字符串 | 数字取整后 `String()` 包装 | `"2044"` |
| 百分比 | 小数 × 100,`toFixed(2) + "%"` | `"20.54%"` |
| 货币 | `¥` + 千分位 + 2 位小数 | `"¥1,234.56"` |
| 保留N位小数 | `Number(n).toFixed(N)` | `"3.14"` |

## Cross-AI Prompt (hand-off mode)

If the user wants a prompt they can paste into any other AI (ChatGPT / 豆包 / DeepSeek / Codex), hand them the block in `references/prompt-template.md` verbatim. It bakes in every constraint above so other models produce code compatible with this skill.

## References

- `references/prompt-template.md` — the paste-anywhere prompt (final auto-inference version from the source conversation).
- `references/handler-contract.md` — skeleton + mandatory utility helpers + error shape.
- `references/type-formatting.md` — type inference table and formatter implementations.
- `references/field-structures.md` — the four `input` shapes and the four Bitable field-value shapes, with a canonical reader.
