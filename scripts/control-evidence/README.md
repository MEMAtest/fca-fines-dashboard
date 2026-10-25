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
