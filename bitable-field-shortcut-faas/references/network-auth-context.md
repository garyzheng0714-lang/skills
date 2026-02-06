# Network, Auth, and Context

## Use Context Inputs

Read these context values as needed:

- `fetch`: outbound HTTP client
- `logID`: trace key for logs
- `baseID`, `tableID`: environment identifiers
- `packID`: plugin release identifier
- `baseSignature`: signed marker for source verification
- `tenantKey`: tenant identifier (billing/rules)
- `timeZone`: user timezone context
- `isNeedPayPack`, `hasQuota`: paid plugin entitlement flags

## Call External APIs

1. Register outbound domains first.
2. Use `context.fetch` for all requests.
3. Keep targets publicly reachable.

```ts
basekit.addDomainList(['example.com']);

const res = await context.fetch('https://api.example.com/path', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ foo: 'bar' }),
});
```

## Configure Domain Whitelist Correctly

Use host-only strings:

- Valid: `example.com`, `localhost`, `192.168.1.1`
- Invalid: `https://example.com`, `example.com/path`

## Choose Authorization Mode

Match API requirements with one mode:

- `HeaderBearerToken`: inject `Authorization: Bearer <token>`
- `Basic`: inject `Authorization: Basic <base64 user:pass>`
- `MultiHeaderToken`: inject multiple headers from user-provided keys
- `MultiQueryParamToken`: inject auth fields into URL query
- `Custom`: replace `{{key}}` in URL/body templates
- `AWSSigV4`: specialized mode with pinned SDK version requirements

Pass authorization id as third argument of `context.fetch(url, options, authId)`.

In local debug, mock auth values in `config.json` using structure that matches `authorizations` definition.

## Verify Source Traffic on Your Backend

When calling your own backend, forward `packID` and `baseSignature`.
Verify signature with provided Base public key, then compare `packID` inside signed payload.

Use verification sequence:

1. Split token by `.` into payload and signature.
2. Base64 decode payload and signature.
3. Verify `RSA-SHA256` over payload with Base public key.
4. Confirm payload `source=base`, `version=v1`, `packID` match, and `exp` valid.

Use backend verification only; do not assume sandbox supports full Node crypto APIs.
