#!/usr/bin/env python3
"""Generate a robust GitHub Actions workflow for Aliyun ECS auto-deploy."""

from __future__ import annotations

import argparse
from pathlib import Path

TEMPLATE = """name: Deploy To Aliyun

on:
  push:
    branches:
      - main
  workflow_dispatch:

concurrency:
  group: deploy-production
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: |
            __WEB_DIR__/package-lock.json
            __API_DIR__/package-lock.json

      - name: Build And Test
        env:
          VITE_API_URL: ${{ secrets.VITE_API_URL }}
        run: |
          set -euo pipefail
          API_URL="${VITE_API_URL:-http://__HOST_DEFAULT__:__API_PORT__}"
          npm ci --prefix __API_DIR__
__API_TEST_LINE__
          npm ci --prefix __WEB_DIR__
          VITE_API_URL="${API_URL}" npm run build --prefix __WEB_DIR__

      - name: Package Release
        run: |
          set -euo pipefail
          rm -f /tmp/release.tgz release.tgz
          tar -czf /tmp/release.tgz \\
            --exclude=".git" \\
            --exclude=".github" \\
            --exclude="release.tgz" \\
            --exclude="./release.tgz" \\
            --exclude="__WEB_DIR__/node_modules" \\
            --exclude="__API_DIR__/node_modules" \\
            --exclude="__WEB_DIR__/.env" \\
            --exclude="__WEB_DIR__/.env.*" \\
            --exclude="__API_DIR__/.env" \\
            --exclude="__API_DIR__/.env.*" \\
            --exclude=".local-stack" \\
            .
          cp /tmp/release.tgz release.tgz

      - name: Validate SSH Key
        env:
          ALIYUN_HOST: ${{ secrets.ALIYUN_HOST }}
          ALIYUN_USER: ${{ secrets.ALIYUN_USER }}
          ALIYUN_SSH_KEY: ${{ secrets.ALIYUN_SSH_KEY }}
          ALIYUN_SSH_KEY_B64: ${{ secrets.ALIYUN_SSH_KEY_B64 }}
        run: |
          set -euo pipefail
          HOST="${ALIYUN_HOST:-__HOST_DEFAULT__}"
          USER="${ALIYUN_USER:-__USER_DEFAULT__}"

          mkdir -p ~/.ssh

          if [ -n "${ALIYUN_SSH_KEY:-}" ]; then
            KEY_HEAD="$(printf '%s' "${ALIYUN_SSH_KEY}" | head -n 1)"
            if printf '%s' "${KEY_HEAD}" | grep -qE '^ssh-(ed25519|rsa|dss) '; then
              echo "::error::ALIYUN_SSH_KEY looks like a public key. Please set private key content."
              exit 1
            fi

            RAW_KEY="$(printf '%b' "${ALIYUN_SSH_KEY}" | tr -d '\\r')"
            if printf '%s' "${RAW_KEY}" | grep -q -- '-----BEGIN OPENSSH PRIVATE KEY-----'; then
              printf '%s\\n' "${RAW_KEY}" | awk '
                /-----BEGIN OPENSSH PRIVATE KEY-----/ {in_key=1}
                in_key {print}
                /-----END OPENSSH PRIVATE KEY-----/ {if (in_key) {exit}}
              ' > ~/.ssh/id_aliyun
            else
              printf '%s' "${RAW_KEY}" > ~/.ssh/id_aliyun
            fi
          elif [ -n "${ALIYUN_SSH_KEY_B64:-}" ]; then
            printf '%s' "${ALIYUN_SSH_KEY_B64}" | tr -d '\\r\\n ' | base64 -d > ~/.ssh/id_aliyun
          else
            echo "::error::Missing Actions secret: ALIYUN_SSH_KEY or ALIYUN_SSH_KEY_B64"
            exit 1
          fi

          chmod 600 ~/.ssh/id_aliyun

          if ! ssh-keygen -y -f ~/.ssh/id_aliyun >/dev/null 2>/tmp/ssh_key_err.log; then
            echo "::error::Invalid private key content in Actions secret."
            cat /tmp/ssh_key_err.log || true
            exit 1
          fi

          if ! ssh \\
            -i ~/.ssh/id_aliyun \\
            -o BatchMode=yes \\
            -o ConnectTimeout=10 \\
            -o StrictHostKeyChecking=accept-new \\
            "${USER}@${HOST}" \\
            "echo SSH_OK" >/tmp/ssh_probe_out.log 2>/tmp/ssh_probe_err.log; then
            if grep -qi "Permission denied" /tmp/ssh_probe_err.log; then
              echo "::error::SSH authentication failed. Ensure public key is in ~/.ssh/authorized_keys."
            elif grep -Eqi "Connection timed out|No route to host|Connection refused" /tmp/ssh_probe_err.log; then
              echo "::error::Cannot reach server SSH/22 from GitHub Actions. Check Aliyun security group/firewall."
            else
              echo "::error::SSH probe failed."
            fi
            cat /tmp/ssh_probe_err.log || true
            exit 1
          fi

          grep -q "SSH_OK" /tmp/ssh_probe_out.log

      - name: Upload Release To Server
        env:
          ALIYUN_HOST: ${{ secrets.ALIYUN_HOST }}
          ALIYUN_USER: ${{ secrets.ALIYUN_USER }}
        run: |
          set -euo pipefail
          HOST="${ALIYUN_HOST:-__HOST_DEFAULT__}"
          USER="${ALIYUN_USER:-__USER_DEFAULT__}"

          scp \\
            -i ~/.ssh/id_aliyun \\
            -o BatchMode=yes \\
            -o ConnectTimeout=20 \\
            -o StrictHostKeyChecking=accept-new \\
            release.tgz \\
            "${USER}@${HOST}:/tmp/release.tgz"

      - name: Deploy On Server
        env:
          ALIYUN_HOST: ${{ secrets.ALIYUN_HOST }}
          ALIYUN_USER: ${{ secrets.ALIYUN_USER }}
          APP_DIR: ${{ secrets.APP_DIR }}
          APP_ENV_B64: ${{ secrets.APP_ENV_B64 }}
          GH_SHA: ${{ github.sha }}
        run: |
          set -euo pipefail
          HOST="${ALIYUN_HOST:-__HOST_DEFAULT__}"
          USER="${ALIYUN_USER:-__USER_DEFAULT__}"

          cat > /tmp/remote_deploy.sh <<'REMOTE_SCRIPT'
            set -euo pipefail

            APP_ROOT="${APP_DIR:-__APP_DIR_DEFAULT__}"
            RELEASES_DIR="${APP_ROOT}/releases"
            CURRENT_LINK="${APP_ROOT}/current"
            RELEASE_DIR="${RELEASES_DIR}/${GH_SHA}"

            mkdir -p "${RELEASES_DIR}"
            rm -rf "${RELEASE_DIR}"
            mkdir -p "${RELEASE_DIR}"

            tar -xzf /tmp/release.tgz -C "${RELEASE_DIR}"

            npm ci --omit=dev --prefix "${RELEASE_DIR}/__API_DIR__"

            SOURCE_ENV=""
            if [ -f "${CURRENT_LINK}/__API_DIR__/.env" ]; then
              SOURCE_ENV="${CURRENT_LINK}/__API_DIR__/.env"
            elif [ -f "${APP_ROOT}/__API_DIR__/.env" ]; then
              SOURCE_ENV="${APP_ROOT}/__API_DIR__/.env"
            fi

            if [ -n "${SOURCE_ENV}" ]; then
              cp "${SOURCE_ENV}" "${RELEASE_DIR}/__API_DIR__/.env"
            elif [ -n "${APP_ENV_B64:-}" ]; then
              printf '%s' "${APP_ENV_B64}" | tr -d '\\r\\n ' | base64 -d > "${RELEASE_DIR}/__API_DIR__/.env"
            fi

            ln -sfn "${RELEASE_DIR}" "${CURRENT_LINK}"

            if ! command -v pm2 >/dev/null 2>&1; then
              npm install -g pm2
            fi

            pm2 delete __API_PROCESS_NAME__ >/dev/null 2>&1 || true
            pm2 start "${CURRENT_LINK}/__API_DIR__/__API_START__" --name __API_PROCESS_NAME__ --cwd "${CURRENT_LINK}/__API_DIR__" --update-env

            pm2 delete __WEB_PROCESS_NAME__ >/dev/null 2>&1 || true
            pm2 serve "${CURRENT_LINK}/__WEB_DIR__/dist" __WEB_PORT__ --name __WEB_PROCESS_NAME__ --spa

            pm2 save
            pm2 startup systemd -u root --hp /root || true

            curl -fsS "http://127.0.0.1:__API_PORT____API_HEALTH_PATH__" >/dev/null
            curl -fsS "http://127.0.0.1:__WEB_PORT__" >/dev/null

            ls -1dt "${RELEASES_DIR}"/* 2>/dev/null | tail -n +__RELEASE_PRUNE_FROM__ | xargs -r rm -rf
          REMOTE_SCRIPT

          REMOTE_ENV="$(printf \\
            "APP_DIR=%q APP_ENV_B64=%q GH_SHA=%q" \\
            "${APP_DIR:-}" "${APP_ENV_B64:-}" "${GH_SHA}")"

          ssh \\
            -i ~/.ssh/id_aliyun \\
            -o BatchMode=yes \\
            -o ConnectTimeout=20 \\
            -o StrictHostKeyChecking=accept-new \\
            "${USER}@${HOST}" \\
            "${REMOTE_ENV} bash -s" < /tmp/remote_deploy.sh

      - name: Cleanup
        if: always()
        run: rm -f ~/.ssh/id_aliyun /tmp/remote_deploy.sh /tmp/release.tgz release.tgz
"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate .github/workflows/deploy-aliyun.yml for a Node web + API project"
    )
    parser.add_argument("--repo-root", default=".", help="Repository root path")
    parser.add_argument("--workflow-path", default=".github/workflows/deploy-aliyun.yml")
    parser.add_argument("--web-dir", default="apps/web")
    parser.add_argument("--api-dir", default="apps/mock-api")
    parser.add_argument("--api-start", default="src/server.js")
    parser.add_argument("--api-port", type=int, default=8080)
    parser.add_argument("--web-port", type=int, default=3001)
    parser.add_argument("--api-health-path", default="/health")
    parser.add_argument("--host-default", default="112.124.103.65")
    parser.add_argument("--user-default", default="root")
    parser.add_argument("--app-dir-default", default="")
    parser.add_argument("--api-process-name", default="app-api")
    parser.add_argument("--web-process-name", default="app-web")
    parser.add_argument("--release-keep", type=int, default=5)
    parser.add_argument("--skip-api-test", action="store_true")
    parser.add_argument("--force", action="store_true")
    return parser.parse_args()


def ensure_health_path(value: str) -> str:
    return value if value.startswith("/") else f"/{value}"


def render(args: argparse.Namespace, app_dir_default: str) -> str:
    api_test_line = (
        "          # npm test skipped by generator (--skip-api-test)"
        if args.skip_api_test
        else f"          npm test --prefix {args.api_dir}"
    )

    replacements = {
        "__WEB_DIR__": args.web_dir,
        "__API_DIR__": args.api_dir,
        "__API_START__": args.api_start,
        "__API_PORT__": str(args.api_port),
        "__WEB_PORT__": str(args.web_port),
        "__API_HEALTH_PATH__": ensure_health_path(args.api_health_path),
        "__HOST_DEFAULT__": args.host_default,
        "__USER_DEFAULT__": args.user_default,
        "__APP_DIR_DEFAULT__": app_dir_default,
        "__API_PROCESS_NAME__": args.api_process_name,
        "__WEB_PROCESS_NAME__": args.web_process_name,
        "__RELEASE_PRUNE_FROM__": str(args.release_keep + 1),
        "__API_TEST_LINE__": api_test_line,
    }

    content = TEMPLATE
    for key, value in replacements.items():
        content = content.replace(key, value)

    return content


def main() -> int:
    args = parse_args()

    repo_root = Path(args.repo_root).resolve()
    workflow_path = repo_root / args.workflow_path

    if not repo_root.exists():
        raise SystemExit(f"repo root not found: {repo_root}")

    if workflow_path.exists() and not args.force:
        raise SystemExit(
            f"workflow already exists: {workflow_path} (pass --force to overwrite)"
        )

    repo_name = repo_root.name.replace("_", "-")
    app_dir_default = args.app_dir_default or f"/opt/{repo_name}"

    workflow_path.parent.mkdir(parents=True, exist_ok=True)
    workflow_path.write_text(render(args, app_dir_default), encoding="utf-8")

    print(f"Generated workflow: {workflow_path}")
    print(
        "Defaults: "
        f"host={args.host_default}, user={args.user_default}, app_dir={app_dir_default}, "
        f"api_port={args.api_port}, web_port={args.web_port}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
