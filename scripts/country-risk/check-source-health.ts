#!/usr/bin/env npx tsx
import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { countryRiskSourcesAsOf } from "../../src/data/countryRiskSources.js";
import {
  assessCountryRiskSourceHealth,
  shouldFailCountryRiskSourceHealth,
  type CountryRiskOperationalSourceRun,
  type CountryRiskSourceHealthReport,
} from "../../src/data/countryRiskSourceHealth.js";
import { getSqlClient, resolveConnectionString } from "../../server/db.js";

const JSON_OUTPUT =
  process.env.COUNTRY_RISK_HEALTH_JSON ??
  "/tmp/country-risk-source-health.json";
const MARKDOWN_OUTPUT =
  process.env.COUNTRY_RISK_HEALTH_MARKDOWN ??
  "/tmp/country-risk-source-health.md";

function markdown(report: CountryRiskSourceHealthReport): string {
  const icon =
    report.status === "healthy"
      ? "OK"
      : report.status === "warning"
        ? "WARNING"
        : "CRITICAL";
  const issueLines = report.issues.length
    ? report.issues
        .map(
          (issue) =>
            `- **${issue.severity.toUpperCase()} — ${issue.sourceId}:** ${issue.message}`,
        )
        .join("\n")
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
    "Critical source failures, empty responses, missing hashes, stale runs and review-required states fail closed. Current retained-evidence unavailability remains a visible watch.",
    "",
  ].join("\n");
}

async function writeReport(report: CountryRiskSourceHealthReport) {
  await Promise.all([
    writeFile(JSON_OUTPUT, `${JSON.stringify(report, null, 2)}\n`),
    writeFile(MARKDOWN_OUTPUT, markdown(report)),
  ]);
}

const DB_ATTEMPT_TIMEOUT_MS = Number(
  process.env.COUNTRY_RISK_HEALTH_DB_TIMEOUT_MS ?? 45_000,
);
const DB_ATTEMPTS = 2;

/**
 * The pg pool has no connect timeout, so a stalled TCP handshake to the
 * database used to hang this step silently until the workflow's 3-minute
 * limit killed it without writing a report (2026-11-05). Bound each attempt,
 * retry once, and otherwise fail closed with a report that says why.
 */
async function withDeadline<T>(
  label: string,
  run: () => Promise<T>,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      run(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(`${label} timed out after ${DB_ATTEMPT_TIMEOUT_MS}ms`),
            ),
          DB_ATTEMPT_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function main() {
  const asOf = new Date();
  const connectionString = resolveConnectionString();
  let operationalRuns: CountryRiskOperationalSourceRun[] = [];
  let databaseAvailable = Boolean(connectionString);
  let databaseError: string | null = connectionString
    ? null
    : "DATABASE_URL is not configured";

  if (connectionString) {
    try {
      let lastError: unknown = null;
      const client = getSqlClient();
      for (let attempt = 1; attempt <= DB_ATTEMPTS; attempt += 1) {
        try {
          operationalRuns = (await withDeadline(
            "country_risk_source_runs query",
            async () =>
              await client(
                `SELECT source_id, status, source_url, retrieved_at, effective_at, sha256,
                parser_version, record_count, error_message, metadata
         FROM country_risk_source_runs
         WHERE id IN (
           SELECT id FROM (
             SELECT DISTINCT ON (source_id) id
             FROM country_risk_source_runs
             WHERE source_id IN ('ofac-programmes', 'uk-regimes', 'eu-resources', 'un-consolidated-list',
                                 'fatf-lists', 'fatf-assessments', 'world-bank-wgi', 'sanctions-regimes')
             ORDER BY source_id, retrieved_at DESC, id DESC
           ) latest_attempts
           UNION
           SELECT id FROM (
             SELECT DISTINCT ON (source_id) id
             FROM country_risk_source_runs
             WHERE source_id IN ('ofac-programmes', 'uk-regimes', 'eu-resources', 'un-consolidated-list',
                                 'fatf-lists', 'fatf-assessments', 'world-bank-wgi', 'sanctions-regimes')
               AND (
                 status = 'succeeded'
                 OR (status = 'review_required'
                     AND metadata->>'changed' = 'false'
                     AND metadata->>'baselineMissing' = 'false'
                     AND error_message IS NULL)
               )
             ORDER BY source_id, retrieved_at DESC, id DESC
           ) latest_successes
         )`,
              ),
          )) as unknown as CountryRiskOperationalSourceRun[];
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          console.error(
            `source-health database attempt ${attempt}/${DB_ATTEMPTS} failed: ${error instanceof Error ? error.message : error}`,
          );
        }
      }
      // Never await end() on a possibly stalled connection; process.exit follows.
      void client.end().catch(() => undefined);
      if (lastError) throw lastError;
    } catch (error) {
      databaseAvailable = false;
      databaseError = error instanceof Error ? error.message : String(error);
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
  console.log(
    JSON.stringify(
      {
        ...report,
        jsonReport: JSON_OUTPUT,
        markdownReport: MARKDOWN_OUTPUT,
      },
      null,
      2,
    ),
  );
  // Exit explicitly: a pool left half-open by a stalled connection must not
  // keep the process (and the workflow step) alive after the report is written.
  process.exit(shouldFailCountryRiskSourceHealth(report) ? 1 : 0);
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
