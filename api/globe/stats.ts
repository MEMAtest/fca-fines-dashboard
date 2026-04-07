import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSqlClient } from "../../server/db.js";

const sql = getSqlClient();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Get counts from all tables
    const fcaCount = await sql`SELECT COUNT(*)::int as count FROM fca_fines`;
    const euCount = await sql`SELECT COUNT(*)::int as count FROM eu_fines`;

    // Get year range from both tables (filter out invalid years > current year)
    const currentYear = new Date().getFullYear();
    const fcaYears = await sql`
      SELECT MIN(year_issued)::int as min_year, MAX(year_issued)::int as max_year
      FROM fca_fines
      WHERE year_issued <= ${currentYear}
    `;
    const euYears = await sql`
      SELECT MIN(year_issued)::int as min_year, MAX(year_issued)::int as max_year
      FROM eu_fines
      WHERE year_issued <= ${currentYear}
    `;

    // Get unique regulators count
    const regulatorCount = await sql`
      SELECT COUNT(DISTINCT regulator)::int as count FROM eu_fines
    `;

    // Get unique countries count
    const countryCount = await sql`
      SELECT COUNT(DISTINCT country_code)::int as count FROM eu_fines
    `;

    const totalActions = parseInt(fcaCount[0].count) + parseInt(euCount[0].count);
    const earliestYear = Math.min(
      fcaYears[0].min_year || 2013,
      euYears[0].min_year || 2013
    );
    const latestYear = Math.max(
      fcaYears[0].max_year || new Date().getFullYear(),
      euYears[0].max_year || new Date().getFullYear()
    );

    // Add FCA as a regulator (it's in fca_fines table, not eu_fines)
    const totalRegulators = parseInt(regulatorCount[0].count) + 1; // +1 for FCA

    // Add GB as a country (FCA is UK)
    const totalCountries = parseInt(countryCount[0].count) + 1; // +1 for GB

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
