# Global regulatory ecosystem and publication research

## Executive conclusion

RegActions has the raw ingredients for a defensible proprietary regulatory-intelligence layer, but not for a single global “regulator quality” score. The sound product is a family of separately explained signals covering institutional mandates, publication transparency, RegActions' own coverage confidence and observed enforcement activity.

The research universe contains 213 jurisdictions. Official evidence now identifies local authority structures for 212; North Korea is retained as externally observable through FATF but without a credible public domestic regulator source. This avoids the false conclusion that no discoverable website means no regulator or low risk.

RegActions currently has 54 live regulators across 40 countries plus one EU-level authority. That is meaningful enforcement depth—38,138 records were returned by the live APIs during this snapshot—but the geographic footprint remains concentrated in Europe, North America and selected APAC/IFC centres. The proposed regulatory layer should make both the depth and the gaps visible.

## Evidence base

The ecosystem map combines current official directories from:

- BIS central banks and prudential authorities: https://www.bis.org/cbanks.htm and https://www.bis.org/regauth.htm
- IOSCO ordinary securities members: https://www.iosco.org/v2/about/?subsection=membership&memid=1
- IAIS insurance members: https://www.iais.org/about-the-iais/iais-members/
- IOPS pension supervisors: https://www.iopsweb.org/en/membership/iops-members-and-observers.html
- Egmont FIU membership: https://egmontgroup.org/members-by-region/
- FATF and FSRB network context: https://www.fatf-gafi.org/en/countries.html

Targeted national-source research closed gaps for Comoros, Djibouti, Mauritania, São Tomé and Príncipe, Somalia, South Sudan, Palau, American Samoa and Guam. Eritrea uses the official 2025 ESAAMLG mutual evaluation because no credible public Bank of Eritrea site was located. North Korea uses the current FATF call-for-action evidence rather than an invented domestic source: https://www.fatf-gafi.org/en/countries/detail/DPRK.html

The World Bank Bank Regulation and Supervision Survey was considered as a contextual benchmark, but its latest global survey vintage is 2019 and is not suitable as a current publication-performance input: https://www.worldbank.org/en/research/brief/BRSS

## Global ecosystem result

The merged directory contains 642 authority records:

- central banking evidence in 191 jurisdictions;
- prudential supervision in 188;
- securities supervision in 138;
- insurance supervision in 148;
- pensions supervision in 81;
- financial-intelligence units in 187.

Of 213 jurisdictions, 117 have broad evidence across at least five role families, 66 have moderate evidence across three or four, 29 have limited directory evidence, and one is externally observable but domestically unpublished/unobservable.

These are evidence-depth categories, not judgments about regulatory quality. Pension arrangements, for example, are not universally organized through a standalone public supervisor.

## Official-site publication discovery

All 642 authority records were checked. Results at the time of research:

- 356 sites reachable;
- 110 challenge-protected;
- 15 access-blocked;
- 56 timed out;
- 58 network errors;
- 18 other HTTP errors;
- 29 authority records had no public website.

The root-page multilingual scan found 1,179 potential enforcement, sanctions, disciplinary or decision links across 264 authorities. A follow-up request to one best candidate per authority found:

- 115 strong official-publication candidates;
- 12 plausible candidates;
- 88 generic or ambiguous decision/news links;
- 49 candidates that could not be observed because of challenge/access/error states.

Dated first-page evidence was visible for candidate pages in 50 countries. Those date counts are not yet a publishable cadence metric: search forms, pagination, document archives and delayed publication can all hide activity.

## Current RegActions position

Country coverage is 40 of 213 jurisdictions (18.8%), with seven additional countries having an official enforcement source already validated in the pipeline. Coverage by region is:

| Region | Jurisdictions | Live countries | Validated pipeline | Live share |
|---|---:|---:|---:|---:|
| Africa | 54 | 2 | 2 | 3.7% |
| Americas | 32 | 4 | 2 | 12.5% |
| Asia Pacific | 45 | 9 | 1 | 20.0% |
| Europe | 49 | 19 | 0 | 38.8% |
| Middle East | 15 | 2 | 1 | 13.3% |
| Offshore / IFC | 18 | 4 | 1 | 22.2% |

The 54 live feeds comprise 48 automated, two curated archives, one sparse source and three low-frequency sources. Forty-three have standard operational confidence and 11 lower confidence.

Observed activity is diverse: 20 frequent, 15 active, 14 periodic, four low-frequency and one with no recent signal. Fifty-one feeds are within their regulator-specific freshness contract. AMMC, HKMA and IOMFSA are beyond their present contract thresholds but belong in a watch/review state, not as automatic scraper failures. FSS and Ghana SEC each show one active month in the last 24 months and remain correctly interpretable as genuine low-frequency publication patterns.

## Data-quality findings before a product build

The static registry count differs from the live production observation for 39 of 54 regulators. The largest visible mismatch is FCA: 308 static versus 752 live. Static counts must stop driving public totals or any denominator.

Monetary disclosure ranges from 0% for 11 feeds to 100% for seven. This is evidence that a universal “amount completeness” score would encode legal/publication style rather than transparency. The median live regulator has 116 actions, nine active years and activity in 11 of the last 24 months, but the range is extremely skewed: six to 11,155 actions and 1.2 to 293.6 actions per active year.

The correct distinction is:

- **publication transparency** belongs to the regulator/source;
- **coverage confidence** belongs to RegActions;
- **activity** describes observed publications;
- **country risk** remains in v3 and its treatment overlays.

## Commercial and product opportunity

This research supports a distinctive “RegActions Regulatory Signal” that competitors' public country-rating pages do not visibly provide: a traceable map from country, to authority mandate, to enforcement-publication behavior, to RegActions coverage and then to the underlying official action.

The first user-facing version should be evidence-led rather than score-led:

1. show the regulator ecosystem on every country page;
2. identify which authorities publish enforcement records and how they publish;
3. show RegActions coverage confidence separately;
4. show neutral activity labels and observed trend;
5. explain missing, blocked, low-frequency and structurally absent states;
6. retain Country Risk v3, FATF, sanctions and beneficial-ownership evidence as adjacent context.

After human validation and shadow calibration, a regulator publication-transparency score may be defensible. A score purporting to measure “regulator strength” is not supported by the available public evidence and should not be built.

## Research disposition for every jurisdiction

The 213-row `coverage-gap-register.csv` records official authority evidence, mandate roles, FATF/FSRB context, live and pipeline regulators, publication candidates, provisional cadence evidence and the next research/control action. Every jurisdiction therefore has a documented disposition before product work begins; none is silently represented as zero.
