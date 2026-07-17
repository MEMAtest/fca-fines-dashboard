# RegActions Growth Roadmap — July 2026

Synthesis of a four-agent research program (2026-07-17): country-product enhancements +
competitor teardown, regulator-scraping feasibility (25 candidates, each site visited),
technical SEO audit of the live site (served-HTML verified), and growth/differentiation
strategy. Every factual claim below was verified against a cited URL or the served HTML
at research time.

## Headline findings

1. **Credibility gap (prod, all countries):** the per-imposer sanctions grid renders
   "REVIEW PENDING" for UN/EU/UK/US on every country page (fail-closed
   `sanctionsCoverageComplete=false`). Fixable from licence-clean official sources:
   EU Sanctions Map (sanctionsmap.eu), UN Consolidated List (public XML),
   UK Sanctions List (OGL v3).
2. **The site's best growth assets already exist but are invisible:** a keyless,
   CORS-open country-risk JSON API (`/api/country-risk/list`, full provenance) with no
   docs page; a FATF grey-list page one countdown-and-changelog away from being "THE
   tracker"; Dataset JSON-LD missing the one `distribution` property Google Dataset
   Search requires.
3. **SEO plumbing, not content, is the constraint:** country pages serve 5-7k chars of
   unique HTML with excellent Core Web Vitals, but the country/regulator clusters are
   orphaned (homepage links zero country pages), "historical v1" jargon sits in
   crawler-visible H2s and meta descriptions, sitemap `lastmod` is the build date on
   467/516 URLs, no FAQPage schema despite question-shaped titles, and unknown
   `/countries/*` URLs soft-404 as HTTP-200 homepages.
4. **Competitors gate what we give away:** Basel (registration + CC-BY-NC-ND),
   KnowYourCountry (paid reports). Their free-tier edge is a handful of licence-clean
   flags we can add: EU tax blacklist, FATF mutual-evaluation dates/links, Egmont FIU
   membership, beneficial-ownership register availability (Open Ownership CC-BY),
   US State Dept flags (public domain).

## Ranked roadmap

### Fix first — credibility
1. Populate the sanctions grid from EU Sanctions Map + UN Consolidated + UK OGL,
   through the v2 approval pipeline (not around it).
2. Strip v1/parallel-validation jargon from the prerendered SEO bodies
   (H2s + meta descriptions in `scripts/prerender-seo.ts`).

### SEO quick wins (each ~1 day)
3. Per-country FAQPage schema + visible FAQ blocks (answers derive from existing data).
4. Dataset schema completion: Dataset node on `/countries`; `distribution` →
   `/api/country-risk/{iso2}` + `license`/`temporalCoverage`/`variableMeasured` on
   country pages (mirror the good `/regulators/fca` template).
5. Real freshness signals: sitemap `lastmod` + WebPage `dateModified` from actual
   per-page data-change dates.
6. Schema hygiene: breadcrumb capitalisation ("Fca"→FCA), Organization `sameAs`,
   drop the redundant en/en-gb/en-us hreflang trio.
7. `/developers` docs page for the free API (attribution-link terms, curl samples,
   keyless/CORS-open) + a real `public/llms.txt`.
8. FATF grey-list tracker upgrade: plenary countdown (next: 26-30 Oct 2026),
   change-log, "as of" trust line, Dataset/JSON-LD.
9. Cheap data wins: EU tax-blacklist flag (10 countries, Council page),
   Egmont FIU membership per country.

### Medium (1-3 days each)
10. Internal-linking overhaul: prerendered footer/mega-nav, blog↔country↔regulator
    cross-links, top-20 country links from the homepage (fixes the orphan problem).
11. Country-vs-country compare pages (`/countries/compare/a-vs-b`; stub route exists;
    zero new data; thousands of long-tail pages).
12. Prerender a static top-N enforcement table into regulator hubs (FCA hub currently
    serves 660 chars) + return real 404s for unknown `/countries/*`.
13. Scraper wave 1 (verified, small effort): Turkey SPK (documented open-data API at
    ws.spk.gov.tr), US FRB, Ghana SEC, Taiwan FSC (scaffolded), Isle of Man FSA
    (JS-rendered table).
14. FATF mutual-evaluation dates + report links; BO-register availability
    (Open Ownership CC-BY); blog-bundle code-split (768KB chunk loads on every route);
    weekly score-snapshot cron (unlocks movers + trend charts).

### Strategic (multi-week)
15. Recent-developments feed + country change alerts + changes RSS (alerts infra
    exists; needs score-run persistence; OFAC RSS retired — scrape Recent Actions HTML).
16. Scraper wave 2: Greece HCMC, Morocco AMMC, Argentina CNV, Colombia SFC, US FDIC,
    Korea FSS; then the FlareSolverr-walled batch (Mauritius FSC, Mexico CNBV,
    Saudi CMA, Indonesia OJK, Philippines SEC, Thailand SEC — all publish, all WAF'd;
    needs a FlareSolverr instance).
17. Quarterly "State of Global AML Enforcement" data study (original-data digital-PR
    asset) + embeddable SVG risk badge (SVG endpoint dodges the site-wide
    `frame-ancestors 'none'`; an iframe widget would need a header exception).
18. Grounded narratives for the ~22 thin micro-state pages.

## Verified negatives (do not spend time on)
- Bahrain CBB publishes no public enforcement listing.
- Peru SMV: no data grid reachable (POST-form ASP.NET; unverified).
- Qatar QFCRA: policy narrative + one PDF only.
- Licence-blocked for reuse: Basel AML Index sub-scores (CC-BY-NC-ND/paid),
  OpenSanctions bulk data (CC-BY-NC), FATF consolidated ratings table (licensed;
  dates/links are fine), GI-TOC OC Index (likely NC — verify before use).
- llms.txt currently "resolves" HTTP-200 via the SPA catch-all — it does not exist.

## Execution status (as of this commit)
- Wave A in flight: items 1+2 (sanctions grid + jargon strip).
- Wave B in flight: items 3-7 (SEO quick-wins PR).
- Wave C in flight: items 8-9 (grey-list tracker + tax-blacklist/Egmont flags).
- Wave D planned next: items 10-14 after waves A-C merge (they share
  `prerender-seo.ts`/`CountryHub.tsx` and would conflict if parallel).
- Wave E planned: items 15-18.
