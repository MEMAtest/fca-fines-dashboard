import { getSqlClient } from "../db.js";
import {
  assessCountryRiskSourceHealth,
  type CountryRiskOperationalSourceRun,
} from "../../src/data/countryRiskSourceHealth.js";
import type { CountryRiskSourceStatus } from "../../src/data/countryRiskSources.js";

export interface CountryRiskOperationalHealthResult {
  sourceHealth: ReturnType<typeof assessCountryRiskSourceHealth>;
  operationalSourceRuns: CountryRiskOperationalSourceRun[];
}

/**
 * Operational freshness is deliberately assessed independently from the
 * immutable, approved score snapshot. Both public APIs use this helper so a
 * score-list response cannot claim default readiness while source status says
 * the contrary.
 */
export async function getCountryRiskOperationalHealth(
  asOf: Date,
  sources: CountryRiskSourceStatus[],
): Promise<CountryRiskOperationalHealthResult> {
  let operationalSourceRuns: CountryRiskOperationalSourceRun[] = [];
  let databaseAvailable = true;
  let databaseError: string | null = null;
  try {
    const sql = getSqlClient();
    operationalSourceRuns = await sql(
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
    databaseError = "operational source history unavailable";
    const detail = error instanceof Error ? error.message : String(error);
    console.warn("Country-risk operational source history unavailable", detail);
  }
  return {
    sourceHealth: assessCountryRiskSourceHealth({
      asOf,
      declaredSources: sources,
      operationalRuns: operationalSourceRuns,
      databaseAvailable,
      databaseError,
    }),
    operationalSourceRuns,
  };
}
