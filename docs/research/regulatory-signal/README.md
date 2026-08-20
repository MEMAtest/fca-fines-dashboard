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
- `coverage-by-region.csv` — geographic coverage comparison.
- JSON companions retain nested evidence and provenance.

## Reproduction

```bash
npx tsx scripts/research/build-regulatory-signal-baseline.ts
npx tsx scripts/research/discover-authority-publications.ts
npx tsx scripts/research/observe-publication-cadence.ts
npx tsx scripts/research/analyze-regulatory-signal-baseline.ts
```

The scripts read official global directories and national authority sites. A challenge-protected IOPS governing-member snapshot is explicitly marked rather than silently treated as absent. No generated observation is a regulator-effectiveness judgment.
