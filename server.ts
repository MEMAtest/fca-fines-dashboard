import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { neon } from '@neondatabase/serverless';

const connectionString = process.env.NEON_FCA_FINES_URL;
if (!connectionString) {
  throw new Error('NEON_FCA_FINES_URL is not set');
}

const sql = neon(connectionString);
const app = express();
app.use(cors());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, 'dist');
app.use(express.static(distDir));

function buildWhereClause(year: number) {
  if (year > 0) {
    return {
      text: 'WHERE EXTRACT(YEAR FROM date_issued) = $1',
      params: [year],
    };
  }
  return { text: '', params: [] };
}

app.get('/api/fca-fines/list', async (req, res) => {
  try {
    const year = Number(req.query.year || '0');
    const limit = Math.min(Number(req.query.limit || '500'), 5000);
    const { text: where, params } = buildWhereClause(year);
    const query = `
      SELECT fine_reference, firm_individual, firm_category, regulator,
             final_notice_url, summary, breach_type, breach_categories,
             amount, date_issued, year_issued, month_issued
      FROM fca_fines
      ${where}
      ORDER BY date_issued DESC
      LIMIT $${params.length + 1}
    `;
    const rows = await sql(query, [...params, limit]);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('List endpoint error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch fines' });
  }
});

app.get('/api/fca-fines/stats', async (req, res) => {
  try {
    const year = Number(req.query.year || new Date().getFullYear());
    const allYears = year === 0 ? 0 : year;
    const { text: where, params } = buildWhereClause(allYears);
    const breachWhere = where ? `${where} AND` : 'WHERE';

    const statsQuery = `
      SELECT
        COUNT(*)::int AS total_fines,
        COALESCE(SUM(amount), 0)::float8 AS total_amount,
        COALESCE(AVG(amount), 0)::float8 AS avg_amount,
        COALESCE(MAX(amount), 0)::float8 AS max_fine
      FROM fca_fines
      ${where}
    `;
    const stats = (await sql(statsQuery, params))[0];

    const maxQuery = `
      SELECT firm_individual
      FROM fca_fines
      ${where}
      ORDER BY amount DESC
      LIMIT 1
    `;
    const maxRow = (await sql(maxQuery, params))[0];

    const breachQuery = `
      SELECT
        jsonb_array_elements_text(breach_categories) AS category,
        COUNT(*) AS category_count
      FROM fca_fines
      ${breachWhere} breach_categories IS NOT NULL
        AND breach_categories != '[]'::jsonb
      GROUP BY category
      ORDER BY category_count DESC
      LIMIT 1
    `;
    const breachRow = (await sql(breachQuery, params))[0];

    res.json({
      success: true,
      data: {
        totalFines: stats?.total_fines || 0,
        totalAmount: stats?.total_amount || 0,
        avgAmount: stats?.avg_amount || 0,
        maxFine: stats?.max_fine || 0,
        maxFirmName: maxRow?.firm_individual || null,
        dominantBreach: breachRow?.category || null,
      },
    });
  } catch (error) {
    console.error('Stats endpoint error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
});

app.get('/api/fca-fines/trends', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || '12'), 120);
    const period = (req.query.period as string) || 'month';
    const year = Number(req.query.year || '0');

    const params: Array<string | number> = [period];
    let query = `
      SELECT period_type, year, period_value, fine_count, total_fines, average_fine
      FROM fca_fine_trends
      WHERE period_type = $1
    `;

    if (year > 0) {
      params.push(year);
      query += ` AND year = $${params.length} ORDER BY period_value ASC`;
    } else {
      params.push(limit);
      query += ` ORDER BY year DESC, period_value DESC LIMIT $${params.length}`;
    }

    const rows = await sql(query, params);
    const data = year > 0 ? rows : rows.reverse();

    res.json({ success: true, data });
  } catch (error) {
    console.error('Trends endpoint error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch trends' });
  }
});

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`FCA fines dashboard running on http://localhost:${port}`);
});
