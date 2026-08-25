/**
 * Reversible-evidence remediation for legacy numeric NaN values.
 *
 * Default mode is read-only. `--apply` records the complete original row in
 * coverage_discovery_quarantine, normalises invalid numeric NaN values to
 * NULL, and refreshes the public materialised view. The v2 database checks
 * prevent new NaN values after this cleanup.
 */
import "dotenv/config";
import postgres from "postgres";
import { resolveConnectionString } from "../../server/db.js";

const databaseUrl = resolveConnectionString();
if (!databaseUrl) throw new Error("A supported database connection string is required");

const sql = postgres(databaseUrl, {
  max: 1,
  ssl: databaseUrl.includes("sslmode=") ? { rejectUnauthorized: false } : undefined,
});

async function loadCandidates(client: typeof sql) {
  return client`
    SELECT *
    FROM public.eu_fines
    WHERE amount::text = 'NaN'
       OR amount_eur::text = 'NaN'
       OR amount_gbp::text = 'NaN'
    ORDER BY regulator, date_issued DESC NULLS LAST, id
  `;
}

async function main() {
  const rows = await loadCandidates(sql);
  console.log(`Legacy numeric NaN candidates: ${rows.length}`);
  for (const row of rows) {
    console.log(`- ${row.id} | ${row.regulator} | ${row.firm_individual} | ${row.date_issued}`);
  }

  if (!process.argv.includes("--apply")) {
    console.log("Read-only mode. Re-run with --apply to preserve and normalise these exact rows.");
    return;
  }
  if (!rows.length) return;

  await sql.begin(async (tx) => {
    const txSql = tx as unknown as typeof sql;
    for (const row of rows) {
      await txSql`
        INSERT INTO public.coverage_discovery_quarantine (
          regulator, source_url, fingerprint, reason_codes, reasons, payload,
          status, reviewed_at, review_note
        ) VALUES (
          ${row.regulator}, ${row.source_url}, ${row.content_hash},
          ${txSql.json(["invalid_amount", "legacy_remediation"])},
          ${txSql.json(["Legacy numeric NaN is invalid; normalised to null while preserving the original row payload."])},
          ${txSql.json(row)}, 'reviewed', now(),
          'Production ingestion-safety v2 legacy numeric remediation'
        )
      `;
      await txSql`
        UPDATE public.eu_fines
        SET amount = CASE WHEN amount::text = 'NaN' THEN NULL ELSE amount END,
            amount_eur = CASE WHEN amount_eur::text = 'NaN' THEN NULL ELSE amount_eur END,
            amount_gbp = CASE WHEN amount_gbp::text = 'NaN' THEN NULL ELSE amount_gbp END,
            updated_at = now()
        WHERE id = ${row.id}
      `;
    }
    await txSql`REFRESH MATERIALIZED VIEW public.all_regulatory_fines`;
  });

  const remaining = await loadCandidates(sql);
  if (remaining.length > 0) {
    throw new Error(`${remaining.length} legacy numeric NaN row(s) remain after remediation.`);
  }
  console.log(`Preserved and normalised ${rows.length} legacy numeric NaN row(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => sql.end());
