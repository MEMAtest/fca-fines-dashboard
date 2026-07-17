#!/usr/bin/env npx tsx
import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { buildPgPoolConfig, resolveConnectionString } from "../../server/db.js";

const REPORT_PATH = process.env.COUNTRY_RISK_SOURCE_REPORT
  ?? "/tmp/country-risk-sanctions-review.json";
const PARSER_VERSION = "sanctions-source-assurance/2.1";

interface SourceResult {
  id: string;
  url: string;
  healthy: boolean;
  retrievedAt?: string;
  bytes?: number;
  sha256?: string;
  fingerprint?: string;
  discoveryMode?: string;
  discoveryItems?: number;
  inventory?: unknown[];
  changed?: boolean;
  baselineMissing?: boolean;
  error?: string;
}

const connectionString = resolveConnectionString();
if (!connectionString) {
  console.log(JSON.stringify({ skipped: true, reason: "DATABASE_URL is not configured", productionScoresChanged: false }));
  process.exit(0);
}

const raw = await readFile(REPORT_PATH);
const report = JSON.parse(raw.toString("utf8")) as {
  schemaVersion?: number;
  checkedAt: string;
  requiresHumanReview: boolean;
  results: SourceResult[];
};
if (report.schemaVersion !== 2 || !Array.isArray(report.results) || !report.results.length) {
  throw new Error("A sanctions source-assurance schema v2 report is required");
}
const reportSha256 = createHash("sha256").update(raw).digest("hex");
const pool = new pg.Pool(buildPgPoolConfig(connectionString));
const client = await pool.connect();
try {
  await client.query("BEGIN");
  let inserted = 0;
  let unchanged = 0;
  for (const source of report.results) {
    const existing = await client.query(
      `SELECT id FROM country_risk_source_runs
       WHERE source_id=$1 AND metadata->>'reportSha256'=$2`,
      [source.id, reportSha256],
    );
    if (existing.rowCount) {
      unchanged += 1;
      continue;
    }
    const status = !source.healthy
      ? "failed"
      : source.changed || source.baselineMissing || report.requiresHumanReview
        ? "review_required"
        : "succeeded";
    await client.query(
      `INSERT INTO country_risk_source_runs (
         source_id, status, source_url, retrieved_at, effective_at, sha256,
         parser_version, record_count, error_message, metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
      [
        source.id,
        status,
        source.url,
        source.retrievedAt ?? report.checkedAt,
        report.checkedAt.slice(0, 10),
        source.sha256 ?? null,
        PARSER_VERSION,
        source.discoveryItems ?? 0,
        source.error ?? null,
        JSON.stringify({
          reportSha256,
          reportCheckedAt: report.checkedAt,
          fingerprint: source.fingerprint ?? null,
          discoveryMode: source.discoveryMode ?? null,
          byteLength: source.bytes ?? null,
          changed: source.changed ?? null,
          baselineMissing: source.baselineMissing ?? null,
          inventory: source.inventory ?? [],
        }),
      ],
    );
    inserted += 1;
  }
  await client.query("COMMIT");
  console.log(JSON.stringify({
    report: REPORT_PATH,
    reportSha256,
    sourceRuns: report.results.length,
    inserted,
    unchanged,
    productionScoresChanged: false,
  }, null, 2));
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
