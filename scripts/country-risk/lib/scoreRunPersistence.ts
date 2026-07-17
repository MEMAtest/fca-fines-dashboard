import { execFileSync } from "node:child_process";
import pg from "pg";
import { buildPgPoolConfig, resolveConnectionString } from "../../../server/db.js";
import { getFatfAssessment } from "../../../src/data/fatfAssessmentData.js";
import { getFatfStatus } from "../../../src/data/fatfStatus.js";
import { getGovernanceDimensions } from "../../../src/data/governanceData.js";
import {
  getApprovedSanctions,
  getApprovedSanctionsCoverage,
  SANCTIONS_APPROVED_SNAPSHOT,
} from "../../../src/data/sanctionsApprovedData.js";
import {
  COUNTRY_RISK_FLOORS,
  COUNTRY_RISK_METHODOLOGY_VERSION,
  COUNTRY_RISK_PILLAR_WEIGHTS,
  type CountryRiskV2Result,
} from "../../../src/data/countryRiskV2.js";
import type { CountryRiskSourceStatus } from "../../../src/data/countryRiskSources.js";

export interface PersistableCountryRiskRun {
  runId: string;
  generatedAt: string;
  methodologyVersion: string;
  readyForDefault: boolean;
  readinessReasons: string[];
  sources: CountryRiskSourceStatus[];
  results: Array<{
    iso2: string;
    country: string;
    current: CountryRiskV2Result;
    previous: unknown;
  }>;
}

const sourceForPillar = {
  aml: "fatf-assessments",
  governance: "world-bank-wgi",
  sanctions: "sanctions-regimes",
} as const;

function codeCommit(): string | null {
  const environmentCommit = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA;
  if (environmentCommit) return environmentCommit;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

export async function persistCountryRiskScoreRun(report: PersistableCountryRiskRun): Promise<{
  scoreRunId: number;
  created: boolean;
  scoreCount: number;
  evidenceCount: number;
}> {
  const connectionString = resolveConnectionString();
  if (!connectionString) throw new Error("DATABASE_URL is required to persist a country-risk score run");
  const pool = new pg.Pool(buildPgPoolConfig(connectionString));
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO country_risk_methodologies
         (version, status, definition, validation_report_url, approved_by, approved_at)
       VALUES ($1, 'live', $2::jsonb, $3, $4, $5)
       ON CONFLICT (version) DO UPDATE SET
         status = EXCLUDED.status,
         definition = EXCLUDED.definition,
         validation_report_url = EXCLUDED.validation_report_url,
         approved_by = EXCLUDED.approved_by,
         approved_at = EXCLUDED.approved_at`,
      [
        COUNTRY_RISK_METHODOLOGY_VERSION,
        JSON.stringify({
          weights: COUNTRY_RISK_PILLAR_WEIGHTS,
          floors: COUNTRY_RISK_FLOORS,
          missingData: "One missing pillar is provisional with renormalised weights and no Low label; fewer than two pillars produces no score.",
          sanctionsSnapshot: SANCTIONS_APPROVED_SNAPSHOT,
          externalValidation: "not-independently-validated",
        }),
        "/api/country-risk/methodology/v2",
        null,
        null,
      ],
    );

    const existing = await client.query<{ id: string }>(
      "SELECT id FROM country_risk_score_runs WHERE run_hash = $1",
      [report.runId],
    );
    if (existing.rowCount) {
      await client.query("COMMIT");
      return {
        scoreRunId: Number(existing.rows[0].id),
        created: false,
        scoreCount: report.results.length,
        evidenceCount: 0,
      };
    }

    const sourceRunIds = new Map<string, number>();
    for (const source of report.sources.filter((item) => item.scored)) {
      const retrievedAt = source.retrievedAt ?? report.generatedAt;
      const matched = await client.query<{ id: string }>(
        `SELECT id FROM country_risk_source_runs
         WHERE source_id = $1
           AND sha256 IS NOT DISTINCT FROM $2
           AND retrieved_at = $3::timestamptz
         ORDER BY id DESC LIMIT 1`,
        [source.id, source.sha256, retrievedAt],
      );
      let sourceRunId: number;
      if (matched.rowCount) {
        sourceRunId = Number(matched.rows[0].id);
      } else {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO country_risk_source_runs
             (source_id, status, source_url, retrieved_at, effective_at, sha256, parser_version, record_count, metadata)
           VALUES ($1, $2, $3, $4::timestamptz, $5, $6, $7, $8, $9::jsonb)
           RETURNING id`,
          [
            source.id,
            source.state === "current" ? "succeeded" : "review_required",
            source.sourceUrl,
            retrievedAt,
            source.effectiveAt,
            source.sha256,
            `country-risk-v2@${COUNTRY_RISK_METHODOLOGY_VERSION}`,
            report.results.length,
            JSON.stringify({ cadence: source.cadence, note: source.note, scored: source.scored }),
          ],
        );
        sourceRunId = Number(inserted.rows[0].id);
      }
      sourceRunIds.set(source.id, sourceRunId);
    }

    const insertedRun = await client.query<{ id: string }>(
      `INSERT INTO country_risk_score_runs
         (methodology_version, status, started_at, completed_at, input_source_runs, code_commit, error_message, run_hash)
       VALUES ($1, $2, $3::timestamptz, $3::timestamptz, $4::jsonb, $5, $6, $7)
       RETURNING id`,
      [
        report.methodologyVersion,
        report.readyForDefault ? "succeeded" : "review_required",
        report.generatedAt,
        JSON.stringify({
          runId: report.runId,
          sources: Object.fromEntries(report.sources.filter((source) => source.scored).map((source) => [
            source.id,
            { sourceRunId: sourceRunIds.get(source.id), sha256: source.sha256, effectiveAt: source.effectiveAt },
          ])),
          sanctionsSnapshotVersion: SANCTIONS_APPROVED_SNAPSHOT.version,
        }),
        codeCommit(),
        report.readyForDefault ? null : report.readinessReasons.join("; "),
        report.runId,
      ],
    );
    const scoreRunId = Number(insertedRun.rows[0].id);
    let evidenceCount = 0;

    for (const row of report.results) {
      const result = row.current;
      await client.query(
        `INSERT INTO country_risk_scores
           (score_run_id, iso2, score, band, publication_status, confidence, pillars, floors, limiting_reasons, arithmetic)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10)`,
        [
          scoreRunId,
          row.iso2,
          result.score,
          result.band,
          result.status,
          result.confidence,
          JSON.stringify(result.pillars),
          JSON.stringify(result.floors),
          JSON.stringify(result.limitingReasons),
          result.arithmetic,
        ],
      );

      for (const [pillarName, pillar] of Object.entries(result.pillars) as Array<
        [keyof typeof sourceForPillar, CountryRiskV2Result["pillars"][keyof CountryRiskV2Result["pillars"]]]
      >) {
        const source = report.sources.find((item) => item.id === sourceForPillar[pillarName]);
        const sourceRunId = sourceRunIds.get(sourceForPillar[pillarName]);
        if (!source || !sourceRunId) throw new Error(`Missing persisted source run for ${pillarName}`);
        const evidence = pillarName === "aml"
          ? { assessment: getFatfAssessment(row.iso2) ?? null, listing: getFatfStatus(row.iso2) ?? null, pillar }
          : pillarName === "governance"
            ? { dimensions: getGovernanceDimensions(row.iso2) ?? null, pillar }
            : {
                programs: getApprovedSanctions(row.iso2)?.programs ?? [],
                imposerCoverage: getApprovedSanctionsCoverage(row.iso2),
                snapshotVersion: SANCTIONS_APPROVED_SNAPSHOT.version,
                pillar,
              };
        const indicator = await client.query<{ id: string }>(
          `INSERT INTO country_risk_indicator_values
             (source_run_id, iso2, indicator_key, value_numeric, value_text, effective_at, evidence_url, evidence)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
           ON CONFLICT (source_run_id, iso2, indicator_key) DO UPDATE SET
             value_numeric = EXCLUDED.value_numeric,
             value_text = EXCLUDED.value_text,
             effective_at = EXCLUDED.effective_at,
             evidence_url = EXCLUDED.evidence_url,
             evidence = EXCLUDED.evidence
           RETURNING id`,
          [
            sourceRunId,
            row.iso2,
            `${pillarName}.pillar-risk`,
            pillar.score,
            pillar.coverageStatus,
            source.effectiveAt,
            source.sourceUrl,
            JSON.stringify(evidence),
          ],
        );
        await client.query(
          `INSERT INTO country_risk_score_evidence
             (score_run_id, iso2, indicator_value_id, pillar, contribution)
           VALUES ($1, $2, $3, $4, $5)`,
          [scoreRunId, row.iso2, Number(indicator.rows[0].id), pillarName, pillar.score === null ? null : pillar.score * pillar.appliedWeight],
        );
        evidenceCount += 1;
      }
    }

    await client.query("COMMIT");
    return { scoreRunId, created: true, scoreCount: report.results.length, evidenceCount };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
