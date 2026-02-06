---
name: aliyun-ssh
description: Secure SSH operations for Alibaba Cloud ECS instances through local SSH aliases and key-based authentication. Use when Codex needs to connect to Aliyun servers, run remote shell commands, inspect logs, transfer files with scp, or execute deployment and maintenance steps without exposing private keys or passwords.
---

# Aliyun SSH

## Execute Workflow

1. Run one-time bootstrap first: `./scripts/bootstrap_aliyun_ssh.sh`.
2. Confirm local SSH alias works (`ssh aliyun-prod`).
3. Run one-off remote commands with `scripts/run_remote.sh`.
4. Open an interactive shell with `scripts/connect.sh`.
5. Transfer files with `scripts/copy_to.sh` and `scripts/copy_from.sh`.
6. Read `references/quickstart.md` for a one-command setup flow and `references/setup.md` for detailed troubleshooting.

## Use Bundled Scripts

- Bootstrap and self-check:
  - `./scripts/bootstrap_aliyun_ssh.sh`
- Bootstrap with custom settings:
  - `./scripts/bootstrap_aliyun_ssh.sh --host 112.124.103.65 --user root --alias aliyun-prod --key-path ~/.ssh/id_ed25519_aliyun`
- Run remote command:
  - `./scripts/run_remote.sh aliyun-prod uname -a`
- Open interactive session:
  - `./scripts/connect.sh aliyun-prod`
- Upload file or folder:
  - `./scripts/copy_to.sh ./local-file /tmp/remote-file aliyun-prod`
- Download file or folder:
  - `./scripts/copy_from.sh /var/log/messages ./messages.log aliyun-prod`

Use alias `aliyun-prod` by default. Pass another alias as the last argument where supported.

## Enforce Security Guardrails

1. Use local SSH config aliases instead of embedding host, username, and key material in prompts.
2. Refuse requests to print private keys, passwords, or full secret file contents.
3. Prefer key-based auth and disable password-based workflows unless explicitly required by the operator.
4. Keep commands non-interactive when possible for repeatability (`scripts/run_remote.sh ...`).
5. Use `scripts/bootstrap_aliyun_ssh.sh` to recover connectivity before manual key operations.

## Troubleshoot Quickly

1. Run `ssh -v aliyun-prod` to inspect handshake failures.
2. Check key permissions (`chmod 700 ~/.ssh`, `chmod 600 ~/.ssh/config ~/.ssh/id_*`).
3. Verify remote key installation in `~/.ssh/authorized_keys`.
4. Verify ECS security group inbound rule allows TCP/22 from your source IP.
