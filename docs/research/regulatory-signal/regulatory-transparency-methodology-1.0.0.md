# RegActions Regulatory Transparency Index 1.0.0 (shadow only)

Status: internal calibration artifact. This version is not imported by the browser bundle, is not served by an API route, and does not enable public score rendering.

As-of: `2026-08-20T12:11:07.553Z`
Sample source: the read-only RegActions search endpoint, captured in `live-regulator-sample-snapshot.json` with up to 100 newest rows per live regulator code.

## What the index measures

The index measures how usable and observable an authority's publicly published enforcement record is. It is not a country-risk score, regulator-effectiveness score, sanctions score, FATF score, corruption score or assessment of misconduct. Higher values mean more publicly observable evidence under this methodology.

Country Risk v3, FATF/FSRB status, sanctions and beneficial-ownership evidence remain separate surfaces. Enforcement action count, fine value, monetary disclosure and raw publication frequency have zero weight.

## Authority identity and mapping

Every live RegActions code receives a stable code identity `ra-reg-{lowercase-code}`. Where the live code has a sufficiently specific match in the researched official authority directory, the authority receives `ra-auth-{iso2}-{sha256(iso2|authority)[0:16]}` and the union of roles across all duplicate directory rows for that authority. EU-level ECB is explicitly excluded from country aggregation. Registry-only mappings remain in the mapping artifact but cannot contribute to country role aggregation. A financial-intelligence role is retained only where the matched authority name explicitly identifies an FIU/intelligence function or the stable live code is an explicit FIU identity (`AUSTRAC` or `FINCEN`); a general supervisor such as Sweden's Finansinspektionen is not treated as an FIU.

The mapping is deterministic and auditable in `regulatory-transparency-authority-mapping.json`. Name aliases are explicit in the calculation source. Central banking is not an index role: a central bank contributes only where the official directory also maps it to an applicable supervisory role.

## Regulator components

| Component | Weight | Evidence rule |
|---|---:|---|
| Official accessibility | 20% | A matched official publication route must be `approved-for-human-contract` and currently `reachable`. Challenge-protected, transport-failed and under-review routes are null, never zero. |
| Case-level specificity | 25% | Percentage of sampled live cases containing a subject, issue date, breach theme/category and stable case ID. Monetary amount is not required. Fewer than five cases is null. |
| Source traceability | 20% | Percentage of sampled live cases containing a stable case ID, an official-source URL field and an explicit source-link status. Verified status is separately reported; an unverified link is not silently treated as verified. Fewer than five cases is null. |
| Archive depth | 20% | Observed active-year span from the live regulator observation, only when the mapped official route is approved. One observed year is the floor and ten or more observed years reaches 100. This is observed depth, not a completeness claim. |
| Timeliness | 15% | Latest successful dated observation against that regulator's explicit stale threshold: `100 * max(0, 1 - age_days/stale_after_days)`. Low-frequency and sparse sources are null/watch states rather than failed scores. This is observation-contract timeliness, not inferred publication delay. |

Component values are on a 0–100 scale. The composite is a weighted mean over available components only. No missing component is imputed as zero. A regulator score requires at least 80% of component weight available; all five components available is `complete`, otherwise it is `provisional`. The available-weight denominator is retained in every result.

This partial-denominator rule is deliberate: the shadow run must show what the evidence supports without converting an unverified or inaccessible source into a negative judgement. It also means a provisional score is never equivalent to a complete score.

## Country aggregation

Applicable roles are `prudential_supervision`, `securities`, `insurance`, `pensions` and `financial_intelligence`. The country baseline supplies the applicable role universe. For each role, assessed authority scores are combined by the median. Role medians are then averaged equally; authority count, architecture and enforcement volume do not add weight.

Country result thresholds:

- `complete`: at least two assessed roles and at least 80% of applicable mapped roles;
- `provisional`: at least two assessed roles and 50–79.9999% role coverage;
- `not-assessed`: fewer than two assessed roles, less than 50% role coverage, no applicable roles, or no usable authority result.

Bands are applied only to a non-null country score: 80–100 `highly-transparent`, 60–79.9999 `transparent`, 40–59.9999 `partially-transparent`, 20–39.9999 `limited-transparency`, below 20 `very-limited-transparency`.

## Evidence and unresolved states

The component artifact records a source path and blocker for every null. A live feed being healthy does not prove that every official publication route is qualified. A source status of `official_unverified` preserves traceability metadata but does not claim verification. Low-frequency watches such as AMMC, HKMA and IOMFSA are not converted to zeros or scraper failures.

The sample snapshot is the deterministic input for this run. Re-running without `--refresh` reproduces the same scores and hashes. A deliberate `--refresh` captures a new read-only sample and must create a new reviewed snapshot/hash before any future methodology decision.

## Calibration safeguards

The bias report compares the baseline's region labels (including `Asia Pacific`, without inventing an empty `Oceania` bucket) and integrated/fragmented architecture cohorts, records that language evidence is unavailable rather than inferring it, and reports the descriptive correlation between score and log observed-record volume together with its assessed-country sample size. The implementation also tests that changing observed volume alone cannot change a component or composite score. The report is descriptive and does not authorise a public release.

## Inputs and outputs

Inputs are the previously qualified research artifacts: `regulator-shadow-measures.csv`, `live-regulator-observations.json`, `official-authority-directory.json`, `publication-qualification-ledger.json`, `country-regulatory-ecosystem-baseline.json`, plus the captured live search sample.

Outputs are internal JSON/CSV authority mappings, component evidence, regulator results, country results, bias calibration, unresolved gaps, the aggregate shadow artifact and SHA-256 manifest. No route, React surface, public API contract or deployment flag is changed by this phase.
