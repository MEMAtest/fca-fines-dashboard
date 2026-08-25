/**
 * Reversible AFM remediation for the legacy extraction regression.
 *
 * Default mode is read-only. `--apply` copies the exact matching rows to an
 * audit table, removes them from eu_fines, and refreshes the public materialised
 * view. `--restore` restores the most recent backup. No broad AFM delete is
 * permitted: the predicates below are the known page-furniture and NaN forms.
 */
import "dotenv/config";
import postgres from "postgres";
import crypto from "node:crypto";
import { resolveConnectionString } from "../../server/db.js";

const databaseUrl = resolveConnectionString();
if (!databaseUrl) throw new Error("A supported database connection string is required");
const sql = postgres(databaseUrl, { max: 1, ssl: databaseUrl.includes("sslmode=") ? { rejectUnauthorized: false } : undefined });

const MALFORMED_ENTITY = "consumenten|digitalisering|duurzaamheid|marktmisbru";

async function main() {
  await sql`
    CREATE TABLE IF NOT EXISTS public.afm_malformed_row_backup (
      remediation_id uuid NOT NULL,
      backed_up_at timestamptz NOT NULL DEFAULT now(),
      row_data jsonb NOT NULL
    )
  `;

  const rows = await sql`
    SELECT * FROM public.eu_fines
    WHERE regulator = 'AFM'
      AND (
        amount::text = 'NaN'
        OR firm_individual ~* ${MALFORMED_ENTITY}
        OR firm_individual ~* '<[^>]+>'
      )
    ORDER BY date_issued DESC NULLS LAST, id
  `;
  console.log(`AFM remediation candidates: ${rows.length}`);
  for (const row of rows) console.log(`- ${row.id} | ${row.firm_individual} | ${row.amount} | ${row.date_issued}`);

  if (process.argv.includes("--restore")) {
    const [backup] = await sql`
      SELECT remediation_id, backed_up_at
      FROM public.afm_malformed_row_backup
      ORDER BY backed_up_at DESC
      LIMIT 1
    `;
    if (!backup) throw new Error("No AFM remediation backup is available to restore.");
    await sql.begin(async (tx) => {
      const txSql = tx as unknown as typeof sql;
      await txSql`
        INSERT INTO public.eu_fines
        SELECT (row_data->>'id')::uuid, row_data->>'content_hash', row_data->>'regulator',
          row_data->>'regulator_full_name', row_data->>'country_code', row_data->>'country_name',
          row_data->>'firm_individual', row_data->>'firm_category', NULLIF(row_data->>'amount','')::numeric,
          row_data->>'currency', NULLIF(row_data->>'amount_eur','')::numeric, NULLIF(row_data->>'amount_gbp','')::numeric,
          NULLIF(row_data->>'date_issued','')::date, NULLIF(row_data->>'year_issued','')::int,
          NULLIF(row_data->>'month_issued','')::int, row_data->>'breach_type', row_data->'breach_categories',
          row_data->>'summary', row_data->>'final_notice_url', row_data->>'source_url', row_data->'raw_payload',
          NULLIF(row_data->>'scraped_at','')::timestamptz, NULLIF(row_data->>'created_at','')::timestamptz,
          NULLIF(row_data->>'updated_at','')::timestamptz
        FROM public.afm_malformed_row_backup
        WHERE remediation_id = ${backup.remediation_id}
        ON CONFLICT (id) DO NOTHING
      `;
      await txSql`REFRESH MATERIALIZED VIEW public.all_regulatory_fines`;
    });
    console.log(`Restored AFM remediation ${backup.remediation_id}.`);
    return;
  }

  if (!process.argv.includes("--apply")) {
    console.log("Read-only mode. Re-run with --apply to quarantine these exact rows.");
    return;
  }
  if (!rows.length) return;

  const remediationId = crypto.randomUUID();
  await sql.begin(async (tx) => {
    const txSql = tx as unknown as typeof sql;
    await txSql`
      INSERT INTO public.afm_malformed_row_backup (remediation_id, row_data)
      SELECT ${remediationId}::uuid, to_jsonb(eu_fines)
      FROM public.eu_fines
      WHERE regulator = 'AFM'
        AND (amount::text = 'NaN' OR firm_individual ~* ${MALFORMED_ENTITY} OR firm_individual ~* '<[^>]+>')
    `;
    await txSql`
      DELETE FROM public.eu_fines
      WHERE regulator = 'AFM'
        AND (amount::text = 'NaN' OR firm_individual ~* ${MALFORMED_ENTITY} OR firm_individual ~* '<[^>]+>')
    `;
    await txSql`REFRESH MATERIALIZED VIEW public.all_regulatory_fines`;
  });
  console.log(`Quarantined ${rows.length} AFM rows under remediation ${remediationId}. Restore with --restore.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => sql.end());
