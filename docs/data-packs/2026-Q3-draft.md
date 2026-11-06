# State of Global Enforcement: 2026 Q3 Data Study (DRAFT)

Pack generated 2026-11-06 from the live database. Window 2026-07-01 to 2026-09-30.

Independent SQL cross-check:
- current: js=1210/689/108390488.42 sql=1210/689/108390488.42 MATCH
- yoy: js=1327/874/86252077.23 sql=1327/874/86252077.23 MATCH
- qoq: js=1585/1031/267075945.9 sql=1585/1031/267075945.9 MATCH

## Headline

| Measure | This quarter | Previous quarter | Same quarter last year |
| --- | --- | --- | --- |
| Distinct actions | 1,210 | 1,585 | 1,327 |
| Verified penalties | 689 | 1,031 | 874 |
| Verified value | £108,390,488.42 | £267,075,945.90 | £86,252,077.23 |

Change vs previous quarter: actions -23.7%, penalties -33.2%, value -59.4%. Change vs same quarter last year: actions -8.8%, penalties -21.2%, value 25.7%.

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
| 2026-09-30 | FCA | Robin Crispin William Odey | £1,529,374.00 | GBP 1,529,374 |
| 2026-07-28 | FRC | Ernst and Young (EY) | £1,197,000.00 | GBP 1,197,000 |
| 2026-09-10 | OFAC | Unnamed individual (OFAC) | £1,113,239.40 | USD 1,427,230 |

## Regulators by actions

| Regulator | Actions | Penalties | Value |
| --- | --- | --- | --- |
| CNBV | 436 | 427 | £7,169,931.43 |
| BCB | 151 | 102 | £622,164.18 |
| FSS | 73 | 18 | £5,519,082.00 |
| CBN | 46 | 0 | £0.00 |
| FINRA | 42 | 4 | £25,350.00 |
| FCA | 39 | 10 | £2,989,283.00 |
| CNBCZ | 34 | 0 | £0.00 |
| SPK | 33 | 23 | £2,284,220.10 |
| CVM | 32 | 0 | £0.00 |
| BaFin | 31 | 16 | £1,490,475.00 |

## Themes (tags overlap)

- SUPERVISORY_SANCTION: 843
- MONETARY_PENALTY: 600
- DISCLOSURE: 209
- MARKETS_SUPERVISION: 64
- PROHIBITION: 43
- OTHER: 39
- AML: 37
- CONDUCT: 31

## Needs an editor before publishing

- 52 current-quarter records were excluded. Unattested amounts of GBP 1m or more must be checked against the official notice and added to docs/data-packs/attestations.json (attested or rejected):
  - BANCO GENIAL S.A. (BCB) £1,181,600.00: first-instance decision under appeal (BCB, CRSFN); not a final penalty
  - ABN AMRO Bank N.V. (DNB) £7,225,000.00: single amount >= GBP 5,000,000 that is not attested against the official notice
  - BANCO GENIAL S.A. (BCB) £1,248,800.00: first-instance decision under appeal (BCB, CRSFN); not a final penalty
- Also check the same for the year-ago and previous-quarter windows (see exclusions in the JSON).
- Write the prose yourself, then run: npx tsx scripts/check-quarterly-article.ts --slug=<slug> --year=<y> --quarter=<q>
