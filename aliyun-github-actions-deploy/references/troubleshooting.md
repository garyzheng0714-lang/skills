# Troubleshooting Runbook

## Validate SSH Key step fails

### "Invalid private key content"
- Check `ALIYUN_SSH_KEY` is private key text with:
  - `-----BEGIN OPENSSH PRIVATE KEY-----`
  - `-----END OPENSSH PRIVATE KEY-----`
- Remove accidental prefix/suffix text.
- If using `ALIYUN_SSH_KEY_B64`, regenerate base64 from the private key file only.

### "Permission denied"
- Add corresponding public key to server `~/.ssh/authorized_keys`.
- Verify key pair matches.

### "Connection timed out" or "Connection refused"
- Check Aliyun security group allows inbound TCP `22` from GitHub Actions source IP ranges.
- Check server firewall and sshd status.

## Deploy On Server step fails

### `exit code 2` quickly
- Usually shell syntax error in remote script.
- Re-check heredoc usage and variable expansion.

### `pm2: command not found`
- Ensure install path can be resolved under non-interactive shell.
- Keep fallback `npm install -g pm2` in deploy script.

### App starts but sync fails with missing config
- Check API `.env` exists after deploy.
- Ensure process-level empty env vars do not override `.env` values.

## Post-deploy verification

- `curl http://<host>:<api_port>/health`
- `curl http://<host>:<web_port>`
- Submit one test form and poll sync status to terminal state.
