# Aliyun SSH Quickstart (One Command)

Run this once on a new device:

```bash
cd /Users/macmini_gary/.codex/skills/aliyun-ssh
./scripts/bootstrap_aliyun_ssh.sh
```

Expected result:

- If local key + alias already works, script exits quickly.
- If connection fails, script generates a new key and tries to install the public key to the server.
- After success, run:

```bash
ssh aliyun-prod
```

Optional custom command:

```bash
./scripts/bootstrap_aliyun_ssh.sh --host 112.124.103.65 --user root --alias aliyun-prod --key-path ~/.ssh/id_ed25519_aliyun
```
