# Methodology options before product design

## Recommended model boundary

Do not add regulator data to Country Risk v3. Country Risk v3 measures financial-crime effectiveness, legal/supervisory safeguards and governance; FATF and sanctions remain treatment overlays. Regulator publication behavior is a different construct.

Use the umbrella **RegActions Regulatory Signal** with four separately displayed measures:

1. **Regulatory Ecosystem Map** — which official authorities exist and which mandates they cover.
2. **Regulator Publication Transparency** — how usable the authority's public enforcement record is.
3. **RegActions Coverage Confidence** — how reliably RegActions captures and verifies that public record.
4. **Enforcement Activity Signal** — how often actions are observed, stated neutrally.

No overall good/bad regulator score should be published in the first release.

## Measure 1: Regulatory Ecosystem Map

Descriptive fields:

- authority name and official website;
- banking/prudential, securities, insurance, pensions, central banking and FIU mandates;
- national, territorial or regional scope;
- direct FATF and FSRB network context;
- structural absence, parent-jurisdiction context or unobservable state.

Raw authority count is never a quality input. Integrated supervisors and sector-specific architectures are both legitimate.

## Measure 2: Regulator Publication Transparency

Assess the public record, not the regulator's effectiveness. Candidate components for shadow calibration:

| Component | Candidate weight | Required evidence |
|---|---:|---|
| Official accessibility | 20% | Public official route, challenge state and durable access pattern |
| Case-level specificity | 25% | Named subject, decision date, legal basis, outcome and stable case identifier |
| Source traceability | 20% | Stable official document or decision URL and preserved source status |
| Archive depth | 20% | Earliest year, pagination/completeness and documented archive boundary |
| Publication timeliness | 15% | Observed publication dates compared with a regulator-specific cadence contract |

Publication accessibility must use explicit states: `open`, `challenge-protected`, `document-only`, `search-only`, `no public archive found`, or `unobservable`. Missing evidence is never zero.

Monetary amount disclosure is a descriptive field, not a weighted component. Some authorities primarily issue non-monetary orders.

## Measure 3: RegActions Coverage Confidence

This is the product's own assurance score and may use:

- official-source verification rate;
- successful scheduled checks under the regulator-specific cadence contract;
- stable identifiers and deduplication confidence;
- field completeness by source-appropriate schema;
- archive boundary documentation;
- automation lane (`automated`, `curated archive`, `sparse`, `low frequency`);
- unresolved parsing or source-access incidents.

It must never be presented as regulator quality. A Cloudflare challenge is a RegActions collection constraint.

## Measure 4: Enforcement Activity Signal

Use a label rather than a score:

- frequent: action-bearing publications in at least 18 of the previous 24 months;
- active: 9–17 months;
- periodic: 3–8 months;
- low-frequency: 1–2 months;
- no recent signal: no observed action-bearing month;
- insufficient observation: archive or collection boundary prevents interpretation.

For live RegActions feeds this can be computed from case dates. For newly discovered pages it remains provisional until pagination, scope and archive depth are validated.

## Country aggregation

A country page may summarize:

- mandate coverage: roles with official authority evidence;
- RegActions live coverage: roles for which a verified feed exists;
- publication transparency: range across assessed authorities, not a simple average;
- activity: regulator-by-regulator labels and a trend chart;
- treatment context: Country Risk v3, FATF and sanctions shown adjacent but not blended.

If a compact country summary is later required, use a tuple such as `5/6 mandates mapped · 2/4 enforcement publishers covered · coverage confidence high`, not one opaque number.

## Bias and validity tests required before scoring

- integrated supervisor versus multi-authority country;
- high-volume versus low-frequency authority;
- monetary versus mainly non-monetary enforcement;
- English versus non-English publication;
- HTML/open-data versus PDF/search-register archive;
- national versus territorial/regional authority;
- challenge-protected versus genuinely non-public archive;
- recent regulator creation or legal restructuring;
- duplicate publication across authority, court and ministry sources;
- time lag between decision date and publication date.

Any candidate composite should remain in shadow mode until these tests show it separates publication transparency without simply rewarding wealth, English-language websites, regulator count or enforcement volume.

## Build gates

1. Reconcile static regulator counts with live API counts; 39 of 54 currently differ.
2. Human-validate the 115 strong and 12 plausible candidate pages, and explicitly classify the 49 obstructed candidate pages.
3. Establish archive boundaries and cadence contracts for each selected new feed.
4. Define source-appropriate completeness rules; do not require a penalty amount where the regime publishes non-monetary measures.
5. Run shadow scoring and inspect outliers across all architecture/language/region cohorts.
6. Approve labels, caveats and fail-closed states before exposing any score.
