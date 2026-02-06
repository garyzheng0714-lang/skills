# FormItems

## Select Component by Input Shape

| Component | Typical Use | Execute Input Shape |
| --- | --- | --- |
| `FieldComponent.Input` | Free text | `string` |
| `FieldComponent.SingleSelect` | One option | `{ label, value }` |
| `FieldComponent.MultipleSelect` | Many options | `{ label, value }[]` |
| `FieldComponent.Radio` | Small option set | `{ label, value }` |
| `FieldComponent.FieldSelect` | Reference existing fields | Depends on selected field type |

## Apply Common Form Config

Use these common attributes when needed:

1. `validator.required` for mandatory input.
2. `defaultValue` for initial selection.
3. `tooltips` for text/link helper hints.
4. `props.placeholder` for guided input.

## Use FieldSelect Safely

1. Restrict source field types through `props.supportType`.
2. Use `mode: 'single' | 'multiple'` when necessary.
3. Parse values by field type.

Supported field families:

- `Text`
- `Number`
- `Url`
- `SingleSelect`
- `MultiSelect`
- `Attachment`
- `Checkbox`
- `DateTime`

## Parse FieldSelect Runtime Values

Use these shapes when mapping values:

- Attachment: `{ name, size, type, tmp_url }[]`
- Text rich value: array of text/url/mention tokens
- Number: `number`
- DateTime: `number` timestamp
- URL: `{ link, text }[]`
- SingleSelect: `string`
- MultiSelect: `string[]`
- Checkbox: `boolean`

## Minimal Form Skeleton

```ts
basekit.addField({
  formItems: [
    {
      key: 'source',
      label: 'Source',
      component: FieldComponent.FieldSelect,
      props: { supportType: [FieldType.Text] },
      validator: { required: true },
    },
  ],
});
```
