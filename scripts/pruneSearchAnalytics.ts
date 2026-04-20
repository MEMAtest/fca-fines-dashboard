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

function parseIntArg(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function main() {
  const retentionDays = parseIntArg(process.argv[2], 90);

  const [result] = await sql<{ deleted_rows: number }[]>`
    WITH deleted AS (
      DELETE FROM search_query_analytics
      WHERE created_at < NOW() - (${retentionDays} || ' days')::interval
      RETURNING 1
    )
    SELECT COUNT(*)::int AS deleted_rows
    FROM deleted
  `;

  console.log(
    JSON.stringify(
      {
        retentionDays,
        deletedRows: result?.deleted_rows ?? 0,
      },
      null,
      2,
    ),
  );

  await sql.end();
}

void main().catch(async (error) => {
  console.error('❌ Search analytics prune failed', error);
  await sql.end();
  process.exitCode = 1;
});
