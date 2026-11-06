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
      "RegActions' Q3 2026 data study: 1,197 enforcement actions from 45 regulators, 45 verified monetary penalties worth £75.6m, and why one FinCEN penalty made up 79% of the value. Free to reuse under CC BY-NC 4.0.",
    content: `
## State of Global Enforcement: Q3 2026

**This study covers enforcement actions dated 1 July to 30 September 2026, taken from RegActions' enforcement database on 5 November 2026.** Every figure was computed by a script from the database and then recomputed with a separately written query; the two results match. The study states what each number includes and names the records left out and why. Where the data cannot support a claim, none is made.

## Key Takeaways

- **Volume was lower than a year earlier.** RegActions recorded **1,197 distinct enforcement actions** from **45 regulators** in Q3 2026, against 1,313 from 54 regulators in Q3 2025 (**-8.8%**) and 1,576 in Q2 2026 (**-24.0%**).
- **Verified penalties roughly halved.** There were **45 verified monetary penalties worth £75,627,438.50** in Q3 2026, against 94 worth 106,765,814.80 pounds in Q3 2025 (**-52.1% by number, -29.2% by value**).
- **One penalty dominates the value.** FinCEN's penalty on **UBS Financial Services Inc.** (£60,060,000, or 77,000,000 US dollars) is **79.4%** of the quarter's total. Without it, the other 44 penalties come to **15,567,438.50 pounds**.
- **Volume is concentrated in a few regulators.** Mexico's CNBV alone accounts for **416** of the 1,197 actions (34.8%), and the five busiest regulators for 719 (60.1%).
- **Most actions carry no published monetary amount.** Supervisory sanctions are tagged on 811 actions and monetary penalties on 573; the tags overlap.
- **Data quality is part of the story.** RegActions excluded **51 source records** from the penalty figures, including 48 duplicate rows and one record whose stored amount contradicts the regulator's own press release.

## What is counted, and what is not

Two measures run through this study, and they answer different questions.

**Enforcement actions** are distinct records of regulator, respondent, date and the opening of the published summary, dated in the quarter. The database holds duplicate rows for some actions, so each action is counted once. This measure includes reprimands, prohibitions, supervisory sanctions and other outcomes that carry no fine.

**Verified monetary penalties** are the subset where the stored GBP amount is positive, the notice comes from an official regulator domain, the text uses penalty language such as fine or financial penalty, and it does not describe a review, examination or consultation. Three kinds of record are then removed. Rows repeated with an identical amount and summary are removed, because they are duplicates or group totals rather than separate penalties. One record proved to be a data defect is removed. And any single amount of 1 million pounds or more that could not be confirmed is removed, whether by the amount quoted in the record's own text (for amounts below 5 million pounds) or by checking it against the official notice.

Amounts are converted to pounds sterling using the rate stored with each record, so the totals move slightly if exchange rates are restated.

## The previous quarter and the same quarter of 2025

| Measure | Q3 2026 | Q2 2026 | Q3 2025 |
| --- | --- | --- | --- |
| Distinct enforcement actions | 1,197 | 1,576 | 1,313 |
| Regulators with actions | 45 | 55 | 54 |
| Verified monetary penalties | 45 | 50 | 94 |
| Value of verified penalties (pounds) | 75,627,438.50 | 16,219,339.50 | 106,765,814.80 |

Against the previous quarter, the number of actions was 24.0% lower and the number of penalties 10.0% lower, but their value was 366.3% higher. That jump comes almost entirely from the UBS penalty: Q2 2026 contained no single penalty of that size in the verified set.

Against the same quarter of 2025, the number of penalties was 52.1% lower and their value 29.2% lower. Treat the value comparison with care. Q3 2025 includes three large penalties confirmed against official notices: 46,000,000 pounds on Neil Woodford, 21,091,300 pounds on Monzo Bank and 11,900,000 pounds on Vocalink. A single large case moves a quarterly total far more than a steady flow of smaller ones.

## The ten largest verified penalties

| Date | Regulator | Respondent | Amount (GBP) | Original amount |
| --- | --- | --- | --- | --- |
| 3 Aug 2026 | FinCEN | UBS Financial Services Inc. | £60,060,000 | USD 77,000,000 |
| 20 Jul 2026 | PRA | HDI Global SE | £4,165,000 | GBP 4,165,000 |
| 13 Jul 2026 | DNB | CCV Group B.V. | £2,252,500 | EUR 2,650,000 |
| 9 Sep 2026 | FDIC | CBW Bank | £1,950,000 | USD 2,500,000 |
| 3 Sep 2026 | FCA | Daniel Philip Thomas | £742,700 | GBP 742,700 |
| 29 Sep 2026 | SFC | Zheng Da International Financial Holding Limited | £700,000 | HKD 7,000,000 |
| 27 Jul 2026 | SFC | China Industrial Securities International Asset Management Limited | £680,000 | HKD 6,800,000 |
| 13 Jul 2026 | AFM | M. van Wettum | £531,250 | EUR 625,000 |
| 21 Jul 2026 | DNB | CCV Group B.V. | £531,250 | EUR 625,000 |
| 12 Aug 2026 | FCA | Paul Vincent Taylor | £489,000 | GBP 489,000 |

The UBS figure needs a note. FinCEN assessed a civil money penalty of 125,000,000 US dollars, and 48,000,000 US dollars of it was credited for payments to parallel regulators. RegActions records the non-duplicative 77,000,000 US dollars, which is the figure used here. Counting the full 125,000,000 US dollars would overstate what was newly owed to FinCEN.

## Where the volume sits

Ranking regulators by number of actions gives a very different league table from ranking by value.

| Regulator | Actions | Verified penalties | Value of verified penalties |
| --- | --- | --- | --- |
| CNBV (Mexico) | 416 | 0 | £0 |
| BCB (Brazil) | 136 | 0 | £0 |
| FSS (South Korea) | 74 | 0 | £0 |
| BaFin (Germany) | 47 | 4 | £429,250 |
| CBN (Nigeria) | 46 | 0 | £0 |
| FCA (United Kingdom) | 44 | 11 | £2,243,839 |
| FINRA (United States) | 42 | 5 | £33,150 |
| SPK (Turkey) | 36 | 0 | £0 |

The zeros are a finding about publication practice, not a claim that those regulators imposed no sanctions. Several of these authorities publish a large number of supervisory sanctions without a monetary amount in a form that can be verified, so they lead on volume and do not appear in the value ranking.

The FCA recorded 44 actions in the quarter, of which 11 were verified monetary penalties totalling £2,243,839. That is a small total next to the UBS figure, and a reminder that a quarterly sum says little without the individual cases behind it.

## Breach themes

RegActions tags each action with one or more themes. In Q3 2026 the most common were supervisory sanction (811 actions), monetary penalty (573), disclosure (206), markets supervision (64), other (49) and anti-money laundering (35). An action can carry more than one tag, so the counts add to more than 1,197. The anti-money laundering tag is the narrowest of these.

## Data quality: what was excluded

The database is built from regulators' public notices, and some records carry errors. Three examples from this quarter show why the penalty figures above are filtered rather than summed raw.

- **Duplicate rows.** RegActions excluded 48 rows, all BaFin notices, in groups of three to seven that repeated an identical amount and summary. Summing them would have inflated both counts and value.
- **A contradicted amount.** One FCA record stored 126,000,000 pounds for Heather Dunne. That is the value of the pension transfers she advised on, not the penalty. The FCA's press release says the Upper Tribunal reduced her fine to 41,230 pounds. The record is excluded rather than using either number.
- **Unconfirmed large amounts.** Two records of £1m or more, including a penalty of 8,500,000 euros on ABN AMRO Bank N.V. recorded from a DNB notice, could not be confirmed against the official notice in time for publication, so they are not in the totals. If they are confirmed, the Q3 total will rise.

This study will be corrected if any of these are resolved differently. The underlying data pack is reproducible from the quarterly script in the RegActions repository.

## About the Data

**Sources.** All records come from RegActions' enforcement database as of 5 November 2026; each record links to a regulator's own notice. The quarter is defined by the date recorded for each action, which can differ from the date a regulator announced it.

**Limits.** Penalty value reflects only verified penalties as defined above, so it understates total sanctions wherever regulators do not publish amounts. Figures for the same quarter of 2025 use the same rules applied to Q3 2025, and the Q3 2025 value is sensitive to a handful of large cases.

**Licence.** This study is published under [Creative Commons Attribution-NonCommercial 4.0 (CC BY-NC 4.0)](https://creativecommons.org/licenses/by-nc/4.0/). You may reuse the figures for non-commercial purposes with a visible, clickable credit to [RegActions](https://regactions.com). For commercial licensing, contact contact@memaconsultants.com.

Explore the underlying records in the [enforcement explorer](https://regactions.com/search), compare regulators in the [regulator data hub](https://regactions.com/regulators), or read the earlier [H1 2026 data study](https://regactions.com/blog/state-of-global-aml-enforcement-h1-2026).
    `,
    category: "Data Studies",
    readTime: "8 min read",
    date: "November 2026",
    dateISO: "2026-11-05",
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
