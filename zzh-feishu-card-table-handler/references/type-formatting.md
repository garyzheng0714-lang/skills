# Type & Formatting Rules

## Type Inference from Expected Output

When the user doesn't state a type explicitly, infer it from the shape of the expected output value.

| Expected output value | Type | Reason |
|----------------------|------|--------|
| `2493` (number literal) | 数字 | number type, keep as number |
| `"2044"` (string of pure digits) | 整数字符串 | Digits wrapped in quotes → String(int) |
| `"20.54%"` (string ending in `%`) | 百分比 | Pct formatter, input treated as 0-1 fraction |
| `"¥1,234.56"` (string starting with `¥`) | 货币 | Currency formatter, en-US thousands + 2 decimals |
| `"3.14"` (fixed decimal string) | 保留N位小数 | `toFixed(N)` where N matches sample |
| `"渠道对接会门票"` (free-form string) | 文本 | Pass through via `getText` |
| `true` / `false` | 布尔 | Pass raw boolean |
| `["a","b"]` | 数组 | Collect all values (ask user if full array or first-item) |

If the sample is ambiguous (e.g. `"100"` could be 整数字符串 or 文本), raise it when presenting the mapping for confirmation — do not silently pick.

## Formatter Implementations

Include **only** the formatters the mapping actually uses. Dead helpers are rejected.

### 数字 (safe integer/float)

```javascript
const toSafeInt = (num) => {
  const v = Number(num) || 0;
  const nearest = Math.round(v);
  if (Math.abs(v - nearest) < 1e-9) return nearest;
  return Math.round(v);
};
```

- Handles `164.00000000000003` → `164` (floating-point reconstruction from Bitable formulas).
- When mapping wants a raw float (not rounded), skip `toSafeInt` and just use the number read by `getNumber`.

### 整数字符串

```javascript
// usage: String(toSafeInt(getNumber(fields, '预估到场人数', 0)))
```

No helper needed — compose `String()` around `toSafeInt`.

### 百分比

```javascript
const formatPercent = (num) => ((Number(num) || 0) * 100).toFixed(2) + '%';
// 0.2053 → "20.54%"
// null → "0.00%"
```

- Assumes input is a 0-1 fraction.
- If the Bitable field stores already-multiplied percentages (`20.5` meaning 20.5%), swap in:
  ```javascript
  const formatPercent = (num) => (Number(num) || 0).toFixed(2) + '%';
  ```
  and call this out to the user.

### 货币

```javascript
const formatCurrency = (num) =>
  '¥' +
  (Number(num) || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
// 1234.5 → "¥1,234.50"
```

- `en-US` locale is the reliable way to get thousands-separator `,` and decimal `.` in the sandbox runtime. Do not rely on `zh-CN` formatting.

### 保留N位小数

```javascript
const formatFixed = (num, n) => (Number(num) || 0).toFixed(n);
// formatFixed(3.14159, 2) → "3.14"
```

Pick N from the sample (count digits after decimal in the expected output).

### 日期 (pass-through by default)

```javascript
// If the Bitable field is already a formatted string, use getText.
// If it's a timestamp, convert explicitly:
const formatDate = (ts) => {
  const d = new Date(Number(ts) || 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
```

Never guess the timezone. If the sample date shape is ambiguous, ask before generating.

## Null / Default Values

| Type | Default when field missing |
|------|---------------------------|
| 文本 | `""` |
| 数字 | `0` |
| 整数字符串 | `"0"` (via `String(toSafeInt(0))`) |
| 百分比 | `"0.00%"` |
| 货币 | `"¥0.00"` |
| 保留N位小数 | `"0" + '.' + '0'.repeat(N)` e.g. `"0.00"` |

Defaults match the field type so downstream card-table rendering never sees a literal `undefined`.
