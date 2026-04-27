# UK regulator coverage audit - 2026-04-27

## Purpose

This audit checks whether Wise and similar UK-adjacent enforcement items are missing because of search ranking, source coverage, or scraper parsing. The answer is mixed:

- The UK adjacent scraper layer is in place for PRA, PSR, OFSI, ICO, CMA, FRC and TPR.
- Wise Payments Limited is present in OFSI as a non-monetary disclosure, not a fine.
- The FCA Wise-related action is indexed as an individual action against Kristo Kaarmann, not as a Wise firm action. That is a search/entity-alias issue rather than a missing FCA regulator issue.
- PRA coverage was under-counted because the loader used news keyword search instead of the Bank of England enforcement actions table. This pass moves PRA to the official enforcement table.

## Coverage Matrix

| Regulator | What the source publishes | Current source path | Format | Amount availability | Current scrape state | Gap / action |
| --- | --- | --- | --- | --- | --- | --- |
| PRA | Financial penalties, public censures, prohibitions, final/decision notices | `https://www.bankofengland.co.uk/prudential-regulation/the-bank-of-england-enforcement` | Structured HTML tables by year, linked PDF notices | Usually explicit in table; non-monetary actions show public censure/prohibition | Live loader now parses the official enforcement table; dry-run finds 35 PRA records versus 20 from the old news-search path | Done in this pass: use table as primary source, keep news API fallback |
| PSR | SD17, CA98 and IFR enforcement cases, press releases and decision notices | `https://www.psr.org.uk/information-for-firms/enforcement/enforcement-cases/` | HTML case page with sections and links | Amounts usually in press-release titles; decision notices linked separately | Live; dry-run finds 4 monetary PSR cases | Good for known PSR fines; watch for future non-"fines" wording |
| OFSI | Financial sanctions monetary penalties and disclosure notices | `https://www.gov.uk/government/collections/enforcement-of-financial-sanctions` | GOV.UK collection table/sections, linked HTML/PDF notices | Explicit penalty field; disclosures have no monetary amount | Live; dry-run finds 18 actions, including Wise Payments Limited as a disclosure | Good; Wise is present but non-monetary |
| ICO | Monetary penalties, enforcement notices, reprimands, prosecutions | `https://ico.org.uk/action-weve-taken/enforcement/` plus `https://ico.org.uk/api/search` | Dynamic search UI backed by JSON API | Amounts often in API result descriptions; some records need detail parsing | Live; dry-run finds 58 monetary-penalty-focused records | Good for monetary penalties; wider notices/reprimands intentionally excluded from this fine-led lane |
| CMA | Competition/consumer cases, press releases, penalty decisions, case pages | `https://www.gov.uk/api/search.json` filtered to CMA plus GOV.UK CMA organisation pages | GOV.UK search API and press/case pages | Amounts usually in title/description/body; respondent names are often generic in headlines | Live; dry-run finds 74 records | Needs a second pass for respondent-name quality using case pages/details, not only headlines |
| FRC | Current/past investigations, imposed sanctions, settlements, tribunal outcomes | `https://www.frc.org.uk/library/enforcement/enforcement-cases/` | Large filterable HTML table with linked outcome pages | Some table rows have no amount; amounts may be on detail pages | Live; dry-run finds 133 records, 70 with amounts in Hetzner before this pass | Good corpus; improve detail-page enrichment for rows still non-monetary |
| TPR | Escalating penalty notices and selected scheme return/climate/VFM fines | `https://www.thepensionsregulator.gov.uk/en/document-library/enforcement-activity/penalty-notices` | HTML tables by period | Explicit amount column | Live; dry-run finds 48 records | Source currently only exposes 2024 dated tables, so health shows stale latest action; source-specific freshness threshold needed |

## Wise-Specific Finding

Known UK official-source Wise-related items in the current dataset:

| Source | Action | How it appears |
| --- | --- | --- |
| OFSI | Wise Payments Limited disclosure, 31 August 2023 | Present in `uk_enforcement_actions` as OFSI, non-monetary, alias includes Wise |
| FCA | Kristo Kaarmann final notice, 28 October 2024, GBP 350,000 | Present in `all_regulatory_fines` as an individual action; the firm relationship is in the source text, not the `firm_individual` field |

Implication: a bare `wise` search should return both the OFSI Wise disclosure and the FCA Kaarmann action if alias/entity expansion is applied. If it returns only incidental "wise" text matches, that is a search ranking/entity-alias issue. If the user expects multiple firm-level Wise fines, those are not present in the checked UK regulator sources as firm fines.

Code status: this pass expands Wise aliases in the global search preparation layer, including `Wise Payments Limited`, `Wise plc`, `Wise Assets UK Ltd`, `Wise Payments Ltd`, `Kristo Kaarmann` and `Kristo Käärmann`.

## Hetzner Pipeline Check

Local operational verification on 2026-04-27:

- `.env` `DATABASE_URL` resolves to host `89.167.95.173`.
- Connection reaches database `fcafines` as user `fca_app`.
- `all_regulatory_fines` refresh completed successfully; row count stayed at 36,282 and latest date stayed 2026-04-24.
- Latest GitHub UK Enforcement Monitor run `24981721519` completed successfully on 2026-04-27 and prepared 355 records before the PRA table fix.
- GitHub `DATABASE_URL` secret exists. GitHub does not allow reading the secret value back, so on 2026-04-27 it was reset from the local Hetzner `.env` value to confirm the Actions path by construction.

## Current Counts

Hetzner counts after applying the PRA table upgrade live:

| Regulator | Rows | Earliest | Latest | Rows with amount |
| --- | ---: | --- | --- | ---: |
| CMA | 74 | 2015-03-19 | 2026-04-15 | 74 |
| FRC | 133 | 2012-11-09 | 2026-04-09 | 70 |
| ICO | 58 | 2022-12-14 | 2026-02-23 | 32 |
| OFSI | 18 | 2019-01-21 | 2026-03-30 | 15 |
| PRA | 35 | 2014-11-20 | 2026-03-24 | 29 |
| PSR | 4 | 2022-01-18 | 2026-02-19 | 4 |
| TPR | 48 | 2024-12-31 | 2024-12-31 | 48 |

The live scraper run prepared and inserted 370 UK adjacent records:

| Regulator | Dry-run rows |
| --- | ---: |
| PRA | 35 |
| PSR | 4 |
| OFSI | 18 |
| ICO | 58 |
| CMA | 74 |
| FRC | 133 |
| TPR | 48 |

## Next Implementation Pass

1. Add source-specific freshness logic for TPR so "official source has no newer table" is separated from "scraper stopped updating".
2. Improve CMA respondent extraction by following case/detail pages where GOV.UK headlines are generic.
3. Let the next scheduled GitHub UK Enforcement Monitor run prove the reset Hetzner secret from Actions.
