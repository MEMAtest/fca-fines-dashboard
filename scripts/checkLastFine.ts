import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.NEON_FCA_FINES_URL || '');

async function checkLastFine() {
  console.log('🔍 Checking last fines pulled into database...\n');

  // Get the most recent fine
  const latest = await sql`
    SELECT firm_individual, amount, date_issued, year_issued, breach_type
    FROM fca_fines
    ORDER BY date_issued DESC
    LIMIT 5
  `;

  console.log('📊 5 Most Recent Fines:');
  console.table(latest.map(r => ({
    firm: r.firm_individual,
    amount: `£${(r.amount / 1000000).toFixed(2)}M`,
    date: new Date(r.date_issued).toISOString().split('T')[0],
    year: r.year_issued,
    breach: r.breach_type
  })));

  // Get count by year
  const byYear = await sql`
    SELECT year_issued, COUNT(*) as count, SUM(amount) as total
    FROM fca_fines
    GROUP BY year_issued
    ORDER BY year_issued DESC
    LIMIT 5
  `;

  console.log('\n📅 Fines by Recent Years:');
  console.table(byYear.map(r => ({
    year: r.year_issued,
    count: r.count,
    total: `£${(r.total / 1000000).toFixed(2)}M`
  })));
}

checkLastFine().catch(console.error);
