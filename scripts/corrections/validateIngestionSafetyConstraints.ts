import "dotenv/config";
import postgres from "postgres";
import { resolveConnectionString } from "../../server/db.js";

const databaseUrl = resolveConnectionString();
if (!databaseUrl) throw new Error("A supported database connection string is required");
const sql = postgres(databaseUrl, { max: 1, ssl: databaseUrl.includes("sslmode=") ? { rejectUnauthorized: false } : undefined });

async function main() {
  await sql`ALTER TABLE public.eu_fines VALIDATE CONSTRAINT eu_fines_amount_not_nan`;
  await sql`ALTER TABLE public.eu_fines VALIDATE CONSTRAINT eu_fines_amount_eur_not_nan`;
  await sql`ALTER TABLE public.eu_fines VALIDATE CONSTRAINT eu_fines_amount_gbp_not_nan`;
  console.log("Validated ingestion amount NaN constraints.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => sql.end());
