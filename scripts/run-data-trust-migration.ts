import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import "dotenv/config";
import { backfillRegulatoryAmountAssessments } from "./backfill-regulatory-amount-assessments.js";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const sql = postgres(databaseUrl, {
  max: 1,
  ssl: databaseUrl.includes("sslmode=")
    ? { rejectUnauthorized: false }
    : undefined,
});

async function main() {
  await sql`
    CREATE TABLE IF NOT EXISTS public.regactions_schema_migrations (
      migration_name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  await recordSatisfiedLegacyMigrations();

  const migrationPaths = [
    "migrations/20260714_board_pack_leads.sql",
    "migrations/20260715_canonical_regulatory_evidence.sql",
    "migrations/20260715_board_pack_delivery.sql",
    "migrations/20260715_sec_amount_evidence_remediation.sql",
    "migrations/20260715_jfsc_verified_archive_cleanup.sql",
    "migrations/20260717_evidence_first_trust_gate.sql",
    "migrations/20260717_monitor_profiles.sql",
    "migrations/20260718_source_assessment_operations.sql",
    "migrations/20260718_delivery_journey_operations.sql",
    "migrations/20260718_scraper_quality_operations.sql",
    "migrations/20260718_product_funnel_events.sql",
  ].map((file) => path.resolve(process.cwd(), file));

  for (const migrationPath of migrationPaths) {
    const migrationName = path.basename(migrationPath);
    const [existing] = await sql`
      SELECT migration_name
      FROM public.regactions_schema_migrations
      WHERE migration_name = ${migrationName}
    `;
    if (existing) {
      console.log(`Skipping ${migrationName}; already applied.`);
      continue;
    }

    console.log(`Applying ${migrationName}...`);
    await sql.unsafe(fs.readFileSync(migrationPath, "utf8"));
    await sql`
      INSERT INTO public.regactions_schema_migrations (migration_name)
      VALUES (${migrationName})
      ON CONFLICT (migration_name) DO NOTHING
    `;
  }

  await sql`
    INSERT INTO public.regulatory_case_registry (source_row_id, current_fingerprint)
    SELECT id::text, canonical_case_id
    FROM public.all_regulatory_fines_canonical
    ON CONFLICT (source_row_id) DO UPDATE SET
      current_fingerprint = EXCLUDED.current_fingerprint,
      updated_at = now()
  `;
  await sql`
    INSERT INTO public.regulatory_case_aliases (fingerprint, public_case_id)
    SELECT registry.current_fingerprint, registry.public_case_id
    FROM public.regulatory_case_registry AS registry
    ON CONFLICT (fingerprint) DO NOTHING
  `;

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

  const [trustGate] = await sql`
    SELECT
      to_regclass('public.all_regulatory_fines_trusted') IS NOT NULL AS trusted_view_ready,
      to_regclass('public.monitor_profiles') IS NOT NULL AS monitor_profiles_ready,
      (SELECT COUNT(*)::int FROM public.regulatory_case_registry) AS registered_cases,
      (SELECT COUNT(*)::int FROM public.all_regulatory_fines_canonical) AS canonical_cases,
      (
        SELECT COUNT(*)::int
        FROM public.all_regulatory_fines_canonical AS canonical
        LEFT JOIN public.regulatory_case_registry AS registry
          ON registry.source_row_id = canonical.id::text
        WHERE registry.public_case_id IS NULL
      ) AS missing_registry_cases
  `;
  if (!trustGate?.trusted_view_ready || !trustGate?.monitor_profiles_ready) {
    throw new Error("Evidence trust view or monitor profile table is missing");
  }
  if (Number(trustGate.missing_registry_cases) !== 0) {
    throw new Error("Immutable public case registry does not cover every canonical case");
  }

  console.log(JSON.stringify({ counts, verified, jfsc, amountAssessment, leadLifecycle, trustGate }, null, 2));
  await sql.end();
}

async function recordSatisfiedLegacyMigrations() {
  const [state] = await sql`
    SELECT
      to_regclass('public.board_pack_leads') IS NOT NULL AS board_pack_ready,
      to_regclass('public.all_regulatory_fines_canonical') IS NOT NULL
        AND to_regclass('public.regulatory_amount_overrides') IS NOT NULL AS canonical_ready,
      to_regclass('public.all_regulatory_fines_trusted') IS NOT NULL
        AND to_regclass('public.regulatory_case_registry') IS NOT NULL
        AND to_regclass('public.regulatory_case_aliases') IS NOT NULL
        AND to_regclass('public.regulatory_source_assessments') IS NOT NULL AS trust_gate_ready,
      to_regclass('public.monitor_profiles') IS NOT NULL AS monitors_ready,
      to_regclass('public.regulatory_evidence_quarantine') IS NOT NULL AS quarantine_ready,
      (
        SELECT COUNT(*)::int
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'board_pack_leads'
          AND column_name IN (
            'notification_last_attempt_at',
            'notification_next_attempt_at',
            'notification_message_id'
          )
      ) AS board_pack_delivery_columns
  `;

  let verifiedAmountOverrides = 0;
  let reviewedJfscRows = 0;
  if (state?.canonical_ready) {
    const [evidenceState] = await sql`
      SELECT
        (
          SELECT COUNT(*)::int
          FROM public.regulatory_amount_overrides
          WHERE quality_status = 'verified_override'
        ) AS verified_amount_overrides,
        (
          SELECT COUNT(*)::int
          FROM public.all_regulatory_fines_canonical
          WHERE upper(regulator) = 'JFSC'
            AND source_url = notice_url
        ) AS reviewed_jfsc_rows
    `;
    verifiedAmountOverrides = Number(evidenceState?.verified_amount_overrides);
    reviewedJfscRows = Number(evidenceState?.reviewed_jfsc_rows);
  }

  const satisfied = [
    state?.board_pack_ready && "20260714_board_pack_leads.sql",
    state?.canonical_ready && "20260715_canonical_regulatory_evidence.sql",
    Number(state?.board_pack_delivery_columns) === 3 && "20260715_board_pack_delivery.sql",
    verifiedAmountOverrides >= 4 && "20260715_sec_amount_evidence_remediation.sql",
    state?.quarantine_ready && reviewedJfscRows === 6
      ? "20260715_jfsc_verified_archive_cleanup.sql"
      : false,
    state?.trust_gate_ready && "20260717_evidence_first_trust_gate.sql",
    state?.monitors_ready && "20260717_monitor_profiles.sql",
  ].filter((name): name is string => Boolean(name));

  if (satisfied.length > 0) {
    await sql`
      INSERT INTO public.regactions_schema_migrations ${sql(
        satisfied.map((migration_name) => ({ migration_name })),
      )}
      ON CONFLICT (migration_name) DO NOTHING
    `;
  }
}

void main().catch(async (error) => {
  console.error("Data trust migration failed", error);
  await sql.end();
  process.exitCode = 1;
});
