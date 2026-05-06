# RegActions - Project Knowledge

## Project Overview

Multi-regulator enforcement fines dashboard with 30+ global regulator scrapers. React 19 + Vite + Express, PostgreSQL (Hetzner), TypeScript.
**Prod:** https://regactions.com | **Repo:** github.com/MEMAtest/fca-fines-dashboard | **Deploy:** Vercel (auto on push to `main`)

## Key Commands

```bash
npm run dev              # Vite dev server (frontend, port 5173)
npm run dev:api          # Express API server (port 4000)
npm run build            # vite build + OG images + SEO prerender
npm test                 # Vitest unit tests
npm run test:e2e         # Playwright E2E (build first)
npm run scrape:fines     # FCA enforcement scraper
npm run scrape:fines:dry # Dry-run FCA scraper
npm run scrape:esma      # ESMA scraper (+ 17 other regulator scrapers)
npm run scrape:next-eight # Batch run multiple scrapers
npm run check:live-freshness  # Check scraper health
```

## Architecture

- **Frontend:** React 19 + Vite + React Router 7
- **Backend:** Express 5 server (`server.ts`, port 4000)
- **API (prod):** Vercel serverless functions in `api/` directory
- **Database:** PostgreSQL on Hetzner via `pg` driver
- **Charts:** Recharts 3
- **Animations:** Framer Motion
- **Email:** Resend API + AWS SES
- **Scraping:** Cheerio (HTML) + Puppeteer (JS-heavy sites)
- **No auth** — public dashboard

## Directory Structure

```
├── api/                    # Vercel serverless routes
│   ├── fca-fines/          # 11 FCA endpoints (list, stats, trends, etc.)
│   ├── unified/            # Cross-regulator (stats, search, compare)
│   ├── alerts/             # Alert subscriptions
│   ├── digest/             # Daily digest subscriptions
│   ├── watchlist/          # Watchlist management
│   └── homepage/           # Homepage stats
├── src/
│   ├── pages/              # 23 React pages
│   ├── components/         # 51+ components
│   ├── hooks/              # 11 custom hooks
│   ├── styles/             # 27 stylesheets
│   ├── types.ts            # TypeScript types
│   ├── api.ts              # API client
│   ├── router.tsx          # React Router config
│   └── App.tsx             # Root component
├── server/
│   ├── services/           # Express services (fcaFines, hubs, homepage, etc.)
│   └── db.ts               # SQL client
├── scripts/
│   ├── scraper/            # 50+ scraper files
│   │   ├── scrapeFcaFines.ts         # Primary UK scraper
│   │   ├── scrapeEsma.ts, scrapeBafin.ts, scrapeAmf.ts, ...
│   │   ├── scrapeNextEight.ts        # Batch runner
│   │   ├── checkLiveRegulatorFreshness.ts
│   │   └── lib/                      # Shared scraper utilities
│   ├── generate-og-images.ts         # OG image generation (build step)
│   └── prerender-seo.ts             # SEO prerendering (build step)
├── migrations/             # SQL migrations
├── e2e/                    # Playwright tests
├── server.ts               # Express entry point
└── vite.config.ts          # Vite config (proxy /api → localhost:4000)
```

## Key Files

| File | Purpose |
|------|---------|
| `server.ts` | Express server entry (282 lines), serves API + static files |
| `server/db.ts` | PostgreSQL pool with `pg` driver |
| `api/fca-fines/list.ts` | Paginated fines list with filters |
| `api/fca-fines/stats.ts` | Annual statistics aggregation |
| `api/unified/search.ts` | Cross-regulator full-text search |
| `scripts/scraper/scrapeFcaFines.ts` | Primary FCA enforcement scraper |
| `scripts/scraper/lib/runScraper.ts` | Common scraper framework |

## API Routes

**FCA Fines (11):** `/api/fca-fines/{list,stats,trends,notifications,categories,years,sectors,firms,firm,breach,sector}`
**Unified (3):** `/api/unified/{stats,search,compare}`
**Alerts (4):** `/api/alerts/{subscribe,verify/[token],unsubscribe/[token],resend-verification}`
**Digest (3):** `/api/digest/{subscribe,verify/[token],unsubscribe/[token]}`
**Watchlist (3):** `/api/watchlist/{add,verify/[token],unsubscribe/[token]}`
**Other:** `/api/homepage/stats`, `/api/contact`, `/api/daily-digest`, `/api/search`, `/api/pageview`

## Environment Variables

**Required:**
```
DATABASE_URL=postgresql://fca_app:PASSWORD@89.167.95.173:5432/fcafines?sslmode=no-verify
PORT=4000
```

**Email:**
```
RESEND_API_KEY=              # Contact form emails
AWS_ACCESS_KEY_ID=           # SES for alerts/digests
AWS_SECRET_ACCESS_KEY=
AWS_SES_REGION=eu-west-2
SES_FROM_EMAIL=
```

**Optional:**
```
NEXT_PUBLIC_BASE_URL=https://regactions.com
FCA_YEARS=2026,2025         # Years to scrape
```

## Gotchas

- **`breach_categories` column is double-encoded JSONB** — 312/316 rows store a JSON string like `"[\"AML\",\"PRINCIPLES\"]"` instead of a native array. Must wrap in `CASE WHEN jsonb_typeof(col) = 'string' THEN (col #>> '{}')::jsonb ELSE col END` before using `jsonb_array_elements_text()`
- **Build has 3 steps:** `vite build` → `generate-og-images.ts` → `prerender-seo.ts`
- **Dev requires two processes:** Vite frontend (5173) + Express API (4000). Vite proxies `/api` to Express
- **SSL:** Use `sslmode=no-verify` for Hetzner self-signed cert

## Database

- **Host:** 89.167.95.173 (Hetzner), user `fca_app`, DB `fcafines`
- **Key tables:**
  - `fca_fines` (316+ rows) — FCA enforcement actions
  - `eu_fines` — Multi-regulator EU/global fines
  - `all_regulatory_fines` — Materialized view combining all sources
- **Full-text search:** `tsvector` columns with GIN indexes (migration 20260325)
- **9 tables total** in the database

## Scrapers

30+ global regulator scrapers in `scripts/scraper/`:
- **UK:** FCA (primary), FSCA
- **EU:** ESMA, BaFin, AMF, CNMV, AFM, DNB, CBI, ECB, CONSOB, FINMA
- **Americas:** SEC, CIRO, OCC, FRB, FDIC, CNBV, CVM, CMF
- **Asia-Pacific:** SEBI, MAS, HKMA, ASIC, SFC, CSRC, SESC, TWFSC, FMANZ
- **Middle East:** DFSA, FSRA, CBUAE
- **Caribbean:** JFSC, GFSC
