import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import * as dotenv from 'dotenv';

dotenv.config();

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const sql = postgres(databaseUrl, {
  ssl: databaseUrl.includes('sslmode=')
    ? { rejectUnauthorized: false }
    : undefined,
});

async function main() {
  const migrationPaths = [
    'migrations/20260420_search_query_analytics.sql',
    'migrations/20260423_search_query_modes.sql',
  ].map((migration) => path.resolve(process.cwd(), migration));

  console.log('🚀 Running search query analytics migration...');
  for (const migrationPath of migrationPaths) {
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');
    await sql.unsafe(migrationSql);
  }

  const verification = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'search_query_analytics'
  `;

  if (verification.length === 0) {
    throw new Error('search_query_analytics table was not created');
  }

  console.log('✅ search_query_analytics table is ready');
  await sql.end();
}

void main().catch(async (error) => {
  console.error('❌ Search analytics migration failed', error);
  await sql.end();
  process.exitCode = 1;
});
