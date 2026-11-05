# State of Global Enforcement: 2026 Q3 Data Study (DRAFT)

Pack generated 2026-11-05 from the live database. Window 2026-07-01 to 2026-09-30.

Independent SQL cross-check:
- current: js=1197/45/75627438.5 sql=1197/45/75627438.5 MATCH
- yoy: js=1313/94/106765814.8 sql=1313/94/106765814.8 MATCH
- qoq: js=1576/50/16219339.5 sql=1576/50/16219339.5 MATCH

## Headline

| Measure | This quarter | Previous quarter | Same quarter last year |
| --- | --- | --- | --- |
| Distinct actions | 1,197 | 1,576 | 1,313 |
| Verified penalties | 45 | 50 | 94 |
| Verified value | £75,627,438.50 | £16,219,339.50 | £106,765,814.80 |

Change vs previous quarter: actions -24%, penalties -10%, value 366.3%. Change vs same quarter last year: actions -8.8%, penalties -52.1%, value -29.2%.

## Ten largest verified penalties

| Date | Regulator | Respondent | GBP | Original |
| --- | --- | --- | --- | --- |
| 2026-08-03 | FINCEN | UBS Financial Services Inc. | £60,060,000.00 | USD 77,000,000 |
| 2026-07-20 | PRA | HDI Global SE | £4,165,000.00 | GBP 4,165,000 |
| 2026-07-13 | DNB | CCV Group B.V. | £2,252,500.00 | EUR 2,650,000 |
| 2026-09-09 | FDIC | CBW Bank | £1,950,000.00 | USD 2,500,000 |
| 2026-09-03 | FCA | Daniel Philip Thomas | £742,700.00 | GBP 742,700 |
| 2026-09-29 | SFC | Zheng Da International Financial Holding Limited | £700,000.00 | HKD 7,000,000 |
| 2026-07-27 | SFC | China Industrial Securities International Asset Management Limited | £680,000.00 | HKD 6,800,000 |
| 2026-07-13 | AFM | M. van Wettum | £531,250.00 | EUR 625,000 |
| 2026-07-21 | DNB | CCV Group B.V. | £531,250.00 | EUR 625,000 |
| 2026-08-12 | FCA | Paul Vincent Taylor | £489,000.00 | GBP 489,000 |

## Regulators by actions

| Regulator | Actions | Penalties | Value |
| --- | --- | --- | --- |
| CNBV | 416 | 0 | £0.00 |
| BCB | 136 | 0 | £0.00 |
| FSS | 74 | 0 | £0.00 |
| BaFin | 47 | 4 | £429,250.00 |
| CBN | 46 | 0 | £0.00 |
| FCA | 44 | 11 | £2,243,839.00 |
| FINRA | 42 | 5 | £33,150.00 |
| SPK | 36 | 0 | £0.00 |
| CNBCZ | 34 | 0 | £0.00 |
| CVM | 32 | 0 | £0.00 |

## Themes (tags overlap)

- SUPERVISORY_SANCTION: 811
- MONETARY_PENALTY: 573
- DISCLOSURE: 206
- MARKETS_SUPERVISION: 64
- OTHER: 49
- AML: 35
- PROHIBITION: 35
- CONDUCT: 33

## Needs an editor before publishing

- 51 current-quarter records were excluded. Unattested amounts of GBP 1m or more must be checked against the official notice and added to docs/data-packs/attestations.json (attested or rejected):
  - TeamViewer SE (BaFin) £2,125,000.00: identical amount and summary repeated across 5 rows (duplicate rows or a group total, so not countable as separate penalties)
  - TeamViewer SE (BaFin) £2,125,000.00: identical amount and summary repeated across 5 rows (duplicate rows or a group total, so not countable as separate penalties)
  - Aktuelles & Presse - TeamViewer SE (BaFin) £2,125,000.00: identical amount and summary repeated across 5 rows (duplicate rows or a group total, so not countable as separate penalties)
  - TeamViewer SE (BaFin) £2,125,000.00: identical amount and summary repeated across 5 rows (duplicate rows or a group total, so not countable as separate penalties)
  - TeamViewer SE (BaFin) £2,125,000.00: identical amount and summary repeated across 5 rows (duplicate rows or a group total, so not countable as separate penalties)
  - Robin Crispin William Odey (FCA) £1,529,374.00: single amount >= GBP 1,000,000 that is not attested against the official notice (amounts under GBP 5m may instead be stated in the record's own text)
  - ABN AMRO Bank N.V. (DNB) £7,225,000.00: single amount >= GBP 1,000,000 that is not attested against the official notice (amounts under GBP 5m may instead be stated in the record's own text)
  - Heather Dunne (FCA) £126,000,000.00: rejected data defect: Stored GBP 126,000,000 is the value of pension transfers advised on; the FCA press release (checked 2026-11-05) says the Upper Tribunal reduced Ms Dunne's fine to GBP 41,230.
- Also check the same for the year-ago and previous-quarter windows (see exclusions in the JSON).
- Write the prose yourself, then run: npx tsx scripts/check-quarterly-article.ts --slug=<slug> --year=<y> --quarter=<q>
