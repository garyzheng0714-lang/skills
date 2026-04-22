# Input Shapes & Field Value Structures

## The 4 `input` Shapes

The handler entry is called with one of these shapes. Detect and normalize in this order:

### 1. `input` is itself an array
```json
[
  { "record_id": "...", "fields": { ... } },
  { "record_id": "...", "fields": { ... } }
]
```

### 2. `input.items` is an array
```json
{
  "items": [
    { "record_id": "...", "fields": { ... } }
  ]
}
```
Most common: output from a Bitable "list records" node in a 飞书 automation.

### 3. `input.data.items` is an array
```json
{
  "data": {
    "items": [
      { "record_id": "...", "fields": { ... } }
    ]
  }
}
```
Common when the upstream is a direct API call returning the `{ code, data }` envelope.

### 4. `input.input` is an array
```json
{
  "input": [
    { "record_id": "...", "fields": { ... } }
  ]
}
```
Shows up when a previous step wraps data in a generic `input` key.

### Fallback
If none match, `return [];` (never throw for this case).

## The 4 Bitable Field Value Shapes

Inside `fields[...]`, the same logical value can appear in several physical shapes. A robust reader must cover all of them.

### Shape A — `{ value: [...] }` (most common)
```json
"📌应注册": { "type": 2, "value": [2493] }
```
Take `field.value[0]`. When that element is an object like `{ text: "xxx" }`, take `.text`.

### Shape B — `[{ text: "..." }]`
```json
"票种": [{ "text": "渠道对接会门票", "type": "text" }]
```
Take the first array element, then its `.text` property.

### Shape C — `["字符串"]`
```json
"标签": ["VIP"]
```
Take the first element.

### Shape D — Raw scalar
```json
"状态": "已签到"
"次序": 7
```
Return as-is.

## Canonical Readers

Copy these two helpers verbatim into every generated handler:

```javascript
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
```

## Gotchas

### emoji prefix in field names
Source fields may be literally named `📌应注册`, `📌实际注册`, `【今日】门票增长量`. Read with the full string — dropping the emoji or the 【】 brackets returns `default`.

### Records with missing `fields`
Some upstream nodes emit `{ record_id: "..." }` without `fields`. The `items.map((it) => mapFields(it.fields || {}))` pattern in the skeleton handles this — each mapper then relies on the per-field default (`""`, `0`, etc.).

### `type: 2` meaning
`type: 2` in Bitable field responses denotes a number column. Reader code should not branch on `type`; the shape-based reader above handles all column types uniformly.

### Formula columns return float noise
Fields produced by `formula` often come back as `164.00000000000003`. Always route through `toSafeInt` when the expected output is an integer.
