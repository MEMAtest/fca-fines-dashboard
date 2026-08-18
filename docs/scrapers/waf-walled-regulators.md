# WAF-walled regulator batch — measured evidence

Probed 2026-08-18. Supersedes the backlog note that read:

> FlareSolverr-walled scraper batch — Mauritius FSC, Mexico CNBV, Saudi CMA,
> Indonesia OJK, Philippines SEC, Thailand SEC. All publish enforcement data,
> all sit behind WAFs; needs a FlareSolverr instance stood up first.

Two things in that note were wrong.

**FlareSolverr does not need standing up.** It has been running on the Hetzner
box for months (`flaresolverr`, v3.5.0, `127.0.0.1:8191`), and
`scripts/scraper/lib/flaresolverr.ts` is already an env-gated client
(`FLARESOLVERR_URL`). Nothing to provision.

**The six do not share one wall, and most are already passable.** Each URL below
was fetched twice: directly from a residential IP, and through the live
FlareSolverr instance on the Hetzner datacenter IP.

| Regulator | Protection | Direct (residential) | Through FlareSolverr | Verdict |
|---|---|---|---|---|
| Philippines SEC | Cloudflare (`cf-mitigated: challenge`) | 403 "Just a moment" | **200, 132KB, clean** | Solved |
| Thailand SEC | F5 BIG-IP style block page | 403, 13KB block page | **200, 106KB, clean** | Solved |
| Mexico CNBV (gob.mx) | Akamai Bot Manager (`sec-cpt` challenge) | 200 "Challenge Validation" shell | **200, 22KB, clean** | Solved |
| Mauritius FSC | Imperva/Incapsula (`x-iinfo`, `_Incapsula_Resource`) | 949-byte iframe challenge | **200, 1.0MB, 35.5k visible chars, 371 links** | Solved |
| Indonesia OJK | none | **200, 444KB real page** | times out at 110s | Use direct fetch, no solver |
| Saudi CMA | F5 BIG-IP ASM hard reject | "The requested URL was rejected" | 200 but 1,210 bytes, same rejection | **Still blocked** |

## What this changes

- **Five of six are reachable today.** Only Saudi CMA needs a different
  approach (residential/rotating proxy, or an alternative official source).
- **Indonesia OJK needs no solver at all** and returns a full page from the
  Hetzner datacenter IP — so the datacenter-IP concern does not apply to it.
  Routing it through FlareSolverr actively makes it worse (the page is heavy
  enough that the solver times out). Fetch it directly.
- **FlareSolverr beat Akamai and Imperva here.** That contradicts the common
  guidance, including my own initial read. Do not assume by vendor; probe.

## Correct URLs

The WAF and the URL are separate problems, and solving the first exposes the
second. Confirmed live through the solver:

- Philippines SEC: `https://www.sec.gov.ph/enforcement-actions/` — correct.
- Mauritius FSC: `https://www.fscmauritius.org/en/enforcement/enforcement-actions` — correct.
- Thailand SEC: `.../EN/Pages/ENFORCEMENT/CIVILSANCTION.aspx` returns **"Page not
  found"** even once unblocked. Live surfaces are
  `https://www.sec.or.th/EN/Pages/LAWANDREGULATIONS/ENFORCEMENT.aspx` (132KB) and
  the Open Data portal `https://secopendata.sec.or.th/sec-open-apis` (70KB).
  Prefer the Open Data API over scraping if it exposes enforcement datasets.
- Mexico CNBV: `https://www.gob.mx/cnbv/documentos/sanciones-cnbv` unblocks to a
  22KB document-listing shell with only 32 links. Check `datos.gob.mx` for a
  structured sanctions dataset before writing an HTML parser.

## Operational constraint

FlareSolverr runs on the **Postgres box** (no swap, ~4.9GB free). Each solve
spawns headless Chrome. It has coexisted with the database for months at
single-scraper load, so the risk is batch **concurrency**, not the container.
Run this batch serially, reuse one session per scraper, and cap the container
(`docker update --memory`) before running six scrapers together.

## Reproducing

```bash
ssh root@<hetzner> 'curl -s -m 130 -XPOST localhost:8191/v1 \
  -H "Content-Type: application/json" \
  -d "{\"cmd\":\"request.get\",\"url\":\"<URL>\",\"maxTimeout\":110000}"'
```

Check `solution.status` and the response body for `Just a moment`,
`_Incapsula_Resource`, `requested URL was rejected`, `Challenge Validation` or
`Block Response`. A 200 alone proves nothing — Saudi CMA returns 200 with a
1,210-byte rejection page, and Thailand returned 200 on a 404.
