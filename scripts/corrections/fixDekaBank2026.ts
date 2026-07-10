#!/usr/bin/env npx tsx
import pg from "pg";
import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPgPoolConfig, resolveConnectionString } from "../../server/db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "..");
config({ path: join(root, ".env") });
config({ path: join(root, ".env.local"), override: false });

const connectionString = resolveConnectionString();
if (!connectionString) {
  throw new Error("DATABASE_URL is required to correct the DekaBank record");
}

const pool = new pg.Pool(buildPgPoolConfig(connectionString));
const client = await pool.connect();
const checkOnly = process.argv.includes("--check");

try {
  await client.query("BEGIN");
  const result = checkOnly
    ? await client.query(`
        SELECT id, content_hash, firm_individual, amount, amount_eur, amount_gbp,
               breach_type, final_notice_url
        FROM public.eu_fines
        WHERE regulator = 'BaFin'
          AND firm_individual = 'DekaBank Deutsche Girozentrale'
          AND date_issued = DATE '2026-06-08'
          AND final_notice_url LIKE '%meldung_2026_06_08_dekabank%'
      `)
    : await client.query(`
        UPDATE public.eu_fines
        SET amount = NULL,
            amount_eur = NULL,
            amount_gbp = NULL,
            breach_type = 'Financial Reporting Examination',
            breach_categories = '["DISCLOSURE", "REPORTING"]'::jsonb,
            raw_payload = COALESCE(raw_payload, '{}'::jsonb) || jsonb_build_object(
              'editorialCorrection', '2026-07 DekaBank amount was a tax receivable, not a financial penalty',
              'monetarySanctionVerified', false,
              'monetaryReference', 478000000
            ),
            updated_at = NOW()
        WHERE regulator = 'BaFin'
          AND firm_individual = 'DekaBank Deutsche Girozentrale'
          AND date_issued = DATE '2026-06-08'
          AND final_notice_url LIKE '%meldung_2026_06_08_dekabank%'
        RETURNING id, content_hash, firm_individual, amount, amount_eur, amount_gbp,
                  breach_type, final_notice_url
      `);

  if (result.rowCount !== 1) {
    throw new Error(`Expected exactly one DekaBank row, found ${result.rowCount ?? 0}`);
  }

  if (checkOnly) {
    await client.query("ROLLBACK");
    console.log(JSON.stringify({ checkOnly: true, record: result.rows[0] }, null, 2));
  } else {
    await client.query("SELECT public.refresh_all_fines()");
    await client.query("COMMIT");
    console.log(JSON.stringify({ corrected: result.rows[0] }, null, 2));
  }
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
