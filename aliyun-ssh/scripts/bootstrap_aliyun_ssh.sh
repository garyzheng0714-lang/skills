#!/usr/bin/env bash
set -euo pipefail

DEFAULT_HOST="112.124.103.65"
DEFAULT_USER="root"
DEFAULT_ALIAS="aliyun-prod"
DEFAULT_KEY_PATH="$HOME/.ssh/id_ed25519_aliyun"
CONNECT_TIMEOUT=8

host="$DEFAULT_HOST"
user="$DEFAULT_USER"
alias_name="$DEFAULT_ALIAS"
key_path="$DEFAULT_KEY_PATH"

usage() {
  cat <<'EOF'
Usage:
  bootstrap_aliyun_ssh.sh [--host IP] [--user USER] [--alias NAME] [--key-path PATH]

Defaults:
  --host     112.124.103.65
  --user     root
  --alias    aliyun-prod
  --key-path ~/.ssh/id_ed25519_aliyun

What this script does:
  1) Ensure local key pair exists
  2) Ensure SSH config alias exists
  3) Test non-interactive SSH login
  4) If login fails, create a new key and try to install the public key to the server
EOF
}

log() {
  printf '[aliyun-ssh] %s\n' "$*"
}

fail() {
  printf '[aliyun-ssh] ERROR: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  local cmd="$1"
  command -v "$cmd" >/dev/null 2>&1 || fail "Missing required command: $cmd"
}

parse_args() {
  while [[ "$#" -gt 0 ]]; do
    case "$1" in
      --host)
        [[ "$#" -ge 2 ]] || fail "--host requires a value"
        host="$2"
        shift 2
        ;;
      --user)
        [[ "$#" -ge 2 ]] || fail "--user requires a value"
        user="$2"
        shift 2
        ;;
      --alias)
        [[ "$#" -ge 2 ]] || fail "--alias requires a value"
        alias_name="$2"
        shift 2
        ;;
      --key-path)
        [[ "$#" -ge 2 ]] || fail "--key-path requires a value"
        key_path="$2"
        shift 2
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        fail "Unknown argument: $1"
        ;;
    esac
  done
}

ensure_ssh_dir() {
  mkdir -p "$HOME/.ssh"
  chmod 700 "$HOME/.ssh"
}

ensure_key_pair() {
  if [[ -f "$key_path" && -f "${key_path}.pub" ]]; then
    log "Found existing key pair at $key_path"
    chmod 600 "$key_path"
    chmod 644 "${key_path}.pub"
    return
  fi

  log "Generating key pair at $key_path"
  ssh-keygen -t ed25519 -f "$key_path" -N '' -C "aliyun-${user}-${host}-$(date +%Y%m%d)"
  chmod 600 "$key_path"
  chmod 644 "${key_path}.pub"
}

write_managed_ssh_config() {
  local config_file="$HOME/.ssh/config"
  local marker_begin="# >>> aliyun-ssh-bootstrap:${alias_name} >>>"
  local marker_end="# <<< aliyun-ssh-bootstrap:${alias_name} <<<"
  local clean_file tmp_file

  touch "$config_file"
  chmod 600 "$config_file"

  clean_file="$(mktemp)"
  tmp_file="$(mktemp)"

  awk -v begin="$marker_begin" -v end="$marker_end" '
    $0 == begin {skip=1; next}
    $0 == end {skip=0; next}
    skip != 1 {print}
  ' "$config_file" > "$clean_file"

  cat > "$tmp_file" <<EOF
$marker_begin
Host $alias_name
  HostName $host
  User $user
  Port 22
  IdentityFile $key_path
  IdentitiesOnly yes
$marker_end

EOF

  cat "$clean_file" >> "$tmp_file"
  mv "$tmp_file" "$config_file"
  chmod 600 "$config_file"
  rm -f "$clean_file"
}

test_alias_login() {
  ssh \
    -o BatchMode=yes \
    -o ConnectTimeout="$CONNECT_TIMEOUT" \
    -o StrictHostKeyChecking=accept-new \
    "$alias_name" \
    "echo ALIYUN_SSH_OK" >/dev/null 2>&1
}

install_pubkey() {
  local pub_key="$1"

  if command -v ssh-copy-id >/dev/null 2>&1; then
    log "Installing public key via ssh-copy-id (you may be prompted for server password)"
    ssh-copy-id -i "$pub_key" "${user}@${host}"
    return
  fi

  fail "ssh-copy-id not found. Install it, then run: ssh-copy-id -i ${pub_key} ${user}@${host}"
}

rotate_key_and_install() {
  local ts temp_key temp_pub
  ts="$(date +%Y%m%d%H%M%S)"
  temp_key="${key_path}.new.${ts}"
  temp_pub="${temp_key}.pub"

  log "Connection failed. Creating a fresh key pair at $temp_key"
  ssh-keygen -t ed25519 -f "$temp_key" -N '' -C "aliyun-rotate-${user}-${host}-${ts}"
  chmod 600 "$temp_key"
  chmod 644 "$temp_pub"

  install_pubkey "$temp_pub"

  if [[ -f "$key_path" ]]; then
    mv "$key_path" "${key_path}.bak.${ts}"
    log "Backed up old private key to ${key_path}.bak.${ts}"
  fi
  if [[ -f "${key_path}.pub" ]]; then
    mv "${key_path}.pub" "${key_path}.pub.bak.${ts}"
    log "Backed up old public key to ${key_path}.pub.bak.${ts}"
  fi

  mv "$temp_key" "$key_path"
  mv "$temp_pub" "${key_path}.pub"
  chmod 600 "$key_path"
  chmod 644 "${key_path}.pub"

  write_managed_ssh_config
}

main() {
  parse_args "$@"
  require_cmd ssh
  require_cmd ssh-keygen

  ensure_ssh_dir
  ensure_key_pair
  write_managed_ssh_config

  if test_alias_login; then
    log "SSH login check passed for alias: $alias_name"
    log "Done. You can now run: ssh $alias_name"
    exit 0
  fi

  rotate_key_and_install

  if test_alias_login; then
    log "SSH login recovered with a newly generated key"
    log "Done. You can now run: ssh $alias_name"
    exit 0
  fi

  fail "Still cannot login via alias '$alias_name'. Run: ssh -v $alias_name"
}

main "$@"
