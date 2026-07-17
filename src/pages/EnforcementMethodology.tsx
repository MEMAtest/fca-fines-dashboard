import { Link } from "react-router-dom";
import { useSEO } from "../hooks/useSEO.js";

export function EnforcementMethodology() {
  useSEO({
    title: "Enforcement Data Methodology | RegActions",
    description: "How RegActions counts, verifies, deduplicates and presents public regulatory enforcement evidence.",
  });

  return <main className="content-page">
    <div className="content-page__breadcrumb"><Link to="/search">Enforcement Explorer</Link><span>/</span><strong>Methodology</strong></div>
    <header><span className="eyebrow">Evidence and counting contract</span><h1>Enforcement data methodology</h1><p>RegActions separates source records, cases, actions and monetary outcomes so totals remain reproducible and limitations remain visible.</p></header>
    <section><h2>Counting unit</h2><p>The primary counting unit is a canonical public enforcement case. One regulator operation may produce several notices or outcomes, and one notice may cover several subjects. Counts should therefore not be interpreted as regulator operations unless a chart says so explicitly.</p></section>
    <section><h2>Canonical identity and duplicates</h2><p>Source rows are matched into canonical cases using regulator, entity, date, source and outcome evidence. Duplicate source rows are collapsed. Each published case receives an immutable public identifier, while mutable matching fingerprints and aliases support later corrections.</p></section>
    <section><h2>Monetary outcomes</h2><p>Original currency and reported value are retained. GBP and EUR normalisation supports comparison but does not restate the legal outcome. Values requiring review are excluded from totals, rankings and Board Packs until verified.</p></section>
    <section><h2>Source evidence</h2><p>A link is called verified only after a persisted source check confirms a reachable case-level source on a configured official regulator domain. Listing pages and unchecked official links remain available with explicit provisional labels.</p></section>
    <section><h2>Freshness and coverage</h2><p>Latest official action date, last successful source check and last ingestion time are separate measures. Coverage confidence reflects archive completeness, collection method and operational stability for each regulator.</p></section>
    <section><h2>Corrections</h2><p>RegActions may revise classifications, links, amounts and duplicate mappings as stronger official evidence becomes available. Exports include their generation time, source states and methodology version so earlier analysis can be reproduced.</p></section>
  </main>;
}
