import postgres from 'postgres';
import * as dotenv from 'dotenv';

dotenv.config();

const sql = postgres(process.env.DATABASE_URL?.trim() || '', {
  ssl: process.env.DATABASE_URL?.includes('sslmode=')
    ? { rejectUnauthorized: false }
    : false
});

async function checkStatus() {
  console.log('📊 EU Fines Database Status\n');

  try {
    // Count by regulator
    const regulatorCounts = await sql`
      SELECT
        regulator,
        COUNT(*) as count,
        SUM(amount_eur)::numeric as total_eur,
        MIN(date_issued) as earliest,
        MAX(date_issued) as latest
      FROM eu_fines
      GROUP BY regulator
      ORDER BY count DESC
    `;

    console.log('🇪🇺 EU Fines by Regulator:');
    regulatorCounts.forEach(r => {
      console.log(`   ${r.regulator}: ${r.count} fines, €${(Number(r.total_eur || 0) / 1000000).toFixed(2)}M`);
      console.log(`      Range: ${r.earliest} to ${r.latest}`);
    });

    // Total counts
    const totalEu = await sql`SELECT COUNT(*) as count FROM eu_fines`;
    const totalFca = await sql`SELECT COUNT(*) as count FROM fca_fines`;
    const totalUnified = await sql`SELECT COUNT(*) as count FROM all_regulatory_fines`;

    console.log('\n📈 Total Counts:');
    console.log(`   EU fines: ${totalEu[0].count}`);
    console.log(`   FCA fines: ${totalFca[0].count}`);
    console.log(`   Unified view: ${totalUnified[0].count}`);

    // Sample records
    const sampleEu = await sql`
      SELECT
        regulator,
        firm_individual,
        amount_eur,
        breach_categories,
        date_issued
      FROM eu_fines
      ORDER BY date_issued DESC
      LIMIT 5
    `;

    console.log('\n🔍 Recent EU Fines:');
    sampleEu.forEach((r, i) => {
      console.log(`   ${i + 1}. ${r.firm_individual} (${r.regulator})`);
      console.log(`      €${Number(r.amount_eur).toLocaleString()}, ${r.date_issued}`);
      console.log(`      Categories: ${JSON.stringify(r.breach_categories)}`);
    });

    // Check for double-encoding issues
    const doubleEncoded = await sql`
      SELECT COUNT(*) as count
      FROM eu_fines
      WHERE jsonb_typeof(breach_categories) = 'string'
    `;

    console.log('\n🐛 Data Quality Check:');
    console.log(`   Double-encoded breach_categories: ${doubleEncoded[0].count}`);
    if (Number(doubleEncoded[0].count) > 0) {
      console.log('   ⚠️  WARNING: Some records have double-encoded JSONB!');
    } else {
      console.log('   ✅ All breach_categories are properly stored as JSONB arrays');
    }

    await sql.end();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error checking status:', error);
    await sql.end();
    process.exit(1);
  }
}

checkStatus();
