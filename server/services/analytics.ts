import crypto from 'node:crypto';
import { getSqlClient } from '../db.js';

let ensured = false;

function hashText(input: string | undefined | null) {
  return crypto.createHash('sha256').update(input || 'unknown').digest('hex');
}

async function ensureTable() {
  if (ensured) return;
  const sql = getSqlClient();
  await sql`
    CREATE TABLE IF NOT EXISTS fca_pageviews (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      path TEXT NOT NULL,
      user_agent_hash TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_fca_pageviews_created ON fca_pageviews (created_at DESC);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_fca_pageviews_path ON fca_pageviews (path);`;
  ensured = true;
}

export async function recordPageview(path: string, userAgent?: string) {
  await ensureTable();
  const sql = getSqlClient();
  const uaHash = hashText(userAgent);
  await sql`INSERT INTO fca_pageviews (path, user_agent_hash) VALUES (${path}, ${uaHash})`;
}

export interface DailySummary {
  totalPageviews: number;
  topPaths: Array<{ path: string; hits: number }>;
  latestNotice: { firm: string; amount: number; date: string } | null;
}

export async function getDailySummary(since: Date): Promise<DailySummary> {
  await ensureTable();
  const sql = getSqlClient();
  const sinceIso = since.toISOString();

  const totalRows = (await sql`
    SELECT COUNT(*)::int AS total_pageviews
    FROM fca_pageviews
    WHERE created_at >= ${sinceIso}
  `) as any[];
  const total_pageviews = totalRows[0]?.total_pageviews;

  const topPaths = (await sql`
    SELECT path, COUNT(*)::int AS hits
    FROM fca_pageviews
    WHERE created_at >= ${sinceIso}
    GROUP BY path
    ORDER BY hits DESC
    LIMIT 5
  `) as any[];

  const latestRows = (await sql`
    SELECT firm_individual, amount, date_issued
    FROM fca_fines
    WHERE date_issued >= (NOW() - INTERVAL '1 day')
    ORDER BY date_issued DESC, amount DESC
    LIMIT 1
  `) as any[];
  const latestNotice = latestRows[0];

  return {
    totalPageviews: total_pageviews || 0,
    topPaths: topPaths.map((row: any) => ({ path: row.path, hits: row.hits })),
    latestNotice: latestNotice
      ? {
          firm: latestNotice.firm_individual,
          amount: Number(latestNotice.amount) || 0,
          date: new Date(latestNotice.date_issued).toISOString().slice(0, 10),
        }
      : null,
  };
}
