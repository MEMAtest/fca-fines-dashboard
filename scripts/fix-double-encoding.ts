import postgres from 'postgres';
import * as dotenv from 'dotenv';

dotenv.config();

const sql = postgres(process.env.DATABASE_URL?.trim() || '', {
  ssl: process.env.DATABASE_URL?.includes('sslmode=')
    ? { rejectUnauthorized: false }
    : false
});

async function fixDoubleEncoding() {
  console.log('🔧 Fixing double-encoded breach_categories...\n');

  try {
    // Find all double-encoded records
    const doubleEncoded = await sql`
      SELECT id, firm_individual, breach_categories
      FROM eu_fines
      WHERE jsonb_typeof(breach_categories) = 'string'
    `;

    console.log(`Found ${doubleEncoded.length} records with double-encoding\n`);

    let fixed = 0;
    let errors = 0;

    for (const record of doubleEncoded) {
      try {
        // The breach_categories is currently a JSONB string: "\"[\\\"MAR\\\",\\\"DISCLOSURE\\\"]\""
        // We need to parse it to get the actual array
        const stringValue = record.breach_categories as unknown as string;
        const actualArray = JSON.parse(stringValue);

        console.log(`Fixing: ${record.firm_individual}`);
        console.log(`   Before: ${JSON.stringify(record.breach_categories)}`);
        console.log(`   After:  ${JSON.stringify(actualArray)}`);

        // Update with properly parsed array
        await sql`
          UPDATE eu_fines
          SET breach_categories = ${sql.json(actualArray)},
              updated_at = NOW()
          WHERE id = ${record.id}
        `;

        fixed++;

      } catch (error) {
        console.error(`❌ Error fixing ${record.firm_individual}:`, error);
        errors++;
      }
    }

    console.log(`\n✅ Fixed ${fixed} records`);
    if (errors > 0) {
      console.log(`❌ Errors: ${errors}`);
    }

    // Verify fix
    const stillDoubleEncoded = await sql`
      SELECT COUNT(*) as count
      FROM eu_fines
      WHERE jsonb_typeof(breach_categories) = 'string'
    `;

    console.log(`\n🔍 Verification:`);
    console.log(`   Remaining double-encoded records: ${stillDoubleEncoded[0].count}`);

    if (Number(stillDoubleEncoded[0].count) === 0) {
      console.log('   ✅ All records fixed!');
    } else {
      console.log('   ⚠️  Some records still have issues');
    }

    await sql.end();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error fixing double-encoding:', error);
    await sql.end();
    process.exit(1);
  }
}

fixDoubleEncoding();
