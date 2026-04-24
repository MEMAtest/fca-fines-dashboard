import "dotenv/config";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getSqlClient } from "../../server/db.js";
import {
  getUKEnforcementHealth,
  isFailingUKEnforcementHealth,
  type UKEnforcementHealthResult,
} from "../../server/services/ukEnforcementHealth.js";

function printHumanReport(results: UKEnforcementHealthResult[]) {
  console.log("UK enforcement health report\n");

  for (const result of results) {
    const status =
      result.status === "ok"
        ? "OK"
        : result.status === "warning"
          ? "WARN"
          : result.status.toUpperCase();

    console.log(
      `${status} ${result.regulator} | layer=${result.sourceLayer} | records=${result.recordCount} | latest=${result.latestDate ?? "none"} | run=${result.lastStatus ?? "n/a"}`,
    );
    console.log(`   ${result.message}`);
  }
}

function writeGitHubSummary(results: UKEnforcementHealthResult[]) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) {
    return;
  }

  const failing = results.filter(isFailingUKEnforcementHealth);
  const lines = [
    "## UK enforcement health",
    "",
    `Checked ${results.length} UK enforcement sources; ${failing.length} require attention.`,
    "",
    "| Source | Status | Records | Latest action | Latest run | Guidance |",
    "| --- | --- | ---: | --- | --- | --- |",
    ...results.map(
      (result) =>
        `| ${result.regulator} | ${result.status.toUpperCase()} | ${result.recordCount} | ${result.latestDate ?? "none"} | ${result.lastStatus ?? "n/a"} | ${result.message} |`,
    ),
    "",
  ];

  appendFileSync(summaryPath, `${lines.join("\n")}\n`);
}

export async function main() {
  const sql = getSqlClient();

  try {
    const report = await getUKEnforcementHealth(sql);

    if (process.argv.includes("--json")) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printHumanReport(report.sources);
      console.log("");
      console.log(
        `Checked ${report.totals.sources} UK enforcement sources; ${report.totals.failing} require attention.`,
      );
    }

    writeGitHubSummary(report.sources);

    if (report.sources.some(isFailingUKEnforcementHealth)) {
      process.exitCode = 1;
    }
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("UK enforcement health check failed:", error);
    process.exit(1);
  });
}
