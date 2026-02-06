# Limits and Operations

## Respect Runtime and Queue Limits

Apply these operational constraints:

1. Process each record independently.
2. Expect concurrent execution of roughly 2-4 records, with queueing for the rest.
3. Expect queue cap around 10,000 tasks per table (across all shortcuts).
4. Expect queued task cancellation after about 1 hour without explicit error surface.
5. Expect per-table, per-shortcut throughput around 90 records/minute for fast tasks.

Treat exact scheduler behavior as platform-controlled and re-confirm in release channels.

## Choose Sync vs Async Mode

Use sync only when execution is consistently short.
Use async for long-running AI or heavy compute jobs.

Known timeout characteristics:

- Sync wait window around 58 seconds.
- Async wait window up to 15 minutes.

Rate/concurrency controls are platform-configurable and may vary by plugin and tenant.

## Handle Version Compatibility During Updates

Treat these parts differently:

1. Backend logic: `execute`
2. Frontend config: `formItems`, `resultType`, authorization schema

Expect mixed-version windows after upgrade because frontend config may refresh only when users reopen and save field settings.

Use one of these safer strategies:

1. Keep backend backward-compatible with older frontend config.
2. Publish a new shortcut version (v2) and keep old version in reserve state.

## Add Observability by Default

1. Include `context.logID` in every log.
2. Add step labels to each log payload key.
3. Log request/response boundaries and mapping steps.
4. Use log query tools with shortcut id + table id filters.

## Return User-Friendly Errors

When business error is clear and expected, return a structured success payload containing readable error details instead of generic throw-only failures.

Use hard error codes only when the run should be considered failed by platform behavior.
