#!/usr/bin/env npx tsx
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import { buildPgPoolConfig, resolveConnectionString } from "../server/db.js";

const connectionString = resolveConnectionString();
if (!connectionString) throw new Error("DATABASE_URL is required");

const pool = new pg.Pool(buildPgPoolConfig(connectionString));

try {
  // Listed in order rather than globbed, so adding a file is a deliberate act
  // and the sequence is reviewable. Every statement is CREATE ... IF NOT EXISTS,
  // so re-running the whole list is safe and is the normal way to apply a new
  // one: this runner is not wired into a workflow, and a migration that is
  // never referenced here is a migration that never reaches the database.
  const migrations = [
    "migrations/20260909_developer_api_access.sql",
    "migrations/20260910_developer_api_anonymous_buckets.sql",
  ];
  for (const file of migrations) {
    await pool.query(await readFile(resolve(file), "utf8"));
    console.log(`applied ${file}`);
  }
  const verification = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name LIKE 'developer_api_%'
     ORDER BY table_name`,
  );
  console.log(`Developer API access schema ready (${verification.rowCount ?? 0} tables)`);
} finally {
  await pool.end();
}
