/**
 * Check EU Fines System Status
 * Shows current state of multi-regulator enforcement data
 */

import postgres from 'postgres';
import * as dotenv from 'dotenv';

dotenv.config();

const sql = postgres(process.env.DATABASE_URL?.trim() || '', {
  ssl: process.env.DATABASE_URL?.includes('sslmode=') ? 'require' : undefined
});

async function main() {
  console.log('🇪🇺 EU Regulatory Fines System Status\n');

  try {
    // Summary by regulator
    const byRegulator = await sql`
      SELECT
        regulator,
        country_code,
        COUNT(*) as count,
        SUM(amount_eur) as total_eur,
        MIN(date_issued) as earliest,
        MAX(date_issued) as latest
      FROM eu_fines
      GROUP BY regulator, country_code
      ORDER BY count DESC
    `;

    console.log('📊 EU Fines by Regulator:');
    console.table(byRegulator.map(r => ({
      regulator: r.regulator,
      country: r.country_code,
      count: r.count,
      total_eur: `€${Number(r.total_eur || 0).toLocaleString()}`,
      earliest: r.earliest?.toISOString().split('T')[0],
      latest: r.latest?.toISOString().split('T')[0]
    })));

    // FCA for comparison
    const fca = await sql`
      SELECT
        COUNT(*) as count,
        SUM(amount) as total_gbp,
        MIN(date_issued) as earliest,
        MAX(date_issued) as latest
      FROM fca_fines
    `;

    console.log('\n📊 FCA Fines (UK) for Comparison:');
    console.table([{
      regulator: 'FCA',
      country: 'UK',
      count: fca[0].count,
      total_gbp: `£${Number(fca[0].total_gbp || 0).toLocaleString()}`,
      total_eur: `€${Number(fca[0].total_gbp * 1.18 || 0).toLocaleString()}`,
      earliest: fca[0].earliest?.toISOString().split('T')[0],
      latest: fca[0].latest?.toISOString().split('T')[0]
    }]);

    // Unified view stats
    const unified = await sql`
      SELECT
        COUNT(*) as total_fines,
        COUNT(DISTINCT regulator) as total_regulators,
        COUNT(DISTINCT country_code) as total_countries
      FROM all_regulatory_fines
    `;

    console.log('\n🌍 Unified Regulatory Fines View:');
    console.log(`   Total fines: ${unified[0].total_fines}`);
    console.log(`   Regulators: ${unified[0].total_regulators}`);
    console.log(`   Countries: ${unified[0].total_countries}`);

    // Recent EU fines
    const recent = await sql`
      SELECT
        regulator,
        firm_individual,
        amount_eur,
        date_issued
      FROM eu_fines
      ORDER BY date_issued DESC
      LIMIT 5
    `;

    console.log('\n📋 Most Recent EU Fines:');
    console.table(recent.map(r => ({
      regulator: r.regulator,
      firm: r.firm_individual,
      amount: `€${Number(r.amount_eur || 0).toLocaleString()}`,
      date: r.date_issued?.toISOString().split('T')[0]
    })));

    // Top 5 largest EU fines
    const largest = await sql`
      SELECT
        regulator,
        firm_individual,
        amount_eur,
        date_issued
      FROM eu_fines
      WHERE amount_eur IS NOT NULL
      ORDER BY amount_eur DESC
      LIMIT 5
    `;

    if (largest.length > 0) {
      console.log('\n💰 Largest EU Fines:');
      console.table(largest.map(r => ({
        regulator: r.regulator,
        firm: r.firm_individual,
        amount: `€${Number(r.amount_eur || 0).toLocaleString()}`,
        date: r.date_issued?.toISOString().split('T')[0]
      })));
    }

    // Breach type distribution
    const breachTypes = await sql`
      SELECT
        breach_type,
        COUNT(*) as count
      FROM eu_fines
      GROUP BY breach_type
      ORDER BY count DESC
    `;

    if (breachTypes.length > 0) {
      console.log('\n⚖️  EU Breach Types:');
      console.table(breachTypes);
    }

    await sql.end();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    await sql.end();
    process.exit(1);
  }
}

main();
