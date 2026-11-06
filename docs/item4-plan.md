# Item 4 - commercial surface: plan and definition of done

## What exists (audited 2026-11-06)
- Registered API core is already built: `server/services/developerApiAccess.ts` (sha256 key hash, `X-API-Key` or Bearer,
  per-minute and per-day buckets, 429 + Retry-After, usage rows in `developer_api_usage_events`, operator alerts),
  guarding country-risk, regulatory-signal and unified-search handlers. Schema migrations 20260909/0910/0914 are applied
  on prod (a bad key returns 401 `invalid_api_key`, not 500). `developer-api-migrate.yml` is the dispatch-only migration workflow.
- Applications: `api/developers/apply.ts` records a pending row and notifies contact@. No key is issued.
- Keys can only be issued by a local CLI (`scripts/developer-api/issue-key.ts`): no admin route, no revoke, term is a CLI flag
  not the application's requested term.
- Developers page + `src/data/developersApiDocs.ts` document only `X-API-Key` and 429; no error-code table, no provenance
  contract. Board packs (`api/board-pack/*`, `BoardPackPdfDocument.tsx`, @react-pdf/renderer) are proven; evidence endpoints
  render PDFs server-side with react-pdf.
- `ExportMenu` (CSV/XLSX/JSON/PDF/PNG) covers FineRecord lists only; CSV via papaparse with no BOM, no formula guard, no footer.
  Countries overview table, regulator and search views have no CSV of the shown rows.
- Roadmap: "Branded export and sharing" (2026 Q3) and "API and embedded surfaces" (2026 Q4) are `planned`.

## Gaps and build
1. Admin route `/api/developers/admin` (Bearer ADMIN_API_KEY, constant-time compare, same pattern as digest-subscribers):
   issue key from an application (random `ra_live_...`, shown once, only hash stored, expiry = now + requested term months,
   marks application approved), list keys (no secrets), revoke (status=revoked, revoked_at), set limits. Idempotent migration
   adds `issued_by`, `revoked_reason`, `application_id` on keys. No email is sent to applicants.
2. Accept `X-RegActions-Key` (plus existing `X-API-Key`, Bearer). Revoked/expired -> 403 `api_key_expired`, unknown -> 401.
3. Provenance and attribution on every registered response: `attribution` + `provenance` block in JSON bodies and
   `X-RegActions-Attribution`/licence `Link` headers (no emails in headers). Public endpoints and badge unchanged.
4. Developers page: new header, error-code table, limits, provenance, revoke/expiry; matches tested behaviour.
5. CSV: shared `utils/csvExport.ts` (BOM, formula-injection guard, source and as-of footer row); wired to Countries overview
   (visible filtered rows and shown columns) and regulator/search views.
6. Branded print/PDF: print stylesheet + "Print / save PDF" action on regulator view and country hub with logo, title,
   as-of date, source citations and URL page footer. Verified by rendering to PDF with Playwright.
7. Roadmap: both items -> live with accurate wording (only after the above are on prod).

## Definition of done
Unit tests for key lifecycle, header variants, 429 + Retry-After, provenance, CSV guard; CI green; gated merge; prod rehearsal
(test key for contact@memaconsultants.com: each endpoint, 401 bad, revoked refused, 429 on tiny quota, usage rows, revoke);
CSV downloaded in Playwright and parsed; PDFs for /regulators/fca and one country hub checked for text, pages, clipping;
1440 and 375 checks clean.

## Known constraint
ADMIN_API_KEY is not set in Vercel production (only hidden CRON_SECRET exists) and I may not write secrets. The route will
also accept it once the owner sets it; until then the live rehearsal uses the CLI against the prod database if credentials allow.
