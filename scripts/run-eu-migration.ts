/**
 * Run EU Fines Migration
 * Creates eu_fines table and unified regulatory fines view
 */

import postgres from 'postgres';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sql = postgres(process.env.DATABASE_URL?.trim() || '', {
  ssl: process.env.DATABASE_URL?.includes('sslmode=') ? 'require' : undefined
});

async function runMigration() {
  console.log('🚀 Starting EU fines migration...\n');

  try {
    // Read migration SQL file
    const migrationPath = join(__dirname, 'migrations', '003_add_eu_fines.sql');
    const migrationSql = readFileSync(migrationPath, 'utf-8');

    console.log('📄 Running migration from:', migrationPath);

    // Execute migration within transaction for atomicity
    await sql.begin(async (tx) => {
      await tx.unsafe(migrationSql);
    });

    console.log('✅ Migration completed successfully!\n');

    // Verify tables created
    const tables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('eu_fines', 'all_regulatory_fines')
      ORDER BY table_name
    `;

    console.log('📊 Tables created:');
    tables.forEach(t => console.log(`   - ${t.table_name}`));

    // Check materialized view
    const viewInfo = await sql`
      SELECT
        schemaname,
        matviewname,
        matviewowner,
        hasindexes
      FROM pg_matviews
      WHERE matviewname = 'all_regulatory_fines'
    `;

    if (viewInfo.length > 0) {
      console.log('\n🔍 Materialized view created:');
      console.log(`   - Name: ${viewInfo[0].matviewname}`);
      console.log(`   - Owner: ${viewInfo[0].matviewowner}`);
      console.log(`   - Has indexes: ${viewInfo[0].hasindexes}`);
    }

    // Check functions
    const functions = await sql`
      SELECT routine_name
      FROM information_schema.routines
      WHERE routine_schema = 'public'
      AND routine_name IN ('refresh_all_fines', 'convert_to_eur', 'convert_to_gbp', 'normalize_regulator')
      ORDER BY routine_name
    `;

    if (functions.length > 0) {
      console.log('\n⚙️  Functions created:');
      functions.forEach(f => console.log(`   - ${f.routine_name}()`));
    }

    // Check indexes
    const indexes = await sql`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'eu_fines'
      ORDER BY indexname
    `;

    console.log(`\n📇 Indexes on eu_fines: ${indexes.length} created`);

    // Current counts
    const fcaCount = await sql`SELECT COUNT(*) as count FROM fca_fines`;
    const euCount = await sql`SELECT COUNT(*) as count FROM eu_fines`;
    const allCount = await sql`SELECT COUNT(*) as count FROM all_regulatory_fines`;

    console.log('\n📈 Current data:');
    console.log(`   - FCA fines: ${fcaCount[0].count}`);
    console.log(`   - EU fines: ${euCount[0].count}`);
    console.log(`   - Unified view: ${allCount[0].count}`);

    console.log('\n✅ Migration verification complete!');
    console.log('\n🎯 Next steps:');
    console.log('   1. Run ESMA scraper: npm run scrape:esma');
    console.log('   2. Run BaFin scraper: npm run scrape:bafin');
    console.log('   3. Check results: npx tsx scripts/check-eu-fines.ts');

    await sql.end();
    process.exit(0);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    await sql.end();
    process.exit(1);
  }
}

runMigration();
