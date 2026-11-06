#!/usr/bin/env npx tsx
/**
 * Apply source-verified amount corrections to the SOURCE tables (compare-and-set:
 * a row is only changed when it still holds the expected wrong amount), plus
 * duplicate-suppression overrides, then refresh the materialised views. Every entry
 * in data/verifiedAmountCorrections.json carries the evidence URL and quote.
 *
 * RUN VIA .github/workflows/verified-amount-corrections.yml (dry run by default;
 * DB host/name guard). Nothing is deleted; content_hash is untouched.
 */
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { requireExpectedDbTarget, resolveConnectionString } from "../lib/dbTarget.js";
import { convertToEur, convertToGbp } from "../scraper/lib/euFineHelpers.js";
import { refreshViewsStandalone } from "../scraper/lib/refreshViews.js";

const apply = process.argv.includes("--apply");
const here = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(here, "data", "verifiedAmountCorrections.json"), "utf8")) as {
  corrections: Array<{ table: "eu_fines" | "uk_enforcement_actions"; id: string; expectedAmount: number; newAmount: number | null; currency: string; evidenceUrl: string; quote: string }>;
  nameCorrections: Array<{ table: "eu_fines" | "uk_enforcement_actions"; id: string; expectedName: string; newName: string; reason: string }>;
  suppressions: Array<{ sourceRowId: string; regulator: string; replacementSourceRowId: string; reason: string }>;
};

async function main() {
  requireExpectedDbTarget("verified amount corrections");
  const url = resolveConnectionString()!.trim();
  const sql = postgres(url, { max: 1, ssl: url.includes("sslmode=") ? { rejectUnauthorized: false } : false });
  let changed = 0;
  const failures: string[] = [];
  try {
    for (const c of data.corrections) {
      const amountCol = c.table === "eu_fines" ? "amount" : "amount_original";
      const rows = await sql.unsafe(`SELECT id::text, ${amountCol}::float AS amount, currency FROM ${c.table} WHERE id::text = $1`, [c.id]);
      const row = rows[0] as unknown as { amount: number | null; currency: string } | undefined;
      if (!row) { console.log(JSON.stringify({ id: c.id, status: "missing" })); failures.push(`${c.id}: missing`); continue; }
      const already = c.newAmount === null ? row.amount === null : row.amount !== null && Math.abs(row.amount - c.newAmount) < 0.005;
      if (already) { console.log(JSON.stringify({ id: c.id, status: "already-correct" })); continue; }
      if (row.amount === null || Math.abs(row.amount - c.expectedAmount) > 0.005 || row.currency.toUpperCase() !== c.currency) {
        console.log(JSON.stringify({ id: c.id, status: "SKIPPED: stored value is not the expected wrong value", stored: row })); failures.push(`${c.id}: unexpected stored value`); continue;
      }
      const gbp = c.newAmount === null ? null : c.currency === "GBP" ? c.newAmount : convertToGbp(c.newAmount, c.currency);
      const eur = c.newAmount === null ? null : convertToEur(c.newAmount, c.currency);
      console.log(JSON.stringify({ id: c.id, table: c.table, before: row.amount, after: c.newAmount, gbp, eur, evidence: c.evidenceUrl }));
      if (apply) {
        const res = await sql.unsafe(
          `UPDATE ${c.table} SET ${amountCol} = $2, amount_gbp = $3, amount_eur = $4, updated_at = now() WHERE id::text = $1 AND ${amountCol} = $5`,
          [c.id, c.newAmount, gbp, eur, c.expectedAmount],
        );
        if (res.count !== 1) { failures.push(`${c.id}: compare-and-set matched ${res.count} rows`); continue; }
      }
      changed++;
    }
    for (const n of data.nameCorrections) {
      console.log(JSON.stringify({ rename: n.id, to: n.newName }));
      if (apply) {
        const res = await sql.unsafe(`UPDATE ${n.table} SET firm_individual = $2, updated_at = now() WHERE id::text = $1 AND firm_individual = $3`, [n.id, n.newName, n.expectedName]);
        if (res.count !== 1) { failures.push(`${n.id}: rename matched ${res.count} rows`); continue; }
      }
      changed++;
    }
    for (const sRow of data.suppressions) {
      const exists = await sql.unsafe(`SELECT 1 FROM public.regulatory_case_suppressions WHERE source_row_id = $1`, [sRow.sourceRowId]);
      const target = await sql.unsafe(`SELECT 1 FROM public.all_regulatory_fines WHERE id = $1`, [sRow.sourceRowId]);
      const replacement = await sql.unsafe(`SELECT 1 FROM public.all_regulatory_fines WHERE id = $1`, [sRow.replacementSourceRowId]);
      console.log(JSON.stringify({ suppress: sRow.sourceRowId, existing: exists.length > 0, rowFound: target.length > 0, replacementFound: replacement.length > 0 }));
      if (!target.length || !replacement.length) { failures.push(`${sRow.sourceRowId}: row or replacement missing`); continue; }
      if (apply && !exists.length) {
        const res = await sql.unsafe(
          `INSERT INTO public.regulatory_case_suppressions (source_row_id, regulator, reason, replacement_source_row_id) VALUES ($1, $2, $3, $4)`,
          [sRow.sourceRowId, sRow.regulator, sRow.reason, sRow.replacementSourceRowId],
        );
        if (res.count !== 1) { failures.push(`${sRow.sourceRowId}: suppression insert matched ${res.count} rows`); continue; }
        changed++;
      }
    }
    if (apply) await refreshViewsStandalone(["all_regulatory_fines", "all_regulatory_fines_canonical"]);
    console.log(JSON.stringify({ mode: apply ? "APPLY" : "DRY RUN", changed, failures }));
    if (failures.length) process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
