#!/usr/bin/env npx tsx
import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { countryRiskSourcesAsOf } from "../../src/data/countryRiskSources.js";
import {
  assessCountryRiskSourceHealth,
  type CountryRiskOperationalSourceRun,
  type CountryRiskSourceHealthReport,
} from "../../src/data/countryRiskSourceHealth.js";
import { getSqlClient, resolveConnectionString } from "../../server/db.js";

const JSON_OUTPUT = process.env.COUNTRY_RISK_HEALTH_JSON ?? "/tmp/country-risk-source-health.json";
const MARKDOWN_OUTPUT = process.env.COUNTRY_RISK_HEALTH_MARKDOWN ?? "/tmp/country-risk-source-health.md";

function markdown(report: CountryRiskSourceHealthReport): string {
  const icon = report.status === "healthy" ? "OK" : report.status === "warning" ? "WARNING" : "CRITICAL";
  const issueLines = report.issues.length
    ? report.issues.map((issue) => `- **${issue.severity.toUpperCase()} — ${issue.sourceId}:** ${issue.message}`).join("\n")
    : "- No source-health issues detected.";
  return [
    `# Country risk source health — ${icon}`,
    "",
    `Checked: ${report.checkedAt}`,
    `Ready for scoring: ${report.readyForScoring ? "yes" : "no"}`,
    `Operational coverage: ${report.observedOperationalSources}/${report.requiredOperationalSources}`,
    `Latest successful check: ${report.lastSuccessfulCheckAt ?? "unavailable"}`,
    "",
    "## Findings",
    "",
    issueLines,
    "",
    "Source failures, empty responses, missing hashes, stale runs and review-required states fail closed.",
    "",
  ].join("\n");
}

async function writeReport(report: CountryRiskSourceHealthReport) {
  await Promise.all([
    writeFile(JSON_OUTPUT, `${JSON.stringify(report, null, 2)}\n`),
    writeFile(MARKDOWN_OUTPUT, markdown(report)),
  ]);
}

async function main() {
  const asOf = new Date();
  const connectionString = resolveConnectionString();
  let operationalRuns: CountryRiskOperationalSourceRun[] = [];
  let databaseAvailable = Boolean(connectionString);
  let databaseError: string | null = connectionString ? null : "DATABASE_URL is not configured";
  let sql: ReturnType<typeof getSqlClient> | null = null;

  if (connectionString) {
    try {
      sql = getSqlClient();
      operationalRuns = await sql(
        `SELECT DISTINCT ON (source_id)
                source_id, status, source_url, retrieved_at, effective_at, sha256,
                parser_version, record_count, error_message, metadata
         FROM country_risk_source_runs
         WHERE source_id IN ('ofac-programmes', 'uk-regimes', 'eu-resources', 'un-consolidated-list',
                             'fatf-lists', 'fatf-assessments', 'world-bank-wgi', 'sanctions-regimes')
         ORDER BY source_id, retrieved_at DESC, id DESC`,
      ) as unknown as CountryRiskOperationalSourceRun[];
    } catch (error) {
      databaseAvailable = false;
      databaseError = error instanceof Error ? error.message : String(error);
    } finally {
      await sql?.end().catch(() => undefined);
    }
  }

  const report = assessCountryRiskSourceHealth({
    asOf,
    declaredSources: countryRiskSourcesAsOf(asOf),
    operationalRuns,
    databaseAvailable,
    databaseError,
  });
  await writeReport(report);
  console.log(JSON.stringify({
    ...report,
    jsonReport: JSON_OUTPUT,
    markdownReport: MARKDOWN_OUTPUT,
  }, null, 2));
  if (!report.readyForScoring || report.status !== "healthy") process.exitCode = 1;
}

main().catch(async (error) => {
  const asOf = new Date();
  const message = error instanceof Error ? error.message : String(error);
  const report = assessCountryRiskSourceHealth({
    asOf,
    declaredSources: countryRiskSourcesAsOf(asOf),
    operationalRuns: [],
    databaseAvailable: false,
    databaseError: message,
  });
  await writeReport(report).catch(() => undefined);
  console.error(message);
  process.exit(1);
});
