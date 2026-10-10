# Hetzner scraper host (`/opt/regactions-scrapers`)

Scrapers whose sites block GitHub-hosted runner IPs (Cloudflare/WAF) run on the
Hetzner box, where a FlareSolverr container listens on `127.0.0.1:8191`.
GitHub Actions cannot reach it.

## Database target (read this first)

**Root cause of the five-month staleness:** the Hetzner cron wrote to Hetzner
`fcafines` through `DATABASE_URL`, but the public site reads
`REGACTIONS_DATABASE_URL` first (`server/db.ts`). Hetzner held OCC to
2026-10-07 and SFC/CIRO to 09-28 while the site still showed April.

Every script now resolves its database through `scripts/lib/dbTarget.ts`:
`REGACTIONS_DATABASE_URL` first, then `DATABASE_URL` (same precedence as
`server/db.ts`; no `HORIZON_DB_URL`/`POSTGRES_URL` fallback). At start each
scraper prints `database target: host=... db=...` (never the password) and
refuses to write when the host or name differs from
`REGACTIONS_EXPECTED_DB_HOST` / `REGACTIONS_EXPECTED_DB_NAME`.

Set in `/opt/regactions-scrapers/.env`:

```bash
# SAME value as Vercel's REGACTIONS_DATABASE_URL (Vercel project env, Production)
REGACTIONS_DATABASE_URL=postgres://...site database...
# Pin the target; the wrapper refuses to run without these
REGACTIONS_EXPECTED_DB_HOST=<host part of that URL>
REGACTIONS_EXPECTED_DB_NAME=<database name part of that URL>
FLARESOLVERR_URL=http://127.0.0.1:8191
```

`REGACTIONS_DATABASE_URL` and `DATABASE_URL` must both resolve to this same
Hetzner database. RegActions does not use a secondary Neon or Horizon target.

GitHub: set repository **variables** (not secrets) `REGACTIONS_EXPECTED_DB_HOST`
and `REGACTIONS_EXPECTED_DB_NAME`, and optionally a secret
`REGACTIONS_DATABASE_URL` (if the existing `DATABASE_URL` secret already points
at the site database, the variables alone are enough as a guard).

### Verify before enabling cron

```bash
cd /opt/regactions-scrapers
scripts/ops/hetzner-run-scraper.sh --check           # prints {"host":...,"database":...}, exit 0 only if it matches the expected vars
npm run scrape:ecb -- --dry-run | head -5            # first line must say: database target: host=<expected host> db=<expected name>
```

The host it prints must equal the host in Vercel's `REGACTIONS_DATABASE_URL`.

### One-off catch-up (run once, after the check passes)

Run serially (FlareSolverr shares the Postgres box). This lands the missing months:

```bash
/opt/regactions-scrapers/scripts/ops/hetzner-run-scraper.sh scrape:fines 120 # FCA_YEARS unset = full archive
/opt/regactions-scrapers/scripts/ops/hetzner-run-scraper.sh scrape:fca-enforcement 120
/opt/regactions-scrapers/scripts/ops/hetzner-run-scraper.sh scrape:occ 120
/opt/regactions-scrapers/scripts/ops/hetzner-run-scraper.sh scrape:cssf 120
/opt/regactions-scrapers/scripts/ops/hetzner-run-scraper.sh scrape:ecb 120
/opt/regactions-scrapers/scripts/ops/hetzner-run-scraper.sh scrape:bdi 120
/opt/regactions-scrapers/scripts/ops/hetzner-run-scraper.sh scrape:fsra 120
/opt/regactions-scrapers/scripts/ops/hetzner-run-scraper.sh scrape:fise 120
/opt/regactions-scrapers/scripts/ops/hetzner-run-scraper.sh scrape:sfc 120
/opt/regactions-scrapers/scripts/ops/hetzner-run-scraper.sh scrape:ciro 120
/opt/regactions-scrapers/scripts/ops/hetzner-run-scraper.sh scrape:fmanz 120
/opt/regactions-scrapers/scripts/ops/hetzner-run-scraper.sh scrape:finra 120
/opt/regactions-scrapers/scripts/ops/hetzner-run-scraper.sh scrape:mfsa 120
```

Then confirm: `npm run --silent check:live-freshness -- --cadence=daily` and
reload the site's regulator pages.

## One delivery path per regulator

A lock is per host, so no regulator is scheduled on both hosts. The list lives in
`scripts/ops/hetzner-schedule.json`; a test fails if a Hetzner regulator also
appears in a GitHub matrix or if a live regulator has no schedule.

| Regulator | Runs on | Why |
|---|---|---|
| FCA fines, FCA enforcement | Hetzner | Cloudflare 403 on GitHub IPs (FlareSolverr) |
| OCC, CSSF, ECB, BDI, FSRA, FISE, SFC | Hetzner | Moved off GitHub in May 2026 for IP blocks; kept on one path, now writing to the site DB |
| CIRO, FMANZ | Hetzner | Cloudflare challenge needs FlareSolverr |
| FINRA | Hetzner | Export 403 / archive 429 from GitHub runner IPs (2026-10-10 run) |
| MFSA | Hetzner | Cloudflare challenge; on GitHub it returned only the 2024-06 archive |
| AUSTRAC | GitHub | Latest GitHub run succeeded; no blocking reason |
| CMVM | GitHub | Failure was a worker timeout (fixed), not an IP block |
| CBN, NGSEC | GitHub | Newly scheduled; no blocking |
| SEC | GitHub | Daily incremental + weekly 365-day rescan (`weekly-sec-backfill.yml`) |
| FSCA | GitHub | Daily in `africa-enforcement-candidates.yml`; amount repair dry run 2026-10-10: 577 rows, 0 changes |
| everything else live | GitHub | Unchanged |

## Crontab (`/etc/crontab`, user `root`, times UTC)

```cron
# keep the checkout current (before the first scraper)
15 2 * * *  root  cd /opt/regactions-scrapers && git pull --ff-only -q origin main && npm ci --legacy-peer-deps --silent >> /var/log/regactions-scrapers/update.log 2>&1

0 3 * * *  root  FCA_YEARS=$(date +\%Y),$(( $(date +\%Y) - 1 )) /opt/regactions-scrapers/scripts/ops/hetzner-run-scraper.sh scrape:fines 30
0 5 * * *  root  /opt/regactions-scrapers/scripts/ops/hetzner-run-scraper.sh scrape:fca-enforcement 40
30 3 * * *  root  /opt/regactions-scrapers/scripts/ops/hetzner-run-scraper.sh scrape:occ 35
0 4 * * *  root  /opt/regactions-scrapers/scripts/ops/hetzner-run-scraper.sh scrape:cssf 35
10 4 * * *  root  /opt/regactions-scrapers/scripts/ops/hetzner-run-scraper.sh scrape:ecb 20
20 4 * * *  root  /opt/regactions-scrapers/scripts/ops/hetzner-run-scraper.sh scrape:bdi 20
30 4 * * *  root  /opt/regactions-scrapers/scripts/ops/hetzner-run-scraper.sh scrape:fsra 20
40 4 * * *  root  /opt/regactions-scrapers/scripts/ops/hetzner-run-scraper.sh scrape:fise 20
50 4 * * *  root  /opt/regactions-scrapers/scripts/ops/hetzner-run-scraper.sh scrape:sfc 35
20 5 * * *  root  /opt/regactions-scrapers/scripts/ops/hetzner-run-scraper.sh scrape:ciro 40
40 5 * * *  root  /opt/regactions-scrapers/scripts/ops/hetzner-run-scraper.sh scrape:fmanz 30
0 6 * * *  root  /opt/regactions-scrapers/scripts/ops/hetzner-run-scraper.sh scrape:finra 45
20 7 * * *  root  /opt/regactions-scrapers/scripts/ops/hetzner-run-scraper.sh scrape:mfsa 40

# full FCA fines archive weekly
30 3 * * 0  root  /opt/regactions-scrapers/scripts/ops/hetzner-run-scraper.sh scrape:fines 90
```

Remove any older line for the same scrapers (for example a bare
`npm run scrape:next-eight`). `\%` is required inside crontab lines.

## One-off host setup

```bash
cd /opt/regactions-scrapers
git fetch origin && git checkout main && git pull --ff-only   # needs this PR merged
npm ci --legacy-peer-deps
chmod +x scripts/ops/hetzner-run-scraper.sh
mkdir -p /var/log/regactions-scrapers
curl -s -m 30 localhost:8191/ | head -c 200    # expect {"msg":"FlareSolverr is ready!"...}
```

## Seeing failures

The GitHub workflows end with `check:scraper-gate`, which fails the run when a
regulator is past its freshness limit AND its scraper failed. For Hetzner
regulators it reads their latest `scraper_runs` row (success in the last 72h), so
a dead cron turns the workflow red. Logs: `/var/log/regactions-scrapers/<script>.log`
and `<script>-summary.json`.

## Backfills

* SEC: incremental (120 days, `SEC_INCREMENTAL_DAYS`) daily, 365 days weekly.
  Full archive: `npm run scrape:sec -- --backfill` (`SEC_SINCE_YEAR`, default 2012).
* AMF: incremental 240 days (`AMF_INCREMENTAL_DAYS`); `-- --backfill` for all.
* CMVM pages capped by `CMVM_MAX_PAGES` (default 25).
