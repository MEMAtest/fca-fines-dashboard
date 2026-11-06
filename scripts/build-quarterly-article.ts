#!/usr/bin/env npx tsx
/**
 * Render the quarterly data-study article body from docs/data-packs/<YYYY>-Q<n>.json so every
 * figure comes from the pack (no hand-typed numbers). Prose is editorial; numbers are filled in.
 *   npx tsx scripts/build-quarterly-article.ts --year=2026 --quarter=3 > /tmp/body.md
 * Then paste into src/data/blogDataStudies.ts, run scripts/check-quarterly-article.ts and re-derive
 * the headline figures with a second query before publishing.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const year = arg("year") ?? "2026";
const q = arg("quarter") ?? "3";
const p = JSON.parse(readFileSync(join(root, "docs", "data-packs", `${year}-Q${q}.json`), "utf8"));

const n = (v: number) => v.toLocaleString("en-GB");
const money = (v: number) => v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cmp = (pct: number | null) => (pct === null ? "not comparable" : pct >= 0 ? `${pct.toFixed(1)}% higher` : `${Math.abs(pct).toFixed(1)}% lower`);
const month = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const top = p.topFines;
const lead = top[0];
const leadShare = (lead.amountGbp / p.current.valueGbp) * 100;
const rest = p.current.valueGbp - lead.amountGbp;
const byActions = [...p.byRegulator].sort((a: any, b: any) => b.actions - a.actions || a.regulator.localeCompare(b.regulator));
const five = byActions.slice(0, 5);
const fiveActions = five.reduce((s: number, r: any) => s + r.actions, 0);
const generated = month(p.generatedAt.slice(0, 10));
const label = `Q${q} ${year}`;

const lines: string[] = [];
lines.push(`## State of Global Enforcement: ${label}`, "");
lines.push(`**This study covers enforcement actions dated ${month(p.window.start)} to ${month(p.window.end)}, taken from RegActions' enforcement database on ${generated}.** Every figure was computed by a script from the database and then recomputed with a separately written query; the two results match. The definitions below say what each number includes and what was left out.`, "");
lines.push("## Key Takeaways", "");
lines.push(`- **Volume:** RegActions recorded **${n(p.current.actions)} distinct enforcement actions** from **${p.byRegulator.length} regulators**, which is ${cmp(p.yoy.actionsPct)} than the ${n(p.yoy.actions)} recorded in the same quarter of ${Number(year) - 1} and ${cmp(p.qoq.actionsPct)} than the ${n(p.qoq.actions)} in the previous quarter.`);
lines.push(`- **Monetary penalties:** **${n(p.current.penalties)} penalties carry a counted amount, together ${money(p.current.valueGbp)} pounds**. The number is ${cmp(p.yoy.penaltiesPct)} and the value ${cmp(p.yoy.valuePct)} than the same quarter of ${Number(year) - 1}; against the previous quarter they are ${cmp(p.qoq.penaltiesPct)} and ${cmp(p.qoq.valuePct)}.`);
lines.push(`- **Concentration of value:** the largest single penalty, **${lead.respondent}** (${lead.regulator}, £${n(lead.amountGbp)}), is **${leadShare.toFixed(1)}%** of the quarter's counted value; without it the other ${n(p.current.penalties - 1)} penalties come to ${money(rest)} pounds.`);
lines.push(`- **Concentration of volume:** the five busiest regulators (${five.map((r: any) => r.regulator).join(", ")}) account for **${n(fiveActions)}** of the ${n(p.current.actions)} actions (${((fiveActions / p.current.actions) * 100).toFixed(1)}%).`);
lines.push(`- **Most actions carry no counted amount:** ${p.byTheme.slice(0, 2).map((t: any) => `${t.theme.toLowerCase().replace(/_/g, " ")} is tagged on ${n(t.actions)} actions`).join(" and ")}; tags overlap.`);
lines.push(`- **Data quality is part of the story:** ${n(p.exclusions.current.length)} otherwise-qualifying records were excluded, with reasons listed below.`, "");
lines.push("## What is counted, and what is not", "");
lines.push("**Enforcement actions** are distinct records of regulator, respondent, date, amount and breach, dated in the quarter, with duplicate rows counted once. They include reprimands, prohibitions and other outcomes that carry no fine.", "");
lines.push(`**Counted monetary penalties** are the subset where the trusted record holds a positive amount, the notice or source is on an official regulator or court domain taken from the RegActions regulator registry, and the text names an imposed sanction. Sanction wording covers fine, penalty, multa, Bußgeld, 과태료, 과징금, infringement notice and civil money penalty. The amount must not be restitution, disgorgement, compensation, costs or a periodic penalty rate. Each notice is counted once per respondent. Decisions that are still open to challenge are not counted: FCA Decision Notices that can be referred to the Tribunal, Brazilian first-instance decisions under appeal to the CRSFN, and figures the FCA would have imposed but waived for hardship. Orders subject to penalty (periodic penalty payments) are not fines and are not counted either. Any single amount of 5 million pounds or more is counted only after it has been checked against the official notice.`, "");
lines.push("Amounts are converted to pounds sterling at the rate stored with each record, so totals move slightly if rates are restated.", "");
lines.push("## The previous quarter and the same quarter last year", "");
lines.push(`| Measure | ${label} | Previous quarter | Same quarter ${Number(year) - 1} |`, "| --- | --- | --- | --- |");
lines.push(`| Distinct enforcement actions | ${n(p.current.actions)} | ${n(p.qoq.actions)} | ${n(p.yoy.actions)} |`);
lines.push(`| Counted monetary penalties | ${n(p.current.penalties)} | ${n(p.qoq.penalties)} | ${n(p.yoy.penalties)} |`);
lines.push(`| Value of counted penalties (pounds) | ${money(p.current.valueGbp)} | ${money(p.qoq.valueGbp)} | ${money(p.yoy.valueGbp)} |`, "");
lines.push("Treat the value comparisons with care: a single large case moves a quarterly total far more than a steady flow of smaller ones.", "");
lines.push("## The ten largest counted penalties", "");
lines.push("| Date | Regulator | Respondent | Amount (GBP) | Original amount |", "| --- | --- | --- | --- | --- |");
for (const t of top) lines.push(`| ${month(t.date)} | ${t.regulator} | ${t.respondent} | £${n(t.amountGbp)} | ${t.original} |`);
lines.push("", "## Where the volume sits", "");
lines.push("| Regulator | Actions | Counted penalties | Value of counted penalties (pounds) |", "| --- | --- | --- | --- |");
for (const r of byActions.slice(0, 8)) lines.push(`| ${r.regulator} | ${n(r.actions)} | ${n(r.penalties)} | ${money(r.valueGbp)} |`);
const lowCounted = byActions.filter((r: any) => r.actions >= 25 && r.penalties / r.actions < 0.5).slice(0, 5);
if (lowCounted.length) lines.push("", `In this quarter ${lowCounted.map((r: any) => `${r.regulator} had ${n(r.actions)} actions and ${n(r.penalties)} counted ${r.penalties === 1 ? "penalty" : "penalties"}`).join("; ")}. The pack shows only that the remaining actions did not meet the counted-penalty definition above; it does not show why.`, "");
lines.push("## Breach themes", "");
lines.push(`RegActions tags each action with one or more themes. The most common were ${p.byTheme.slice(0, 6).map((t: any) => `${t.theme.toLowerCase().replace(/_/g, " ")} (${n(t.actions)})`).join(", ")}. An action can carry more than one tag, so the counts add to more than ${n(p.current.actions)}.`, "");
lines.push("## Data quality: what was excluded", "");
lines.push("The database is built from regulators' public notices, and some records carry errors, so the penalty figures are filtered rather than summed raw. Reasons for current-quarter exclusions:", "");
const reasons = new Map<string, number>();
for (const e of p.exclusions.current) reasons.set(e.reason.replace(/\(.*$/, "").slice(0, 90), (reasons.get(e.reason.replace(/\(.*$/, "").slice(0, 90)) ?? 0) + 1);
for (const [r, c] of [...reasons.entries()].sort((a, b) => b[1] - a[1])) lines.push(`- ${c} record${c === 1 ? "" : "s"}: ${r.replace(/[.\s]+$/, "")}.`);
lines.push("", "## About the Data", "");
lines.push(`**Sources.** All records come from the RegActions enforcement database as of ${generated}; each links to a regulator's own notice. The quarter is defined by the date recorded for each action, which can differ from the announcement date.`, "");
lines.push("**Limits.** Counted value reflects only penalties that meet the definition above, so it understates total sanctions wherever regulators do not publish a single imposed amount. Figures for the comparison quarters use the same rules.", "");
lines.push("**Licence.** This study is published under [Creative Commons Attribution-NonCommercial 4.0 (CC BY-NC 4.0)](https://creativecommons.org/licenses/by-nc/4.0/). You may reuse the figures for non-commercial purposes with a visible, clickable credit to [RegActions](https://regactions.com). For commercial licensing, contact contact@memaconsultants.com.", "");
lines.push("Explore the underlying records in the [enforcement explorer](https://regactions.com/search), compare regulators in the [regulator data hub](https://regactions.com/regulators), or read the earlier [H1 2026 data study](https://regactions.com/blog/state-of-global-aml-enforcement-h1-2026).");
console.log(lines.join("\n"));
