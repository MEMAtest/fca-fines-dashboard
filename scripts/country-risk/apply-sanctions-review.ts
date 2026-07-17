#!/usr/bin/env npx tsx
import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { buildPgPoolConfig, resolveConnectionString } from "../../server/db.js";
import { SANCTIONS_REGIME_CANDIDATES } from "../../src/data/sanctionsRegimeCandidates.js";
import {
  validateCompletedSanctionsReview,
  validateSanctionsCatalogueReviews,
  validateSanctionsInventoryDispositions,
  type CompletedSanctionsCatalogueReview,
  type CompletedSanctionsInventoryDisposition,
  type CompletedSanctionsReviewRecord,
} from "./lib/sanctionsReviewImport.js";
import type {
  SanctionsCatalogueReviewRow,
  SanctionsCatalogueItemReviewRow,
  SanctionsReviewRow,
  SanctionsSourceAssuranceReport,
} from "./lib/sanctionsPromotion.js";

const input = process.env.COUNTRY_RISK_SANCTIONS_COMPLETED_REVIEW_JSON
  ?? "/tmp/country-risk-sanctions-taxonomy-review.json";
const sourceReportPath = process.env.COUNTRY_RISK_SOURCE_REPORT
  ?? "/tmp/country-risk-sanctions-review.json";
const censusReportPath = process.env.COUNTRY_RISK_SANCTIONS_CENSUS_JSON
  ?? "/tmp/country-risk-sanctions-census.json";

async function main() {
  const document = JSON.parse(await readFile(input, "utf8")) as {
    records?: CompletedSanctionsReviewRecord[];
    catalogueReviews?: CompletedSanctionsCatalogueReview[];
    catalogueDispositionLedger?: CompletedSanctionsInventoryDisposition[];
  };
  const sourceReport = JSON.parse(await readFile(sourceReportPath, "utf8")) as SanctionsSourceAssuranceReport;
  const censusRaw = await readFile(censusReportPath);
  const censusSha256 = createHash("sha256").update(censusRaw).digest("hex");
  const census = JSON.parse(censusRaw.toString("utf8")) as {
    inventoryDispositions?: Array<Omit<CompletedSanctionsInventoryDisposition, "finalDisposition" | "reviewerNote">>;
  };
  const rows = validateCompletedSanctionsReview({
    candidates: SANCTIONS_REGIME_CANDIDATES,
    records: document.records ?? [],
  });
  const catalogueReviews = validateSanctionsCatalogueReviews({
    reviews: document.catalogueReviews ?? [],
    sourceFingerprints: new Map(sourceReport.results.flatMap((source) =>
      source.fingerprint ? [[source.id, source.fingerprint] as const] : [])),
    censusSha256,
  });
  const catalogueItemReviews = validateSanctionsInventoryDispositions({
    expected: census.inventoryDispositions ?? [],
    completed: document.catalogueDispositionLedger ?? [],
    catalogueReviews,
    censusSha256,
  });
  const summary = {
    input,
    records: rows.length,
    approved: rows.filter((row) => row.status === "approved").length,
    rejected: rows.filter((row) => row.status === "rejected").length,
    catalogueAttestations: catalogueReviews.length,
    catalogueItemDispositions: catalogueItemReviews.length,
  };
  if (process.argv.includes("--dry-run")) {
    console.log(JSON.stringify({ dryRun: true, ...summary, productionScoresChanged: false }, null, 2));
    return;
  }

  const connectionString = resolveConnectionString();
  if (!connectionString) throw new Error("DATABASE_URL is required unless --dry-run is used");
  const pool = new pg.Pool(buildPgPoolConfig(connectionString));
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query<SanctionsReviewRow>(
      `SELECT iso2, imposer, regime_name, relationship, proposed_tier, final_tier,
              catalogue_url, measure_evidence_url, decision_evidence_url, effective_at,
              status, reviewed_by, reviewer_organisation, reviewed_at, review_note,
              legal_status, coverage_state, legal_instrument_id, legal_instrument_url,
              official_guidance_url, legal_effective_from, legal_effective_to,
              source_last_updated, evidence_locator, measures,
              broad_trade_prohibition, broad_financial_prohibition,
              material_non_designation_restriction, prepared_by, prepared_at
       FROM country_risk_sanctions_regimes`,
    );
    const currentByKey = new Map(current.rows.map((row) => [
      `${row.iso2.trim()}|${row.imposer}|${row.regime_name}`,
      row,
    ]));
    let updated = 0;
    let unchanged = 0;
    for (const row of rows) {
      const rowKey = `${row.iso2}|${row.imposer}|${row.regime_name}`;
      const existing = currentByKey.get(rowKey);
      if (!existing) throw new Error(`${rowKey}: database candidate is missing`);
      if (existing.status !== "pending") {
        const same = existing.status === row.status
          && existing.relationship === row.relationship
          && existing.final_tier === row.final_tier
          && existing.decision_evidence_url === row.decision_evidence_url
          && existing.legal_status === row.legal_status
          && existing.coverage_state === row.coverage_state
          && existing.legal_instrument_id === row.legal_instrument_id
          && existing.legal_instrument_url === row.legal_instrument_url
          && existing.official_guidance_url === row.official_guidance_url
          && existing.legal_effective_from === row.legal_effective_from
          && existing.legal_effective_to === row.legal_effective_to
          && existing.source_last_updated === row.source_last_updated
          && existing.evidence_locator === row.evidence_locator
          && JSON.stringify(existing.measures ?? []) === JSON.stringify(row.measures ?? [])
          && existing.broad_trade_prohibition === row.broad_trade_prohibition
          && existing.broad_financial_prohibition === row.broad_financial_prohibition
          && existing.material_non_designation_restriction === row.material_non_designation_restriction
          && existing.prepared_by === row.prepared_by
          && existing.prepared_at !== null
          && row.prepared_at !== null
          && new Date(existing.prepared_at).toISOString() === new Date(row.prepared_at).toISOString()
          && existing.reviewed_by === row.reviewed_by
          && existing.reviewer_organisation === row.reviewer_organisation
          && existing.reviewed_at !== null
          && row.reviewed_at !== null
          && new Date(existing.reviewed_at).toISOString() === new Date(row.reviewed_at).toISOString()
          && existing.review_note === row.review_note;
        if (!same) throw new Error(`${rowKey}: refusing to overwrite an existing reviewed decision`);
        unchanged += 1;
        continue;
      }
      const update = await client.query(
        `UPDATE country_risk_sanctions_regimes
         SET relationship=$4, final_tier=$5, status=$6, reviewed_by=$7,
             reviewer_organisation=$8, reviewed_at=$9, review_note=$10,
             decision_evidence_url=$11, legal_status=$12, coverage_state=$13,
             legal_instrument_id=$14, legal_instrument_url=$15,
             official_guidance_url=$16, legal_effective_from=$17,
             legal_effective_to=$18, source_last_updated=$19,
             evidence_locator=$20, measures=$21::jsonb,
             broad_trade_prohibition=$22, broad_financial_prohibition=$23,
             material_non_designation_restriction=$24, prepared_by=$25,
             prepared_at=$26,
             updated_at=NOW()
         WHERE iso2=$1 AND imposer=$2 AND regime_name=$3 AND status='pending'`,
        [
          row.iso2,
          row.imposer,
          row.regime_name,
          row.relationship,
          row.final_tier,
          row.status,
          row.reviewed_by,
          row.reviewer_organisation,
          row.reviewed_at,
          row.review_note,
          row.decision_evidence_url,
          row.legal_status,
          row.coverage_state,
          row.legal_instrument_id,
          row.legal_instrument_url,
          row.official_guidance_url,
          row.legal_effective_from,
          row.legal_effective_to,
          row.source_last_updated,
          row.evidence_locator,
          JSON.stringify(row.measures),
          row.broad_trade_prohibition,
          row.broad_financial_prohibition,
          row.material_non_designation_restriction,
          row.prepared_by,
          row.prepared_at,
        ],
      );
      if (update.rowCount !== 1) throw new Error(`${rowKey}: concurrent review update detected`);
      updated += 1;
    }
    const currentCatalogue = await client.query<SanctionsCatalogueReviewRow>(
      `SELECT imposer, source_id, catalogue_url, source_fingerprint, census_sha256, status,
              reviewed_by, reviewer_organisation, reviewed_at, review_note
       FROM country_risk_sanctions_catalogue_reviews`,
    );
    const catalogueByKey = new Map(currentCatalogue.rows.map((row) => [`${row.imposer}|${row.source_fingerprint}`, row]));
    let catalogueUpdated = 0;
    let catalogueUnchanged = 0;
    for (const review of catalogueReviews) {
      const reviewKey = `${review.imposer}|${review.source_fingerprint}`;
      const existing = catalogueByKey.get(reviewKey);
      if (existing?.status === "approved") {
        const same = existing.source_id === review.source_id
          && existing.catalogue_url === review.catalogue_url
          && existing.census_sha256 === review.census_sha256
          && existing.reviewed_by === review.reviewed_by
          && existing.reviewer_organisation === review.reviewer_organisation
          && existing.review_note === review.review_note
          && existing.reviewed_at !== null
          && review.reviewed_at !== null
          && new Date(existing.reviewed_at).toISOString() === new Date(review.reviewed_at).toISOString();
        if (!same) throw new Error(`${reviewKey}: refusing to overwrite an existing catalogue approval`);
        catalogueUnchanged += 1;
        continue;
      }
      const result = await client.query(
        `INSERT INTO country_risk_sanctions_catalogue_reviews (
           imposer, source_id, catalogue_url, source_fingerprint, census_sha256, status,
           reviewed_by, reviewer_organisation, reviewed_at, review_note
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (imposer, source_fingerprint) DO UPDATE SET
           source_id=EXCLUDED.source_id, catalogue_url=EXCLUDED.catalogue_url,
           census_sha256=EXCLUDED.census_sha256,
           status=EXCLUDED.status, reviewed_by=EXCLUDED.reviewed_by,
           reviewer_organisation=EXCLUDED.reviewer_organisation,
           reviewed_at=EXCLUDED.reviewed_at, review_note=EXCLUDED.review_note,
           updated_at=NOW()
         WHERE country_risk_sanctions_catalogue_reviews.status='pending'`,
        [
          review.imposer, review.source_id, review.catalogue_url,
          review.source_fingerprint, review.census_sha256, review.status, review.reviewed_by,
          review.reviewer_organisation, review.reviewed_at, review.review_note,
        ],
      );
      if (result.rowCount !== 1) throw new Error(`${reviewKey}: concurrent catalogue review update detected`);
      catalogueUpdated += 1;
    }
    const currentCatalogueItems = await client.query<SanctionsCatalogueItemReviewRow>(
      `SELECT census_sha256, imposer, item_key, label, url, disposition, candidate_keys,
              reviewed_by, reviewed_at, review_note
       FROM country_risk_sanctions_catalogue_item_reviews
       WHERE census_sha256=$1`,
      [censusSha256],
    );
    const itemByKey = new Map(currentCatalogueItems.rows.map((row) => [`${row.imposer}|${row.item_key}`, row]));
    let itemUpdated = 0;
    let itemUnchanged = 0;
    for (const item of catalogueItemReviews) {
      const itemKey = `${item.imposer}|${item.item_key}`;
      const existing = itemByKey.get(itemKey);
      if (existing) {
        const same = existing.label === item.label
          && existing.url === item.url
          && existing.disposition === item.disposition
          && JSON.stringify(existing.candidate_keys) === JSON.stringify(item.candidate_keys)
          && existing.reviewed_by === item.reviewed_by
          && new Date(existing.reviewed_at).toISOString() === new Date(item.reviewed_at).toISOString()
          && existing.review_note === item.review_note;
        if (!same) throw new Error(`${itemKey}: refusing to overwrite an existing catalogue-item disposition`);
        itemUnchanged += 1;
        continue;
      }
      await client.query(
        `INSERT INTO country_risk_sanctions_catalogue_item_reviews (
           census_sha256, imposer, item_key, label, url, disposition, candidate_keys,
           reviewed_by, reviewed_at, review_note
         ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)`,
        [
          item.census_sha256, item.imposer, item.item_key, item.label, item.url,
          item.disposition, JSON.stringify(item.candidate_keys), item.reviewed_by,
          item.reviewed_at, item.review_note,
        ],
      );
      itemUpdated += 1;
    }
    await client.query("COMMIT");
    console.log(JSON.stringify({
      ...summary,
      updated,
      unchanged,
      catalogueUpdated,
      catalogueUnchanged,
      itemUpdated,
      itemUnchanged,
      productionScoresChanged: false,
    }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
