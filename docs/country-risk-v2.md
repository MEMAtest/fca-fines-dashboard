# Trusted Country Risk Score v2 operations

Methodology `2.0.0` runs in parallel with v1. It must not become the default until the scored source registry is current, every jurisdiction has three pillars, the review gates below are complete, and the two-week comparison report has been approved.

## Data flow and evidence

1. Run migration `npm run country-risk:migrate` to create source-run, indicator, methodology, score-run, score-evidence, and review records.
2. Refresh WGI with `npx tsx scripts/ingest-wgi.ts --year=2024 --dry-run`; a non-dry run writes only after schema and minimum-coverage validation.
3. Refresh CPI with `npm run country-risk:ingest-cpi -- --dry-run`. CPI is unmodified display context and validation evidence, never a scored pillar.
4. Obtain both official FATF consolidated assessment workbooks from the methodology page. Run `npm run country-risk:ingest-fatf -- --file-2013 <path> --file-2022 <path> --dry-run`, inspect unresolved names and coverage, then rerun without `--dry-run`. HTML challenges, missing tables, zero results and low coverage fail closed.
5. Run `npm run country-risk:check-sanctions`. It records hashes and source drift in `/tmp/country-risk-sanctions-review.json` but never changes classifications or scores. After legal review, `--approve-baseline` records the accepted source hashes. Sanctions tier changes still require a review record and a separate data change.
6. Run `npm run country-risk:score-run` and `npm run country-risk:validate`. Add `--require-ready` to the score run for a promotion gate.

Every production ingestion should persist source URL, retrieval and effective dates, raw SHA-256, parser version, methodology version, and calculation evidence using the v2 migration tables. Generated TypeScript snapshots remain reproducible application inputs; database rows are the operational audit trail.

## Approval gates

- FATF list status and sanctions tier changes require human approval before score publication.
- Sanctions classifications require legal-measure evidence from the relevant UN, UK, EU or US programme. A designation list alone does not prove a geographic regime tier.
- A compliance practitioner approves factor interpretation, missing-data policy and sanctions taxonomy.
- A quantitative reviewer approves sensitivity, historical back-test design and the parallel-run comparison.
- Production promotion requires two weeks of v1/v2 results, stable full ingestion, complete evidence links, no missing-as-zero cases, public API checks, and rendered page verification.

Until those gates pass, v2 remains labelled `parallel-validation`; incomplete evidence produces `provisional` or `insufficient-data`, never a falsely reassuring Low score.
