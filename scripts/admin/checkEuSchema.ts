#!/usr/bin/env tsx
/**
 * Check EU Fines Schema
 *
 * Verify that the EU fines tables and views were created successfully
 */

import postgres from 'postgres';

const dbUrl = process.env.DATABASE_URL?.trim() || '';
const sql = postgres(dbUrl, {
  ssl: dbUrl.includes('sslmode=') ? { rejectUnauthorized: false } : false
});

async function main() {
  console.log('📊 EU Fines Database Schema Status\n');

  try {
    // Check eu_fines table exists
    const euFinesExists = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'eu_fines'
      ) as exists
    `;
    console.log(`eu_fines table exists: ${euFinesExists[0].exists ? '✅' : '❌'}`);

    // Check eu_fines row count
    const euFinesCount = await sql`SELECT COUNT(*) as count FROM eu_fines`;
    console.log(`eu_fines row count: ${euFinesCount[0].count}\n`);

    // Check materialized view exists
    const viewExists = await sql`
      SELECT EXISTS (
        SELECT FROM pg_matviews
        WHERE matviewname = 'all_regulatory_fines'
      ) as exists
    `;
    console.log(`all_regulatory_fines view exists: ${viewExists[0].exists ? '✅' : '❌'}`);

    // Check view row count
    const viewCount = await sql`SELECT COUNT(*) as count FROM all_regulatory_fines`;
    console.log(`all_regulatory_fines row count: ${viewCount[0].count}`);

    // Show breakdown by regulator
    const breakdown = await sql`
      SELECT regulator, COUNT(*) as count
      FROM all_regulatory_fines
      GROUP BY regulator
      ORDER BY count DESC
    `;
    console.log('\nFines by regulator:');
    console.table(breakdown);

    // Check indexes
    const indexes = await sql`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename IN ('eu_fines', 'all_regulatory_fines')
      ORDER BY tablename, indexname
    `;
    console.log(`\nIndexes created: ${indexes.length}`);
    console.table(indexes.map(i => ({ index: i.indexname })));

    // Check functions
    const functions = await sql`
      SELECT routine_name
      FROM information_schema.routines
      WHERE routine_name IN ('refresh_all_fines', 'normalize_regulator', 'convert_to_eur', 'convert_to_gbp')
      ORDER BY routine_name
    `;
    console.log(`\nHelper functions: ${functions.length}/4`);
    console.table(functions.map(f => ({ function: f.routine_name })));

    console.log('\n✅ Schema validation complete');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
