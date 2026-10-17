import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSqlClient } from "../../server/db.js";
import { PUBLIC_REGULATOR_CODES } from "../../src/data/regulatorCoverage.js";

const sql = getSqlClient();

interface CountRow {
  count: unknown;
}

interface YearRangeRow {
  min_year: unknown;
  max_year: unknown;
}

function toInt(value: unknown, fallback = 0): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.trunc(value) : fallback;
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Get public counts from the trusted perimeter so suppressed or unreviewed
    // rows cannot leak into globe totals.
    const fcaCount = (await sql`
      SELECT COUNT(*)::int as count
      FROM public.all_regulatory_fines_trusted
      WHERE upper(regulator) = 'FCA'
        AND regulator = ANY(${PUBLIC_REGULATOR_CODES}::text[])
    `) as unknown as CountRow[];

    // Keep all globe aggregate fields on the same trusted public view.
    const currentYear = new Date().getFullYear();
    const trustedStats = (await sql`
      -- Legacy OSC entries use 1900-01-01 as an undated placeholder; retain
      -- their action counts, but exclude that sentinel from dated coverage.
      SELECT COUNT(*)::int as total_actions,
             COUNT(*) FILTER (WHERE date_issued::date = DATE '1900-01-01')::int as undated_actions,
             COUNT(DISTINCT regulator)::int as total_regulators,
             COUNT(DISTINCT country_code)::int as total_countries,
             MIN(CASE WHEN date_issued::date <> DATE '1900-01-01' AND year_issued BETWEEN 1 AND ${currentYear} THEN year_issued END)::int as min_year,
             MAX(CASE WHEN date_issued::date <> DATE '1900-01-01' AND year_issued BETWEEN 1 AND ${currentYear} THEN year_issued END)::int as max_year
      FROM public.all_regulatory_fines_trusted
      WHERE regulator = ANY(${PUBLIC_REGULATOR_CODES}::text[])
    `) as unknown as (YearRangeRow & { total_actions: unknown; undated_actions: unknown; total_regulators: unknown; total_countries: unknown })[];

    const totalActions = toInt(trustedStats[0]?.total_actions);
    const earliestYear = toInt(trustedStats[0]?.min_year, 2013);
    const latestYear = toInt(trustedStats[0]?.max_year, currentYear);
    const totalRegulators = toInt(trustedStats[0]?.total_regulators);
    const totalCountries = toInt(trustedStats[0]?.total_countries);

    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=120"); // Cache 1-2 mins

    return res.status(200).json({
      totalActions,
      undatedActions: toInt(trustedStats[0]?.undated_actions),
      fcaActions: toInt(fcaCount[0]?.count),
      totalRegulators,
      totalCountries,
      earliestYear,
      latestYear,
    });
  } catch (error) {
    console.error("Globe stats error:", error);
    return res.status(500).json({ error: "Failed to fetch globe stats" });
  }
}
