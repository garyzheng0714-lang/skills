# Handler Contract

The canonical skeleton every generated `handler` MUST match. Reproduce structure, helper names, comment style, and error shape exactly.

## Canonical Skeleton

```javascript
function handler(input) {
  try {
    /** 1) 统一取得 items 数组(兼容 4 种入参) */
    let items = [];
    if (Array.isArray(input)) {
      items = input;
    } else if (input && Array.isArray(input.items)) {
      items = input.items;
    } else if (input && input.data && Array.isArray(input.data.items)) {
      items = input.data.items;
    } else if (input && Array.isArray(input.input)) {
      items = input.input;
    } else {
      return [];
    }

    /** 2) 通用取文本 */
    const getText = (fields, key, def = '') => {
      const f = fields[key];
      if (!f) return def;

      if (Array.isArray(f) && f.length > 0) {
        const first = f[0];
        if (typeof first === 'string') return first;
        if (first && typeof first === 'object' && first.text) return first.text;
      }

      if (f.value && Array.isArray(f.value) && f.value.length > 0) {
        const v = f.value[0];
        if (typeof v === 'string') return v;
        if (v && typeof v === 'object' && v.text) return v.text;
      }

      if (typeof f === 'string') return f;

      return def;
    };

    /** 3) 通用取数值 */
    const getNumber = (fields, key, def = 0) => {
      const f = fields[key];
      if (!f) return def;

      if (f.value && Array.isArray(f.value) && f.value.length > 0) {
        const v = f.value[0];
        if (typeof v === 'number') return v;
        if (typeof v === 'string') {
          const p = parseFloat(v);
          if (!isNaN(p)) return p;
        }
        if (v && typeof v === 'object' && v.text != null) {
          const p = parseFloat(v.text);
          if (!isNaN(p)) return p;
        }
      }

      if (typeof f === 'number') return f;

      return def;
    };

    /** 4) 安全整数(处理浮点误差,如 164.00000000000003 → 164) */
    const toSafeInt = (num) => {
      const v = Number(num) || 0;
      const nearest = Math.round(v);
      if (Math.abs(v - nearest) < 1e-9) return nearest;
      return Math.round(v);
    };

    /** 5) 按需加入的格式化助手(只在映射用到时包含) */
    // const formatPercent = (num) => ((Number(num) || 0) * 100).toFixed(2) + '%';
    // const formatCurrency = (num) => '¥' + (Number(num) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    // const formatFixed = (num, n) => (Number(num) || 0).toFixed(n);

    /** 6) 字段映射 */
    const mapFields = (fields) => {
      // <根据确认后的映射表逐字段读取并转换>
      return {
        // <output_key>: <transform>(get*(fields, '<源字段>', <default>)),
      };
    };

    /** 7) 生成结果 */
    const result = items.map((it) => mapFields(it.fields || {}));

    return result;
  } catch (err) {
    return {
      error: `处理数据时出错: ${err.message}`,
    };
  }
}
```

## Do / Don't

### Do
- Keep helper order: `getText` → `getNumber` → `toSafeInt` → optional formatters → `mapFields` → `result`.
- Only include formatter helpers actually used by the mapping (don't ship dead code).
- Call `it.fields || {}` inside `items.map` so a malformed record produces a defaulted row, not a crash.
- When expected output wraps an integer in quotes (`"2044"`), generate `String(toSafeInt(...))`.
- When the percentage input is already a percentage (e.g. `20.5`, not `0.205`), document the assumption; the default `formatPercent` treats input as a 0-1 fraction.

### Don't
- Don't rename helpers (`getText` must stay `getText` — the template is expected to be reused across codebases).
- Don't use `async` / top-level `await` / `import` / `require`.
- Don't throw — always route errors through the catch to `{ error: "处理数据时出错: ..." }`.
- Don't silently collapse unexpected structures into `0`/`""` without the default-arg fallback; malformed data must still match `resultType`.

## Percent-format parentheses (easy bug)

Always parenthesize the default before the multiplication:

```javascript
// CORRECT
const formatPercent = (num) => ((Number(num) || 0) * 100).toFixed(2) + '%';

// WRONG — `|| 0 * 100` parses as `|| (0 * 100)`, which still equals `|| 0`, so it accidentally works,
// but any reviewer will flag it. Reject this shape during code review.
const formatPercent = (num) => (Number(num) || 0 * 100).toFixed(2) + '%';
```

## Return Shape

- Default: `return result;`
- On error (inside catch): `return { error: \`处理数据时出错: ${err.message}\` };`
- Only wrap in `{ result }` if the user explicitly states a downstream consumer expects it.
