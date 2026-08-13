# RegActions Coverage and Content Intelligence Agent

This is a **report-only** layer on top of RegActions' existing scraper, trusted
evidence view, regulator hubs, public search data and editorial workflow. It
does not create records, publish articles, alter amounts or call external AI.

## Inputs and outputs

Use a JSON input shaped as:

```json
{
  "candidates": [],
  "existingRecords": [],
  "currentState": { "urls": [], "regulatorHubs": [] }
}
```

Run it offline with fixtures:

```bash
npm run coverage:agent -- --input=scripts/coverage-agent/fixtures/example.json --output-dir=/tmp/coverage-agent
```

For a candidate feed outside the database environment, use the existing public
record lookup rather than reimplementing search:

```bash
npm run coverage:agent -- --input=/tmp/official-discovery.json --api-base=https://regactions.com --output-dir=/tmp/coverage-agent
```

Or run a QA-only audit of trusted recent records using the canonical data view:

```bash
npm run coverage:agent -- --recent-records=7 --output-dir=/tmp/coverage-agent
```

The output directory always has exactly four action-free artifacts:

1. `coverage-report.json` — current-state audit and per-candidate match decisions.
2. `missing-record-import-queue.json` — proposed, human-reviewed record imports.
3. `qa-issue-queue.json` — source, duplicate, aggregate-amount and SEO findings.
4. `article-briefs.json` — consumer-safe `cause → failure → outcome → lesson` briefs.

The matcher uses, in order: source-content hash; canonical official URL and
entity; regulator/entity/date/amount; then conservative related-action logic.
It keeps press-release/final-notice pairs distinct and refuses to allocate an
aggregate penalty across participant firms without evidence.

`--recent-records` intentionally supplies **existing** records only. It is for
duplicate and amount QA and does not pretend to discover missing enforcement
records. Missing-record coverage requires an upstream official-discovery JSON
feed passed via `--input`; the scheduled workflow only runs QA until that feed
is supplied.
