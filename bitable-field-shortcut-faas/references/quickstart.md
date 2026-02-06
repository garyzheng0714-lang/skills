# Quickstart

## Prepare Environment

1. Use Node.js `14.21.0` for development and build alignment.
2. Keep port `8080` available for local debug service.
3. Start from the official template:

```bash
git clone https://github.com/Lark-Base-Team/field-demo.git -b main --depth=1
cd field-demo
npm install
npm run start
```

4. Keep entry layout unchanged, especially `src/index.ts`.

## Build Core Field

1. Define `formItems` for user inputs.
2. Define `resultType` for output schema.
3. Implement `execute(formItemParams, context)` so returned `data` matches `resultType` exactly.

## Run Local Debug Flow

1. Open the field shortcut debug helper in Bitable sidebar.
2. Create a debug field from the FaaS debug template.
3. Select the target shortcut field and click `Debug Field`.
4. Keep both the local service and debug helper running.

Use these debug constraints:

1. Update only the first row in local debug mode.
2. Trigger updates only from the debug helper in local mode.
3. Re-create the debug field after changing `formItems` or non-`execute` structures.

## Add Logs Before Release

1. Log every risky boundary: input parse, external request, response parse, mapping, return.
2. Include `context.logID` in every log line.
3. Add explicit order labels in log keys to avoid ambiguity in unordered log search.

## Package and Release

1. Package only with:

```bash
npm run pack
```

2. Upload `output/*.zip` to the plugin submission flow.
3. Avoid manual zip modifications; packaging step includes required structure.
4. Re-check release scope (enterprise/internal/global) with Feishu admin policy.

## Common Fixes

If you hit `Cannot find module '@ies/starling_intl'`, run:

```bash
rm -rf node_modules
npm i
```
