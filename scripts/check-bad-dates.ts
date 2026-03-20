import postgres from 'postgres';
import * as dotenv from 'dotenv';

dotenv.config();

const sql = postgres(process.env.DATABASE_URL?.trim() || '', {
  ssl: process.env.DATABASE_URL?.includes('sslmode=')
    ? { rejectUnauthorized: false }
    : false
});

async function main() {
  console.log('Checking for bad dates in FCA fines...\n');

  // Check for dates before 2000
  const badDates = await sql`
    SELECT firm_individual, amount, date_issued, created_at
    FROM fca_fines
    WHERE date_issued < '2000-01-01'
    ORDER BY date_issued
    LIMIT 20
  `;

  console.log(`Found ${badDates.length} fines with dates before 2000:\n`);
  badDates.forEach(fine => {
    console.log(`${fine.firm_individual}: ${fine.date_issued} (created: ${fine.created_at})`);
  });

  // Check date range distribution
  const dateStats = await sql`
    SELECT
      EXTRACT(YEAR FROM date_issued) as year,
      COUNT(*) as count
    FROM fca_fines
    GROUP BY year
    ORDER BY year
  `;

  console.log('\n\nDate distribution by year:');
  dateStats.forEach(stat => {
    console.log(`  ${stat.year}: ${stat.count} fines`);
  });

  // Check most recent fines by created_at
  const recentlyCreated = await sql`
    SELECT firm_individual, amount, date_issued, created_at
    FROM fca_fines
    WHERE created_at >= NOW() - INTERVAL '48 hours'
    ORDER BY created_at DESC
    LIMIT 10
  `;

  console.log(`\n\nFines created in last 48 hours: ${recentlyCreated.length}`);
  recentlyCreated.forEach(fine => {
    console.log(`${fine.firm_individual}: issued ${fine.date_issued}, created ${fine.created_at}`);
  });

  await sql.end();
}

main();
