# Offline country-risk shadow validation

`review-model-shadow.ts` compares a v3.1.0 snapshot with one isolated
beneficial-ownership-register uncertainty rule. It does not change the v3.1
headline weights, scores, bands, sensitivity, source snapshots, or live
publication model. For `none-identified` and `unrecorded` registers it withholds
register-access risk; a fully rated FATF IO5/R24/R25 breakout falls back to its
FATF-only formula, while a missing full FATF breakout is unavailable rather
than assigned the register tier's former default score.

The report is reproducible with an explicit date and output path:

```sh
node --import tsx/esm scripts/country-risk/review-model-shadow.ts \
  --as-of=2026-10-25 --output=/tmp/country-risk-shadow-2026-10-25.json
```

The default output is a date-stamped file under `/tmp`; an existing file is
never overwritten. The report preserves each country's existing v3.1
sensitivity metadata and states its coverage, complete/provisional/proxy
counts, near-threshold count, changed breakouts, newly unavailable breakouts,
and unchanged headline count. Provisional composites and governance-only
proxies remain separate labels; neither should be read as comparable to a full
composite by default.

No regional cohort is inferred from geography. If a benchmark is necessary,
provide it manually with `--benchmark=<path>`; the JSON file must be at most
1 MiB and contain no more than 1,000 observations, a named source, explicit
licence, `rightsConfirmed: true`, benchmark vintage, and per-row ISO2, region,
score (0-10), and vintage. Only observations matching the declared benchmark
vintage are joined or counted as peers. Peer descriptions are descriptive
matched-vintage context, never a validated regional ranking. The operator does
not fetch benchmark data or infer commercial rights from public availability.
It does not acquire additional Basel or WGI data or reset source freshness; the
existing v3.1 inputs are reused unchanged.
