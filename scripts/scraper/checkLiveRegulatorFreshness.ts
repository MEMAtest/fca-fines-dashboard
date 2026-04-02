import "dotenv/config";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  buildLiveRegulatorHealthReport,
  getTargetLiveRegulatorCodes,
  type LiveRegulatorCadence,
  type LiveRegulatorStatsRow,
} from "./lib/liveRegulatorHealth.js";
import { createSqlClient, requireDatabaseUrl } from "./lib/euFineHelpers.js";

interface CliOptions {
  cadence: LiveRegulatorCadence | "all";
  json: boolean;
  regulator: string | null;
}

export async function loadLiveRegulatorStats() {
  requireDatabaseUrl();
  const sql = createSqlClient();

  try {
    const rows = await sql`
      SELECT
        regulator,
        COUNT(*)::int AS "recordCount",
        MIN(date_issued)::text AS "earliestRecordDate",
        MAX(date_issued)::text AS "latestRecordDate"
      FROM all_regulatory_fines
      GROUP BY regulator
    `;

    return rows.map((row) => ({
      regulator: String(row.regulator),
      recordCount: Number(row.recordCount ?? 0),
      earliestRecordDate: row.earliestRecordDate
        ? String(row.earliestRecordDate)
        : null,
      latestRecordDate: row.latestRecordDate
        ? String(row.latestRecordDate)
        : null,
    }));
  } finally {
    await sql.end();
  }
}

function parseCliOptions(): CliOptions {
  const cadence = getStringArg("cadence");
  const regulator = getStringArg("regulator");

  return {
    cadence: cadence === "daily" || cadence === "fragile" ? cadence : "all",
    json: process.argv.includes("--json"),
    regulator: regulator ? regulator.toUpperCase() : null,
  };
}

function getStringArg(name: string) {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length).trim() : null;
}

function printHumanReport(
  results: ReturnType<typeof buildLiveRegulatorHealthReport>,
) {
  console.log("Live regulator freshness report\n");

  for (const result of results) {
    const statusIcon =
      result.status === "ok"
        ? "OK"
        : result.status === "warning"
          ? "WARN"
        : result.status === "stale"
          ? "STALE"
          : "MISSING";

    console.log(
      `${statusIcon} ${result.regulator} | cadence=${result.cadence} | confidence=${result.confidence} | records=${result.recordCount} | latest=${result.latestRecordDate ?? "none"} | ageDays=${result.ageDays ?? "n/a"}`,
    );
    console.log(`   ${result.message}`);
    console.log(`   Source contract: ${result.sourceContractSummary}`);
    console.log(`   Operator action: ${result.operatorAction}`);
  }
}

function writeGitHubSummary(
  results: ReturnType<typeof buildLiveRegulatorHealthReport>,
  checked: number,
  failing: number,
) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) {
    return;
  }

  const lines = [
    "## Live regulator freshness",
    "",
    `Checked ${checked} live regulators; ${failing} require attention.`,
    "",
    "| Regulator | Status | Cadence | Records | Latest | Guidance |",
    "| --- | --- | --- | ---: | --- | --- |",
    ...results.map(
      (result) =>
        `| ${result.regulator} | ${result.status.toUpperCase()} | ${result.cadence} | ${result.recordCount} | ${result.latestRecordDate ?? "none"} | ${result.operatorAction} |`,
    ),
    "",
  ];

  appendFileSync(summaryPath, `${lines.join("\n")}\n`);
}

export async function main() {
  const options = parseCliOptions();
  const rows = await loadLiveRegulatorStats();
  const results = options.regulator
    ? buildLiveRegulatorHealthReport(rows, "all").filter(
        (result) => result.regulator === options.regulator,
      )
    : buildLiveRegulatorHealthReport(rows, options.cadence);

  const targetCodes = options.regulator
    ? [options.regulator]
    : getTargetLiveRegulatorCodes(options.cadence);
  const failing = results.filter((result) => result.status !== "ok");
  const payload = {
    generatedAt: new Date().toISOString(),
    cadence: options.regulator ? "single" : options.cadence,
    regulatorsChecked: targetCodes,
    totals: {
      checked: results.length,
      failing: failing.length,
    },
    results,
  };

  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    printHumanReport(results);
    console.log("");
    console.log(
      `Checked ${payload.totals.checked} live regulators; ${payload.totals.failing} require attention.`,
    );
  }

  writeGitHubSummary(results, payload.totals.checked, payload.totals.failing);

  if (results.length === 0) {
    throw new Error(
      options.regulator
        ? `No live regulator health data found for ${options.regulator}.`
        : "No live regulators were evaluated.",
    );
  }

  if (failing.length > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("Live regulator freshness check failed:", error);
    process.exit(1);
  });
}
