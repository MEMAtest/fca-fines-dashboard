# Trusted Country Risk Score v2 operations

Methodology `2.0.0` is the production country-risk methodology. It is a public,
neutral benchmark and never a customer accept/reject decision by itself. It is
structured with reference to Basel and Wolfsberg factors; it is not described as
Basel-validated or independently practitioner-validated.

## Scored model

- AML/CFT framework, 50%: FATF Mutual Evaluation effectiveness ratings at 70%
  and technical compliance at 30%. The 11 Immediate Outcomes and 40
  Recommendations are equally weighted within their groups.
- Governance, 30%: the equal-weight mean of the six World Bank WGI percentile
  dimensions, each inverted with `(100 - percentile) / 10`.
- Sanctions exposure, 20%: `70% x highest imposer scope + 30% x mean imposer
  scope` across UN, UK, EU and US. Targeted = 3.33, sectoral = 6.67 and
  comprehensive = 10.

Regulatory floors are applied after weighting: FATF grey list 6.0, FATF call
for action 9.0, sectoral sanctions 6.0 and comprehensive sanctions 8.0.
Targeted sanctions remain a visible flag without a floor.

Missing evidence is never zero risk. Three available pillars is `complete`; two
is `provisional` with renormalised weights and no Low label; fewer than two is
`insufficient-data` with no headline score. Confidence is independent of risk.

Transparency International CPI and RegActions enforcement volume are context
only and never enter the score.

## Reproducible source flow

Apply the idempotent schema first:

```bash
npm run country-risk:migrate
```

Refresh and verify official sources:

```bash
npx tsx scripts/ingest-wgi.ts --year=2024 --dry-run
npm run country-risk:ingest-cpi -- --dry-run
npm run country-risk:verify-fatf
npm run country-risk:ingest-fatf -- --dry-run
npm run country-risk:check-sanctions
npm run country-risk:persist-sanctions-source-run
npm run country-risk:ingest-eu-sanctions
npm run country-risk:prepare-sanctions-evidence
npm run country-risk:sanctions-census
npm run country-risk:sanctions-review-pack
```

FATF verification uses direct HTTP first and Playwright for the
challenge-protected lane. Empty responses, missing list headings, schema drift,
unresolved countries and coverage collapse fail closed.

The sanctions pipeline covers the current official OFAC programme catalogue,
UK regimes, EU Sanctions Map legal acts and UN committee/list inventories. It
binds raw source hashes and fingerprints, 144 catalogue items, 117 candidate
regime-country records and measure-specific evidence into one decision pack.

## Deterministic sanctions decision and promotion

No user spreadsheet or manual row-by-row classification is required. Run:

```bash
npm run country-risk:classify-sanctions
npm run country-risk:apply-sanctions-review -- --dry-run
npm run country-risk:apply-sanctions-review
npm run country-risk:promote-sanctions -- --dry-run
npm run country-risk:promote-sanctions
```

The versioned classifier requires all of the following before a record can be
promoted:

- a current official catalogue item;
- an explicit direct-country or situation-related relationship;
- an active or terminated legal status;
- a measure-specific legal instrument and HTTPS evidence URL;
- reproducible scope facts or a published scope rule that reproduces the tier;
- a complete catalogue-item disposition and country-by-imposer census;
- matching current source hashes, fingerprints and census hashes.

Situation-related regimes are rejected from direct country exposure. Unknown or
contradictory evidence throws and leaves the prior production snapshot unchanged.
Promotion is transactional and content-addressed. The generated snapshot records
`approvalMode: deterministic-evidence` and
`externalValidation: not-independently-validated`; those labels must not be
silently upgraded.

The current coverage model contains all 214 canonical jurisdictions by four
imposers, or 856 explicit cells. A zero sanctions pillar is available only after
all four cells are present in the promoted snapshot.

## Score runs, evidence and validation

```bash
npm run country-risk:score-run -- --require-ready
npx tsx scripts/country-risk/generate-score-run.ts --require-ready --persist
npm run country-risk:validate
```

The release gate allows the methodology's explicit `provisional` state, but
fails when any scored source is unhealthy, any jurisdiction has fewer than two
pillars, or any unexplained 0.0 headline score appears.

Persisted runs are content-addressed and idempotent. PostgreSQL retains:

- methodology definition and assurance labels;
- source-run URL, retrieval/effective dates, hash and parser version;
- normalised per-country AML, governance and sanctions pillar indicators;
- score, band, publication status, confidence, floors and arithmetic;
- per-country links from every score to its indicator evidence;
- code commit, run hash and immutable score history.

Validation includes golden calculations, source/schema failure fixtures,
country-name reconciliation, sensitivity with each pillar weight varied by 20%,
CPI direction comparison and a leakage-safe exploratory back-test. The back-test
uses WGI 2024 governance risk only for jurisdictions added to FATF monitoring in
2026; current FATF listings, current ratings and sanctions are excluded from the
historical input. Its small sample is a limitation, not independent validation.

## Operating cadence

- Daily: verify all four sanctions catalogues and fail closed on structural or
  fingerprint drift.
- Weekly and around FATF plenaries: Playwright-assisted FATF list verification,
  FATF workbook checks, sanctions legal evidence, census and deterministic
  promotion checks.
- Monthly: WGI and CPI release detection, FATF ratings refresh detection,
  reproducible score run, persistence and validation.
- After any promoted change: retain the prior immutable run, publish the score
  delta and calculation explanation, test the public APIs, build the static
  country pages and verify the production deployment.

## Source-health monitoring and alerts

Run the production health assessment with database access:

```bash
npm run country-risk:source-health
```

The assessment checks the latest persisted run for the four sanctions
catalogues, FATF lists, FATF assessments, World Bank WGI and the promoted
sanctions snapshot. A missing run, failed or review-required status, stale run,
empty result, missing hash or unavailable operational database is critical and
fails closed. It writes machine-readable and human-readable evidence to:

- `/tmp/country-risk-source-health.json`
- `/tmp/country-risk-source-health.md`

The scheduled assurance workflow runs this check after the source lanes. A
failure opens or updates one deduplicated GitHub issue named
`[Country Risk] Source health alert`; recovery comments on and closes the same
issue. The workflow remains failed after alert creation, so the warning cannot
be mistaken for a successful source run.

Technical health detail remains in the source-status API and workflow evidence.
Consumer country reports show only plain-language score explanations and the
date of the latest source check.

The public endpoints are:

- `GET /api/country-risk/list?methodology=v2`
- `GET /api/country-risk/{iso2}?methodology=v2`
- `GET /api/country-risk/methodology/v2`
- `GET /api/country-risk/sources/status`

Independent practitioner and quantitative review remain worthwhile external
assurance enhancements. They are not represented as an unfinished data gate and
the product never claims they have occurred when they have not.
