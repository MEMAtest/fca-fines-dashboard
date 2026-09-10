#!/usr/bin/env npx tsx
import "dotenv/config";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { buildPgPoolConfig, resolveConnectionString } from "../../server/db.js";
import { countryRiskSourceStatus } from "../../src/data/countryRiskSources.js";
import {
  buildFatfListAttempt,
  type FatfListAttemptOutcome,
  type FatfListReviewReport,
} from "./lib/fatfListAttempt.js";

const REPORT_PATH = process.env.FATF_LIST_REVIEW_PATH
  ?? "/tmp/country-risk-fatf-list-review.json";
const outcome = process.env.FATF_LIST_OUTCOME as FatfListAttemptOutcome | undefined;
if (!outcome || !["drift", "unavailable", "error"].includes(outcome)) {
  throw new Error(`FATF_LIST_OUTCOME must be drift, unavailable or error; received ${outcome ?? "nothing"}`);
}

let report: FatfListReviewReport = {};
try {
  report = JSON.parse(await readFile(REPORT_PATH, "utf8")) as FatfListReviewReport;
} catch (error) {
  if (outcome !== "error") throw error;
  report = { error: "The FATF verifier ended without producing a readable review artifact." };
}

const retainedSource = countryRiskSourceStatus("fatf-lists", new Date());
const attempt = buildFatfListAttempt({ outcome, report, retainedSource });
const connectionString = resolveConnectionString();
if (!connectionString) throw new Error("DATABASE_URL is required to persist a FATF verification attempt");

const pool = new pg.Pool(buildPgPoolConfig(connectionString));
const client = await pool.connect();
try {
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM country_risk_source_runs
     WHERE source_id = 'fatf-lists' AND metadata->>'attemptKey' = $1
     ORDER BY id DESC LIMIT 1`,
    [attempt.attemptKey],
  );
  if (existing.rowCount) {
    console.log(JSON.stringify({ created: false, sourceRunId: Number(existing.rows[0].id), outcome }));
  } else {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO country_risk_source_runs (
         source_id, status, source_url, retrieved_at, effective_at, sha256,
         parser_version, record_count, error_message, metadata
       ) VALUES ('fatf-lists',$1,$2,$3::timestamptz,$4,$5,$6,$7,$8,$9::jsonb)
       RETURNING id`,
      [
        attempt.status,
        attempt.sourceUrl,
        attempt.attemptedAt,
        attempt.effectiveAt,
        attempt.sha256,
        "fatf-list-assurance/1.0",
        attempt.recordCount,
        attempt.errorMessage,
        JSON.stringify(attempt.metadata),
      ],
    );
    console.log(JSON.stringify({ created: true, sourceRunId: Number(inserted.rows[0].id), outcome }));
  }
} finally {
  client.release();
  await pool.end();
}
