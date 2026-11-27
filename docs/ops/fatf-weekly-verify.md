# Weekly FATF verification (Mac launchd + EX63)

Why: the FATF black/grey list page is behind a Cloudflare challenge that GitHub-hosted runners cannot pass, so the
`fatf-weekly-fragile` job in `country-risk-source-assurance.yml` can only retain old evidence, which goes stale after 14 days.
A headed browser from the EX63 IP does pass. The sanctions promotion no longer depends on the FATF job.

How it runs
- launchd agent `~/Library/LaunchAgents/com.mema.regactions-fatf-verify.plist`: Mondays 06:00 local (London). A missed run fires at next wake.
- Script `scripts/ops/fatf-verify-weekly.sh` (installed copy: `~/bin/regactions-fatf-verify.sh`):
  fresh worktree off origin/main under `~/mema-worktrees/`, then `~/bin/rx` runs
  `FATF_BROWSER_HEADLESS=false xvfb-run npm run country-risk:verify-fatf -- --write` on EX63 and writes changed files back.
  If evidence changed it commits, pushes `automation/fatf-verify-mac-<stamp>`, opens a PR with the Mac's `gh` auth, waits for CI,
  tests the result (the watch exits 0 on red) and squash-merges only if green. The worktree is removed afterwards.
- No runner is registered on the public repo and no token is stored on EX63.

Check it
- `tail ~/Library/Logs/regactions-fatf-verify.log` (stderr: `regactions-fatf-verify.err`); `launchctl list | grep fatf-verify`.
- Run now: `~/bin/regactions-fatf-verify.sh`.
- Freshness: `verifiedAt` in `src/data/fatfStatus.ts`; source health at the `country-risk` issue in GitHub.
- Failures raise a macOS notification. Exit 1 from verify means the curated list drifted from FATF and needs a human to update `src/data/fatfStatus.ts`.
