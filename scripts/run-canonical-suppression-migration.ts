import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import "dotenv/config";
import { resolveConnectionString } from "../server/db.js";
import { assertExpectedDbTarget, requireExpectedDbTarget } from "./lib/dbTarget.js";

/**
 * Applies migrations/20261106_canonical_honours_all_suppressions.sql. Dry by default: prints the
 * state and EVERY row that will disappear from the canonical view (existing non-FMANZ suppressions
 * that currently still appear there). --apply rebuilds the view (one transaction) and records it.
 */
const FILE = "migrations/20261106_canonical_honours_all_suppressions.sql";
const apply = process.argv.includes("--apply");
if (apply) requireExpectedDbTarget("canonical-suppression-migration");
else assertExpectedDbTarget("canonical-suppression-migration");
const url = resolveConnectionString();
if (!url) throw new Error("A supported database connection string is required");
const sql = postgres(url, { max: 1, ssl: url.includes("sslmode=") ? { rejectUnauthorized: false } : undefined });
const hash = (v: string) => crypto.createHash("sha256").update(v).digest("hex").slice(0, 16);

async function main() {
  await sql`CREATE TABLE IF NOT EXISTS public.regactions_schema_migrations (migration_name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
  const name = path.basename(FILE);
  const body = fs.readFileSync(path.resolve(process.cwd(), FILE), "utf8");
  const [done] = await sql`select 1 from public.regactions_schema_migrations where migration_name = ${name}`;
  console.log(`Mode: ${apply ? "APPLY" : "DRY RUN (no changes)"}; ${name}: ${done ? "already applied" : "pending"} (file hash ${hash(body)})`);
  const [def] = await sql<{ definition: string }[]>`select definition from pg_matviews where schemaname='public' and matviewname='all_regulatory_fines_canonical'`;
  console.log("canonical honours only FMANZ:", /upper\(suppression\.regulator\) = 'FMANZ'/.test(def?.definition ?? ""));
  const rows = await sql`
    SELECT c.id, c.regulator, c.firm_individual, c.date_issued::text AS date_issued, c.amount_gbp::float AS amount_gbp, s.reason
      FROM public.all_regulatory_fines_canonical c
      JOIN public.regulatory_case_suppressions s ON s.source_row_id = c.id
     WHERE upper(s.regulator) <> 'FMANZ'
     ORDER BY c.regulator, c.date_issued DESC`;
  console.log(`WILL DISAPPEAR FROM CANONICAL (existing suppressions still present there): ${rows.length}`);
  for (const r of rows) console.log(JSON.stringify(r));
  if (apply && !done) {
    await sql.unsafe(body);
    await sql`insert into public.regactions_schema_migrations (migration_name) values (${name}) on conflict do nothing`;
    const left = await sql`SELECT count(*)::int AS n FROM public.all_regulatory_fines_canonical c JOIN public.regulatory_case_suppressions s ON s.source_row_id = c.id`;
    console.log(`applied; suppressed ids still in canonical: ${left[0].n}`);
    if (left[0].n !== 0) { console.error("Suppressed rows are still visible in canonical"); process.exitCode = 1; }
  }
  await sql.end();
}
main().catch(async (e) => { console.error(e); await sql.end({ timeout: 1 }).catch(() => undefined); process.exit(1); });
