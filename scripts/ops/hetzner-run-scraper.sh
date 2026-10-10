#!/usr/bin/env bash
# Run ONE scraper on the Hetzner scraper host (/opt/regactions-scrapers).
#
#   hetzner-run-scraper.sh <npm-script> [timeout-minutes] [-- extra scraper args]
#   e.g. hetzner-run-scraper.sh scrape:ecb 25
#        hetzner-run-scraper.sh scrape:sec 60 -- --backfill
#
# Why a wrapper instead of bare `npm run` in crontab:
#   * one flock per scraper, so a slow run is never doubled up by the next tick;
#   * a hard timeout, so a hung browser cannot hold the lock forever;
#   * FLARESOLVERR_URL defaults to the local container, so FMANZ / FINRA /
#     AUSTRAC / CIRO / FCA clear their Cloudflare challenge;
#   * a log per scraper with a non-zero exit code on failure, so cron mail and
#     `check:live-freshness` both see the failure instead of silence.
# Always exits with the scraper's status. Never touches other scrapers.
set -uo pipefail

SCRIPT="${1:?usage: hetzner-run-scraper.sh <npm-script> [timeout-minutes] [-- args]}"
TIMEOUT_MIN="${2:-25}"
shift $(( $# >= 2 ? 2 : 1 ))
[ "${1:-}" = "--" ] && shift

APP_DIR="${REGACTIONS_DIR:-/opt/regactions-scrapers}"
LOG_DIR="${REGACTIONS_LOG_DIR:-/var/log/regactions-scrapers}"
NAME="${SCRIPT//[^A-Za-z0-9_-]/_}"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/$NAME.log"

cd "$APP_DIR" || { echo "missing $APP_DIR" >&2; exit 2; }
if [ -f "$APP_DIR/.env" ]; then set -a; . "$APP_DIR/.env"; set +a; fi
export FLARESOLVERR_URL="${FLARESOLVERR_URL:-http://127.0.0.1:8191}"
export TS_NODE_PROJECT="${TS_NODE_PROJECT:-tsconfig.json}"
export SCRAPER_RUN_SUMMARY_FILE="${SCRAPER_RUN_SUMMARY_FILE:-$LOG_DIR/$NAME-summary.json}"

{
  echo "=== $(date -u +%FT%TZ) start $SCRIPT (timeout ${TIMEOUT_MIN}m) ==="
  flock -n 9 || { echo "previous $SCRIPT run still holds the lock; skipping"; exit 0; }
  timeout --signal=TERM --kill-after=30s "${TIMEOUT_MIN}m" npm run --silent "$SCRIPT" -- "$@"
  rc=$?
  echo "=== $(date -u +%FT%TZ) end $SCRIPT rc=$rc ==="
  exit $rc
} 9>"/tmp/regactions-$NAME.lock" >>"$LOG" 2>&1
