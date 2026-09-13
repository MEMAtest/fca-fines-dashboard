import postgres from "postgres";
import * as dotenv from "dotenv";
import { buildProductFunnelReport, type ProductFunnelReportRow } from "../server/services/productFunnel.js";

dotenv.config();

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const sql = postgres(databaseUrl, {
  ssl: databaseUrl.includes("sslmode=") ? { rejectUnauthorized: false } : undefined,
});

function parseDays(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 365) : 7;
}

async function main() {
  const days = parseDays(process.argv[2]);
  const rows = await sql<ProductFunnelReportRow[]>`
    SELECT event_name, surface, regulator_code, COUNT(*)::int AS event_count
    FROM public.product_funnel_events
    WHERE created_at >= now() - (${days}::int * interval '1 day')
    GROUP BY event_name, surface, regulator_code
    ORDER BY surface, regulator_code, event_name
  `;
  // Deliberately print only aggregate stages and categorical scope. This
  // report cannot expose search terms, firms, email addresses or URLs.
  console.log(JSON.stringify(buildProductFunnelReport(rows, days), null, 2));
}

main()
  .catch((error) => {
    console.error("Product funnel report failed", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
