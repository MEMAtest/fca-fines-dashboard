#!/usr/bin/env npx tsx
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { buildPgPoolConfig, resolveConnectionString } from "../server/db.js";

async function main() {
  const connectionString = resolveConnectionString();
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const migrationDirectory = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
  const migrationNames = [
    "20260715_country_risk_v2.sql",
    "20260716_country_risk_sanctions_review.sql",
    "20260716_country_risk_sanctions_promotion.sql",
    "20260717_country_risk_sanctions_evidence.sql",
    "20260717_country_risk_deterministic_decisions.sql",
  ];
  const pool = new pg.Pool(buildPgPoolConfig(connectionString));
  try {
    for (const migrationName of migrationNames) {
      const migration = await readFile(join(migrationDirectory, migrationName), "utf8");
      await pool.query(migration);
      console.log(`Applied ${migrationName}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
