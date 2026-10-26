# Official-source control evidence operator

This bounded operator enriches one trusted enforcement case at a time. It only
fetches HTTPS sources accepted by the repository's explicit regulator-host
allowlist (`scripts/lib/editorialWorkflow.ts`) plus the individually pinned
FSS, FSCA, NGSEC, NDIC and FSCA Azure archive hosts. DNS answers must be public;
redirects must remain on the original origin; fetches time out and are capped at
8 MiB. PDF extraction uses the already-installed `pdftotext` binary and has its
own timeout and bounded stdout/stderr.

The safe default is a read-only dry run. It writes a mode-0600 JSON manifest to
the current directory (or `--out <path>`) with extracted passage, source hash,
case identity, passage/alias-definition locator, taxonomy version and
`candidate` status. The matcher runs only on paragraphs already attributed to
the case respondent. A short name is accepted only when the official document
defines it parenthetically beside the full respondent name; the locator records
both the matched paragraph and the definition paragraph. Evidence is withheld
if respondent and control terms cannot both fit within the 2,000-character
stored passage.

Example:

```sh
node --import tsx/esm scripts/control-evidence/run.ts --dry-run --case-id <public-case-id> --out review.json
```

For systematic but bounded notice review, an operator may provide an explicit
JSON array of trusted public case IDs. The file must be at most 16 KiB and
contain 1–25 unique IDs; sources are fetched sequentially and one combined
candidate manifest is written. There is no broad database scan, automatic case
selection, or apply-on-discovery behavior. Choose cases using a separate
read-only coverage report (for example, summary-only AML/control cases), then
review every candidate in the resulting manifest:

```sh
printf '["<public-case-id-1>","<public-case-id-2>"]\n' > case-ids.json
node --import tsx/esm scripts/control-evidence/run.ts --dry-run --case-ids-file case-ids.json --out review-batch.json
```

Batch snapshot retention is not supported; dynamic-source snapshot review is
limited to a single case so the retained bytes cannot be confused across
respondents or source URLs.

The batch manifest also includes a per-case outcome ledger: `candidate`,
`no_supported_match`, or `source_error`, plus the known source URL, fetched
content hash when available, candidate count, and supported control codes.
`no_supported_match` means only that this versioned matcher produced no
respondent-attributed passage; it does not mean the notice has no control
failure. Errors are reduced to fixed safe codes. The run fails closed above
1,000 candidate rows or a 4 MiB serialized manifest rather than truncating.
Unknown flags and missing flag values are rejected.

The cash evidence vocabulary is version 2026-10-25.v5. It adds the narrow
official-notice phrasing “deposits were in cash” only when the same paragraph
also establishes absent transaction-monitoring alerts and activity to MSBs.
Preparing v5 does not invalidate v4 production availability: v4 summary-index
readiness and approved evidence remain available for rollback. Existing v4
approved evidence is not silently copied or promoted to v5; it requires an
explicit fresh review under the new version.

### Versioned rollout and rollback

Keep the current v4 production API active while preparing v5. Use this order:

1. Apply the versioned-readiness/evidence schema migration from the reviewed
   commit using the operator workstation; do not apply migrations from an API
   deployment.
2. Prepare the v5 summary index with the bounded index operator and do not use
   `--prune-stale`. The versioned readiness row leaves v4 readiness untouched.
3. Independently re-review existing v4 official passages and any new v5
   candidates. Do not auto-approve or copy v4 evidence into v5.
4. Verify v5 readiness, classification parity, dry-run identity checks, and
   reviewed evidence hashes before serving v5.
5. Complete preview API and UI acceptance before promoting the new version to
   production.

Rollback to the old application uses the legacy v4 readiness marker and the
retained v4 rows. Do not run old, unversioned apply operators after the
versioned evidence constraint is installed; they are expected to fail closed.

An operator must inspect every candidate and set each decision to `approved` or
`rejected`, and add `reviewedBy` and `reviewedAt`. Applying requires an explicit
manifest path and the configured expected database host. The operator then
checks the exact database target, taxonomy version, control code, case identity,
respondent and source URL, refetches every official source, compares its
SHA-256, and inserts the reviewed batch in one transaction. Inserts are
idempotent on the migration's stable unique key. Only rows marked `approved`
should be served by a product/API query; rejected rows remain review records.

The hash is deliberately calculated over fetched source bytes (after normal
HTTP content decoding), not a normalized text rendering. A regulator page whose
bytes change between review and apply fails closed by default, even if the visible
passage appears unchanged. For a known dynamic page, an operator may explicitly
retain the exact fetched bytes during dry run:

```sh
node --import tsx/esm scripts/control-evidence/run.ts --dry-run --case-id <public-case-id> --retain-source reviewed-source.bin --out review.json
```

This creates one bounded (maximum 8 MiB) mode-0600 source blob and a bounded
(maximum 64 KiB) mode-0600 metadata sidecar; the manifest references both. After a human reviews
the manifest and snapshot, `--allow-reviewed-snapshot` is an explicit opt-in for
the apply invocation. The apply path verifies the retained blob's SHA-256 and
metadata, then refetches the exact official URL. Snapshot replay is permitted
only when the live final URL and media type match and the current source again
produces the exact reviewed passage, locator, respondent, document-local alias
attribution method and control match. Any changed passage or attribution fails
closed. The database stores the original reviewed source hash and fetch time;
the bounded apply audit reports both original and current hashes and does not
represent the dynamic live page as the original artifact. The opt-in does not
normalize, fuzzy-match, or replace the original hash.

```sh
node --import tsx/esm scripts/control-evidence/run.ts --apply review.json
```

This operator does not apply the migration or make any writes without the
explicit reviewed-manifest apply mode.
