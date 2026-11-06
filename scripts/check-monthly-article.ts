#!/usr/bin/env npx tsx
/**
 * Run the repo's deterministic editorial quality + evidence gate over a monthly
 * "FCA Fines <Month> 2026" article, using that month's records from fca_fines
 * (read-only) as the source set. No model calls.
 *   npx tsx scripts/check-monthly-article.ts --slug=fca-fines-august-2026 --year=2026 --month=8
 */
import pg from "pg";
import { resolveConnectionString, buildPgPoolConfig } from "../server/db.js";
import { runQualityGate, formatQualityReport, getArticleQualityWordRange } from "./lib/articleQuality.js";
import { allBlogArticles } from "../src/data/blogArticles.js";
import type { EnforcementRecord } from "./lib/articleData.js";

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];

async function main() {
  const article = allBlogArticles.find((a) => a.slug === arg("slug"));
  if (!article) throw new Error("Unknown slug");
  const pool = new pg.Pool(buildPgPoolConfig(resolveConnectionString()!));
  try {
    const r = await pool.query(
      `SELECT id, regulator, firm_individual, amount::float AS amount, currency,
       to_char(date_issued AT TIME ZONE 'Europe/London','YYYY-MM-DD') AS date_issued,
       breach_type, summary, final_notice_url
       FROM fca_fines
       WHERE EXTRACT(YEAR FROM date_issued AT TIME ZONE 'Europe/London') = $1
         AND EXTRACT(MONTH FROM date_issued AT TIME ZONE 'Europe/London') = $2
       ORDER BY date_issued`,
      [Number(arg("year")), Number(arg("month"))],
    );
    const records: EnforcementRecord[] = r.rows.map((v) => ({
      id: v.id, regulator: v.regulator, firm_individual: v.firm_individual,
      amount: Number(v.amount), currency: String(v.currency).toUpperCase(), amount_gbp: Number(v.amount),
      date_issued: v.date_issued, breach_type: v.breach_type ?? "", summary: v.summary ?? "",
      notice_url: v.final_notice_url ?? "", source_url: v.final_notice_url ?? "", amount_verified: true,
    }));
    console.log(`${records.length} source records`);
    const report = runQualityGate(
      { title: article.title, excerpt: article.excerpt, content: article.content, keywords: article.keywords },
      records, getArticleQualityWordRange(article.articleType));
    console.log(formatQualityReport(report));
    process.exit(report.passed ? 0 : 1);
  } finally {
    await pool.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
