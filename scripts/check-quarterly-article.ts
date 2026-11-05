#!/usr/bin/env npx tsx
/**
 * Run the repo's editorial quality + evidence gate (scripts/lib/articleQuality.ts)
 * over a quarterly data-study article, using that quarter's verified penalty
 * records from the live DB (read-only) as the source set. No model calls.
 *   npx tsx scripts/check-quarterly-article.ts --slug=state-of-global-enforcement-q3-2026 --year=2026 --quarter=3
 */
import pg from "pg";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { resolveConnectionString, buildPgPoolConfig } from "../server/db.js";
import { classify, quarterWindow, type Attestations, type PackRow } from "./lib/quarterlyDataPack.js";
import { runQualityGate, formatQualityReport, getArticleQualityWordRange } from "./lib/articleQuality.js";
import { dataStudyArticles } from "../src/data/blogDataStudies.js";
import type { EnforcementRecord } from "./lib/articleData.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];

async function main() {
  const article = dataStudyArticles.find((a) => a.slug === arg("slug"));
  if (!article) throw new Error("Unknown slug");
  const w = quarterWindow(Number(arg("year")), Number(arg("quarter")));
  const pool = new pg.Pool(buildPgPoolConfig(resolveConnectionString()!));
  try {
    const r = await pool.query(
      `SELECT id, regulator, country_name, firm_individual, amount_original::float AS amount_original, currency,
       amount_gbp::float AS amount_gbp, to_char(date_issued,'YYYY-MM-DD') AS date_issued, breach_type, breach_categories, summary, notice_url, source_url
       FROM all_regulatory_fines WHERE date_issued BETWEEN $1 AND $2`, [w.start, w.end]);
    const attFile = join(root, "docs", "data-packs", "attestations.json");
    const att: Attestations = existsSync(attFile) ? JSON.parse(readFileSync(attFile, "utf8")) : { attested: {} };
    const { verified } = classify(r.rows as PackRow[], att);
    const records: EnforcementRecord[] = verified.map((v) => ({
      id: v.id, regulator: v.regulator, firm_individual: v.firm_individual,
      amount: Number(v.amount_original), currency: String(v.currency).toUpperCase(), amount_gbp: Number(v.amount_gbp),
      date_issued: v.date_issued, breach_type: v.breach_type ?? "", summary: v.summary ?? "",
      notice_url: v.notice_url ?? "", source_url: v.source_url ?? "", amount_verified: true,
    }));
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
