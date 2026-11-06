// Quarterly data studies. Figures come from docs/data-packs/<year>-Q<n>.json, built by
// scripts/quarterly-data-pack.ts from the live database, with each headline number
// re-derived by an independent SQL query. No model-written text: prose is editorial.
// NO React/JSX imports here.

import type { BlogArticleMeta } from "./blogArticles.js";

export const dataStudyArticles: BlogArticleMeta[] = [
  {
    id: "state-of-global-enforcement-q3-2026",
    slug: "state-of-global-enforcement-q3-2026",
    title: "State of Global Enforcement: Q3 2026 Data Study",
    seoTitle: "Global Enforcement Q3 2026 Data Study | Fines and Actions | RegActions",
    excerpt:
      "RegActions' Q3 2026 data study: 1,210 enforcement actions from 45 regulators and 689 counted monetary penalties. Free to reuse under CC BY-NC 4.0.",
    content: `
## State of Global Enforcement: Q3 2026

**This study covers enforcement actions dated 1 Jul 2026 to 30 Sept 2026, taken from RegActions' enforcement database on 6 Nov 2026.** Every figure was computed by a script from the database and then recomputed with a separately written query; the two results match. The definitions below say what each number includes and what was left out.

## Key Takeaways

- **Volume:** RegActions recorded **1,210 distinct enforcement actions** from **45 regulators**, which is 8.8% lower than the 1,327 recorded in the same quarter of 2025 and 23.7% lower than the 1,585 in the previous quarter.
- **Monetary penalties:** **689 penalties carry a counted amount, together 108,390,488.42 pounds**. The number is 21.2% lower and the value 25.7% higher than the same quarter of 2025; against the previous quarter they are 33.2% lower and 59.4% lower.
- **Concentration of value:** the largest single penalty, **UBS Financial Services Inc.** (FINCEN, £60,060,000), is **55.4%** of the quarter's counted value; without it the other 688 penalties come to 48,330,488.42 pounds.
- **Concentration of volume:** the five busiest regulators (CNBV, BCB, FSS, CBN, FINRA) account for **748** of the 1,210 actions (61.8%).
- **Most actions carry no counted amount:** supervisory sanction is tagged on 843 actions and monetary penalty is tagged on 600 actions; tags overlap.
- **Data quality is part of the story:** 52 otherwise-qualifying records were excluded, with reasons listed below.

## What is counted, and what is not

**Enforcement actions** are distinct records of regulator, respondent, date, amount and breach, dated in the quarter, with duplicate rows counted once. They include reprimands, prohibitions and other outcomes that carry no fine.

**Counted monetary penalties** are the subset where the trusted record holds a positive amount, the notice or source is on an official regulator or court domain taken from the RegActions regulator registry, and the text names an imposed sanction. Sanction wording covers fine, penalty, multa, Bußgeld, 과태료, 과징금, infringement notice and civil money penalty. The amount must not be restitution, disgorgement, compensation, costs or a periodic penalty rate. Each notice is counted once per respondent. Decisions that are still open to challenge are not counted: FCA Decision Notices that can be referred to the Tribunal, Brazilian first-instance decisions under appeal to the CRSFN, and figures the FCA would have imposed but waived for hardship. Orders subject to penalty (periodic penalty payments) are not fines and are not counted either. Any single amount of 5 million pounds or more is counted only after it has been checked against the official notice.

Amounts are converted to pounds sterling at the rate stored with each record, so totals move slightly if rates are restated.

## The previous quarter and the same quarter last year

| Measure | Q3 2026 | Previous quarter | Same quarter 2025 |
| --- | --- | --- | --- |
| Distinct enforcement actions | 1,210 | 1,585 | 1,327 |
| Counted monetary penalties | 689 | 1,031 | 874 |
| Value of counted penalties (pounds) | 108,390,488.42 | 267,075,945.90 | 86,252,077.23 |

Treat the value comparisons with care: a single large case moves a quarterly total far more than a steady flow of smaller ones.

## The ten largest counted penalties

| Date | Regulator | Respondent | Amount (GBP) | Original amount |
| --- | --- | --- | --- | --- |
| 3 Aug 2026 | FINCEN | UBS Financial Services Inc. | £60,060,000 | USD 77,000,000 |
| 2 Sept 2026 | OFSI | Citibank, N.A., London Branch (CBNA London) | £4,732,830.58 | GBP 4,732,830.58 |
| 20 Jul 2026 | PRA | HDI Global SE | £4,165,000 | GBP 4,165,000 |
| 16 Jul 2026 | FRC | PwC | £3,248,437 | GBP 3,248,437 |
| 31 Jul 2026 | FSS | 롯데카드㈜ | £2,850,000 | KRW 5,000,000,000 |
| 13 Jul 2026 | DNB | CCV Group B.V. | £2,252,500 | EUR 2,650,000 |
| 9 Sept 2026 | FDIC | CBW Bank | £1,950,000 | USD 2,500,000 |
| 30 Sept 2026 | FCA | Robin Crispin William Odey | £1,529,374 | GBP 1,529,374 |
| 28 Jul 2026 | FRC | Ernst and Young (EY) | £1,197,000 | GBP 1,197,000 |
| 10 Sept 2026 | OFAC | Unnamed individual (OFAC) | £1,113,239.4 | USD 1,427,230 |

## Where the volume sits

| Regulator | Actions | Counted penalties | Value of counted penalties (pounds) |
| --- | --- | --- | --- |
| CNBV | 436 | 427 | 7,169,931.43 |
| BCB | 151 | 102 | 622,164.18 |
| FSS | 73 | 18 | 5,519,082.00 |
| CBN | 46 | 0 | 0.00 |
| FINRA | 42 | 4 | 25,350.00 |
| FCA | 39 | 10 | 2,989,283.00 |
| CNBCZ | 34 | 0 | 0.00 |
| SPK | 33 | 23 | 2,284,220.10 |

In this quarter FSS had 73 actions and 18 counted penalties; CBN had 46 actions and 0 counted penalties; FINRA had 42 actions and 4 counted penalties; FCA had 39 actions and 10 counted penalties; CNBCZ had 34 actions and 0 counted penalties. The pack shows only that the remaining actions did not meet the counted-penalty definition above; it does not show why.

## Breach themes

RegActions tags each action with one or more themes. The most common were supervisory sanction (843), monetary penalty (600), disclosure (209), markets supervision (64), prohibition (43), other (39). An action can carry more than one tag, so the counts add to more than 1,210.

## Data quality: what was excluded

The database is built from regulators' public notices, and some records carry errors, so the penalty figures are filtered rather than summed raw. Reasons for current-quarter exclusions:

- 31 records: first-instance decision under appeal.
- 4 records: same amount and text copied onto several respondents; counted once under ÖZGÜR CEM HANCAN.
- 3 records: FSS disclosure has several monetary components; stored amount is not one fine.
- 2 records: same amount and text copied onto several respondents; counted once under UMPAŞ HOLDİNG ANO.
- 2 records: same amount and text copied onto several respondents; counted once under Mainfreight Distr.
- 2 records: same amount and text copied onto several respondents; counted once under AZMİ YALÇIN.
- 2 records: same amount and text copied onto several respondents; counted once under Asia Cornerstone.
- 1 record: same amount and text copied onto several respondents; counted once under KGI Futures Co.,.
- 1 record: single amount >= GBP 5,000,000 that is not attested against the official notice.
- 1 record: same amount and text copied onto several respondents; counted once under Patrick Michael C.
- 1 record: same amount and text copied onto several respondents; counted once under ARS İZOLASYON İNŞ.
- 1 record: one record carries several respondents' amounts.
- 1 record: same amount and text copied onto several respondents; counted once under ATIF TUNÇ ATIL.

## About the Data

**Sources.** All records come from the RegActions enforcement database as of 6 Nov 2026; each links to a regulator's own notice. The quarter is defined by the date recorded for each action, which can differ from the announcement date.

**Limits.** Counted value reflects only penalties that meet the definition above, so it understates total sanctions wherever regulators do not publish a single imposed amount. Figures for the comparison quarters use the same rules.

**Licence.** This study is published under [Creative Commons Attribution-NonCommercial 4.0 (CC BY-NC 4.0)](https://creativecommons.org/licenses/by-nc/4.0/). You may reuse the figures for non-commercial purposes with a visible, clickable credit to [RegActions](https://regactions.com). For commercial licensing, contact contact@memaconsultants.com.

Explore the underlying records in the [enforcement explorer](https://regactions.com/search), compare regulators in the [regulator data hub](https://regactions.com/regulators), or read the earlier [H1 2026 data study](https://regactions.com/blog/state-of-global-aml-enforcement-h1-2026).
    `,
    category: "Data Studies",
    readTime: "8 min read",
    date: "November 2026",
    dateISO: "2026-11-06",
    featured: false,
    articleType: "thematic",
    keywords: [
      "global enforcement Q3 2026",
      "regulatory fines Q3 2026",
      "enforcement data study",
      "FinCEN UBS penalty 2026",
      "regulator league table Q3 2026",
      "AML enforcement statistics",
      "quarterly enforcement statistics",
    ],
  },
];
