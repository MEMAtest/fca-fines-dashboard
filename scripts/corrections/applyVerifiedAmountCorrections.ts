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
const splitData = JSON.parse(readFileSync(join(here, "data", "amfRespondentSplits.json"), "utf8")) as {
  splits: Array<{ originalId: string; expectedAmount: number; decisionDate: string; noticeUrl: string; parts: Array<{ firm: string; category: string; amount: number }> }>;
};
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
    // Per-respondent splits of combined "respectively" rows. Reversible: new rows carry
    // raw_payload.splitFrom; undo = DELETE those rows and the original's suppression.
    for (const sp of splitData.splits) {
      const rows = await sql.unsafe(`SELECT amount::float AS amount, currency FROM eu_fines WHERE id::text = $1 AND regulator = 'AMF'`, [sp.originalId]);
      const orig = rows[0] as unknown as { amount: number | null; currency: string } | undefined;
      const sum = sp.parts.reduce((t, p) => t + p.amount, 0);
      const done = await sql.unsafe(`SELECT 1 FROM public.regulatory_case_suppressions WHERE source_row_id = $1`, [sp.originalId]);
      console.log(JSON.stringify({ split: sp.originalId, storedAmount: orig?.amount ?? null, partsSum: sum, parts: sp.parts.map((p) => `${p.firm}=${p.amount}`), alreadySplit: done.length > 0 }));
      if (!orig) { failures.push(`${sp.originalId}: split source row missing`); continue; }
      if (done.length) continue;
      if (orig.amount === null || Math.abs(orig.amount - sp.expectedAmount) > 0.005) { failures.push(`${sp.originalId}: stored amount ${orig.amount} is not the expected ${sp.expectedAmount}`); continue; }
      if (!apply) { changed++; continue; }
      // Inserts and the suppression of the original commit together or not at all.
      try {
        await sql.begin(async (tx) => {
          let firstId: string | null = null;
          for (const [i, part] of sp.parts.entries()) {
            const gbp = convertToGbp(part.amount, "EUR");
            const res = await tx.unsafe(
              `INSERT INTO eu_fines (content_hash, regulator, regulator_full_name, country_code, country_name, firm_individual, firm_category, amount, currency, amount_eur, amount_gbp, date_issued, year_issued, month_issued, breach_type, breach_categories, summary, final_notice_url, source_url, raw_payload)
               SELECT encode(sha256(convert_to('split|' || o.id::text || '|' || $2::text, 'utf8')), 'hex'), o.regulator, o.regulator_full_name, o.country_code, o.country_name, $2::text, $3::text, $4::numeric, 'EUR', $4::numeric, $5::numeric, o.date_issued, o.year_issued, o.month_issued, o.breach_type, o.breach_categories,
                      'AMF Enforcement Committee decision of ' || $6::text || ': fine of EUR ' || $4::numeric::text || ' on ' || $2::text || '.', o.final_notice_url, o.source_url,
                      jsonb_build_object('splitFrom', o.id::text, 'splitIndex', $7::int, 'noticeUrl', $8::text, 'decisionDate', $6::text, 'verifiedAt', now())
                 FROM eu_fines o WHERE o.id::text = $1
               ON CONFLICT (content_hash) DO NOTHING RETURNING id::text`,
              [sp.originalId, part.firm, part.category, part.amount, gbp, sp.decisionDate, i, sp.noticeUrl],
            );
            if (res.length !== 1) throw new Error(`${sp.originalId}: split part ${part.firm} inserted ${res.length} rows`);
            if (i === 0) firstId = (res[0] as unknown as { id: string }).id;
          }
          await tx.unsafe(
            `INSERT INTO public.regulatory_case_suppressions (source_row_id, regulator, reason, replacement_source_row_id) VALUES ($1, 'AMF', $2, $3)`,
            [sp.originalId, "Combined 'respectively' row replaced by one row per respondent (see raw_payload.splitFrom).", firstId],
          );
        });
        changed++;
      } catch (e) {
        failures.push(`${sp.originalId}: split rolled back: ${(e as Error).message}`);
      }
    }
    const ids = data.suppressions.map((x) => x.sourceRowId).concat(splitData.splits.map((x) => x.originalId));
    const gone = await sql.unsafe(`SELECT id, regulator, firm_individual, date_issued::text AS date_issued, amount_gbp::float AS amount_gbp FROM public.all_regulatory_fines_canonical WHERE id = ANY($1::text[]) ORDER BY regulator, date_issued DESC`, [ids]);
    console.log(`WILL DISAPPEAR FROM CANONICAL (new suppressions, after the view migration): ${gone.length}`);
    for (const g of gone) console.log(JSON.stringify(g));
    if (apply) await refreshViewsStandalone(["all_regulatory_fines", "all_regulatory_fines_canonical"]);
    console.log(JSON.stringify({ mode: apply ? "APPLY" : "DRY RUN", changed, failures }));
    if (failures.length) process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
