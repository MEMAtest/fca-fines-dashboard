/**
 * Reversible, narrowly scoped FINRA source-provenance remediation.
 *
 * Default mode is read-only. `--apply` requires every legacy row to have a
 * non-empty raw_payload.caseNumber that is represented by a current official
 * FINRA export row, then backs up and deletes only the exact legacy source
 * rows in one transaction. `--restore` restores the latest backup with an
 * explicit column list and sanitises legacy numeric NaN values to NULL.
 */
import "dotenv/config";
import postgres from "postgres";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolveConnectionString } from "../../server/db.js";

export const FINRA_LEGACY_SOURCE_URL =
  "https://www.finra.org/rules-guidance/oversight-enforcement/finra-disciplinary-actions";
export const FINRA_EXPORT_SOURCE_URL =
  "https://data-portal.finra.org/exports/fda_export_all.xlsx";

export interface FinraCaseCoverageAudit {
  legacyRows: number;
  uniqueLegacyCases: number;
  emptyCaseNumbers: number;
  missingCaseNumbers: string[];
}

export function auditFinraCaseCoverage(
  legacyCaseNumbers: Iterable<unknown>,
  officialCaseNumbers: Iterable<unknown>,
): FinraCaseCoverageAudit {
  const legacy = [...legacyCaseNumbers].map((value) => String(value ?? "").trim());
  const official = new Set(
    [...officialCaseNumbers]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean),
  );
  const uniqueLegacy = [...new Set(legacy.filter(Boolean))];
  return {
    legacyRows: legacy.length,
    uniqueLegacyCases: uniqueLegacy.length,
    emptyCaseNumbers: legacy.filter((value) => !value).length,
    missingCaseNumbers: uniqueLegacy.filter((value) => !official.has(value)),
  };
}

export function canApplyFinraRemediation(audit: FinraCaseCoverageAudit) {
  return audit.legacyRows > 0 && audit.emptyCaseNumbers === 0 && audit.missingCaseNumbers.length === 0;
}

function databaseClient() {
  const databaseUrl = resolveConnectionString();
  if (!databaseUrl) throw new Error("A supported database connection string is required");
  return postgres(databaseUrl, {
    max: 1,
    ssl: databaseUrl.includes("sslmode=") ? { rejectUnauthorized: false } : undefined,
  });
}

type SqlClient = ReturnType<typeof postgres>;

async function loadCoverageAudit(sql: SqlClient) {
  const legacyRows = await sql`
    SELECT id, raw_payload->>'caseNumber' AS case_number, firm_individual, date_issued
    FROM public.eu_fines
    WHERE regulator = 'FINRA'
      AND source_url = ${FINRA_LEGACY_SOURCE_URL}
    ORDER BY date_issued DESC NULLS LAST, id
  `;
  const officialRows = await sql`
    SELECT DISTINCT raw_payload->>'caseNumber' AS case_number
    FROM public.eu_fines
    WHERE regulator = 'FINRA'
      AND source_url = ${FINRA_EXPORT_SOURCE_URL}
      AND NULLIF(TRIM(raw_payload->>'caseNumber'), '') IS NOT NULL
  `;
  const audit = auditFinraCaseCoverage(
    legacyRows.map((row) => row.case_number),
    officialRows.map((row) => row.case_number),
  );
  return { legacyRows, officialRows, audit };
}

function printAudit(audit: FinraCaseCoverageAudit, officialRowCount: number) {
  console.log(`FINRA legacy-source candidates: ${audit.legacyRows}`);
  console.log(`FINRA unique legacy case numbers: ${audit.uniqueLegacyCases}`);
  console.log(`FINRA official-export case rows available: ${officialRowCount}`);
  console.log(`FINRA legacy rows with empty case numbers: ${audit.emptyCaseNumbers}`);
  console.log(`FINRA legacy case numbers missing from official export: ${audit.missingCaseNumbers.length}`);
  if (audit.missingCaseNumbers.length > 0) {
    console.log(`Missing case numbers: ${audit.missingCaseNumbers.slice(0, 20).join(", ")}`);
  }
}

async function applyRemediation(sql: SqlClient, auditBeforeApply: FinraCaseCoverageAudit) {
  const remediationId = crypto.randomUUID();
  const result = await sql.begin(async (transaction) => {
    const txSql = transaction as unknown as SqlClient;
    // Re-read both source sets in the transaction. A previously safe dry-run
    // must not authorise an apply after the source corpus has changed.
    const legacyRows = await txSql`
      SELECT raw_payload->>'caseNumber' AS case_number
      FROM public.eu_fines
      WHERE regulator = 'FINRA'
        AND source_url = ${FINRA_LEGACY_SOURCE_URL}
    `;
    const officialRows = await txSql`
      SELECT DISTINCT raw_payload->>'caseNumber' AS case_number
      FROM public.eu_fines
      WHERE regulator = 'FINRA'
        AND source_url = ${FINRA_EXPORT_SOURCE_URL}
        AND NULLIF(TRIM(raw_payload->>'caseNumber'), '') IS NOT NULL
    `;
    const verifiedAudit = auditFinraCaseCoverage(
      legacyRows.map((row) => row.case_number),
      officialRows.map((row) => row.case_number),
    );
    if (verifiedAudit.legacyRows !== auditBeforeApply.legacyRows) {
      throw new Error(
        `FINRA remediation candidate count changed between audit and apply (${auditBeforeApply.legacyRows} → ${verifiedAudit.legacyRows}); no rows were changed.`,
      );
    }
    if (!canApplyFinraRemediation(verifiedAudit)) {
      throw new Error(
        `FINRA remediation coverage gate failed inside transaction: ${verifiedAudit.emptyCaseNumbers} empty case number(s), ${verifiedAudit.missingCaseNumbers.length} case number(s) missing from official export.`,
      );
    }

    await txSql`
      INSERT INTO public.finra_legacy_row_backup (remediation_id, row_data)
      SELECT ${remediationId}::uuid, to_jsonb(eu_fines)
      FROM public.eu_fines
      WHERE regulator = 'FINRA'
        AND source_url = ${FINRA_LEGACY_SOURCE_URL}
    `;
    const deleted = await txSql`
      DELETE FROM public.eu_fines
      WHERE regulator = 'FINRA'
        AND source_url = ${FINRA_LEGACY_SOURCE_URL}
      RETURNING id
    `;
    if (deleted.length !== auditBeforeApply.legacyRows) {
      throw new Error(
        `FINRA remediation delete count changed inside the transaction (${auditBeforeApply.legacyRows} expected, ${deleted.length} selected); backup and deletion were rolled back.`,
      );
    }
    await txSql`SELECT public.refresh_all_fines()`;
    return { deleted: deleted.length, verifiedAudit };
  });
  console.log(`Remediated ${result.deleted} FINRA legacy rows under remediation ${remediationId}.`);
  console.log(`Restore with: npm run data-trust:remediate-finra-legacy -- --restore`);
  return remediationId;
}

async function restoreLatest(sql: SqlClient) {
  const [backup] = await sql`
    SELECT remediation_id, COUNT(*)::int AS row_count
    FROM public.finra_legacy_row_backup
    GROUP BY remediation_id
    ORDER BY MAX(backed_up_at) DESC
    LIMIT 1
  `;
  if (!backup) throw new Error("No FINRA legacy remediation backup is available to restore.");

  const result = await sql.begin(async (transaction) => {
    const txSql = transaction as unknown as SqlClient;
    const restored = await txSql`
      INSERT INTO public.eu_fines (
        id, content_hash, regulator, regulator_full_name, country_code, country_name,
        firm_individual, firm_category, amount, currency, amount_eur, amount_gbp,
        date_issued, year_issued, month_issued, breach_type, breach_categories, summary,
        final_notice_url, source_url, raw_payload, scraped_at, created_at, updated_at
      )
      SELECT (row_data->>'id')::uuid, row_data->>'content_hash', row_data->>'regulator',
        row_data->>'regulator_full_name', row_data->>'country_code', row_data->>'country_name',
        row_data->>'firm_individual', row_data->>'firm_category',
        NULLIF(NULLIF(row_data->>'amount',''),'NaN')::numeric,
        row_data->>'currency',
        NULLIF(NULLIF(row_data->>'amount_eur',''),'NaN')::numeric,
        NULLIF(NULLIF(row_data->>'amount_gbp',''),'NaN')::numeric,
        NULLIF(row_data->>'date_issued','')::date, NULLIF(row_data->>'year_issued','')::int,
        NULLIF(row_data->>'month_issued','')::int, row_data->>'breach_type', row_data->'breach_categories',
        row_data->>'summary', row_data->>'final_notice_url', row_data->>'source_url', row_data->'raw_payload',
        NULLIF(row_data->>'scraped_at','')::timestamptz, NULLIF(row_data->>'created_at','')::timestamptz,
        NULLIF(row_data->>'updated_at','')::timestamptz
      FROM public.finra_legacy_row_backup
      WHERE remediation_id = ${backup.remediation_id}
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `;
    await txSql`SELECT public.refresh_all_fines()`;
    return restored.length;
  });
  console.log(`Restored ${result} FINRA rows from remediation ${backup.remediation_id}.`);
  return backup.remediation_id as string;
}

export function parseFinraRemediationArgs(args: string[]) {
  const normalizedArgs = args.filter((arg) => arg !== "--");
  const apply = normalizedArgs.includes("--apply");
  const restore = normalizedArgs.includes("--restore");
  const unknown = normalizedArgs.filter((arg) => arg !== "--apply" && arg !== "--restore");
  if (unknown.length > 0 || (apply && restore)) {
    throw new Error("Usage: --apply, --restore, or no flag for read-only audit (flags are mutually exclusive).");
  }
  return { apply, restore };
}

export async function main(args = process.argv.slice(2)) {
  const { apply, restore } = parseFinraRemediationArgs(args);
  const sql = databaseClient();
  try {
    if (restore) {
      await restoreLatest(sql);
      return;
    }

    const { officialRows, audit } = await loadCoverageAudit(sql);
    printAudit(audit, officialRows.length);
    if (!apply) {
      console.log("Read-only mode. Re-run with --apply only after reviewing the exact audit counts.");
      return;
    }
    if (!canApplyFinraRemediation(audit)) {
      throw new Error(
        `FINRA remediation coverage gate failed: ${audit.emptyCaseNumbers} empty case number(s), ${audit.missingCaseNumbers.length} case number(s) missing from official export.`,
      );
    }
    await applyRemediation(sql, audit);
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
