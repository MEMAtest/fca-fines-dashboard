import { readdirSync, readFileSync, existsSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Final gate for the scheduled scraper workflows.
 *
 * Scraper matrix steps are continue-on-error, so a red scraper never turned the
 * workflow red and sources went stale for months unnoticed. This gate joins the
 * per-scraper outcome summaries with the freshness report and FAILS the run
 * when a regulator is past its freshness limit AND its scraper did not succeed
 * (or never reported, which is what a dead Hetzner cron looks like).
 * A stale source whose scraper succeeded is only a warning (a quiet regulator).
 */

export interface FreshnessResultLike {
  regulator: string;
  severity: string;
  ageDays: number | null;
  freshnessWindowDays: number;
}

export interface OutcomeLike {
  status?: string;
  qualityStatus?: string;
  errorMessage?: string | null;
}

export interface GateFinding {
  regulator: string;
  ageDays: number | null;
  scraper: "failed" | "quarantined" | "no-report" | "succeeded";
  detail: string;
  fatal: boolean;
}

export function evaluateGate(
  results: FreshnessResultLike[],
  outcomes: Map<string, OutcomeLike>,
): GateFinding[] {
  const findings: GateFinding[] = [];
  for (const result of results) {
    if (result.severity !== "action_required" && result.severity !== "critical") continue;
    const outcome = outcomes.get(result.regulator.toUpperCase());
    let scraper: GateFinding["scraper"];
    let detail: string;
    if (!outcome) {
      scraper = "no-report";
      detail = "no scraper outcome was reported by this workflow (not scheduled here, or it died before writing a summary)";
    } else if (outcome.qualityStatus === "quarantined") {
      scraper = "quarantined";
      detail = outcome.errorMessage || "batch quarantined";
    } else if (outcome.status && outcome.status !== "success") {
      scraper = "failed";
      detail = outcome.errorMessage || `status=${outcome.status}`;
    } else {
      scraper = "succeeded";
      detail = "scraper succeeded; the source itself has published nothing newer";
    }
    findings.push({
      regulator: result.regulator,
      ageDays: result.ageDays,
      scraper,
      detail: detail.slice(0, 200),
      fatal: scraper !== "succeeded",
    });
  }
  return findings;
}

export function loadOutcomes(dir: string): Map<string, OutcomeLike> {
  const outcomes = new Map<string, OutcomeLike>();
  if (!existsSync(dir)) return outcomes;
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        const match = entry.name.match(/^(.+)-scrape-summary\.json$/);
        if (!match) continue;
        try {
          outcomes.set(match[1].toUpperCase(), JSON.parse(readFileSync(full, "utf8")) as OutcomeLike);
        } catch {
          outcomes.set(match[1].toUpperCase(), { status: "error", errorMessage: "unreadable summary" });
        }
      }
    }
  };
  walk(dir);
  return outcomes;
}

function arg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length) ?? null;
}

/**
 * Regulators scheduled on another host (Hetzner) report no outcome file here.
 * Fall back to their latest scraper_runs row: a success/passed run in the last
 * 72h counts as "scraper succeeded", anything else (or nothing) stays a failure.
 */
export async function loadHostedOutcomes(codes: string[]): Promise<Map<string, OutcomeLike>> {
  const outcomes = new Map<string, OutcomeLike>();
  if (codes.length === 0) return outcomes;
  try {
    const { createSqlClient } = await import("../scraper/lib/euFineHelpers.js");
    const sql = createSqlClient();
    try {
      const rows = await sql`
        SELECT DISTINCT ON (upper(regulator)) upper(regulator) AS code, status, quality_status, error_message, started_at
        FROM scraper_runs
        WHERE upper(regulator) IN ${sql(codes.map((c) => c.toUpperCase()))}
          AND started_at > now() - interval '72 hours'
        ORDER BY upper(regulator), started_at DESC`;
      for (const row of rows) {
        outcomes.set(String(row.code), {
          status: String(row.status),
          qualityStatus: row.quality_status ? String(row.quality_status) : undefined,
          errorMessage: row.error_message ? String(row.error_message) : null,
        });
      }
    } finally {
      await sql.end();
    }
  } catch (error) {
    console.warn(`Could not read scraper_runs for hosted outcomes: ${error instanceof Error ? error.message : String(error)}`);
  }
  return outcomes;
}

export async function main() {
  const freshnessFile = arg("freshness");
  const outcomesDir = arg("outcomes") ?? "scraper-outcomes";
  if (!freshnessFile || !existsSync(freshnessFile)) {
    throw new Error(`Freshness report not found (${freshnessFile}); the freshness step itself failed.`);
  }
  const report = JSON.parse(readFileSync(freshnessFile, "utf8")) as { results: FreshnessResultLike[] };
  const outcomes = loadOutcomes(outcomesDir);
  const missing = report.results
    .filter((r) => (r.severity === "action_required" || r.severity === "critical") && !outcomes.has(r.regulator.toUpperCase()))
    .map((r) => r.regulator);
  for (const [code, outcome] of await loadHostedOutcomes(missing)) outcomes.set(code, outcome);
  const findings = evaluateGate(report.results, outcomes);
  const fatal = findings.filter((f) => f.fatal);
  const lines = [
    "## Scraper delivery gate",
    "",
    fatal.length === 0 ? "No regulator is both stale and failing." : `${fatal.length} regulator(s) are past their freshness limit and their scraper did not succeed.`,
    "",
    "| Regulator | Age (days) | Scraper | Detail |",
    "| --- | ---: | --- | --- |",
    ...findings.map((f) => `| ${f.regulator}${f.fatal ? " (FAIL)" : ""} | ${f.ageDays ?? "n/a"} | ${f.scraper} | ${f.detail.replace(/\|/g, "/")} |`),
  ];
  console.log(lines.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
  for (const f of fatal) {
    console.log(`::error title=${f.regulator} stale and failing::${f.ageDays ?? "?"} days old; scraper ${f.scraper}: ${f.detail}`);
  }
  if (fatal.length > 0) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
