import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config();

const sql = neon(process.env.NEON_FCA_FINES_URL!);

async function fixBadDates() {
  console.log('🔍 Finding records with bad dates (year < 2000)...\n');

  // Find all records with bad years
  const badRecords = await sql`
    SELECT id, firm_individual, date_issued, year_issued, month_issued
    FROM fca_fines
    WHERE year_issued < 2000
    ORDER BY date_issued
  `;

  console.log(`Found ${badRecords.length} records with bad dates:\n`);

  for (const record of badRecords) {
    console.log(`  - ${record.firm_individual}: ${record.date_issued} (year: ${record.year_issued})`);
  }

  if (badRecords.length === 0) {
    console.log('✅ No bad records found!');
    return;
  }

  console.log('\n🔧 Fixing dates by adding 100 years...\n');

  // Fix each record
  for (const record of badRecords) {
    const oldDate = new Date(record.date_issued);
    const newYear = oldDate.getFullYear() + 100;
    const newDate = new Date(oldDate);
    newDate.setFullYear(newYear);

    console.log(`  Fixing ${record.firm_individual}:`);
    console.log(`    Old: ${oldDate.toISOString()} (year: ${record.year_issued})`);
    console.log(`    New: ${newDate.toISOString()} (year: ${newYear})`);

    await sql`
      UPDATE fca_fines
      SET
        date_issued = ${newDate.toISOString()},
        year_issued = ${newYear},
        month_issued = ${newDate.getMonth() + 1}
      WHERE id = ${record.id}
    `;

    console.log(`    ✅ Updated\n`);
  }

  console.log('🎉 All bad dates fixed!');

  // Verify the fix
  const remaining = await sql`
    SELECT COUNT(*)::int as count
    FROM fca_fines
    WHERE year_issued < 2000
  `;

  console.log(`\n📊 Verification: ${remaining[0].count} records remaining with year < 2000`);
}

fixBadDates().catch(console.error);
