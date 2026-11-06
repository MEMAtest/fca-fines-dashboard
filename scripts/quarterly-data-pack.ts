#!/usr/bin/env npx tsx
/**
 * Build the deterministic quarterly data pack from the live DB (read-only) and
 * write docs/data-packs/<YYYY>-Q<n>.json plus a draft article skeleton.
 * No model calls. Usage: npx tsx scripts/quarterly-data-pack.ts [--year=2026 --quarter=3]
 * Default: the most recently completed quarter.
 */
import pg from "pg";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { resolveConnectionString, buildPgPoolConfig } from "../server/db.js";
import { OFFICIAL_REGULATORY_HOSTS, PENALTY_LANGUAGE, NON_PENALTY_LANGUAGE } from "./lib/editorialWorkflow.js";
import { buildPack, classify, priorWindows, quarterWindow, type PackRow, type Attestations } from "./lib/quarterlyDataPack.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];

function defaultQuarter() {
  const now = new Date();
  const q = Math.floor(now.getUTCMonth() / 3); // current quarter index 0..3
  return q === 0 ? { year: now.getUTCFullYear() - 1, quarter: 4 } : { year: now.getUTCFullYear(), quarter: q };
}

const COLS = `id, regulator, country_name, firm_individual, amount_original::float AS amount_original, currency,
  amount_gbp::float AS amount_gbp, to_char(date_issued,'YYYY-MM-DD') AS date_issued, breach_type, breach_categories, summary, notice_url, source_url`;

async function rows(c: pg.PoolClient, w: { start: string; end: string }) {
  const r = await c.query(`SELECT ${COLS} FROM all_regulatory_fines WHERE date_issued BETWEEN $1 AND $2`, [w.start, w.end]);
  return r.rows as PackRow[];
}

/** Independent SQL formulation of the headline numbers (does not share JS classification). */
async function sqlTotals(c: pg.PoolClient, w: { start: string; end: string }, excludeIds: string[]) {
  const hosts = OFFICIAL_REGULATORY_HOSTS.map((h) => h.replace(/\./g, "\\.")).join("|");
  const pen = PENALTY_LANGUAGE.source.replace(/\\b/g, "\\y").replace(/\(\?:ß\|ss\)/g, "(ß|ss)");
  const non = NON_PENALTY_LANGUAGE.source.replace(/\\b/g, "\\y").replace(/\(\?:/g, "(");
  const r = await c.query(
    `WITH base AS (
       SELECT id, amount_gbp, COALESCE(NULLIF(notice_url,''), source_url, '') AS u,
              COALESCE(breach_type,'') || ' ' || COALESCE(summary,'') AS corpus
       FROM all_regulatory_fines WHERE date_issued >= $1::date AND date_issued <= $2::date)
     SELECT (SELECT COUNT(*) FROM (SELECT DISTINCT regulator, firm_individual, date_issued, LEFT(COALESCE(summary,''),120) FROM all_regulatory_fines WHERE date_issued >= $1::date AND date_issued <= $2::date) d)::int AS actions,
            COUNT(*) FILTER (WHERE amount_gbp > 0 AND u ~* ('^https?://([^/]*\\.)?(' || $3 || ')(/|$|:)') AND corpus ~* $4 AND corpus !~* $5 AND id <> ALL($6::text[]))::int AS penalties,
            COALESCE(SUM(amount_gbp) FILTER (WHERE amount_gbp > 0 AND u ~* ('^https?://([^/]*\\.)?(' || $3 || ')(/|$|:)') AND corpus ~* $4 AND corpus !~* $5 AND id <> ALL($6::text[])),0)::float AS value
     FROM base`, [w.start, w.end, hosts, pen, non, excludeIds]);
  return r.rows[0] as { actions: number; penalties: number; value: number };
}

const n = (v: number) => v.toLocaleString("en-GB");
const gbpFmt = (v: number) => `£${v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Figures-only skeleton: every number is from the pack; prose is left for an editor. */
function renderDraft(p: ReturnType<typeof buildPack> & { generatedAt: string; crossChecks: string[] }) {
  const L: string[] = [];
  L.push(`# State of Global Enforcement: ${p.quarter.replace("-", " ")} Data Study (DRAFT)`, "");
  L.push(`Pack generated ${p.generatedAt.slice(0, 10)} from the live database. Window ${p.window.start} to ${p.window.end}.`, "");
  L.push("Independent SQL cross-check:", ...p.crossChecks.map((c) => `- ${c}`), "");
  L.push("## Headline", "", "| Measure | This quarter | Previous quarter | Same quarter last year |", "| --- | --- | --- | --- |");
  L.push(`| Distinct actions | ${n(p.current.actions)} | ${n(p.qoq.actions)} | ${n(p.yoy.actions)} |`);
  L.push(`| Verified penalties | ${n(p.current.penalties)} | ${n(p.qoq.penalties)} | ${n(p.yoy.penalties)} |`);
  L.push(`| Verified value | ${gbpFmt(p.current.valueGbp)} | ${gbpFmt(p.qoq.valueGbp)} | ${gbpFmt(p.yoy.valueGbp)} |`, "");
  L.push(`Change vs previous quarter: actions ${p.qoq.actionsPct}%, penalties ${p.qoq.penaltiesPct}%, value ${p.qoq.valuePct}%. Change vs same quarter last year: actions ${p.yoy.actionsPct}%, penalties ${p.yoy.penaltiesPct}%, value ${p.yoy.valuePct}%.`, "");
  L.push("## Ten largest verified penalties", "", "| Date | Regulator | Respondent | GBP | Original |", "| --- | --- | --- | --- | --- |");
  for (const t of p.topFines) L.push(`| ${t.date} | ${t.regulator} | ${t.respondent} | ${gbpFmt(t.amountGbp)} | ${t.original} |`);
  L.push("", "## Regulators by actions", "", "| Regulator | Actions | Penalties | Value |", "| --- | --- | --- | --- |");
  for (const r of [...p.byRegulator].sort((a, b) => b.actions - a.actions || a.regulator.localeCompare(b.regulator)).slice(0, 10)) L.push(`| ${r.regulator} | ${n(r.actions)} | ${n(r.penalties)} | ${gbpFmt(r.valueGbp)} |`);
  L.push("", "## Themes (tags overlap)", "", ...p.byTheme.slice(0, 8).map((t) => `- ${t.theme}: ${n(t.actions)}`));
  const big = p.exclusions.current.filter((e) => e.amountGbp >= 1_000_000);
  L.push("", "## Needs an editor before publishing", "",
    `- ${p.exclusions.current.length} current-quarter records were excluded. Unattested amounts of GBP 1m or more must be checked against the official notice and added to docs/data-packs/attestations.json (attested or rejected):`,
    ...big.map((e) => `  - ${e.firm} (${e.regulator}) ${gbpFmt(e.amountGbp)}: ${e.reason}`),
    "- Also check the same for the year-ago and previous-quarter windows (see exclusions in the JSON).",
    "- Write the prose yourself, then run: npx tsx scripts/check-quarterly-article.ts --slug=<slug> --year=<y> --quarter=<q>", "");
  return L.join("\n");
}

async function main() {
  const { year, quarter } = arg("year") ? { year: Number(arg("year")), quarter: Number(arg("quarter")) } : defaultQuarter();
  const cs = resolveConnectionString();
  if (!cs) throw new Error("No DATABASE_URL");
  const pool = new pg.Pool(buildPgPoolConfig(cs));
  const c = await pool.connect();
  try {
    await c.query("SET default_transaction_read_only = on");
    const attFile = join(root, "docs", "data-packs", "attestations.json");
    const att: Attestations = existsSync(attFile) ? JSON.parse(readFileSync(attFile, "utf8")) : { attested: {} };
    const w = quarterWindow(year, quarter);
    const pw = priorWindows(year, quarter);
    const [cur, yoy, qoq] = [await rows(c, w), await rows(c, pw.yoy), await rows(c, pw.qoq)];
    const pack = buildPack(year, quarter, cur, yoy, qoq, att);
    // Independent cross-check for all three windows.
    const checks: string[] = [];
    for (const [label, win, set, got] of [["current", w, cur, pack.current], ["yoy", pw.yoy, yoy, pack.yoy], ["qoq", pw.qoq, qoq, pack.qoq]] as const) {
      const excl = classify(set, att).exclusions.map((e) => e.id);
      const s = await sqlTotals(c, win, excl);
      const ok = s.actions === got.actions && s.penalties === got.penalties && Math.abs(s.value - got.valueGbp) < 0.01;
      checks.push(`${label}: js=${got.actions}/${got.penalties}/${got.valueGbp} sql=${s.actions}/${s.penalties}/${s.value} ${ok ? "MATCH" : "MISMATCH"}`);
      if (!ok) { console.error(checks.join("\n")); throw new Error(`Independent SQL cross-check failed for ${label}`); }
    }
    const out = { generatedAt: new Date().toISOString(), crossChecks: checks, ...pack };
    const dir = join(root, "docs", "data-packs");
    mkdirSync(dir, { recursive: true });
    const base = join(dir, `${year}-Q${quarter}`);
    writeFileSync(`${base}.json`, JSON.stringify(out, null, 2) + "\n");
    writeFileSync(`${base}-draft.md`, renderDraft(out));
    console.log(checks.join("\n"));
    console.log(`Wrote ${base}.json`);
    const unresolved = pack.exclusions.current.length;
    if (unresolved) console.log(`NOTE: ${unresolved} current-quarter records excluded; review exclusions in the pack.`);
  } finally {
    c.release();
    await pool.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
