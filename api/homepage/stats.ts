import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const sql = neon(process.env.NEON_FCA_FINES_URL!);

    // Get aggregate statistics
    const stats = await sql`
      SELECT
        COUNT(*)::int AS total_fines,
        COALESCE(SUM(amount), 0)::float8 AS total_amount,
        MIN(year_issued)::int AS earliest_year,
        MAX(year_issued)::int AS latest_year
      FROM fca_fines
    `;

    // Get latest 10 enforcement notices
    const latestFines = await sql`
      SELECT
        firm_individual,
        amount,
        date_issued,
        breach_type,
        final_notice_url
      FROM fca_fines
      ORDER BY date_issued DESC
      LIMIT 10
    `;

    // Get year-over-year comparison
    const currentYear = new Date().getFullYear();
    const yoyStats = await sql`
      SELECT
        year_issued,
        COUNT(*)::int AS fine_count,
        COALESCE(SUM(amount), 0)::float8 AS total_amount
      FROM fca_fines
      WHERE year_issued >= ${currentYear - 1}
      GROUP BY year_issued
      ORDER BY year_issued DESC
    `;

    const { total_fines, total_amount, earliest_year, latest_year } = stats[0];

    // Calculate YoY change
    const thisYear = yoyStats.find(y => y.year_issued === currentYear);
    const lastYear = yoyStats.find(y => y.year_issued === currentYear - 1);
    const yoyChange = lastYear && thisYear
      ? ((thisYear.total_amount - lastYear.total_amount) / lastYear.total_amount * 100).toFixed(1)
      : null;

    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600'); // Cache 5-10 mins

    return res.status(200).json({
      totalFines: total_fines,
      totalAmount: total_amount,
      yearsCovered: latest_year - earliest_year + 1,
      earliestYear: earliest_year,
      latestYear: latest_year,
      yoyChange,
      latestFines: latestFines.map(fine => ({
        firm: fine.firm_individual,
        amount: Number(fine.amount),
        date: fine.date_issued,
        breachType: fine.breach_type,
        noticeUrl: fine.final_notice_url,
      })),
    });
  } catch (error) {
    console.error('Homepage stats error:', error);
    return res.status(500).json({ error: 'Failed to fetch homepage stats' });
  }
}
