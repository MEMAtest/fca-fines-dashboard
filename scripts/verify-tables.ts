import 'dotenv/config';
import { getSqlClient } from '../server/db.ts';

async function verifyTables() {
  const sql = getSqlClient();

  console.log('Checking yearly_summaries table...');
  const summaries = await sql('SELECT * FROM yearly_summaries');
  console.log(`✓ Found ${summaries.length} yearly summary record(s)`);
  if (summaries.length > 0) {
    console.log('  Sample:', summaries[0]);
  }

  console.log('\nChecking contact_submissions table...');
  const contacts = await sql('SELECT COUNT(*) as count FROM contact_submissions');
  console.log(`✓ Contact submissions table exists with ${contacts[0].count} record(s)`);

  console.log('\n✅ All tables verified successfully!');
}

verifyTables().catch(console.error);
