# Bot-walled regulators: official open-data routes

Checked 2026-11-14. Supersedes the route advice in `docs/scrapers/waf-walled-regulators.md`
(which relied on FlareSolverr; that is not used here).

## Rules applied

- Only routes that answer an ordinary automated request count: official open-data portals or
  APIs, official feeds, gazettes, official annual reports on an unblocked host.
- A challenge page, a 403 or a rejection page means the route is **not usable**. It is recorded
  and left alone. No headless browser, solver, proxy, residential IP or third-party mirror.
- User agent for every probe: `RegActions-research` (no email address in any header).
- "This machine" = a Mac on a UK residential connection. "GitHub runner" = `ubuntu-24.04`
  hosted runner, probed with a throwaway workflow on the feature branch (deleted before merge).
  "Hetzner" = the EX63 development host (OJK only, see note).

## Summary

| Regulator | Usable route with penalty data | Result |
|---|---|---|
| Indonesia OJK | Yes: official announcements listing and notice pages | Scraper built (`scrapeOjk.ts`), capital-market fines only |
| Mexico CNBV (beyond the sanctions register) | No | Register already ingested; nothing else open |
| Mauritius FSC | No | Challenge on every enforcement route |
| Saudi CMA | No (aggregate totals only) | Violations pages rejected; annual report has no named firms |
| Philippines SEC | No | 403 on every route, from both vantage points |
| Thailand SEC | No | 403 on website and open-data portal |

## Indonesia OJK (usable)

| Route | This machine | GitHub runner | Format | Enforcement data | Frequency |
|---|---|---|---|---|---|
| `https://www.ojk.go.id/en/berita-dan-kegiatan/pengumuman/Default.aspx` (English announcements listing, paged by a standard ASP.NET form post-back) | 200, 374 KB | 200, 374 KB | HTML | Titles and dates of every announcement back to Nov 2015 (558 items) | As published |
| `.../pengumuman/Pages/<notice>.aspx` (individual announcement) | 200 | 200 | HTML (PDF attached as well) | Capital-market administrative sanctions: respondent (firm or person), role, rupiah fine, legal basis, date. Many notices are licence revocations with no amount | A handful per year (about 6 to 10 fined notices a year) |
| `.../siaran-pers/Default.aspx` (press releases) | 200 | 200 | HTML | Aggregate enforcement statistics only; no per-respondent fines | Weekly |
| `https://www.ojk.go.id/id/berita-dan-kegiatan/pengumuman/Default.aspx` (Indonesian) | 200 | 200 | HTML | Same notices in Indonesian | As published |
| `https://data.go.id/` (national open-data catalogue) | 200 | 200 | HTML/CKAN | `package_search?q=ojk` returned 404; no OJK enforcement dataset found | n/a |
| `https://jdih.ojk.go.id`, `https://peraturan.go.id` | timeout | not probed | n/a | Regulations; unreachable | n/a |
| `https://www.ojk.go.id/robots.txt` | 404 (SharePoint error page) | n/a | n/a | None published | n/a |

Note: the Hetzner development host could not complete a TLS fetch of ojk.go.id (`fetch failed`),
which the 2026-08 note in `waf-walled-regulators.md` did not find. The GitHub runner and this machine
both serve the pages, and the scheduled scraper runs on GitHub.

## Mexico CNBV

The sanctions register at `sanciones.cnbv.gob.mx` and its JSON API are already ingested
(`scrapeCnbv.ts`). The question was whether enforcement notices exist beyond that register.

| Route | This machine | GitHub runner | Format | Enforcement data | Frequency |
|---|---|---|---|---|---|
| `https://sanciones.cnbv.gob.mx/` and `https://publicacion-sanciones-service.cnbv.gob.mx/api/sanctions` | 200 | connection fails without the pinned GlobalSign intermediate (the scraper pins it) | HTML / JSON | Full register: entity, sanction type, MXN amount, conduct, dates. Already ingested | Continuous |
| `https://www.gob.mx/cnbv` and `/cnbv/archivo/prensa` (press releases) | 200 | 200 | HTML | Capital ratios, consultations, performance evaluations. No sanctions or fines | Monthly |
| `https://www.gob.mx/cnbv/documentos/sanciones-cnbv` | 404 | not probed | n/a | Does not exist | n/a |
| `https://datos.gob.mx/api/3/action/package_search?q=cnbv` (national open-data catalogue) | 200 | 200 | CKAN JSON | Two datasets: security incidents and housing finance. No sanctions dataset | n/a |
| `https://dof.gob.mx/` (Diario Oficial de la Federacion; `www.` host has a certificate mismatch) | 200 | 200 | HTML | A search for "CNBV multa" across 2026 returned two unrelated items. CNBV sanction resolutions are not gazetted | Daily |

Result: no additional route. Nothing to build.

## Mauritius FSC

| Route | This machine | GitHub runner | Format | Enforcement data | Frequency |
|---|---|---|---|---|---|
| `https://www.fscmauritius.org/en/enforcement/enforcement-actions` and the site root | 200 but a 0.2 to 1 KB Imperva/Incapsula challenge page, every time | Challenge on 8 of 9 attempts (960 bytes); one attempt returned a full 1 MB page | HTML | Would carry enforcement actions; not reachable reliably | n/a |
| `/rss`, `/sitemap.xml`, `/media/...pdf` | Challenge page (same size) | not probed | n/a | None served | n/a |
| `https://data.govmu.org` (national open-data portal, CKAN) | 200 | 200 | CKAN JSON | No FSC organisation; searches for enforcement, penalty and sanction return 0; "financial services commission" returns budget datasets only | n/a |
| `https://data.gov.mu` | certificate mismatch | not probed | n/a | Unusable | n/a |

A route that serves a real page on one attempt in nine is not a feed. Not usable.

## Saudi CMA

| Route | This machine | GitHub runner | Format | Enforcement data | Frequency |
|---|---|---|---|---|---|
| `https://cma.gov.sa/en/Market/Violations` (and `/ar/`, `/Pages/default.aspx`, `/Decisions.aspx`) | 200 but a 1.2 KB "requested URL was rejected" page | same rejection | n/a | The violations and decisions register; not reachable | n/a |
| `https://cma.gov.sa/en/MediaCenter/PR/...` and `/NEWS/...` | 200, real pages | 200 | HTML | Licences, capital changes, consultations, offering approvals. No penalties | Several a week |
| `https://cma.gov.sa/ar/MediaCenter/NEWS/...` | rejected | not probed | n/a | None | n/a |
| `https://cma.gov.sa/en/Market/Reports/Documents/CMA_2024_REPORT_EN.pdf` (annual report) | 200, 25 MB PDF | not probed | PDF | Aggregate only: SAR 307 million total fines and penalties (CMA, CRSD, ACRSD), counts of decisions and a table of totals by regulation. No firm names | Annual |
| `https://crsd.org.sa`, `https://data.gov.sa`, `https://open.data.gov.sa` | connection timeout | not probed | n/a | Unreachable | n/a |
| `https://uqn.gov.sa/` (Umm Al-Qura gazette) | 200, 850 KB | 200 | HTML | Front page only; no CMA penalty notices found | n/a |

Result: no firm-level route. The annual-report totals are not a case record and are not ingested.

## Philippines SEC

| Route | This machine | GitHub runner | Format | Enforcement data | Frequency |
|---|---|---|---|---|---|
| `https://www.sec.gov.ph/enforcement-actions/`, `/feed/`, `/wp-json/wp/v2/posts`, `/wp-sitemap.xml` | 403 Cloudflare challenge | 403 | n/a | Not reachable | n/a |
| `https://www.officialgazette.gov.ph` (gazette) | 403 | 403 | n/a | Not reachable | n/a |
| `https://data.gov.ph` (open-data portal) | 200, 7 KB script shell; the CKAN-style API path returns the same shell | 200 shell | JS app | No SEC enforcement dataset reachable without running the app | n/a |
| `https://www.lawphil.net` | 200 | not probed | HTML | Statute and case-law archive; not SEC enforcement orders | n/a |

Not usable.

## Thailand SEC

| Route | This machine | GitHub runner | Format | Enforcement data | Frequency |
|---|---|---|---|---|---|
| `https://www.sec.or.th/EN/Pages/...` (enforcement, RSS, annual-report PDF) | 403 block page (13 KB) | 403 | n/a | Not reachable | n/a |
| `https://secopendata.sec.or.th/sec-open-apis` (SEC open-data API) | 403 | 403 | n/a | Not reachable | n/a |
| `https://data.go.th` (national open-data portal) | 403 | 403 | n/a | Not reachable | n/a |
| `https://ratchakitcha.soc.go.th` (Royal Gazette) | 403 | 403 | n/a | Not reachable | n/a |

Not usable.

## What was built

Only OJK. Its definition of a penalty and the guard rails are in `scripts/scraper/scrapeOjk.ts`:

- one row per fined respondent per announcement, explicit rupiah fine only;
- joint-and-several fines are one row naming the group with the joint amount (not split);
- licence revocations, prohibitions, written warnings and written orders produce no row;
- "Fulfillment of Administrative Sanctions" notices restate an earlier penalty and are skipped;
- a notice with a malformed or unattributable figure (for example `Rp500.000.00,00`) is skipped
  whole with a run warning instead of being approximated;
- amounts are protected on re-ingest by the shared `protectVerifiedAmounts` guard and writes are
  pinned by `assertExpectedDbTarget`, both through `runScraper`.
