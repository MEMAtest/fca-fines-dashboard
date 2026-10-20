import fs from "node:fs";
import pg from "pg";
import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPgPoolConfig, resolveConnectionString } from "../../server/db.js";
import { requireExpectedDbTarget } from "../lib/dbTarget.js";
import { UNIFIED_VIEW_REFRESH_LOCK } from "../scraper/lib/refreshViews.js";
import { assessSecEntityRepairRows, runSecEntityRepairApply, type SecEntityRepair, type SecEntityRepairRow } from "./secEtoroRepairHelpers.js";

const manifestPath = new URL("../scraper/data/secEntityRepairs.json", import.meta.url);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as SecEntityRepair[];
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "..");
config({ path: join(root, ".env") });
config({ path: join(root, ".env.local"), override: false });

async function main() {
  const apply = process.argv.includes("--apply");
  if (apply && process.env.SEC_ETORO_ENTITY_REPAIR_APPROVED !== "true") {
    throw new Error("Refusing apply: set SEC_ETORO_ENTITY_REPAIR_APPROVED=true only after independent source and repair review.");
  }
  requireExpectedDbTarget("sec-etoro-entity-repair");
  const connectionString = resolveConnectionString();
  if (!connectionString) throw new Error("DATABASE_URL is required for the read-only repair preflight.");
  const pool = new pg.Pool(buildPgPoolConfig(connectionString));
  const client = await pool.connect();
  try {
    await client.query(apply ? "BEGIN" : "BEGIN READ ONLY");
    if (apply) await client.query("SELECT pg_advisory_xact_lock($1)", [UNIFIED_VIEW_REFRESH_LOCK]);
    const ids = manifest.map((item) => item.id);
    const result = await client.query<SecEntityRepairRow>(
      `SELECT id::text, content_hash AS "contentHash", regulator, firm_individual,
              firm_category, to_char(date_issued, 'YYYY-MM-DD') AS date_issued,
              source_url, final_notice_url, raw_payload->>'title' AS raw_title,
              amount::text AS amount
         FROM public.eu_fines WHERE id = ANY($1::uuid[]) ${apply ? "FOR UPDATE" : ""}`,
      [ids],
    );
    const state = assessSecEntityRepairRows(result.rows, manifest);

    const before = await client.query<{ public_case_id: string }>(
      `SELECT public_case_id FROM public.all_regulatory_fines_trusted ORDER BY public_case_id`,
    );
    console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", state, manifest, verifiedRows: result.rows.length, canonicalCaseCountBefore: before.rowCount, writes: "none" }, null, 2));
    if (!apply) {
      await client.query("ROLLBACK");
      return;
    }

    if (state === "already_applied") {
      await client.query("COMMIT");
      console.log(JSON.stringify({ applied: false, alreadyApplied: true, canonicalCaseCount: before.rowCount, publicCaseIdsUnchanged: true }));
      return;
    }

    const afterIds = await runSecEntityRepairApply({
      lock: async () => undefined,
      snapshot: async () => (await client.query<{ public_case_id: string }>(
        `SELECT public_case_id FROM public.all_regulatory_fines_trusted ORDER BY public_case_id`,
      )).rows.map((row) => row.public_case_id),
      mutate: async () => {
        for (const item of manifest) {
          const updated = await client.query(
            `UPDATE public.eu_fines
                SET firm_individual = $2, firm_category = $3, updated_at = NOW()
              WHERE id = $1::uuid AND content_hash = $4 AND firm_individual = 'Unnamed party (SEC)'
                AND firm_category = 'Unnamed party'
              RETURNING id`,
            [item.id, item.replacementFirm, item.replacementCategory, item.contentHash],
          );
          if (updated.rowCount !== 1) throw new Error(`Expected exactly one guarded update for ${item.id}; got ${updated.rowCount}.`);
        }
      },
      refresh: () => client.query("SELECT public.refresh_all_fines()"),
      commit: () => client.query("COMMIT"),
      rollback: () => client.query("ROLLBACK"),
    });
    console.log(JSON.stringify({ applied: manifest.map(({ id, replacementFirm }) => ({ id, replacementFirm })), canonicalCaseCountAfter: afterIds.length, publicCaseIdsUnchanged: true }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "SEC eToro entity repair failed.");
    process.exitCode = 1;
  });
}
