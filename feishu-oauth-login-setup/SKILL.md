---
name: feishu-oauth-login-setup
description: Interactive runbook for configuring and troubleshooting Feishu OAuth login in web apps (especially Next.js/Node private deployments), with optional event subscription mode selection (long connection vs webhook). Use when users need step-by-step guidance for app setup, redirect URI configuration, required permissions, environment variables, and production debugging of issues such as `20029 redirect_uri 请求不合法`, `oauth_failed`, callback jumping to localhost, or tenant lock mismatches.
---

# Feishu OAuth Login Setup

## Overview

Use a deterministic flow to make Feishu login work end-to-end: collect inputs, configure console, set env, verify endpoints, then troubleshoot by signature. Keep the conversation interactive and ask for missing info in small batches.

## Step 1: Collect Inputs Before Any Change

Start with `references/intake-template.md`.

Rules:
- Ask at most 3 questions per turn.
- Request real values for `FEISHU_APP_ID` and deployment origin.
- Allow masked `FEISHU_APP_SECRET` in chat; ask user to set full value only in server `.env`.
- Do not proceed until these minimum fields are present:
  - `FEISHU_APP_ID`
  - `FEISHU_APP_SECRET` (confirmed set on server)
  - `APP_BASE_URL` (public origin)
  - event mode (`longconn` or `webhook`)

## Step 2: Build Canonical OAuth URLs

Always derive:
- `APP_BASE_URL=<public_origin>`
- `FEISHU_OAUTH_REDIRECT_URI=<public_origin>/api/auth/feishu/callback`

Enforce exact-match constraints:
- Protocol must match (`http` vs `https`)
- Host must match (domain/IP)
- Port must match
- Path must match exactly
- Avoid accidental localhost fallback in production

If user reports `redirect_uri` errors, ask for the pre-click authorize URL and compare decoded `redirect_uri` byte-for-byte with configured value.

## Step 3: Configure Feishu Console in Order

Use `references/permissions-checklist.md` and walk through one block at a time:
1. App credentials and app type (self-built app in correct tenant)
2. Security settings with OAuth redirect URL
3. Required permissions for login and Wiki publishing
4. Event subscription mode (`longconn` or `webhook`)
5. Version publish/install in tenant after permission changes

Important:
- OAuth redirect URL belongs to app security settings, not event callback page.
- If mode is `longconn`, do not ask for public event callback URL.
- If mode is `webhook`, configure `/api/feishu/events` and optional signature keys.

## Step 4: Apply Server Environment and Restart

Use this template and fill concrete values:

```bash
APP_BASE_URL=http://<public-host-or-domain>

FEISHU_BASE_URL=https://open.feishu.cn
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
FEISHU_OAUTH_REDIRECT_URI=http://<public-host-or-domain>/api/auth/feishu/callback

FEISHU_OAUTH_SCOPE=
FEISHU_ALLOWED_TENANT_KEY=

FEISHU_EVENT_SUBSCRIBE_MODE=longconn
FEISHU_VERIFICATION_TOKEN=
FEISHU_ENCRYPT_KEY=
```

Restart both web and worker processes after changes.

## Step 5: Verify in Fixed Sequence

1. `GET {APP_BASE_URL}/api/auth/feishu/debug`
2. `GET {APP_BASE_URL}/api/auth/feishu/check`
3. Open login and authorize
4. Confirm callback lands on `/admin` without `error=oauth_failed`

Expected checks:
- `debug` output `redirectUri` equals configured redirect URL exactly.
- `check` output returns `ok: true`.
- Browser does not jump to `localhost`.

## Step 6: Troubleshoot by Signature

Use `references/troubleshooting.md`.

When login still fails, always collect:
- Full authorize URL before click
- Final callback URL after click
- Error code/message and log ID from Feishu page
- Latest server logs around callback time

Change only one variable at a time, then re-run Step 5.

## Step 7: Close with a Structured Handoff

Output a short summary containing:
- Final env values (mask secrets)
- Feishu console items confirmed
- Permissions confirmed
- Remaining blockers (if any) and exact next action

## Repository-Specific Notes (fbif-wiki)

For this repository, prioritize these endpoints:
- `/api/auth/feishu/debug`
- `/api/auth/feishu/check`
- `/api/auth/feishu/start`
- `/api/auth/feishu/callback`

Known runtime knobs:
- `FEISHU_EVENT_SUBSCRIBE_MODE=longconn` requires worker process running.
- Long connection success log usually contains `ws client ready`.
