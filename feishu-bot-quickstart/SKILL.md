---
name: feishu-bot-quickstart
description: Scaffold a runnable Feishu (LarkSuite) long-connection (WebSocket) chat bot service into any repo, plus auth checks and troubleshooting. Use when you want to quickly connect a Feishu self-built app bot, receive `im.message.receive_v1` events, reply with text, add simple allowlists/dedup, and optionally wire an OpenAI-compatible LLM for multi-turn chat.
---

# Feishu Bot Quickstart

This skill creates a small, project-agnostic Feishu bot service (Node.js + TypeScript) you can drop into any repository. It receives messages via Feishu "long connection" event subscription and sends text replies.

## Quick Start (3 Steps)

### 1) Feishu Console Checklist
Read: `references/feishu-console-checklist.md`

Minimum requirements for this quickstart:
- Create a Feishu self-built app and enable Bot feature.
- Enable long-connection event subscription for `im.message.receive_v1`.
- Grant permissions needed to receive message events and send messages.

### 2) Scaffold The Service Into Your Repo
Run from your target repo root:

```bash
python3 /Users/simba/.codex/skills/feishu-bot-quickstart/scripts/scaffold_feishu_bot.py
```

Behavior:
- If your repo root contains `package.json`, it scaffolds to `./feishu-bot-service`.
- Otherwise you must specify `--out <dir>`.

### 3) Verify Auth, Then Run
Auth-only check (no messages sent):

```bash
python3 /Users/simba/.codex/skills/feishu-bot-quickstart/scripts/feishu_auth_check.py
```

Run the bot:

```bash
cd feishu-bot-service
npm i
npm run dev
```

## Configuration (Stable Interface)
The scaffolded service reads env vars (it does not write secrets to disk):

- `FEISHU_APP_ID` (required; prompts if missing in interactive terminal)
- `FEISHU_APP_SECRET` (required; prompts if missing in interactive terminal)
- `FEISHU_MODE` (fixed: `longconn`)
- `FEISHU_REPLY_POLICY` (`dm_only` default, or `mention_or_dm`)
- `FEISHU_ALLOW_USER_OPEN_IDS` (comma-separated allowlist; optional)
- `FEISHU_ALLOW_CHAT_IDS` (comma-separated allowlist; optional)
- `FEISHU_BOT_OPEN_ID` (optional; recommended when `FEISHU_REPLY_POLICY=mention_or_dm` to enable safe mention detection)
- `LLM_BASE_URL` (optional OpenAI-compatible base URL)
- `LLM_API_KEY` (optional)
- `LLM_MODEL` (optional)
- `BOT_SYSTEM_PROMPT` (optional)
- `CONV_TTL_SECONDS` (default `3600`)
- `CONV_MAX_TURNS` (default `20`)

Notes:
- For safety, group replies require `FEISHU_REPLY_POLICY=mention_or_dm` and `FEISHU_BOT_OPEN_ID` to be set so the service can confirm the bot was mentioned.

## Customizing Business Logic
Edit the generated handler:
- `feishu-bot-service/src/handler.ts`

It must export:
```ts
export async function handleTurn(ctx): Promise<{ text: string }>
```

## Troubleshooting (Fast Checks)
- Auth check fails: verify `FEISHU_APP_ID/FEISHU_APP_SECRET`, and the app is a self-built app in the correct tenant.
- No events received: confirm long-connection subscription is enabled and the bot is added to the chat.
- No replies: ensure the app has permission to send messages and you are using text messages.
- Duplicate replies: verify `message_id` is present in events; the service dedups by `message_id` with a TTL.

## What This Skill Generates
- A Node.js + TypeScript bot service template under `assets/feishu-bot-service/`.
- A scaffolder script that copies it into your repo and keeps the integration project-agnostic.
