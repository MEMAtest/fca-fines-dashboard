import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSqlClient } from "../../server/db.js";

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
    // Get counts from all tables
    const fcaCount = (await sql`
      SELECT COUNT(*)::int as count FROM fca_fines
    `) as unknown as CountRow[];
    const euCount = (await sql`
      SELECT COUNT(*)::int as count FROM eu_fines
    `) as unknown as CountRow[];

    // Get year range from both tables (filter out invalid years > current year)
    const currentYear = new Date().getFullYear();
    const fcaYears = (await sql`
      SELECT MIN(year_issued)::int as min_year, MAX(year_issued)::int as max_year
      FROM fca_fines
      WHERE year_issued <= ${currentYear}
    `) as unknown as YearRangeRow[];
    const euYears = (await sql`
      SELECT MIN(year_issued)::int as min_year, MAX(year_issued)::int as max_year
      FROM eu_fines
      WHERE year_issued <= ${currentYear}
    `) as unknown as YearRangeRow[];

    // Get unique regulators count
    const regulatorCount = (await sql`
      SELECT COUNT(DISTINCT regulator)::int as count FROM eu_fines
    `) as unknown as CountRow[];

    // Get unique countries count
    const countryCount = (await sql`
      SELECT COUNT(DISTINCT country_code)::int as count FROM eu_fines
    `) as unknown as CountRow[];

    const totalActions =
      toInt(fcaCount[0]?.count) + toInt(euCount[0]?.count);
    const earliestYear = Math.min(
      toInt(fcaYears[0]?.min_year, 2013),
      toInt(euYears[0]?.min_year, 2013),
    );
    const latestYear = Math.max(
      toInt(fcaYears[0]?.max_year, currentYear),
      toInt(euYears[0]?.max_year, currentYear),
    );

    // Add FCA as a regulator (it's in fca_fines table, not eu_fines)
    const totalRegulators = toInt(regulatorCount[0]?.count) + 1; // +1 for FCA

    // Add GB as a country (FCA is UK)
    const totalCountries = toInt(countryCount[0]?.count) + 1; // +1 for GB

    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=120"); // Cache 1-2 mins

    return res.status(200).json({
      totalActions,
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
