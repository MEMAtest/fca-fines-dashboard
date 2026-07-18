import type { VercelRequest, VercelResponse } from "@vercel/node";
import postgres from "postgres";
import { resolveConnectionString } from "../../server/db.js";
import { runSourceEvidenceChecks } from "../../scripts/check-regulatory-source-evidence.js";

const SOURCE_CHECK_LOCK_ID = 7_180_261;

export function isSourceCheckAuthorised(
  authorization: string | undefined,
  cronSecret: string | undefined,
) {
  const expected = cronSecret?.trim();
  const supplied = authorization?.replace(/^Bearer\s+/i, "").trim();
  return Boolean(expected && supplied === expected);
}

export function sourceCheckLimit(value: unknown) {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return Number.isFinite(parsed)
    ? Math.max(1, Math.min(60, Math.floor(parsed)))
    : 25;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!isSourceCheckAuthorised(req.headers.authorization, process.env.CRON_SECRET)) {
    return res.status(401).json({ error: "Unauthorised" });
  }

  const databaseUrl = resolveConnectionString();
  if (!databaseUrl) {
    return res.status(503).json({ error: "Evidence database is not configured" });
  }
  const sql = postgres(databaseUrl, {
    max: 1,
    ssl: databaseUrl.includes("sslmode=")
      ? { rejectUnauthorized: false }
      : undefined,
  });

  try {
    const [{ locked }] = await sql<{ locked: boolean }[]>`
      SELECT pg_try_advisory_lock(${SOURCE_CHECK_LOCK_ID}) AS locked
    `;
    if (!locked) {
      return res.status(202).json({ skipped: true, reason: "A source assessment run is already active" });
    }

    try {
      const regulator = typeof req.query.regulator === "string"
        ? req.query.regulator.toUpperCase()
        : undefined;
      const summary = await runSourceEvidenceChecks(sql, {
        limit: sourceCheckLimit(req.query.limit),
        concurrency: 6,
        regulator,
      });
      return res.status(200).json(summary);
    } finally {
      await sql`SELECT pg_advisory_unlock(${SOURCE_CHECK_LOCK_ID})`;
    }
  } catch (error) {
    console.error("Official-source assessment failed", error);
    return res.status(500).json({ error: "Official-source assessment failed" });
  } finally {
    await sql.end();
  }
}
