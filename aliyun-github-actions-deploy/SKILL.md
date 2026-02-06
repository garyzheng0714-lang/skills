---
name: aliyun-github-actions-deploy
description: Create, harden, and troubleshoot GitHub Actions workflows that automatically deploy Node web plus API repositories to Aliyun ECS over SSH with PM2 and release symlink rollout. Use when users ask to add Aliyun auto deployment, fix failing deploy runs, validate SSH secret handling, or reuse a proven deployment pattern across projects.
---

# Aliyun Github Actions Deploy

## Overview

Create or repair `.github/workflows/deploy-aliyun.yml` with strong defaults: SSH key validation, artifact upload, remote release directory switching, PM2 process restart, health checks, and cleanup.

Prefer the bundled scripts for deterministic output and repeatable checks.

## Workflow

1. Collect inputs from `references/questionnaire.md`.
2. Generate workflow with `scripts/generate_workflow.py`.
3. Run `scripts/preflight_check.py` and require PASS.
4. Commit and push to `main`.
5. Watch the first run and fix failures using `references/troubleshooting.md`.

## Input Collection

Ask only unknown values. Default the rest.

Required values:
- repository root path
- web dir
- api dir
- api start script
- api/web ports
- api health path
- host/user defaults
- server app dir default
- PM2 process names
- release retention count
- whether to skip API test

If the user is unsure, use defaults from the generator.

## Generate Workflow

Run:

```bash
python3 /Users/macmini_gary/.codex/skills/aliyun-github-actions-deploy/scripts/generate_workflow.py \
  --repo-root <repo_root> \
  --web-dir apps/web \
  --api-dir apps/mock-api \
  --api-start src/server.js \
  --api-port 8080 \
  --web-port 3001 \
  --api-health-path /health \
  --host-default 112.124.103.65 \
  --user-default root \
  --app-dir-default /opt/<app_name> \
  --api-process-name app-api \
  --web-process-name app-web \
  --release-keep 5 \
  --force
```

If the project should not run API tests during deployment, add `--skip-api-test`.

## Preflight Check

Run:

```bash
python3 /Users/macmini_gary/.codex/skills/aliyun-github-actions-deploy/scripts/preflight_check.py --repo-root <repo_root>
```

Require `Preflight result: PASS` before commit.

## Required Secrets

Always ensure at least one SSH secret exists:
- `ALIYUN_SSH_KEY` (preferred)
- `ALIYUN_SSH_KEY_B64` (fallback)

Common optional secrets:
- `ALIYUN_HOST`
- `ALIYUN_USER`
- `APP_DIR`
- `VITE_API_URL`
- `APP_ENV_B64`

## Guardrails

Always keep these workflow properties:
- `concurrency` enabled with `cancel-in-progress`
- separate `Validate SSH Key`, `Upload Release To Server`, `Deploy On Server`, `Cleanup` steps
- SSH with `BatchMode=yes` and `StrictHostKeyChecking=accept-new`
- release symlink rollout (`releases/<sha>` + `current`)
- PM2 restart for API and web processes
- post-deploy health checks
- old release pruning

Never inline private keys into repository files.

## Failure Handling

If the first run fails, open `references/troubleshooting.md` and patch only the failed stage. Re-run workflow after each fix.
