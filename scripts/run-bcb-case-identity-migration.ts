import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import "dotenv/config";
import { resolveConnectionString } from "../server/db.js";
import { assertExpectedDbTarget, requireExpectedDbTarget } from "./lib/dbTarget.js";

/**
 * Applies only the BCB case-identity migrations. Dry by default: prints the
 * plan and a hash of the current view definitions. Pass --apply to write.
 */
const MIGRATIONS = [
  "migrations/20261010_bcb_case_identity.sql",
  "migrations/20261011_canonical_regulator_created_index.sql",
];

const apply = process.argv.includes("--apply");
// Applying needs the site DB host/name pinned; a dry run still announces and checks the target.
if (apply) requireExpectedDbTarget("bcb-case-identity-migration");
else assertExpectedDbTarget("bcb-case-identity-migration");
const databaseUrl = resolveConnectionString();
if (!databaseUrl) throw new Error("A supported database connection string is required");
const sql = postgres(databaseUrl, {
  max: 1,
  ssl: databaseUrl.includes("sslmode=") ? { rejectUnauthorized: false } : undefined,
});

const hash = (value: string) => crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);

async function viewState() {
  const [canonical] = await sql<{ definition: string }[]>`
    select definition from pg_matviews
    where schemaname = 'public' and matviewname = 'all_regulatory_fines_canonical'`;
  const [trusted] = await sql<{ definition: string }[]>`
    select definition from pg_views
    where schemaname = 'public' and viewname = 'all_regulatory_fines_trusted'`;
  return {
    canonicalHash: canonical ? hash(canonical.definition) : "missing",
    trustedHash: trusted ? hash(trusted.definition) : "missing",
    hasCaseIdentity: Boolean(canonical && /case_ref/i.test(canonical.definition)),
  };
}

async function main() {
  await sql`
    CREATE TABLE IF NOT EXISTS public.regactions_schema_migrations (
      migration_name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`;
  const before = await viewState();
  console.log(`Mode: ${apply ? "APPLY" : "DRY RUN (no changes)"}`);
  console.log("Current views:", JSON.stringify(before));

  for (const file of MIGRATIONS) {
    const name = path.basename(file);
    const [done] = await sql`select 1 from public.regactions_schema_migrations where migration_name = ${name}`;
    const body = fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
    console.log(`- ${name}: ${done ? "already applied" : "pending"} (file hash ${hash(body)})`);
    if (done || !apply) continue;
    await sql.unsafe(body);
    await sql`insert into public.regactions_schema_migrations (migration_name) values (${name}) on conflict do nothing`;
    console.log(`  applied ${name}`);
  }

  if (apply) console.log("After:", JSON.stringify(await viewState()));
  await sql.end();
}

main().catch(async (error) => {
  console.error(error);
  await sql.end({ timeout: 1 }).catch(() => undefined);
  process.exit(1);
});
