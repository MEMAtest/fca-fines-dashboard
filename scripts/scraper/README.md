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

| File | Purpose |
| ---- | ------- |
| `fca_fines_schema.sql` | Creates `fca_fines`, `fca_fine_trends` and the refresh helper |
| `scrapeFcaFines.ts` | Fetches each `/{year}-fines` page, parses the table, and upserts rows |
| `.env.example` | Documents the required environment variables (`NEON_FCA_FINES_URL`, `FCA_YEARS`, etc.) |

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

The repository ships with `.github/workflows/daily-fca-scraper.yml`, which runs `npm run scrape:fines` every morning at 06:00 UTC (plus on manual dispatch). To enable it:

1. In GitHub ➜ **Settings ➜ Secrets and variables ➜ Actions**, add the following secrets:
   - `NEON_FCA_FINES_URL` – Neon connection string (required).
   - `FCA_USER_AGENT` – optional override if FCA blocks the default UA.
2. (Optional) add repository-level **variables** for `FCA_YEARS`, `FCA_START_YEAR`, `FCA_END_YEAR`, or `FCA_SINCE_DATE` to control the backfill window.
3. The workflow uses npm caching and a concurrency lock so only one scrape runs at a time. Monitor the Actions tab for success/failure logs.

## How upserts work

1. Each row generates `content_hash = sha256(firm + amount + date_issued)` to dedupe.
2. `INSERT ... ON CONFLICT (content_hash)` keeps existing rows fresh.
3. After every batch, `SELECT refresh_fca_fine_trends();` recalculates the stats table consumed by the dashboard.

## Notes

- Amount parsing understands `k`, `million`, `billion` and clamps impossible values to avoid numeric overflow.
- If a year page is missing (HTTP 404) it is skipped gracefully.
- The scraper is stateless: rerunning it is safe.

Use this scraper as the single source of truth so both the stand‑alone dashboard and the Next.js site read the same Neon data.
