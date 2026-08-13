import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSqlClient } from "../../server/db.js";

const sql = getSqlClient();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const now = new Date();
    const currentYear = now.getUTCFullYear();
    const asOf = now.toISOString().slice(0, 10);
    const previousAsOf = new Date(Date.UTC(currentYear - 1, now.getUTCMonth(), now.getUTCDate()))
      .toISOString()
      .slice(0, 10);

    // Use the same trusted, deduplicated evidence view as the Fines workspace.
    const stats = (await sql`
      SELECT
        COUNT(*)::int AS total_fines,
        COUNT(trusted_amount_gbp)::int AS disclosed_amount_count,
        COALESCE(SUM(trusted_amount_gbp), 0)::float8 AS total_amount,
        MIN(year_issued)::int AS earliest_year,
        MAX(year_issued)::int AS latest_year,
        MAX(created_at) AS latest_ingestion_at
      FROM public.all_regulatory_fines_trusted
      WHERE regulator = 'FCA'
    `) as Array<{
      total_fines: number;
      disclosed_amount_count: number;
      total_amount: number;
      earliest_year: number | null;
      latest_year: number | null;
      latest_ingestion_at: string | null;
    }>;

    // Get latest 10 enforcement notices
    const latestFines = (await sql`
      SELECT
        firm_individual,
        trusted_amount_gbp AS amount,
        date_issued,
        breach_type,
        notice_url AS final_notice_url
      FROM public.all_regulatory_fines_trusted
      WHERE regulator = 'FCA'
      ORDER BY date_issued DESC
      LIMIT 10
    `) as Array<{
      firm_individual: string;
      amount: number | string;
      date_issued: string;
      breach_type: string;
      final_notice_url: string;
    }>;

    // Get year-over-year comparison
    const yoyStats = (await sql`
      SELECT
        year_issued,
        COUNT(*)::int AS fine_count,
        COALESCE(SUM(trusted_amount_gbp), 0)::float8 AS total_amount
      FROM public.all_regulatory_fines_trusted
      WHERE regulator = 'FCA'
        AND (
          (date_issued >= ${`${currentYear}-01-01`}::date AND date_issued <= ${asOf}::date)
          OR
          (date_issued >= ${`${currentYear - 1}-01-01`}::date AND date_issued <= ${previousAsOf}::date)
        )
      GROUP BY year_issued
      ORDER BY year_issued DESC
    `) as Array<{
      year_issued: number;
      fine_count: number;
      total_amount: number;
    }>;

    const { total_fines, total_amount, earliest_year, latest_year } = stats[0];
    const earliestYear = earliest_year ?? currentYear;
    const latestYear = latest_year ?? currentYear;

    // Calculate YoY change
    const thisYear = yoyStats.find((y) => y.year_issued === currentYear);
    const lastYear = yoyStats.find((y) => y.year_issued === currentYear - 1);
    const yoyChange =
      lastYear && thisYear
        ? (
            ((thisYear.total_amount - lastYear.total_amount) /
              lastYear.total_amount) *
            100
          ).toFixed(1)
        : null;

    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=600"); // Cache 5-10 mins

    return res.status(200).json({
      totalFines: total_fines,
      totalAmount: total_amount,
      yearsCovered: latestYear - earliestYear + 1,
      earliestYear,
      latestYear,
      yoyChange,
      scope: { regulator: "FCA", country: "GB" },
      definition: "Trusted, deduplicated FCA enforcement actions across all available years",
      disclosedAmountCount: Number(stats[0]?.disclosed_amount_count ?? 0),
      asOf,
      latestIngestionAt: stats[0]?.latest_ingestion_at ?? null,
      yoyPeriod: {
        current: `${currentYear}-01-01 to ${asOf}`,
        previous: `${currentYear - 1}-01-01 to ${previousAsOf}`,
      },
      latestFines: latestFines.map((fine) => ({
        firm: fine.firm_individual,
        amount: Number(fine.amount),
        date: fine.date_issued,
        breachType: fine.breach_type,
        noticeUrl: fine.final_notice_url,
      })),
    });
  } catch (error) {
    console.error("Homepage stats error:", error);
    return res.status(500).json({ error: "Failed to fetch homepage stats" });
  }
}
