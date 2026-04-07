import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSqlClient } from "../server/db.js";

const sql = getSqlClient();

interface RegulatorHealth {
  regulator: string;
  region: string;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastDurationMs: number | null;
  lastRecordsInserted: number | null;
  lastRecordsUpdated: number | null;
  lastErrors: number | null;
  lastErrorMessage: string | null;
  successRate7d: number | null;
  totalRuns7d: number;
}

interface RegionalRollup {
  region: string;
  totalRegulators: number;
  healthy: number;
  degraded: number;
  failing: number;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const latestRuns = (await sql`
      WITH ranked AS (
        SELECT
          regulator,
          region,
          started_at,
          status,
          duration_ms,
          records_inserted,
          records_updated,
          errors,
          error_message,
          ROW_NUMBER() OVER (PARTITION BY regulator ORDER BY started_at DESC) AS rn
        FROM scraper_runs
        WHERE started_at > NOW() - INTERVAL '30 days'
      )
      SELECT * FROM ranked WHERE rn = 1
      ORDER BY regulator
    `) as Array<{
      regulator: string;
      region: string;
      started_at: string;
      status: string;
      duration_ms: number | null;
      records_inserted: number | null;
      records_updated: number | null;
      errors: number | null;
      error_message: string | null;
    }>;

    const successRates = (await sql`
      SELECT
        regulator,
        COUNT(*)::int AS total_runs,
        COUNT(*) FILTER (WHERE status = 'success')::int AS successful_runs
      FROM scraper_runs
      WHERE started_at > NOW() - INTERVAL '7 days'
      GROUP BY regulator
    `) as Array<{
      regulator: string;
      total_runs: number;
      successful_runs: number;
    }>;

    const rateMap = new Map(
      successRates.map((row) => [
        row.regulator,
        {
          totalRuns: row.total_runs,
          successRate:
            row.total_runs > 0
              ? Math.round((row.successful_runs / row.total_runs) * 100)
              : null,
        },
      ]),
    );

    const regulators: RegulatorHealth[] = latestRuns.map((run) => {
      const rates = rateMap.get(run.regulator);
      return {
        regulator: run.regulator,
        region: run.region,
        lastRunAt: run.started_at,
        lastStatus: run.status,
        lastDurationMs: run.duration_ms,
        lastRecordsInserted: run.records_inserted,
        lastRecordsUpdated: run.records_updated,
        lastErrors: run.errors,
        lastErrorMessage: run.error_message,
        successRate7d: rates?.successRate ?? null,
        totalRuns7d: rates?.totalRuns ?? 0,
      };
    });

    const regionMap = new Map<string, RegionalRollup>();
    for (const reg of regulators) {
      const existing = regionMap.get(reg.region) ?? {
        region: reg.region,
        totalRegulators: 0,
        healthy: 0,
        degraded: 0,
        failing: 0,
      };
      existing.totalRegulators += 1;
      if (
        reg.lastStatus === "success" &&
        (reg.successRate7d === null || reg.successRate7d >= 80)
      ) {
        existing.healthy += 1;
      } else if (reg.successRate7d !== null && reg.successRate7d < 50) {
        existing.failing += 1;
      } else {
        existing.degraded += 1;
      }
      regionMap.set(reg.region, existing);
    }

    const byRegion = Array.from(regionMap.values()).sort((a, b) =>
      a.region.localeCompare(b.region),
    );

    const summary = {
      total: regulators.length,
      healthy: regulators.filter(
        (r) =>
          r.lastStatus === "success" &&
          (r.successRate7d === null || r.successRate7d >= 80),
      ).length,
      degraded: regulators.filter(
        (r) =>
          r.successRate7d !== null &&
          r.successRate7d >= 50 &&
          r.successRate7d < 80,
      ).length,
      failing: regulators.filter(
        (r) => r.successRate7d !== null && r.successRate7d < 50,
      ).length,
      generatedAt: new Date().toISOString(),
    };

    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=120");

    return res.status(200).json({
      summary,
      byRegion,
      regulators,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";

    if (message.includes("does not exist")) {
      return res.status(200).json({
        summary: {
          total: 0,
          healthy: 0,
          degraded: 0,
          failing: 0,
          generatedAt: new Date().toISOString(),
          note: "scraper_runs table not yet created — run migration first",
        },
        byRegion: [],
        regulators: [],
      });
    }

    console.error("Scraper health error:", error);
    return res.status(500).json({ error: "Failed to fetch scraper health" });
  }
}
