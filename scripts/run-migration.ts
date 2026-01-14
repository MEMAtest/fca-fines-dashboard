import 'dotenv/config';
import { readFileSync } from 'fs';
import { getSqlClient } from '../server/db.ts';

const migrationFile = process.argv[2];

if (!migrationFile) {
  console.error('Usage: ts-node scripts/run-migration.ts <migration-file>');
  process.exit(1);
}

async function runMigration() {
  try {
    console.log(`Running migration: ${migrationFile}`);

    const sql = getSqlClient();
    const migrationSQL = readFileSync(migrationFile, 'utf-8');

    // Parse SQL with proper handling of dollar-quoted strings
    const statements: string[] = [];
    let currentStatement = '';
    let inDollarQuote = false;
    let dollarQuoteTag = '';

    for (const line of migrationSQL.split('\n')) {
      const trimmed = line.trim();

      // Skip comment-only lines when not in dollar quote
      if (!inDollarQuote && (trimmed.startsWith('--') || trimmed === '')) continue;

      // Check for dollar quote delimiters
      const dollarMatches = line.matchAll(/\$(\w*)\$/g);
      for (const match of dollarMatches) {
        const tag = match[0];
        if (!inDollarQuote) {
          inDollarQuote = true;
          dollarQuoteTag = tag;
        } else if (tag === dollarQuoteTag) {
          inDollarQuote = false;
          dollarQuoteTag = '';
        }
      }

      currentStatement += line + '\n';

      // End statement on ; if not in dollar quote
      if (!inDollarQuote && trimmed.endsWith(';')) {
        statements.push(currentStatement.trim());
        currentStatement = '';
      }
    }

    if (currentStatement.trim()) {
      statements.push(currentStatement.trim());
    }

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      if (stmt.length > 10) {
        try {
          await sql(stmt);
          console.log(`✓ Statement ${i + 1}/${statements.length} executed`);
        } catch (err: any) {
          // Ignore "already exists" errors for CREATE IF NOT EXISTS
          if (err.code !== '42P07' && err.code !== '42710') {
            throw err;
          }
          console.log(`⚠ Statement ${i + 1}/${statements.length} - already exists, skipping`);
        }
      }
    }

    console.log('\n✅ Migration completed successfully!');
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
