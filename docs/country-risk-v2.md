# Trusted Country Risk Score v2 operations

Methodology `2.0.0` runs in parallel with v1. It must not become the default until the scored source registry is current, every jurisdiction has three pillars, the review gates below are complete, and the two-week comparison report has been approved.

## Data flow and evidence

1. Run migration `npm run country-risk:migrate` to create source-run, indicator, methodology, score-run, score-evidence, and review records.
2. Refresh WGI with `npx tsx scripts/ingest-wgi.ts --year=2024 --dry-run`; a non-dry run writes only after schema and minimum-coverage validation.
3. Refresh CPI with `npm run country-risk:ingest-cpi -- --dry-run`. CPI is unmodified display context and validation evidence, never a scored pillar.
4. Run `npm run country-risk:verify-fatf`. It diffs the curated black and grey lists against the official page, writes retrieval/hash evidence to `/tmp/country-risk-fatf-list-review.json`, and fails on any status drift. Direct HTTP is attempted first and a headed Playwright browser is used for FATF's challenge-protected page.
5. Run `npm run country-risk:ingest-fatf -- --dry-run`. The importer first tries the official XLSX endpoints and automatically falls back to a headed Playwright download from the official methodology page when FATF returns a browser challenge. CI runs that fragile lane under Xvfb. Local `--file-2013 <path> --file-2022 <path>` inputs remain available for reproducible fixture runs. HTML challenges, missing tables, unresolved countries, zero results and low coverage fail closed.
6. Run `npm run country-risk:check-sanctions`. It checks the approved structural fingerprints for the OFAC programme catalogue, UK regime catalogue, EU official resources and UN consolidated XML. It records raw hashes and source drift in `/tmp/country-risk-sanctions-review.json` but never changes classifications or scores. A structural fingerprint baseline is source-monitoring evidence, not legal or tier approval.
7. Run `npm run country-risk:sanctions-review-pack`. It produces a JSON decision file and a human-readable checklist in `/tmp`. The pack currently contains 94 imposer-country candidates across 35 countries: OFAC 23, UK 26, EU 31 and UN 14. All remain out of v2 scoring until the independent review below is complete.
8. Run `npm run country-risk:score-run` and `npm run country-risk:validate`. Add `--require-ready` to the score run for a promotion gate.

Every production ingestion should persist source URL, retrieval and effective dates, raw SHA-256, parser version, methodology version, and calculation evidence using the v2 migration tables. Generated TypeScript snapshots remain reproducible application inputs; database rows are the operational audit trail.

Apply `npm run country-risk:migrate` before `npm run country-risk:sync-sanctions`. The migration runner applies both the base v2 provenance schema and the additive sanctions-review schema idempotently; the sync command seeds or refreshes only pending candidates and never overwrites approved or rejected decisions.

## Approval gates

- FATF list status and sanctions tier changes require human approval before score publication.
- Sanctions tiers use a mutually exclusive rule: `comprehensive` requires broad country-wide trade and finance prohibitions; `sectoral` requires a non-designation restriction on a material class of country transactions, goods or an economic sector (including a country-wide arms embargo); `targeted` is limited principally to designated persons, entities, vessels and owned/controlled entities.
- A regime named after a country does not automatically create country exposure. The reviewer must separately approve `direct-country-exposure` or `situation-related`. The current review pack flags Guatemala, Moldova, Türkiye and Ukraine for an explicit nexus decision and does not infer that a victim country is itself sanctioned.
- Sanctions classifications require legal-measure evidence from the relevant UN, UK, EU or US programme. A designation list alone does not prove a geographic regime tier. The source catalogue and proposed classifications are in `src/data/sanctionsRegimeCandidates.ts`; the legacy eight-country `sanctionsStatus.ts` table remains v1-only.
- A compliance practitioner approves factor interpretation, missing-data policy and sanctions taxonomy.
- A quantitative reviewer approves sensitivity, historical back-test design and the parallel-run comparison.
- Production promotion requires two weeks of v1/v2 results, stable full ingestion, complete evidence links, no missing-as-zero cases, public API checks, and rendered page verification.

Until those gates pass, v2 remains labelled `parallel-validation`; incomplete evidence produces `provisional` or `insufficient-data`, never a falsely reassuring Low score.

### Exact sanctions sign-off required

The remaining sanctions gate is one named compliance practitioner, independent of the implementation, completing every row in the generated review pack. For each row they must confirm that the regime is active, confirm whether it creates direct exposure to the named country, and approve or amend the proposed tier using the linked official measure page. The completed record must retain the reviewer name and organisation, timestamp, decision, evidence URL and reason for every amendment or rejection. Every score-affecting approval is then persisted in `country_risk_reviews` before the candidate snapshot can be promoted to the v2 scoring input.
