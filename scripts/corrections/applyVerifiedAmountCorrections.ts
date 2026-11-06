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
  corrections: Array<{ table: "eu_fines" | "uk_enforcement_actions"; id: string; expectedAmount: number; newAmount: number; currency: string; evidenceUrl: string; quote: string }>;
  duplicateSuppressions: Array<{ regulator: string; evidenceUrl: string; verificationUrl: string; reason: string }>;
};

async function main() {
  requireExpectedDbTarget("verified amount corrections");
  const url = resolveConnectionString()!.trim();
  const sql = postgres(url, { max: 1, ssl: url.includes("sslmode=") ? { rejectUnauthorized: false } : false });
  let changed = 0;
  try {
    for (const c of data.corrections) {
      const amountCol = c.table === "eu_fines" ? "amount" : "amount_original";
      const rows = await sql.unsafe(`SELECT id::text, ${amountCol}::float AS amount, currency FROM ${c.table} WHERE id::text = $1`, [c.id]);
      const row = rows[0] as unknown as { amount: number | null; currency: string } | undefined;
      if (!row) { console.log(JSON.stringify({ id: c.id, status: "missing" })); continue; }
      if (row.amount !== null && Math.abs(row.amount - c.newAmount) < 0.005) { console.log(JSON.stringify({ id: c.id, status: "already-correct" })); continue; }
      if (row.amount === null || Math.abs(row.amount - c.expectedAmount) > 0.005 || row.currency.toUpperCase() !== c.currency) {
        console.log(JSON.stringify({ id: c.id, status: "SKIPPED: stored value is not the expected wrong value", stored: row })); continue;
      }
      const gbp = c.currency === "GBP" ? c.newAmount : convertToGbp(c.newAmount, c.currency);
      const eur = convertToEur(c.newAmount, c.currency);
      console.log(JSON.stringify({ id: c.id, table: c.table, before: row.amount, after: c.newAmount, gbp, eur, evidence: c.evidenceUrl }));
      if (apply) {
        await sql.unsafe(
          `UPDATE ${c.table} SET ${amountCol} = $2, amount_gbp = $3, amount_eur = $4, updated_at = now() WHERE id::text = $1 AND ${amountCol} = $5`,
          [c.id, c.newAmount, gbp, eur, c.expectedAmount],
        );
      }
      changed++;
    }
    for (const d of data.duplicateSuppressions) {
      const key = await sql.unsafe(`SELECT public.normalise_regulatory_evidence_url($1) AS k`, [d.evidenceUrl]);
      const existing = await sql.unsafe(`SELECT quality_status FROM regulatory_amount_overrides WHERE regulator = $1 AND evidence_url = $2`, [d.regulator, key[0].k]);
      console.log(JSON.stringify({ suppress: d.evidenceUrl, existing: existing[0]?.quality_status ?? null }));
      if (apply && !existing.length) {
        await sql.unsafe(
          `INSERT INTO regulatory_amount_overrides (regulator, evidence_url, amount_original, currency, amount_gbp, amount_eur, verification_url, reason, verified_at, quality_status)
           VALUES ($1, $2, NULL, 'GBP', NULL, NULL, $3, $4, now(), 'duplicate_suppressed')`,
          [d.regulator, key[0].k, d.verificationUrl, d.reason],
        );
        changed++;
      }
    }
    if (apply) await refreshViewsStandalone(["all_regulatory_fines", "all_regulatory_fines_canonical"]);
    console.log(JSON.stringify({ mode: apply ? "APPLY" : "DRY RUN", changed }));
  } finally {
    await sql.end({ timeout: 5 });
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
