# State of Global Enforcement: 2026 Q3 Data Study (DRAFT)

Pack generated 2026-11-06 from the live database. Window 2026-07-01 to 2026-09-30.

Independent SQL cross-check:
- current: js=1209/756/116454531.14 sql=1209/756/116454531.14 MATCH
- yoy: js=1333/902/175915991.61 sql=1333/902/175915991.61 MATCH
- qoq: js=1586/1136/276390042.55 sql=1586/1136/276390042.55 MATCH

## Headline

| Measure | This quarter | Previous quarter | Same quarter last year |
| --- | --- | --- | --- |
| Distinct actions | 1,209 | 1,586 | 1,333 |
| Verified penalties | 756 | 1,136 | 902 |
| Verified value | £116,454,531.14 | £276,390,042.55 | £175,915,991.61 |

Change vs previous quarter: actions -23.8%, penalties -33.5%, value -57.9%. Change vs same quarter last year: actions -9.3%, penalties -16.2%, value -33.8%.

## Ten largest verified penalties

| Date | Regulator | Respondent | GBP | Original |
| --- | --- | --- | --- | --- |
| 2026-08-03 | FINCEN | UBS Financial Services Inc. | £60,060,000.00 | USD 77,000,000 |
| 2026-09-02 | OFSI | Citibank, N.A., London Branch (CBNA London) | £4,732,830.58 | GBP 4,732,830.58 |
| 2026-07-20 | PRA | HDI Global SE | £4,165,000.00 | GBP 4,165,000 |
| 2026-07-16 | FRC | PwC | £3,248,437.00 | GBP 3,248,437 |
| 2026-07-31 | FSS | 롯데카드㈜ | £2,850,000.00 | KRW 5,000,000,000 |
| 2026-07-13 | DNB | CCV Group B.V. | £2,252,500.00 | EUR 2,650,000 |
| 2026-09-09 | FDIC | CBW Bank | £1,950,000.00 | USD 2,500,000 |
| 2026-09-14 | FCA | Robin Crispin William Odey | £1,830,000.00 | GBP 1,830,000 |
| 2026-09-30 | FCA | Robin Crispin William Odey | £1,529,374.00 | GBP 1,529,374 |
| 2026-08-12 | BCB | BANCO GENIAL S.A. | £1,248,800.00 | BRL 8,920,000 |

## Regulators by actions

| Regulator | Actions | Penalties | Value |
| --- | --- | --- | --- |
| CNBV | 436 | 427 | £7,169,931.43 |
| BCB | 151 | 133 | £4,347,144.18 |
| FSS | 73 | 21 | £5,759,793.00 |
| CBN | 46 | 0 | £0.00 |
| FCA | 42 | 15 | £5,845,613.00 |
| FINRA | 42 | 5 | £33,150.00 |
| CNBCZ | 34 | 0 | £0.00 |
| SPK | 33 | 33 | £2,528,718.62 |
| CVM | 32 | 0 | £0.00 |
| BaFin | 31 | 18 | £1,575,475.00 |

## Themes (tags overlap)

- SUPERVISORY_SANCTION: 843
- MONETARY_PENALTY: 600
- DISCLOSURE: 209
- MARKETS_SUPERVISION: 64
- PROHIBITION: 43
- OTHER: 39
- AML: 33
- CONDUCT: 31

## Needs an editor before publishing

- 2 current-quarter records were excluded. Unattested amounts of GBP 1m or more must be checked against the official notice and added to docs/data-packs/attestations.json (attested or rejected):
  - ABN AMRO Bank N.V. (DNB) £7,225,000.00: single amount >= GBP 5,000,000 that is not attested against the official notice
  - Heather Dunne (FCA) £126,000,000.00: rejected data defect: Stored GBP 126,000,000 is the value of pension transfers advised on; the FCA press release (checked 2026-11-05) says the Upper Tribunal reduced Ms Dunne's fine to GBP 41,230.
- Also check the same for the year-ago and previous-quarter windows (see exclusions in the JSON).
- Write the prose yourself, then run: npx tsx scripts/check-quarterly-article.ts --slug=<slug> --year=<y> --quarter=<q>
