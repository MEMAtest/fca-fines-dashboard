#!/bin/zsh
# Weekly FATF list re-verification, run from the Mac (launchd) with the heavy work on EX63 via rx.
# FATF sits behind a Cloudflare challenge that GitHub-hosted runners cannot pass; a headed browser from
# EX63 can. Opens a PR with the refreshed evidence metadata and merges it only when CI is green.
# Installed copy: ~/bin/regactions-fatf-verify.sh   Agent: ~/Library/LaunchAgents/com.mema.regactions-fatf-verify.plist
set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/bin:/usr/bin:/bin:/usr/sbin:/sbin"
REPO="$HOME/Documents/fca-fines-dashboard"
LOG="$HOME/Library/Logs/regactions-fatf-verify.log"
STAMP=$(date +%Y%m%d-%H%M%S)
BRANCH="automation/fatf-verify-mac-$STAMP"
WT="$HOME/mema-worktrees/fatf-verify-$STAMP"
mkdir -p "$(dirname "$LOG")"
log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }
notify() { osascript -e "display notification \"$1\" with title \"RegActions FATF verify\"" >/dev/null 2>&1; }
cleanup() { cd "$REPO" 2>/dev/null && git worktree remove --force "$WT" >/dev/null 2>&1; git -C "$REPO" branch -D "$BRANCH" >/dev/null 2>&1; }
fail() { log "FAILED: $1"; notify "Failed: $1 (see ~/Library/Logs/regactions-fatf-verify.log)"; cleanup; exit 1; }

log "start"
git -C "$REPO" fetch -q origin main >>"$LOG" 2>&1 || fail "git fetch"
git -C "$REPO" worktree add -q -b "$BRANCH" "$WT" origin/main >>"$LOG" 2>&1 || fail "worktree add"
cd "$WT" || fail "cd worktree"

# Headed Chromium under xvfb on EX63 passes the FATF challenge; rx writes changed files back here.
~/bin/rx bash -c 'FATF_BROWSER_HEADLESS=false xvfb-run -a npm run country-risk:verify-fatf -- --write' >>"$LOG" 2>&1
rc=$?
# exit 1 = drift: the curated list no longer matches FATF, which needs a human.
[ $rc -eq 0 ] || fail "verify-fatf exit $rc (1 = list drift, needs a human; 2 = FATF unreachable)"

if [ -z "$(git status --porcelain -- src scripts)" ]; then
  log "no evidence change; nothing to do"; cleanup; exit 0
fi
git add -A src scripts
git commit -qm "data(country-risk): refresh FATF evidence (weekly Mac verification)" >>"$LOG" 2>&1 || fail "commit"
git push -q origin "HEAD:$BRANCH" >>"$LOG" 2>&1 || fail "push"
PR=$(gh pr create --base main --head "$BRANCH" --title "data(country-risk): refresh FATF evidence (weekly Mac verification)" \
  --body "Automated weekly re-verification of the FATF black/grey lists, run from EX63 via the Mac (GitHub-hosted runners cannot pass FATF's Cloudflare challenge). The curated list was confirmed in sync with the live FATF page; only verification metadata changed." 2>>"$LOG" | tail -1)
[ -n "$PR" ] || fail "gh pr create"
log "opened $PR"

# Wait for checks, then test the result (the watch exits 0 on red).
sleep 45
for i in {1..80}; do
  out=$(gh pr checks "$PR" 2>&1)
  echo "$out" | grep -qE $'\tpending|\tqueued|\tin_progress' || break
  sleep 30
done
out=$(gh pr checks "$PR" 2>&1)
if echo "$out" | grep -qE $'\tfail|\tcancel' || echo "$out" | grep -qE $'\tpending'; then
  log "checks not green:\n$out"; notify "PR $PR checks not green; left open"; cleanup; exit 1
fi
gh pr merge "$PR" --squash >>"$LOG" 2>&1 || fail "merge $PR"
log "merged $PR"
cleanup
log "done"
