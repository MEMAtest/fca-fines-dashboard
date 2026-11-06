#!/usr/bin/env bash
# Owner tool for registered API keys. Run it from a worktree of origin/main:
#   ~/bin/wt-new --repo fca api-keys origin/main api-keys   (first time only)
#   ~/mema-worktrees/api-keys/scripts/api-keys.sh applications
#   ~/mema-worktrees/api-keys/scripts/api-keys.sh issue --application <id>
#   ~/mema-worktrees/api-keys/scripts/api-keys.sh revoke --key <prefix>
#   ~/mema-worktrees/api-keys/scripts/api-keys.sh list
# It fast-forwards to origin/main, reads DATABASE_URL from the main checkout's .env
# when it is not already set, and never prints the database URL.
set -euo pipefail
cd "$(dirname "$0")/.."
git fetch -q origin
git merge -q --ff-only origin/main || { echo "Worktree cannot fast-forward to origin/main; use a fresh worktree." >&2; exit 1; }
if [ -z "${DATABASE_URL:-}" ]; then
  ENV_FILE="${REGACTIONS_ENV_FILE:-$HOME/Documents/fca-fines-dashboard/.env}"
  DATABASE_URL="$(grep -m1 '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2- | tr -d '"')"
  export DATABASE_URL
fi
[ -d node_modules ] || npm ci --silent
exec npm run -s api-keys -- "$@"
