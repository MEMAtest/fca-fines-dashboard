#!/usr/bin/env npx tsx
/**
 * Amount outlier monitor (read-only by default; fail closed).
 *   npx tsx scripts/monitoring/checkAmountOutliers.ts             # list candidates, exit 1 if any unreviewed
 *   npx tsx scripts/monitoring/checkAmountOutliers.ts --quarantine # also queue them in regulatory_case_amount_reviews
 * Queued rows get requires_amount_review = true, so the canonical/trusted views
 * withhold the amount from rankings until a human approves (or the source is fixed).
 * Confirmed-correct rows go in scripts/monitoring/data/reviewedAmountOutliers.json.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { requireExpectedDbTarget, resolveConnectionString } from "../lib/dbTarget.js";
import { refreshViewsStandalone } from "../scraper/lib/refreshViews.js";
import { findAmountOutliers, type OutlierRow } from "../lib/amountOutliers.js";

const here = dirname(fileURLToPath(import.meta.url));
const quarantine = process.argv.includes("--quarantine");

async function main() {
  requireExpectedDbTarget("amount outlier monitor");
  const url = resolveConnectionString()?.trim();
  if (!url) throw new Error("No database connection string");
  const sql = postgres(url, { max: 1, ssl: url.includes("sslmode=") ? { rejectUnauthorized: false } : false });
  const reviewed = new Set<string>(Object.keys(JSON.parse(readFileSync(join(here, "data", "reviewedAmountOutliers.json"), "utf8")).reviewed ?? {}));
  const rows = (await sql.unsafe(
    `SELECT id, regulator, firm_individual, to_char(date_issued,'YYYY-MM-DD') AS date_issued,
            amount_original::float AS amount_original, currency, amount_gbp::float AS amount_gbp, summary, breach_type, notice_url,
            amount_quality, requires_amount_review
       FROM public.all_regulatory_fines_trusted`)) as unknown as OutlierRow[];
  const found = findAmountOutliers(rows, reviewed);
  for (const c of found) console.log(`${c.rule}\t${c.row.regulator}\t${c.row.date_issued}\t${c.row.firm_individual.slice(0, 40)}\t${c.row.id}\t${c.detail}`);
  console.log(JSON.stringify({ candidates: found.length, quarantine }));
  if (quarantine && found.length) {
    const fresh: typeof found = [];
    for (const c of found) {
      const res = await sql.unsafe(
        `INSERT INTO regulatory_case_amount_reviews (source_row_id, review_status, reason, evidence_url)
         VALUES ($1, 'required', $2, $3)
         ON CONFLICT (source_row_id) DO NOTHING`,
        [c.row.id, `Amount outlier (${c.rule}): ${c.detail}`.slice(0, 500), ""],
      );
      if (res.count === 1) fresh.push(c);
    }
    if (fresh.length) {
      await refreshViewsStandalone(["all_regulatory_fines", "all_regulatory_fines_canonical"]);
      const report = [
        `The amount outlier monitor quarantined ${fresh.length} row(s): their amounts are now withheld from public rankings until reviewed.`,
        "",
        ...fresh.map((c) => `- ${c.row.regulator} | ${c.row.date_issued} | ${c.row.firm_individual} | ${c.row.id} | ${c.rule}: ${c.detail}`),
        "",
        "Verify each against the official notice. If the amount is right, add the id to scripts/monitoring/data/reviewedAmountOutliers.json and approve the review row; if wrong, add a correction to scripts/corrections/data/verifiedAmountCorrections.json.",
      ].join("\n");
      writeFileSync(process.env.OUTLIER_REPORT ?? "outlier-report.md", report);
      console.log(report);
    }
  }
  await sql.end();
  process.exit(found.length && !quarantine ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
