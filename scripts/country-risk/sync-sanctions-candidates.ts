#!/usr/bin/env npx tsx
import "dotenv/config";
import pg from "pg";
import { buildPgPoolConfig, resolveConnectionString } from "../../server/db.js";
import { SANCTIONS_REGIME_CANDIDATES } from "../../src/data/sanctionsRegimeCandidates.js";

const dryRun = process.argv.includes("--dry-run");

if (dryRun) {
  console.log(JSON.stringify({
    dryRun: true,
    candidates: SANCTIONS_REGIME_CANDIDATES.length,
    countries: new Set(SANCTIONS_REGIME_CANDIDATES.map((candidate) => candidate.iso2)).size,
    byImposer: Object.fromEntries(["OFAC", "UK", "EU", "UN"].map((imposer) => [
      imposer,
      SANCTIONS_REGIME_CANDIDATES.filter((candidate) => candidate.imposer === imposer).length,
    ])),
    productionScoresChanged: false,
  }, null, 2));
  process.exit(0);
}

const connectionString = resolveConnectionString();
if (!connectionString) throw new Error("DATABASE_URL is required unless --dry-run is used");

const pool = new pg.Pool(buildPgPoolConfig(connectionString));
const client = await pool.connect();

try {
  await client.query("BEGIN");
  const existing = await client.query<{
    iso2: string;
    imposer: string;
    regime_name: string;
    status: "pending" | "approved" | "rejected";
  }>(`SELECT iso2, imposer, regime_name, status FROM country_risk_sanctions_regimes`);
  const candidateKeys = new Set(SANCTIONS_REGIME_CANDIDATES.map((candidate) =>
    `${candidate.iso2}|${candidate.imposer}|${candidate.regime}`));
  const stale = existing.rows.filter((row) =>
    !candidateKeys.has(`${row.iso2.trim()}|${row.imposer}|${row.regime_name}`));
  const staleReviewed = stale.filter((row) => row.status !== "pending");
  if (staleReviewed.length) {
    throw new Error(`Refusing candidate sync: ${staleReviewed.length} reviewed records are absent from the current catalogue`);
  }
  let written = 0;
  for (const candidate of SANCTIONS_REGIME_CANDIDATES) {
    const result = await client.query(
      `INSERT INTO country_risk_sanctions_regimes (
         iso2, imposer, regime_name, relationship, proposed_tier,
         catalogue_url, measure_evidence_url, effective_at, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
       ON CONFLICT (iso2, imposer, regime_name) DO UPDATE SET
         relationship = EXCLUDED.relationship,
         proposed_tier = EXCLUDED.proposed_tier,
         catalogue_url = EXCLUDED.catalogue_url,
         measure_evidence_url = EXCLUDED.measure_evidence_url,
         effective_at = EXCLUDED.effective_at,
         updated_at = NOW()
       WHERE country_risk_sanctions_regimes.status = 'pending'
       RETURNING id`,
      [
        candidate.iso2,
        candidate.imposer,
        candidate.regime,
        candidate.relationship,
        candidate.proposedTier,
        candidate.catalogueUrl,
        candidate.measureEvidenceUrl,
        candidate.reviewedAsOf,
      ],
    );
    written += result.rowCount ?? 0;
  }
  let removedStalePending = 0;
  for (const row of stale) {
    const removed = await client.query(
      `DELETE FROM country_risk_sanctions_regimes
       WHERE iso2=$1 AND imposer=$2 AND regime_name=$3 AND status='pending'`,
      [row.iso2.trim(), row.imposer, row.regime_name],
    );
    removedStalePending += removed.rowCount ?? 0;
  }
  const coverage = await client.query<{
    status: string;
    records: string;
    countries: string;
  }>(`SELECT status, COUNT(*)::text AS records, COUNT(DISTINCT iso2)::text AS countries
      FROM country_risk_sanctions_regimes
      GROUP BY status
      ORDER BY status`);
  await client.query("COMMIT");
  console.log(JSON.stringify({
    candidates: SANCTIONS_REGIME_CANDIDATES.length,
    written,
    removedStalePending,
    coverage: coverage.rows,
    productionScoresChanged: false,
  }, null, 2));
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
