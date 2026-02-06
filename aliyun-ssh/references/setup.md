# Aliyun SSH Setup Reference

Use this checklist to prepare secure SSH access for Alibaba Cloud ECS instances.

## 1) Generate a dedicated key

```bash
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_aliyun
```

## 2) Install public key on ECS

```bash
ssh-copy-id -i ~/.ssh/id_ed25519_aliyun.pub root@<ecs_public_ip>
```

If `ssh-copy-id` is unavailable, append the `.pub` content to remote `~/.ssh/authorized_keys`.

## 3) Add local alias

Add this block to `~/.ssh/config`:

```sshconfig
Host aliyun-prod
  HostName <ecs_public_ip>
  User root
  Port 22
  IdentityFile ~/.ssh/id_ed25519_aliyun
  IdentitiesOnly yes
```

## 4) Fix permissions

```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/config ~/.ssh/id_ed25519_aliyun
chmod 644 ~/.ssh/id_ed25519_aliyun.pub
```

## 5) Verify connectivity

```bash
ssh aliyun-prod "hostname && whoami"
```

## 6) Check security group and firewall

- Allow inbound TCP `22` from your source IP in ECS security group.
- Ensure remote `sshd` service is running.

## 7) Avoid secret exposure

- Do not paste private key contents into prompts.
- Do not store passwords in SKILL files.
- Use local alias and key files only.
