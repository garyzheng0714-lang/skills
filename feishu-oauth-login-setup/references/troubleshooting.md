# Troubleshooting Matrix

Use this table to map symptom -> root cause -> fix -> recheck.

## Common Failures

### `20029 redirect_uri 请求不合法`

- Typical cause:
  - redirect URL in authorize link does not exactly match app security settings
  - protocol/host/port/path mismatch
- Fix:
  - set `FEISHU_OAUTH_REDIRECT_URI={APP_BASE_URL}/api/auth/feishu/callback`
  - add the same exact URL in Feishu app security redirect list
  - redeploy/restart app after env update
- Recheck:
  - call `/api/auth/feishu/debug` and compare `redirectUri` byte-for-byte

### Authorize page succeeds, then browser jumps to `localhost` and `ERR_CONNECTION_REFUSED`

- Typical cause:
  - server generated callback/redirect using localhost origin or stale env
- Fix:
  - set correct public `APP_BASE_URL`
  - ensure callback route redirects to `APP_BASE_URL` instead of request-origin
  - restart web process
- Recheck:
  - inspect `/api/auth/feishu/debug` output and actual callback redirect target

### `oauth_failed` after callback

- Typical cause:
  - backend exception during token exchange, user info fetch, or DB upsert
- Fix:
  - inspect server logs for exact exception
  - verify `/api/auth/feishu/check` is `ok:true`
  - verify user identity mapping supports `open_id` fallback when `user_id` absent
- Recheck:
  - retry authorization and confirm `/admin` loads without error param

### Feishu API error `20014 invalid app access token`

- Typical cause:
  - invalid app id/secret pair, wrong tenant app, or broken response parsing
- Fix:
  - verify `FEISHU_APP_ID` + `FEISHU_APP_SECRET`
  - verify app is self-built and active in correct tenant
  - verify backend parser supports APIs that return top-level payload (not only `data`)
- Recheck:
  - `/api/auth/feishu/check` returns `ok:true`

### `oauth_state` mismatch

- Typical cause:
  - state cookie missing/expired or cross-origin flow broke cookie
- Fix:
  - start login from site button again
  - ensure same origin for start and callback
  - check cookie domain/protocol settings
- Recheck:
  - retry in clean browser session

### Event callback URL reports `url invalid`

- Typical cause:
  - using event callback page for OAuth redirect URL
  - or invalid callback format for webhook mode
- Fix:
  - separate concerns:
    - OAuth redirect URL -> app security settings
    - event callback URL -> event subscription page only in webhook mode
  - if using long connection, do not configure webhook URL
- Recheck:
  - event mode is correct and worker logs show long connection started

## Must-Collect Evidence on Every Failure

- Authorize URL before user clicks “授权”
- Final URL after callback failure
- Feishu error code + log ID
- Latest server logs around the callback timestamp
- Current values (masked) of:
  - `APP_BASE_URL`
  - `FEISHU_OAUTH_REDIRECT_URI`
  - `FEISHU_APP_ID`
