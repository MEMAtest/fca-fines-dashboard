# Hetzner scraper host (`/opt/regactions-scrapers`)

Scrapers whose sites challenge GitHub-hosted runners (Cloudflare) run on the
Hetzner box, where a FlareSolverr container listens on `127.0.0.1:8191`.
GitHub Actions cannot reach it. Everything else runs from
`.github/workflows/daily-fca-scraper.yml` and
`.github/workflows/fragile-live-regulator-scrapers.yml`.

> The crontab is not in the repository and nobody could SSH while this was
> written. The lines below are the intended state. Verify with `crontab -l` /
> `cat /etc/crontab` on the host and replace whatever is there for these jobs.

## Why these need the host

| Scraper | Needs FlareSolverr | Notes |
|---|---|---|
| FCA fines (`scrape:fines`) | yes | Cloudflare 403 on GHA IPs |
| FCA enforcement (`scrape:fca-enforcement`) | yes | already routed through `lib/flaresolverr.ts` |
| CIRO (`scrape:ciro`) | yes | FlareSolverr then Puppeteer fallback |
| FMANZ (`scrape:fmanz`) | yes | Cloudflare challenge; code already supports it |
| FINRA (`scrape:finra`) | yes | export XLSX 403, archive 429; archive now fetched via the solver when `FLARESOLVERR_URL` is set, with 429 backoff otherwise |
| MFSA (`scrape:mfsa`) | yes | Cloudflare challenge on mfsa.mt; current listing now fetched via the solver (plain-HTML pagination). Removed from the GHA fragile matrix |
| AUSTRAC (`scrape:austrac`) | recommended | solver tried first, headless Chrome and HTTP as fallback |
| OCC, CSSF, ECB, BDI, FSRA, FISE, SFC | no (datacenter IP only) | moved here in May 2026, then went stale; now ALSO in the daily GHA matrix |

`scripts/ops/hetzner-run-scraper.sh` wraps one scraper with a per-scraper flock,
a hard timeout, `FLARESOLVERR_URL=http://127.0.0.1:8191` and a per-scraper log
in `/var/log/regactions-scrapers/`. It exits non-zero on failure.

## One-off host setup

```bash
cd /opt/regactions-scrapers
git fetch origin && git checkout main && git pull --ff-only   # needs this PR merged
npm ci --legacy-peer-deps
chmod +x scripts/ops/hetzner-run-scraper.sh
mkdir -p /var/log/regactions-scrapers
grep -q '^FLARESOLVERR_URL=' .env || echo 'FLARESOLVERR_URL=http://127.0.0.1:8191' >> .env
curl -s -m 30 localhost:8191/ | head -c 200    # expect {"msg":"FlareSolverr is ready!"...}
```

FlareSolverr shares the Postgres box (about 4.9 GB free, no swap). The
schedule below is serial (one scraper per ten minutes) on purpose; do not
parallelise it.

## Crontab (`/etc/crontab`, user `root`, times UTC)

```cron
# keep the checkout current (before the first scraper)
15 2 * * *  root  cd /opt/regactions-scrapers && git pull --ff-only -q origin main && npm ci --legacy-peer-deps --silent >> /var/log/regactions-scrapers/update.log 2>&1

# FCA: current + previous year daily (fast); full archive weekly
 0 3 * * *  root  FCA_YEARS=$(date +\%Y),$(( $(date +\%Y) - 1 )) /opt/regactions-scrapers/scripts/ops/hetzner-run-scraper.sh scrape:fines 30
30 3 * * 0  root  /opt/regactions-scrapers/scripts/ops/hetzner-run-scraper.sh scrape:fines 90
 0 5 * * *  root  /opt/regactions-scrapers/scripts/ops/hetzner-run-scraper.sh scrape:fca-enforcement 40

# Cloudflare-walled sources that only work through FlareSolverr
20 5 * * *  root  /opt/regactions-scrapers/scripts/ops/hetzner-run-scraper.sh scrape:ciro 40
40 5 * * *  root  /opt/regactions-scrapers/scripts/ops/hetzner-run-scraper.sh scrape:fmanz 30
 0 6 * * *  root  /opt/regactions-scrapers/scripts/ops/hetzner-run-scraper.sh scrape:finra 45
40 6 * * *  root  /opt/regactions-scrapers/scripts/ops/hetzner-run-scraper.sh scrape:austrac 25
20 7 * * *  root  /opt/regactions-scrapers/scripts/ops/hetzner-run-scraper.sh scrape:mfsa 40

# Second delivery path for the seven sources that were moved here in May 2026
30 3 * * 1-6 root /opt/regactions-scrapers/scripts/ops/hetzner-run-scraper.sh scrape:occ 35
 0 4 * * *  root  /opt/regactions-scrapers/scripts/ops/hetzner-run-scraper.sh scrape:cssf 35
10 4 * * *  root  /opt/regactions-scrapers/scripts/ops/hetzner-run-scraper.sh scrape:ecb 20
20 4 * * *  root  /opt/regactions-scrapers/scripts/ops/hetzner-run-scraper.sh scrape:bdi 20
30 4 * * *  root  /opt/regactions-scrapers/scripts/ops/hetzner-run-scraper.sh scrape:fsra 20
40 4 * * *  root  /opt/regactions-scrapers/scripts/ops/hetzner-run-scraper.sh scrape:fise 20
50 4 * * *  root  /opt/regactions-scrapers/scripts/ops/hetzner-run-scraper.sh scrape:sfc 35
```

Remove any older line for the same scraper (for example a bare
`npm run scrape:next-eight`). `scrape:next-eight` and the `europe-phase-*`
wrappers no longer abort on the first failure (`lib/runScraperBatch.ts`), but
the per-scraper lines above are preferred because each gets its own timeout,
log and exit code.

Note: `\%` is required inside crontab lines. The FCA fines scraper also adds the
current year to `FCA_YEARS` itself, so the daily line is a safety net.

## Checking it worked

```bash
tail -n 30 /var/log/regactions-scrapers/scrape_fines.log
cat /var/log/regactions-scrapers/scrape_ecb-summary.json     # status, qualityStatus, latestPreparedDate
cd /opt/regactions-scrapers && npm run --silent check:live-freshness -- --cadence=daily
```

## Backfills

* SEC runs incrementally (last 120 days, `SEC_INCREMENTAL_DAYS`) by default.
  Full archive: `hetzner-run-scraper.sh scrape:sec 120 -- --backfill`
  (honours `SEC_SINCE_YEAR`, default 2012).
* AMF runs incrementally (last 240 days, `AMF_INCREMENTAL_DAYS`). Full listing:
  `scrape:amf -- --backfill`.
* CMVM pages are capped by `CMVM_MAX_PAGES` (default 25 pages of 10).
