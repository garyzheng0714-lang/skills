---
name: bitable-field-shortcut-faas
description: Build, debug, and release Feishu/Lark Bitable field shortcut plugins (FaaS). Use when tasks involve basekit.addField, formItems, resultType, execute, context.fetch, authorization modes, domain whitelist, logID-based debugging, local debug helper, npm run pack, or runtime constraints for 多维表格 字段捷径.
---

# Bitable Field Shortcut FaaS

## Execute Workflow

1. Confirm the plugin goal and the final output field type.
2. Start from the official template repo and keep the entry structure unchanged.
3. Implement `formItems`, `resultType`, and `execute` as one contract.
4. Add network whitelist and optional authorization config before calling external APIs.
5. Add deterministic logs that always include `context.logID`.
6. Validate behavior with the local debug assistant.
7. Package with `npm run pack` and release with compatibility checks.

Use this order unless the user explicitly asks for partial work.

## Enforce Hard Constraints

1. Target runtime constraints: Node.js `14.21.0`, single instance `1C1G`, timeout `15 min`.
2. Use `context.fetch`; do not rely on unsupported sandbox libraries (`axios`, `got`, `bcrypt`, `moment`, `jsdom`, `sharp`, Node `crypto` in sandbox).
3. Treat each record execution as isolated; never assume cross-row state.
4. Keep external calls on public network; do not assume internal network access.
5. Return `data` strictly matching `resultType`; mismatch prevents updates.

## Build Correct Contracts

1. Read `references/formitems.md` to define UI inputs and expected runtime shapes.
2. Read `references/result-types.md` to map output type to `execute` return data.
3. For `FieldType.Object`, always provide required grouping/sorting keys.

## Use Network, Auth, and Context Safely

1. Read `references/network-auth-context.md` before external API integration.
2. Register domains using `basekit.addDomainList` with host-only values.
3. Select authorization mode that matches upstream API expectations.
4. Propagate `context.baseSignature` and `context.packID` when calling your backend.

## Debug and Release

1. Follow `references/quickstart.md` for local startup and debug helper flow.
2. Follow `references/limits-and-ops.md` for queue, rate, async/sync, and update compatibility.
3. Package only with `npm run pack`; do not hand-edit zip contents.

## References

- `references/quickstart.md`: setup, local debug, packaging checklist.
- `references/formitems.md`: form components and input data shapes.
- `references/result-types.md`: result contract and return examples.
- `references/network-auth-context.md`: fetch, whitelist, auth, context, signature verification.
- `references/limits-and-ops.md`: runtime limits, queue/rate behavior, logging, rollout safety.
