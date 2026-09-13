# Privacy-safe product funnel events

The Fines and regulator workspaces use the existing `trackEvent` wrapper. The
wrapper sends only the dimensions allowlisted in
`src/utils/productAnalyticsContract.ts`; the first-party endpoint persists
those dimensions in `product_funnel_events` after the same validation.

## Issue #20 event dictionary

| Event | Safe dimensions | Meaning |
| --- | --- | --- |
| `fines_workspace_opened` | `surface`, `view` | A Fines workspace view was opened. |
| `regulator_workspace_opened` | `surface`, `regulator`, `view` | A regulator workspace view was opened. |
| `workspace_filter_changed` | `surface`, `filter_dimension`, `filter_action`, `filter_count` | A named filter dimension was applied or cleared; values are never sent. |
| `comparison_mode_entered` | `surface` | Comparison mode was entered. |
| `comparison_selection_changed` | `surface`, `selection_dimension`, `selection_action`, `selection_count` | A year, regulator, or theme was added or removed from comparison. |
| `comparison_data_opened` | `surface` | Selected comparison data was opened. |
| `evidence_drawer_opened` | `surface`, `regulator`, `source` | A workspace evidence drawer was opened. |
| `evidence_opened` | `surface`, `regulator`, `source_status` | A case evidence modal was opened. |
| `official_source_opened` | `surface`, `regulator`, `source_status` | An official source link was opened. |
| `evidence_export_completed` | `surface`, `format` | A CSV or other evidence export completed. |
| `comparison_link_copied` | `surface` | A comparison link was copied successfully. |
| `regulator_comparator_changed` | `surface`, `regulator`, `comparator` | The regulator comparator changed. |
| `regulator_year_changed` | `surface`, `regulator`, `year` | The regulator workspace year changed. |

No event accepts search text, firm/entity names, email addresses, messages,
URLs, or query-string values. The report is intentionally aggregate-only.

## Seven-day funnel report

With `DATABASE_URL` configured, run:

```bash
npm run product-funnel:report
```

The optional first argument changes the bounded window in days. Output is JSON
grouped by `surface` and regulator code, with four stages:

`visit -> comparison_or_drilldown -> evidence_open -> official_source_open`

This keeps Fines, FCA, and each other regulator workspace separately visible
without exposing an individual journey or source URL.
