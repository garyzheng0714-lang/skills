# Result Types

## Match `execute.data` to `resultType`

Always return data that strictly matches declared type.

| resultType | Expected `data` |
| --- | --- |
| `FieldType.Text` | `string` |
| `FieldType.Number` | `number` |
| `FieldType.DateTime` | `number` (ms timestamp) |
| `FieldType.SingleSelect` | `string` option name |
| `FieldType.MultiSelect` | `string[]` option names |
| `FieldType.Checkbox` | `boolean` |
| `FieldType.Attachment` | `AttachmentResult[]` |
| `FieldType.Object` | object matching `extra.properties` |

## Build Object Type Correctly

For `FieldType.Object`, enforce these rules:

1. Define `extra.icon`.
2. Define `extra.properties` with stable keys.
3. Mark one property as `primary: true`; keep it visible and type `Text` or `Number`.
4. Mark one property as `isGroupByKey: true`; use type `Text`.
5. Return both required values on every successful update.

If required object keys are missing in returned data, object field update is skipped.

## Return Attachment Type Correctly

Use attachment URL mode:

```ts
{
  name: 'example.png',
  content: 'https://public-url/file.png',
  contentType: 'attachment/url',
}
```

Respect limits:

1. At most 5 files.
2. At most 10MB per file.
3. URL must be publicly downloadable.
4. Response should expose `content-length` and finish within one minute.

## Use FieldCode Precisely

Use targeted error codes first, then fallback:

- `FieldCode.Success`
- `FieldCode.ConfigError`
- `FieldCode.AuthorizationError`
- `FieldCode.PayError`
- `FieldCode.RateLimit`
- `FieldCode.QuotaExhausted`
- `FieldCode.InvalidArgument`
- `FieldCode.Error`

Prefer returning user-readable failure details inside `data` with `FieldCode.Success` when you want users to see a structured message in cells instead of generic hard failure.
