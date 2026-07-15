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
  const migration = await readFile(
    join(dirname(fileURLToPath(import.meta.url)), "..", "migrations", "20260715_country_risk_v2.sql"),
    "utf8",
  );
  const pool = new pg.Pool(buildPgPoolConfig(connectionString));
  try {
    await pool.query(migration);
    console.log("Applied country-risk v2 migration");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
