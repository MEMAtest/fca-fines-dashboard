# DNB / HSBC Mexico / FCA amount verification, 2026-11-06

Live fetch of every dnb.nl page returns Akamai `403 Access Denied` (page, RSS and sitemap, generic User-Agent). Per the hard rules no workaround was used, so every DNB row is UNVERIFIED against the live page. Where a figure is marked 'snapshot' it is the DNB text captured by our own earlier ingest (eu_fines.summary / raw_payload), which is a copy of the official page text, not a fresh fetch. A reviewer should treat snapshot-based changes accordingly.

## 1. DNB rows (50 non-suppressed rows with an amount in all_regulatory_fines; 8 further rows were already suppressed)

Status key: SNAPSHOT-OK = stored amount equals the figure in the DNB snapshot text; UNVERIFIED-NO-FIGURE = snapshot has no figure, nothing to check against; CHANGE = row is in the corrections file.

| Row | Stored name | Stored amount EUR | Notice | Status | Evidence / action |
|---|---|---:|---|---|---|
| f9a6e986 | Rusland | 114,000,000 | latest-news-on-sanctions-against-russia | CHANGE | NULL: EU sanctions news page, not a DNB penalty |
| 47e9b666 | Unnamed firm (DNB) | 100,000,000 | the-sanctions-against-russia-at-a-glance | CHANGE | NULL: EU sanctions overview page, not a DNB penalty |
| 54612d25 | Coinbase | 3,325,000 | dnb-imposes-administrative-fine-on-coinbase-europe-limi | SNAPSHOT-OK (DNB text) | snapshot figure &#x20AC;3,325,000 matches |
| 711350a4 | Travelex | 100,000 | fine-for-travelex-for-failing-to-report-unusual-transac | SNAPSHOT-OK (DNB text) | snapshot figure &#x20AC;100,000 matches |
| 7902f02b | D-Max Corporate B.V. | 29,700 | trust-office-licence-of-d-max-corporate-b-v-revoked | UNVERIFIED-NO-FIGURE | snapshot carries no euro figure |
| de6165dd | Jmond Corporate Solutions B.V. | 47,500 | fine-for-ijmond-corporate-solutions-b-v-for-not-having- | UNVERIFIED-NO-FIGURE | snapshot carries no euro figure (€47,500,000) |
| 26c6df96 | IJmond Corporate Solutions B.V. | 47,500 | fine-for-ijmond-corporate-solutions-b-v-for-not-having- | UNVERIFIED-NO-FIGURE | snapshot carries no euro figure |
| 043aef60 | TMF Netherlands B.V. | 3,125,000 | fine-for-trust-office-tmf-netherlands-b-v-for-insuffici | SNAPSHOT-OK (DNB text) | snapshot figure &#x20AC;3,125,000 matches |
| 8e255eba | Netherlands B.V. | 3,125,000 | fine-for-trust-office-tmf-netherlands-b-v-for-insuffici | SNAPSHOT-OK (DNB text) | snapshot figure &#x20AC;3,125,000, €3,125,000 matches |
| bc1502d2 | Lewben Netherlands B.V. | 10,000 | fine-for-trust-office-lewben-netherlands-b-v-for-failin | SNAPSHOT-OK (DNB text) | snapshot figure &#x20AC;10,000 matches |
| dd07e396 | Lewben Netherlands B.V. | 10,000,000 | fine-for-trust-office-lewben-netherlands-b-v-for-failin | CHANGE | SUPPRESS (quarantine release): x1000 duplicate of bc1502d2 (EUR 10,000) |
| faa14b20 | Unnamed firm (DNB) | 156,250 | fine-for-trust-office-cis-management-for-insufficient-c | SNAPSHOT-OK (DNB text) | snapshot figure &#x20AC; 156.250, €156,250 matches |
| 20c462f8 | CIS Management | 156,250 | fine-for-trust-office-cis-management-for-insufficient-c | SNAPSHOT-OK (DNB text) | snapshot figure &#x20AC; 156.250 matches |
| 3df184f0 | Unnamed firm (DNB) | 10,000,000 | fine-for-trust-office-athos-business-services-netherlan | CHANGE | SUPPRESS (quarantine release): x1000 duplicate of d85b035b (EUR 10,000) |
| d85b035b | Athos Business Services (Netherlands)  | 10,000 | fine-for-trust-office-athos-business-services-netherlan | SNAPSHOT-OK (DNB text) | snapshot figure &#x20AC;10,000 matches |
| 851daaa9 | Intertrust Netherlands | 2,500,000 | fine-for-trust-office-intertrust-netherlands-for-insuff | SNAPSHOT-OK (DNB text) | snapshot figure &#x20AC;2,500,000 matches |
| d9fc2c34 | Intertrust | 2,500,000 | fine-for-trust-office-intertrust-netherlands-for-insuff | SNAPSHOT-OK (DNB text) | snapshot figure &#x20AC;2,500,000, €2,500,000 matches |
| a8fa3cc6 | Aegon Bank N.V. | 2,968,750 | fine-for-aegon-bank-n-v-for-insufficiently-managing-cre | UNVERIFIED-NO-FIGURE | snapshot carries no euro figure |
| eede489a | Aegon Bank N.V. | 2,968,000 | fine-for-aegon-bank-n-v-for-insufficiently-managing-cre | UNVERIFIED (circular) | figure appears only in our generated summary prefix, not in DNB text |
| 8580eff8 | Unnamed firm (DNB) | 2,850,000 | fine-for-crypto-service-provider-for-offering-crypto-se | SNAPSHOT-OK (DNB text) | snapshot figure &#x20AC;2,850,000, €2,850,000 matches |
| 0412f4df | Unnamed firm (DNB) | 2,850,000 | fine-for-crypto-service-provider-for-offering-crypto-se | SNAPSHOT-OK (DNB text) | snapshot figure &#x20AC;2,850,000 matches |
| f0281bb9 | Black Swan Capital | 15,810 | fine-imposed-on-black-swan-capital-for-failure-to-hold- | SNAPSHOT-OK (DNB text) | snapshot figure &#x20AC;15,810, €15,810,000 matches |
| 2abfd1c0 | Black Swan Capital | 15,810 | fine-imposed-on-black-swan-capital-for-failure-to-hold- | SNAPSHOT-OK (DNB text) | snapshot figure &#x20AC;15,810 matches |
| 32e645eb | Pan-Invest | 467,180 | fine-for-trust-office-pan-invest-for-insufficient-custo | SNAPSHOT-OK (DNB text) | snapshot figure &#x20AC;467,180 matches |
| 42cdbcf8 | CIS Management B.V. | 29,700 | instruction-issued-to-trust-office-cis-management-b-v-f | UNVERIFIED-NO-FIGURE | snapshot carries no euro figure |
| 13035b73 | Zenco | 75,000 | zenco-fined-for-failing-to-commission-audits | SNAPSHOT-OK (DNB text) | snapshot figure &#x20AC;75,000 matches |
| f3456dbe | Zenco | 75,000 | zenco-fined-for-failing-to-commission-audits | SNAPSHOT-OK (DNB text) | snapshot figure &#x20AC;75,000, €75,000,000 matches |
| 5673ef0f | Bybit Fintech Limited | 2,250,000 | fine-for-bybit-fintech-limited-for-offering-crypto-serv | SNAPSHOT-OK (DNB text) | snapshot figure &#x20AC;2,250,000 matches |
| 93f45542 | Unnamed firm (DNB) | 2,250,000 | fine-for-bybit-fintech-limited-for-offering-crypto-serv | SNAPSHOT-OK (DNB text) | snapshot figure &#x20AC;2,250,000, €2,250,000 matches |
| 266e5fd6 | Stichting Pensioenfonds PostNL | 80,000,000 | dnb-issues-instruction-to-stichting-pensioenfonds-postn | CHANGE | NULL (already in file, pending apply): instruction, no fine; quarantine ends on apply |
| 53884e98 | de Volksbank N.V. | 15,000,000 | administrative-fine-for-de-volksbank-n-v-for-failure-to | SNAPSHOT-OK (DNB text) | snapshot figure &#x20AC;15 million, €15,000,000 matches |
| 698a01db | de Volksbank N.V. | 5,000,000 | fine-for-de-volksbank-n-v-for-deficient-anti-money-laun | SNAPSHOT-OK (DNB text) | snapshot figure &#x20AC;5 million matches |
| 0ece522a | de Volksbank N.V. | 15,000,000 | administrative-fine-for-de-volksbank-n-v-for-failure-to | SNAPSHOT-OK (DNB text) | snapshot figure &#x20AC;15 million matches |
| 80404792 | de Volksbank N.V. | 20,000,000 | fines-totalling-20-million-imposed-on-de-volksbank | CHANGE | NULL: combined headline of two fines stored separately (5m + 15m) |
| 45273561 | Amicorp | 530,450 | fine-for-trust-office-amicorp-for-insufficient-customer | SNAPSHOT-OK (DNB text) | snapshot figure &#x20AC;530.450, matches |
| 3271e4c3 | Unnamed firm (DNB) | 530,450 | fine-for-trust-office-amicorp-for-insufficient-customer | SNAPSHOT-OK (DNB text) | snapshot figure &#x20AC;530.450,, €530,450 matches |
| 00a93907 | ABN AMRO Bank N.V. | 15,000,000 | fine-for-abn-amro-bank-n-v-for-non-compliance-with-bonu | SNAPSHOT-OK (DNB text) | snapshot figure &#x20AC;15 million matches |
| 072fc8c0 | bunq B.V. | 2,600,000 | fine-for-bunq-b-v-for-insufficient-customer-due-diligen | SNAPSHOT-OK (DNB text) | snapshot figure &#x20AC;2.6 million matches |
| b5ff7cd5 | Aux Cayes Fintech Co. Ltd. | 2,250,000 | fine-for-aux-cayes-fintech-co-ltd-for-offering-crypto-s | SNAPSHOT-OK (DNB text) | snapshot figure &#x20AC;2,250,000 matches |
| 870b6f02 | Unnamed firm (DNB) | 2,250,000 | fine-for-aux-cayes-fintech-co-ltd-for-offering-crypto-s | SNAPSHOT-OK (DNB text) | snapshot figure &#x20AC;2,250,000, €2,250,000 matches |
| befd0f1f | Auction Europe B.V. | 10,125,000 | fine-imposed-on-bondauction-europe-b-v-for-repeated-cap | CHANGE | SUPPRESS (quarantine release): x1000 mis-named duplicate of 0963e0f5 (EUR 10,125) |
| 0963e0f5 | BondAuction Europe B.V. | 10,125 | fine-imposed-on-bondauction-europe-b-v-for-repeated-cap | SNAPSHOT-OK (DNB text) | snapshot figure &#x20AC;10,125 matches |
| 5b9d17c0 | AFS E-Venues B.V. | 28,710 | fine-for-afs-e-venues-b-v-for-repeated-liquidity-shortf | SNAPSHOT-OK (DNB text) | snapshot figure &#x20AC;28,710 matches |
| 3b72dccc | ABN AMRO Bank N.V. | 8,500,000 | fine-for-abn-amro-bank-n-v-for-inadequate-customer-due- | UNVERIFIED-NO-FIGURE | snapshot carries no euro figure |
| 19aeafc8 | CCV Group B.V. | 2,650,000 | administrative-fine-imposed-on-ccv-for-inadequate-custo | SNAPSHOT-OK (DNB text) | snapshot figure &#x20AC;2.65 million matches |
| e6495c01 | CCV Group B.V. | 625,000 | fine-for-ccv-group-b-v-for-lack-of-sira | UNVERIFIED-NO-FIGURE | snapshot carries no euro figure |
| c0147040 | International Trust Services B.V. | 29,700 | fine-for-trust-office-international-trust-services-b-v- | UNVERIFIED-NO-FIGURE | snapshot carries no euro figure |
| d77bb59f | GMG Europe B.V. | 59,770 | fine-imposed-on-gmg-europe-b-v-for-repeated-capital-sho | SNAPSHOT-OK (DNB text) | snapshot figure &#x20AC;59,770 matches |
| 4afc6cdf | Erez Corporate Service B.V. | 95,000 | fine-for-trust-office-erez-corporate-service-b-v-for-fa | UNVERIFIED-NO-FIGURE | snapshot carries no euro figure |
| ce92cbcf | Modulr Finance B.V. | 722,160 | administrative-fine-imposed-on-modulr-finance-b-v-for-i | UNVERIFIED-NO-FIGURE | snapshot carries no euro figure |

Counts: {'SNAPSHOT-OK': 33, 'UNVERIFIED-NO-FIGURE': 10, 'CHANGE': 7} (every row is additionally UNVERIFIED against the live page: Akamai 403).

Notes for the reviewer:
- Unverified rows worth a manual look once the site is reachable: D-Max 7902f02b (licence revocation, EUR 29,700 with no fine in the snapshot), CIS Management 42cdbcf8 (an instruction, EUR 29,700), Aegon a8fa3cc6 vs eede489a (EUR 2,968,750 vs 2,968,000 for the same notice), ABN AMRO 3b72dccc EUR 8.5m, Modulr, CCV EUR 625k, Erez, ITS, Pan-Invest/IDSG replacement rows.
- IDSG replacement row 0eb6fc09 is already nulled by an entry already in the file (order subject to penalty); the unnamed EUR 50m IDSG row ec90554a is already suppressed. Pan-Invest 32e645eb EUR 467,180 matches the snapshot ('administrative fine of EUR 467,180'); the EUR 467,180,000 unnamed row is already suppressed.
- Many notices are still stored twice (named + unnamed rows with the same correct amount). Those are not wrong amounts and were left alone.
- Root cause of the x10/x1000/x1,000,000 amounts: the first DNB parser (commit b256ab6) removed every '.' and ',' and multiplied by 1,000,000 whenever the word 'million'/'miljoen'/'mln' appeared anywhere on the page. Fixed in PR #420 (parseDnbEuroAmount + tests on real Dutch/English formats).

## 2. HSBC Mexico MXN 203,900,000 (CNBV, id b43f493a)

Fetched the official CNBV sanctions service (publicacion-sanciones-service.cnbv.gob.mx/api/sanctions, plain GET, generic User-Agent): 11,609 published sanctions. Largest amount on the whole register is MXN 13,489,269; no HSBC record exceeds MXN 2,886,600; no HSBC record is dated 2023-03-22; no record equals 203,900,000. The stored row has no notice link and a fixture-shaped payload. Verdict: UNVERIFIED, not on the official register; stays quarantined (required review untouched). The same pattern applies to three other large CNBV rows not in scope: BBVA Bancomer MXN 284.4m (cb47225d), Banco Santander Mexico MXN 156.7m (5dca0567), Banorte MXN 98.5m (7dba6326).

## 3. FCA rows (fetched fca.org.uk PDFs, generic User-Agent, HTTP 200)

| Row | Notice | Stored | Official figure | Verdict |
|---|---|---:|---|---|
| BlueCrest Capital Management (UK) LLP, FCA-2025-10-14-...b7bc8090 | Final Notice 13 Oct 2025 | null | 'a public censure ... instead of a financial penalty'; USD 101m is s55L redress | CORRECT (null) |
| BlueCrest, FCA-2021-12-22-...672193e4 | Decision Notice 4 Nov 2021 (GBP 40,806,700) | null | referred to the Upper Tribunal, reference withdrawn 10 Oct 2025, superseded by the censure Final Notice | CORRECT (null) |
| Gatehouse Bank plc, 9ed3435b | Decision Notice 12 Oct 2022 (ML Regulations) | 1,584,100 | 'impose ... a civil penalty of GBP 1,584,100'; settled, 30% stage 1 discount; no Tribunal reference | CORRECT (kept) |
| HSBC UK Bank plc et al, 5f307e7c | Final Notice 23 May 2024 | 6,280,100 | 'imposes on HSBC UK a financial penalty of GBP 6,280,100' (redress GBP 185m excluded) | CORRECT (kept) |
| Ghana International Bank Plc, ad7e2a0c | Decision Notice 23 Jun 2022 (ML Regulations) | 5,829,900 | 'impose ... a civil penalty of GBP 5,829,900'; settled, 30% discount; no Tribunal reference | CORRECT (kept) |
| Lee Morgan (Denis Lee Morgan), FCA-2023-06-28-lee-morgan-277e068c | Final Notice 26 Jun 2023 | null | prohibition order and withdrawal of approvals only; no penalty (GBP 85,000 is the FSCS compensation cap) | CORRECT (null) |
| Lewis George Automotive Limited, FCA-2026-08-25-...f3a45239 | Final Notice 25 Aug 2026 | null | cancellation of Part 4A permission for unpaid fees; no penalty (only GBP 250/50 fee rules quoted) | CORRECT (null) |
| Thomas Plenderleith Adamson (Elgin Honda), FCA-2026-04-07-...0de81451 | Final Notice 7 Apr 2026 | null | refusal to annul a cancellation; no penalty | CORRECT (null) |

Out-of-scope flag: FCA-2026-08-04-heather-dunne-b454e184 is stored at GBP 126,000,000 from a decision-notices URL (decision-notices/heather-dunne-2024.pdf); looks like a x1000 error and a Decision Notice. Not touched.

## 4. Quarantine outcome

- Lewben dd07e396, unnamed Athos 3df184f0, 'Auction Europe' befd0f1f: released by suppression in favour of the correctly valued rows of the same notice (their `required` review rows are left as is).
- Stichting Pensioenfonds PostNL 266e5fd6: nulled by an entry already in the file; applies with the next run.
- HSBC Mexico b43f493a: stays quarantined (UNVERIFIED).

## Addendum after review (coordinator items 1-5)

- Circular-evidence re-check: figure must appear in DNB's own original description (raw_payload.summary), not in our generated 'X fined EUR N by DNB' prefix. Rows downgraded from OK to UNVERIFIED (circular): eede489a.
- Aegon eede489a (EUR 2,968,000) suppressed in favour of a8fa3cc6 (EUR 2,968,750); the 2,968,000 came only from our own summary prefix.
- Volksbank 80404792 (EUR 20m total) and PostNL 266e5fd6 are now suppressions (survive re-ingest) instead of nulls.
- Heather Dunne FCA-2026-08-04-...b454e184: compare-and-set null (126,000,000 -> null), the 'GBP 126m transferred' pension figure, from a Decision Notice.
- CNBV cb47225d, 5dca0567, 7dba6326 and b43f493a are fixtures: the original scraper getTestData() (commit a6e1113) contains BBVA 284,400,000, HSBC Mexico 203,900,000 (and Santander 156.7m, Banorte 98.5m); the official register has none of them. Suppressed as synthetic (no replacement).
