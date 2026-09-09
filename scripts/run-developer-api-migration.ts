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
  const migration = await readFile(resolve("migrations/20260909_developer_api_access.sql"), "utf8");
  await pool.query(migration);
  const verification = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name LIKE 'developer_api_%'
     ORDER BY table_name`,
  );
  console.log(`Developer API access schema ready (${verification.rowCount ?? 0} tables)`);
} finally {
  await pool.end();
}
