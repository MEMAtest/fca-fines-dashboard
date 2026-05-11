import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import * as dotenv from "dotenv";

dotenv.config();

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const sql = postgres(databaseUrl, {
  ssl: databaseUrl.includes("sslmode=")
    ? { rejectUnauthorized: false }
    : undefined,
});

async function main() {
  const migrationPaths = [
    "migrations/20260423_uk_enforcement_actions.sql",
    "migrations/20260511_unify_uk_enforcement_view.sql",
  ].map((migration) => path.resolve(process.cwd(), migration));

  console.log("Running UK enforcement migration...");
  for (const migrationPath of migrationPaths) {
    console.log(`Applying ${path.basename(migrationPath)}...`);
    await sql.unsafe(fs.readFileSync(migrationPath, "utf8"));
  }

  const verification = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'uk_enforcement_actions'
  `;

  if (verification.length === 0) {
    throw new Error("uk_enforcement_actions table was not created");
  }

  console.log("UK enforcement table is ready");
  await sql.end();
}

void main().catch(async (error) => {
  console.error("UK enforcement migration failed", error);
  await sql.end();
  process.exitCode = 1;
});
