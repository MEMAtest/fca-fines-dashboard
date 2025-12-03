# FCA Fines – Supabase ➜ Neon Migration Plan

The current dashboard reads from the `fca_fines` table that lives inside the Supabase project `jypcwaskqihgnnasawie`. The front-end connects straight from the browser using the Supabase anon key, which exposes the table publicly and ties us to Supabase auth/REST APIs. The goal is to move the data and every consumer to Neon PostgreSQL (the same provider already used in `mema-platform`).

The migration can be completed in six phases:

1. **Export the existing Supabase data**
2. **Provision the Neon database structure**
3. **Restore the data into Neon and rebuild derived tables**
4. **Wire up secure API endpoints that read from Neon**
5. **Update the dashboard to call those APIs instead of Supabase**
6. **Retire Supabase once traffic is flowing from Neon**

---
## 1. Export from Supabase

1. Grab the service role password from the Supabase dashboard (Project Settings ➜ Database ➜ `password`).
2. Run `pg_dump` locally (replace `${SUPABASE_PASSWORD}` first):
   ```bash
   export SUPABASE_URL="postgresql://postgres:${SUPABASE_PASSWORD}@db.jypcwaskqihgnnasawie.supabase.co:5432/postgres"
   pg_dump --no-owner --no-privileges --format=custom --table=fca_fines --table=fca_fine_trends $SUPABASE_URL \
     --file=backups/supabase-fca-fines.dump
   ```
3. Optional: create a CSV snapshot for audit purposes:
   ```bash
   psql $SUPABASE_URL -c "COPY fca_fines TO STDOUT WITH CSV HEADER" > backups/fca_fines.csv
   ```
   Keep the dump files in a private bucket / encrypted disk.

## 2. Create and prepare Neon

1. In the Neon console create a project named `fca-fines` (Postgres 15, `Production` compute preset works fine).
2. Create a **branch** named `production` and a database named `horizon` (to mirror `HORIZON_DB_URL` used in `mema-platform`).
3. Grant a dedicated role for the ingestion worker:
   ```sql
   CREATE ROLE fines_ingestor LOGIN PASSWORD 'strong-long-password';
   GRANT CONNECT ON DATABASE horizon TO fines_ingestor;
   GRANT USAGE ON SCHEMA public TO fines_ingestor;
   ```
4. Store the resulting connection string as `NEON_FCA_FINES_URL` (example: `postgresql://fines_ingestor:***@ep-proud-***.eu-central-1.aws.neon.tech/horizon?sslmode=require`).

## 3. Deploy schema + restore data

The schema lives in [`scripts/scraper/fca_fines_schema.sql`](scripts/scraper/fca_fines_schema.sql). It creates:

- `fca_fines` – raw enforcement actions with JSONB fields for categories
- `fca_fine_trends` – pre-aggregated year/month metrics used by the widget
- helper indexes and a `refresh_fca_fine_trends()` function so the API can stay lean

Apply it:
```bash
psql $NEON_FCA_FINES_URL -f scripts/scraper/fca_fines_schema.sql
```

Then restore the dump:
```bash
pg_restore --no-owner --no-privileges --role=fines_ingestor \
  --dbname=$NEON_FCA_FINES_URL backups/supabase-fca-fines.dump
```

After the restore run the aggregation refresh once to populate the trend table:
```bash
psql $NEON_FCA_FINES_URL -c "SELECT refresh_fca_fine_trends();"
```

## 4. Secure API layer (Vercel / Cloudflare Worker / Next.js route)

The browser must **never** hold a Neon connection string. Create a tiny API service—either inside the existing `mema-platform` Next.js app or as a Cloudflare Worker—that exposes:

- `GET /api/fca-fines/stats?year=2024` – returns the same payload currently served by `app/api/fca-enforcement/stats` in `mema-platform`
- `GET /api/fca-fines/trends?period=month&limit=12&year=2024`
- `GET /api/fca-fines/search?q=consumer duty&year=2024&limit=50` (optional)

These handlers can reuse the `lib/enforcement-db.ts` pattern from `mema-platform`, just pointing `HORIZON_DB_URL` to the Neon string. Keep the `Pool` alive via serverless-friendly libraries (Neon’s `@neondatabase/serverless` driver or Vercel’s built-in Postgres connector) to avoid connection storms.

## 5. Update the dashboard front-end

Inside `index.html` replace the Supabase block (lines ~850-970) with fetches against the new API:
```js
async function loadData() {
  const response = await fetch('https://api.memaconsultants.com/fca-fines/search');
  const payload = await response.json();
  allData = payload.data;
  // ... same filter + chart logic as today
}
```

Config values to remove from the client:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

The only public call should be to your own API domain.

## 6. Clean-up & monitoring

1. Rotate any old Supabase keys and move the project to read-only mode, then delete it once traffic is entirely on Neon.
2. Enable PITR + automated backups in Neon (Project ➜ Settings ➜ Backups).
3. Add Healthchecks to ensure the scraper refresh job succeeds (see `scripts/scraper/README.md`).
4. Set `HORIZON_DB_URL` (Next.js) / `NEON_FCA_FINES_URL` (scraper) in 1Password and Vercel/Render secrets.

---
### Quick reference

| Item | Value |
| ---- | ----- |
| Supabase connection | `postgresql://postgres:<password>@db.jypcwaskqihgnnasawie.supabase.co:5432/postgres` |
| Neon database | `horizon` (branch `production`) |
| Primary table | `public.fca_fines` |
| Aggregation table | `public.fca_fine_trends` |
| API env var | `HORIZON_DB_URL` / `NEON_FCA_FINES_URL` |

This keeps the `mema-platform` codebase consistent: every service tool calls the same Neon cluster via `HORIZON_DB_URL`, and the scraper is the single writer that keeps `fca_fines` fresh.
