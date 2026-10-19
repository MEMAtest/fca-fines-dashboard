# FSS Korean sanctions source rollout

## Current boundary

The case-level source is the official FSS Korean inspection-sanctions archive:
<https://www.fss.or.kr/fss/job/openInfo/list.do?menuNo=200476>. The English FSS supervision board and DART press releases remain available as `npm run scrape:fss-english-announcements`, but are not the scheduled enforcement source. The full 2026 read-only preview traversed 29 pages and reconciled 279 unique records through 2026-10-13. Each candidate matched its official detail-page entity/date and had a direct official PDF. The preview contains 142 amount-review cases in total: 39 PDF extraction/section quarantines and 103 parsed-PDF outcomes whose extracted text has reordered units, mixed or multiple fine/surcharge amounts, recommendation-only text, or otherwise ambiguous amounts. All 142 amounts remain null with explicit review reasons; do not interpret unknown amounts as zero or no-penalty, and do not guess amounts from ambiguous text.

This branch does not apply migrations, write source records, suppress legacy rows, or enable the workflow. The daily matrix job still runs its setup/summary steps, but the FSS scraper step is skipped and emits an explicit `disabled` outcome unless `FSS_KOREAN_SANCTIONS_PROMOTION_APPROVED=true`. Production activation requires independent source/QA approval, migrations, then that explicit repository variable. The Kookmin 2004 enforcement row is intentionally excluded from the 39-row legacy announcement manifest.

The isolated `FSS production rehearsal (manual only)` workflow runs only after the same approval variable is true. It shares the `live-regulator-FSS` concurrency lock with the daily matrix, captures read-only before/after production snapshots, runs only `npm run scrape:fss:promote`, and uploads a run-SHA/event manifest, scraper summary, stable-ID inventory hashes, public/raw counts, review-queue counts, and the row IDs touched during that invocation. It has no schedule and sends no email. A successful manual rehearsal is useful production evidence but does not replace either of the two clean scheduled acceptance cycles below. The daily 05:45 UTC matrix remains the only FSS schedule.

## Read-only checks

`previewFssSanctionsArchive()` traverses the complete date-filtered archive and validates every unique listed action by default. A bounded local sample must be explicit (`validateRecords` >= 20); its output reports `unattemptedAfterValidationLimit` and must not be described as a full-archive reconciliation. The manual-only GitHub workflow `FSS Korean source preflight (read-only)` performs the full pass without database credentials, asserts terminal pagination and count reconciliation, and uploads the full JSON preview, a complete amount-review artifact, and a SHA-256/run-revision manifest. The review artifact must enumerate all 142 records with an `amountReviewReason`, report the 39 PDF-quarantine cases as a separate subset, and reconcile both totals independently; the 103 ambiguous extracted outcomes remain null pending review. Because the workflow is introduced on this PR branch, it becomes dispatchable only after the PR is merged to the default branch; trigger it separately for post-merge source QA. This artifact is source QA evidence only; it does not count as a scheduled production run.

```sh
npm run --silent scrape:fss:preview > /tmp/fss-korean-preview.json
npx tsx scripts/corrections/reconcileFssLegacyAnnouncements.ts > /tmp/fss-legacy-suppressions-preview.json
npm run test:run -- scripts/scraper/__tests__/fssSanctionsScraper.test.ts scripts/scraper/__tests__/fssScraper.test.ts
```

The scraper preview performs complete archive pagination and official detail/PDF retrieval; inspect `reconciliation` and `pdfQuarantine` and require `unattemptedAfterValidationLimit: 0`. The suppression command is also dry-run by default. It verifies the exact 39 stored source rows (regulator, UUID, date, unnamed party, null amount, and official URL) without changing them. Do not treat a limited sample as archive completion.

## Gated activation sequence (not performed)

1. Obtain independent review of the full preview and all 142 amount-review cases (39 PDF quarantines plus 103 ambiguous extracted outcomes), reconcile the 39 PDF cases as a subset—not as the whole review queue—and review the 39 legacy suppression candidates and preserved Kookmin exception.
2. Back up the production database and confirm `REGACTIONS_EXPECTED_DB_HOST` and `REGACTIONS_EXPECTED_DB_NAME` point at the intended target without printing connection strings.
3. Apply the existing reviewed suppression migration and then `migrations/20261017_fss_evidence_url_identity.sql` with `psql "$REGACTIONS_DATABASE_URL" -v ON_ERROR_STOP=1 -f <migration>`. Verify the FSS PDF and case URLs remain distinct while cache/date parameters are ignored.
4. Repeat the read-only full archive preview and suppression preflight against the intended target. Only after approval, set the repository variable `FSS_KOREAN_SANCTIONS_PROMOTION_APPROVED=true`. The daily matrix job is skipped unless this exact variable is true; the scraper also checks the same environment variable and checks canonical FSS URL identity before upsert.
5. If separately approved, apply only the exact reviewed suppressions with `FSS_LEGACY_SUPPRESSIONS_APPROVED=true npx tsx scripts/corrections/reconcileFssLegacyAnnouncements.ts --apply`. Verify the trusted view excludes those 39 IDs and still includes Kookmin. The source rows remain intact.
6. After activation, require two consecutive clean scheduled runs against the production database, with complete reconciliation, no action-required assurance, stable canonical IDs, trusted-view/public-hub proof, and amount-review queue reconciliation of all review reasons (142 total in this preview), separately confirming the 39 PDF-quarantine subset and the 103 ambiguous outcome cases. Verify the same-origin public API `/api/site/unified/search?regulator=FSS` and `/regulators/fss`; `/api/unified/search` is an internal, unregistered route that returns 401 by design and is not the public acceptance endpoint. Manual previews, connectivity checks, and unscheduled ingestion do not count as either cycle. A successful deploy or scraper exit alone is not acceptance.

## Rollback

First disable the scheduled writer by removing/setting the repository variable to anything other than `true`. Source rows are not deleted by this scraper. If suppression rollback is explicitly approved, run `FSS_LEGACY_SUPPRESSION_REVERT_APPROVED=true npx tsx scripts/corrections/reconcileFssLegacyAnnouncements.ts --revert`; only the exact manifest IDs are removed from the suppression table and the original source records reappear in the trusted view. Keep the additive URL identity migration in place while FSS evidence exists; do not revert it as part of routine scraper rollback.
