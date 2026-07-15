import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import "dotenv/config";
import { backfillRegulatoryAmountAssessments } from "./backfill-regulatory-amount-assessments.js";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const sql = postgres(databaseUrl, {
  ssl: databaseUrl.includes("sslmode=")
    ? { rejectUnauthorized: false }
    : undefined,
});

async function main() {
  const migrationPaths = [
    "migrations/20260715_canonical_regulatory_evidence.sql",
    "migrations/20260715_board_pack_delivery.sql",
    "migrations/20260715_sec_amount_evidence_remediation.sql",
    "migrations/20260715_jfsc_verified_archive_cleanup.sql",
  ].map((file) => path.resolve(process.cwd(), file));

  for (const migrationPath of migrationPaths) {
    console.log(`Applying ${path.basename(migrationPath)}...`);
    await sql.unsafe(fs.readFileSync(migrationPath, "utf8"));
  }

  const amountAssessment = await backfillRegulatoryAmountAssessments(sql);

  const [counts] = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM public.all_regulatory_fines) AS source_rows,
      (SELECT COUNT(*)::int FROM public.all_regulatory_fines_canonical) AS canonical_rows,
      (SELECT COALESCE(SUM(duplicate_count - 1), 0)::int FROM public.all_regulatory_fines_canonical) AS collapsed_rows,
      (SELECT COUNT(*)::int FROM public.all_regulatory_fines_canonical WHERE requires_amount_review) AS amount_review_rows
  `;
  const verified = await sql`
    SELECT regulator, firm_individual, amount_original, currency, duplicate_count, amount_quality
    FROM public.all_regulatory_fines_canonical
    WHERE amount_quality = 'verified_override'
    ORDER BY regulator
  `;
  const [jfsc] = await sql`
    SELECT
      COUNT(*)::int AS canonical_rows,
      COUNT(*) FILTER (WHERE source_url = notice_url)::int AS reviewed_source_rows
    FROM public.all_regulatory_fines_canonical
    WHERE upper(regulator) = 'JFSC'
  `;

  if (!counts || Number(counts.canonical_rows) >= Number(counts.source_rows)) {
    throw new Error("Canonical evidence verification did not collapse any source rows");
  }
  if (verified.length < 4) {
    throw new Error("Verified amount corrections were not applied");
  }
  if (Number(counts.amount_review_rows) !== 0) {
    throw new Error(
      `Canonical evidence still contains ${counts.amount_review_rows} amount-review rows`,
    );
  }
  if (Number(jfsc?.canonical_rows) !== 6 || Number(jfsc?.reviewed_source_rows) !== 6) {
    throw new Error("JFSC canonical evidence is not restricted to the six reviewed actions");
  }

  const [leadLifecycle] = await sql`
    SELECT COUNT(*)::int AS column_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'board_pack_leads'
      AND column_name IN (
        'notification_last_attempt_at',
        'notification_next_attempt_at',
        'notification_message_id'
      )
  `;
  if (Number(leadLifecycle?.column_count) !== 3) {
    throw new Error("Board Pack notification lifecycle columns are missing");
  }

  console.log(JSON.stringify({ counts, verified, jfsc, amountAssessment, leadLifecycle }, null, 2));
  await sql.end();
}

void main().catch(async (error) => {
  console.error("Data trust migration failed", error);
  await sql.end();
  process.exitCode = 1;
});
