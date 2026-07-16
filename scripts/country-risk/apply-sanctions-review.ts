#!/usr/bin/env npx tsx
import "dotenv/config";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { buildPgPoolConfig, resolveConnectionString } from "../../server/db.js";
import { SANCTIONS_REGIME_CANDIDATES } from "../../src/data/sanctionsRegimeCandidates.js";
import {
  validateCompletedSanctionsReview,
  type CompletedSanctionsReviewRecord,
} from "./lib/sanctionsReviewImport.js";
import type { SanctionsReviewRow } from "./lib/sanctionsPromotion.js";

const input = process.env.COUNTRY_RISK_SANCTIONS_COMPLETED_REVIEW_JSON
  ?? "/tmp/country-risk-sanctions-taxonomy-review.json";

async function main() {
  const document = JSON.parse(await readFile(input, "utf8")) as {
    records?: CompletedSanctionsReviewRecord[];
  };
  const rows = validateCompletedSanctionsReview({
    candidates: SANCTIONS_REGIME_CANDIDATES,
    records: document.records ?? [],
  });
  const summary = {
    input,
    records: rows.length,
    approved: rows.filter((row) => row.status === "approved").length,
    rejected: rows.filter((row) => row.status === "rejected").length,
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
              status, reviewed_by, reviewer_organisation, reviewed_at, review_note
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
             decision_evidence_url=$11, updated_at=NOW()
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
        ],
      );
      if (update.rowCount !== 1) throw new Error(`${rowKey}: concurrent review update detected`);
      updated += 1;
    }
    await client.query("COMMIT");
    console.log(JSON.stringify({ ...summary, updated, unchanged, productionScoresChanged: false }, null, 2));
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
