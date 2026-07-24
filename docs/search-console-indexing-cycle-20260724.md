# Search indexing cycle — 24 July 2026

## Release boundary

This release completes the code-side indexing work. It does not claim that Google has recrawled, indexed or ranked the changed pages.

The production property is `https://regactions.com/`. The submitted sitemap should remain the sitemap index at `https://regactions.com/sitemap.xml`; its FCA case child is `https://regactions.com/sitemap-fca-fines.xml`.

Search Console submission and URL inspection require an authorised signed-in browser session. No such session was available during this implementation run, so those account-bound actions remain an explicit operator step after deployment.

## Query ownership

| Page family | Intended query ownership |
| --- | --- |
| `/regulators/fca` | Broad “FCA fines” and FCA enforcement research |
| Current-year topic | Year-based FCA fines searches |
| Monthly reports | Month-specific FCA fines and enforcement searches |
| Canonical case pages | Firm, individual, penalty, amount and final-notice searches |
| Firm, breach and year hubs | Crawlable comparison paths supporting the canonical cases |

## Post-deployment checks

1. Confirm `/sitemap.xml` returns a sitemap index and includes `/sitemap-fca-fines.xml`.
2. Confirm the FCA case sitemap count equals the current indexable case count and excludes every held case.
3. Confirm selected pages return `200`, self-canonicalise, expose the expected structured data and are not blocked by robots metadata.
4. In Search Console, resubmit only `/sitemap.xml`.
5. Inspect and request indexing for the small priority cohort below. Do not bulk-submit every case route.

## Priority inspection cohort

- `/regulators/fca`
- `/topics/fca-fines-2026`
- `/blog/fca-fines-july-2025`
- `/years/2025`
- `/fca-fines/2026/dinosaur-merchant-bank-limited/29858df8-2bc5-4c69-9229-29ed716b9b5c`
- `/fca-fines/2025/barclays-bank-plc/d1cc3da1-810b-4256-b451-ebfb31544771`
- `/fca-fines/2025/markos-theodosi-markou/02b32768-4d68-4277-be17-3949e9b4ab57`
- `/firms/monzo-bank-limited-e64d6c`
- `/breaches/aml`

These case and hub paths were copied from the production-data build sitemaps. Reconfirm that the same canonical paths are present after deployment before requesting inspection.

## 28-day observation log

Record the following once a week for 28 days, using the same Search Console filters each time.

| Date | Valid indexed pages | Excluded pages | Impressions | Clicks | Average position | Notes or URL-level actions |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Day 0 |  |  |  |  |  | Sitemap resubmitted and priority cohort inspected |
| Day 7 |  |  |  |  |  |  |
| Day 14 |  |  |  |  |  |  |
| Day 21 |  |  |  |  |  |  |
| Day 28 |  |  |  |  |  |  |

Investigate genuine redirect, alternate-canonical, not-found and duplicate-page reports. Do not weaken the evidence gate or widen freshness/indexability thresholds solely to increase the valid-page count.

Top-20 ranking remains a medium-term objective. It is not a release acceptance criterion and should be assessed only after the observation window has enough impressions to support a meaningful comparison.
