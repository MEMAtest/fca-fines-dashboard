import postgres from 'postgres';
import * as dotenv from 'dotenv';
import { resolveConnectionString } from './lib/dbTarget.js';

dotenv.config();

const sql = postgres(resolveConnectionString()?.trim() || '', {
  ssl: resolveConnectionString()?.includes('sslmode=')
    ? { rejectUnauthorized: false }
    : false
});

async function main() {
  console.log('Deleting corrupted date records (pre-2000)...\n');

  // First, show what we're about to delete
  const toDelete = await sql`
    SELECT id, firm_individual, date_issued
    FROM fca_fines
    WHERE date_issued < '2000-01-01'
  `;

  console.log(`Found ${toDelete.length} records to delete:`);
  toDelete.forEach(fine => {
    console.log(`  - ${fine.firm_individual}: ${fine.date_issued}`);
  });

  // Delete them
  const result = await sql`
    DELETE FROM fca_fines
    WHERE date_issued < '2000-01-01'
  `;

  console.log(`\n✅ Deleted ${result.count} corrupted records`);

  await sql.end();
}

main();
