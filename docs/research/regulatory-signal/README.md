# RegActions regulatory-signal research

Research snapshot: 20 August 2026. This directory is deliberately separate from product code. It establishes the evidence and interpretation needed before a regulator or country-level regulatory signal is designed.

## What is complete

- All 213 RegActions jurisdictions have an evidence disposition.
- 642 official authority records have been mapped across six mandate families.
- Every mapped authority website has been checked for access and first-page enforcement/publication routes.
- Current production observations have been captured for all 54 live RegActions regulators.
- A 213-row coverage and research register joins ecosystem, FATF-network, RegActions coverage and publication-discovery evidence.
- Candidate measures and explicit anti-bias controls have been documented.

## Primary outputs

- `research-report.md` — findings, implications and recommendation.
- `methodology-options.md` — candidate measures, aggregation rules and build gates.
- `coverage-gap-register.csv` — one row per jurisdiction.
- `official-authority-directory.csv` — resolved official authority evidence.
- `regulator-shadow-measures.csv` — neutral observations for all live regulators.
- `authority-publication-discovery.csv` — website accessibility and candidate-route results.
- `authority-publication-cadence-observations.csv` — provisional first-page date signals.
- `publication-qualification-ledger.csv` — stable IDs, official route scope, access state, route type, language hints and conservative qualification state for all 264 candidate authorities.
- `country-publication-build-gate.csv` — one explicit source-qualification gate and next action for each of the 213 jurisdictions.
- `source-qualification-report.md` — exact totals, build-gate interpretation and unresolved browser-only cases.
- `publication-qualification-manifest.json` — report SHA-256 and snapshot totals.
- `coverage-by-region.csv` — geographic coverage comparison.
- JSON companions retain nested evidence and provenance.

## Fallback activity layer

`regulatory-fallback-evidence.json`, `regulatory-fallback-evidence.csv` and
`regulatory-fallback-evidence.sha256.json` are deterministic, research-only
exports over the same 213-country/642-authority manifest. They are intended to
keep a regulator profile useful when an enforcement archive is blocked or not
yet qualified:

- `identity-confirmed` means the authority identity, mandate family and
  official directory provenance are present.
- `regulatory-activity-visible` means a dated first-page observation was made
  on an official or officially linked route.
- `enforcement-visible` is reserved for a dated observation on a qualified
  enforcement, sanctions, decision or disciplinary route.
- `score-eligible` is reserved for a future approved scoring release and is
  not populated while `transparencyIndex` is null.

Every authority has an explicit access state, publication/channel candidates,
snapshot check dates and an engagement signal (`recent`, `periodic`,
`low-frequency` or `unknown`) with the observed window, count and latest date.
`unknown` includes blocked, challenge-protected, transport-failed and
undated observations. It never means that the regulator was inactive.

Official regulatory updates and enforcement routes remain separate fields.
Optional secondary-reporting context is represented as `null` until cited
evidence is independently supplied; it cannot contribute to any score.

Rebuild the browser manifest and exports with:

```bash
npm run research:regulatory-fallback
```

The command reads committed research snapshots only and does not bypass access
controls or perform live scraping.

## Reproduction

```bash
npx tsx scripts/research/build-regulatory-signal-baseline.ts
npx tsx scripts/research/discover-authority-publications.ts
npx tsx scripts/research/observe-publication-cadence.ts
npx tsx scripts/research/qualify-regulatory-publications.ts
npx tsx scripts/research/analyze-regulatory-signal-baseline.ts
```

The scripts read official global directories and national authority sites. A challenge-protected IOPS governing-member snapshot is explicitly marked rather than silently treated as absent. No generated observation is a regulator-effectiveness judgment.

## Qualification rules

The qualification script is deliberately fail-closed. A strong candidate is only approved for the next human source-contract step when its direct HTTP evidence is reachable and on the authority-owned host. Plausible, generic or external links remain manual-review states. Challenge-protected candidates remain browser-review states; HTTP errors and timeouts remain transport follow-up states. First-page dates are provisional signals only, and low-frequency or no-date states never become scraper failures or zero scores.

The 264-row candidate universe is locked by invariant checks at 115 strong, 12 plausible, 88 generic/ambiguous and 49 obstructed/not observable. The 213-row country gate is descriptive and does not assign a quality or risk value to missing publication routes.
