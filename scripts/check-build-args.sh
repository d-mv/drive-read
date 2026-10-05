#!/usr/bin/env bash
# Compares the server's drive-read build.args with deploy.toml / .env by SHA-256 prefix.
# Prints names and match/DIFFERS only: never a value. Run before every deploy.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${CONTABO_ADMIN_SSH_PASS:?}"
export SSHPASS="$CONTABO_ADMIN_SSH_PASS"
h() { printf '%s' "$1" | shasum -a 256 | cut -c1-16; }
CLIENT=$(sed -n 's/^VITE_GOOGLE_CLIENT_ID=//p' .env); KEY=$(sed -n 's/^VITE_LOGGER_INGEST_KEY=//p' .env)
TOML_CLIENT=$(grep -o 'VITE_GOOGLE_CLIENT_ID = "[^"]*"' deploy.toml | cut -d'"' -f2)
URL=$(grep -o 'VITE_LOGGER_API_BASE_URL = "[^"]*"' deploy.toml | cut -d'"' -f2)
[ "$TOML_CLIENT" = "$CLIENT" ] || { echo "deploy.toml client id DIFFERS from .env"; exit 1; }
{ printf '%s\n' "$SSHPASS"; cat <<'REMOTE'
awk '/^  drive-read:/{f=1;next} f&&/^  [a-z]/{exit} f&&/- VITE_/{sub(/^ *- /,""); n=index($0,"="); k=substr($0,1,n-1); v=substr($0,n+1); cmd="printf %s \"" v "\" | sha256sum | cut -c1-16"; cmd | getline hh; close(cmd); print k, hh}' /opt/apps/docker-compose.yml
REMOTE
} | sshpass -e ssh -o StrictHostKeyChecking=no admin@167.86.70.240 "sudo -S -p '' bash -s" | while read -r name hash; do
  case "$name" in
    VITE_GOOGLE_CLIENT_ID) want=$(h "$CLIENT");; VITE_LOGGER_INGEST_KEY) want=$(h "$KEY");;
    VITE_LOGGER_API_BASE_URL) want=$(h "$URL");; *) want=unknown;;
  esac
  [ "$hash" = "$want" ] && echo "$name: match" || echo "$name: DIFFERS"
done
