# FCA Fines Scraper

This folder contains the tooling required to rebuild the FCA fines database inside Neon directly from the FCA “**YYYY fines**” pages (for example https://www.fca.org.uk/news/news-stories/2025-fines). The scraper parses the official tables, normalises each row, and loads the data into `fca_fines`/`fca_fine_trends`.

## Architecture

```
FCA yearly table (axios + cheerio)
        ↓
Normalise row (firm, date, amount, reason)
        ↓
INSERT ... ON CONFLICT into fca_fines
        ↓
SELECT refresh_fca_fine_trends()
        ↓
Neon (horizon database)
```

### Components

| File                   | Purpose                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------- |
| `fca_fines_schema.sql` | Creates `fca_fines`, `fca_fine_trends` and the refresh helper                          |
| `scrapeFcaFines.ts`    | Fetches each `/{year}-fines` page, parses the table, and upserts rows                  |
| `.env.example`         | Documents the required environment variables (`NEON_FCA_FINES_URL`, `FCA_YEARS`, etc.) |

## Running locally

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Configure secrets**
   Create `.env.local` (or export env vars) with:
   ```dotenv
   NEON_FCA_FINES_URL=postgresql://user:password@ep-example.neon.tech/neondb?sslmode=require
   FCA_YEARS=2025,2024        # optional – comma separated list
   FCA_START_YEAR=2013        # used when FCA_YEARS unset
   FCA_END_YEAR=2025
   FCA_SINCE_DATE=2013-01-01
   ```
3. **Dry run (prints to console, no DB writes)**
   ```bash
   npm run scrape:fines:dry
   ```
4. **Load into Neon**
   ```bash
   npm run scrape:fines
   ```

Cron recommendations:

- **Daily**: `FCA_YEARS=$(date +%Y)` to ingest the current year.
- **Monthly**: run a mini backfill (`FCA_START_YEAR=2013 FCA_END_YEAR=$(date +%Y)`).

## GitHub Actions automation

The repository ships with two live-regulator workflows:

- `.github/workflows/daily-fca-scraper.yml` for the stable daily live set at `05:45 UTC`
- `.github/workflows/fragile-live-regulator-scrapers.yml` for lower-confidence live feeds on `Monday` and `Thursday` at `06:15 UTC`

Each batch is followed by `npm run check:live-freshness` so stale or missing live feeds fail visibly in Actions. To enable the workflows:

1. In GitHub ➜ **Settings ➜ Secrets and variables ➜ Actions**, add the following secrets:
   - `DATABASE_URL` – database connection string (required).
   - `FCA_USER_AGENT` – optional override if FCA blocks the default UA.
   - `SEC_USER_AGENT` – required identifying user agent for the SEC scraper.
2. (Optional) add repository-level **variables** for `FCA_YEARS`, `FCA_START_YEAR`, `FCA_END_YEAR`, `FCA_SINCE_DATE`, `SEC_SINCE_YEAR`, `SEBI_SINCE_YEAR`, `SEBI_ENRICH_LIMIT`, `CNBCZ_SINCE_YEAR`, `CNBCZ_PDF_ENRICH_LIMIT`, or `CYSEC_PDF_ENRICH_LIMIT` to control crawl windows.
   - `SEBI_ENRICH_LIMIT` now defaults to the full current listing. Set it only if you want to cap local or CI enrichment work for faster diagnostics.
   - `CNBCZ_SINCE_YEAR` lets daily Czech runs stay recent-year only after an initial backfill.
   - `CNBCZ_PDF_ENRICH_LIMIT` caps how many Czech decisions fetch PDFs for amount extraction on each run. Older decisions still load as records even when PDF enrichment is skipped.
   - `CYSEC_PDF_ENRICH_LIMIT` caps how many CySEC board decisions fetch PDFs for amount fallback on each run when the visible card text has no monetary figure.
3. The workflows use per-regulator matrix jobs with isolated concurrency groups so one source failure does not block the full live batch. Monitor the Actions tab for success/failure logs and freshness-check output.
4. Freshness jobs now emit both:
   - a GitHub step summary with per-regulator status, cadence, and operator guidance
   - an artifact JSON payload (`daily-live-regulator-health` or `fragile-live-regulator-health`) so multi-cycle monitoring can compare runs over time

### Freshness statuses

- `OK` – feed is inside its cadence window and above the minimum healthy record floor
- `WARN` – feed is fresh, but live archive volume has dropped below the expected floor for that source contract
- `STALE` – latest record is outside the allowed cadence window
- `MISSING` – no live records were found for that regulator in `all_regulatory_fines`

Lower-confidence live feeds have explicit source contracts:

- `DFSA`, `CBUAE` – curated official-document archive ingestion from challenge-protected public indexes
- `JFSC` – sparse-source public statements feed where low volume may be normal
- `CIRO` – automated live listing ingestion, but still treated as lower-confidence while source normalization matures

### Europe Phase 1 live commands

The viable first Europe expansion wave now ships with dedicated scrapers and a batch runner:

- `npm run scrape:bdi`
- `npm run scrape:acpr`
- `npm run scrape:cssf`
- `npm run scrape:fsma`
- `npm run scrape:europe-phase-one`

These loaders are wired into the stable daily live-regulator workflow. `CONSOB` remains outside the live batch until its official-source access path is production-grade from this environment.

### Europe Phase 2 live commands

The current viable second Europe wave also has dedicated scrapers and can run independently or through its batch runner:

- `npm run scrape:fise`
- `npm run scrape:ftdk`
- `npm run scrape:ftno`
- `npm run scrape:cnbcz`
- `npm run scrape:cysec`
- `npm run scrape:finfsa`
- `npm run scrape:europe-phase-two`

`FISE`, `FTDK`, `FTNO`, `CNBCZ`, `CYSEC`, and `FINFSA` are wired into the stable daily live-regulator workflow. For `CNBCZ`, use `CNBCZ_SINCE_YEAR` and `CNBCZ_PDF_ENRICH_LIMIT` in CI so the daily job stays incremental after the initial archive backfill.

### Fragile live commands

Browser-backed or lower-confidence live loaders run through the fragile cadence workflow:

- `npm run scrape:fmaat`
- `npm run scrape:finma`
- `npm run scrape:austrac`

The remaining core Europe targets stay outside the live batch until their official-source position improves from this environment:

- `CONSOB` and `Banco de Portugal` are challenge-protected from this environment
- `MFSA` runs in the fragile live lane because the official current pages and archive require browser challenge clearance before extraction

## How upserts work

1. Each row generates `content_hash = sha256(firm + amount + date_issued)` to dedupe.
2. `INSERT ... ON CONFLICT (content_hash)` keeps existing rows fresh.
3. After every batch, `SELECT refresh_fca_fine_trends();` recalculates the stats table consumed by the dashboard.

## Notes

- Amount parsing understands `k`, `million`, `billion` and clamps impossible values to avoid numeric overflow.
- If a year page is missing (HTTP 404) it is skipped gracefully.
- The scraper is stateless: rerunning it is safe.

Use this scraper as the single source of truth so both the stand‑alone dashboard and the Next.js site read the same Neon data.
