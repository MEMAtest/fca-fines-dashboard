import "dotenv/config";
import postgres from "postgres";
import { resolveConnectionString } from "../server/db.js";

const databaseUrl = resolveConnectionString();
if (!databaseUrl) throw new Error("A supported database connection string is required");

const sql = postgres(databaseUrl, {
  max: 1,
  ssl: databaseUrl.includes("sslmode=") ? { rejectUnauthorized: false } : undefined,
});

try {
  const [result] = await sql<[{ refreshed: number }]>`
    SELECT public.refresh_enforcement_concept_classifications() AS refreshed
  `;
  const [count] = await sql<[{ total: number }]>`
    SELECT COUNT(*)::int AS total
    FROM public.enforcement_concept_classifications
    WHERE concept = 'CYBER_OPERATIONAL_RESILIENCE'
      AND classification_version = '2026-09-19.v1'
  `;
  console.log(JSON.stringify({
    concept: "CYBER_OPERATIONAL_RESILIENCE",
    version: "2026-09-19.v1",
    refreshed: Number(result?.refreshed ?? 0),
    total: Number(count?.total ?? 0),
  }));
} finally {
  await sql.end();
}
