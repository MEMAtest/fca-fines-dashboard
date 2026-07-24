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

interface BreachRepair {
  sourceRowId: string;
  breachType: string;
  categories: string[];
}

const BREACH_REPAIRS: BreachRepair[] = [
  { sourceRowId: "a6d88618-152b-42c9-ba7b-46af8d7dfa66", breachType: "Individual accountability and integrity", categories: ["INDIVIDUAL_ACCOUNTABILITY", "INTEGRITY"] },
  { sourceRowId: "1ddb7b2f-4209-4c99-9a78-8752f2931f98", breachType: "Listing rules and disclosure", categories: ["DISCLOSURE", "LISTING_RULES"] },
  { sourceRowId: "58ac3254-dd68-42ec-ad65-fed72f5284be", breachType: "Listing rules and disclosure", categories: ["DISCLOSURE", "LISTING_RULES"] },
  { sourceRowId: "cd725e67-bdf1-4a1a-a4c9-07e1ceca5b02", breachType: "Listing rules and disclosure", categories: ["DISCLOSURE", "LISTING_RULES"] },
  { sourceRowId: "59169896-87d4-462c-908c-eddbda8973cd", breachType: "Listing rules and disclosure", categories: ["DISCLOSURE", "LISTING_RULES"] },
  { sourceRowId: "b910f667-653a-4e4a-8f1d-9e7879d1518e", breachType: "Individual accountability and disclosure", categories: ["INDIVIDUAL_ACCOUNTABILITY", "DISCLOSURE"] },
  { sourceRowId: "f5ab4bb9-1b26-4b5b-b0b9-bddff3ca03d1", breachType: "Individual accountability and integrity", categories: ["INDIVIDUAL_ACCOUNTABILITY", "INTEGRITY"] },
  { sourceRowId: "c34cdc61-927a-4fcf-a15e-ac65a73fd26a", breachType: "Competition law", categories: ["COMPETITION"] },
  { sourceRowId: "364573a1-07e7-4d28-bd61-a9b9c8d96a40", breachType: "Competition law", categories: ["COMPETITION"] },
  { sourceRowId: "0647035f-8d4d-4353-ac72-c4712fae9a30", breachType: "Competition law", categories: ["COMPETITION"] },
  { sourceRowId: "c847fc0c-7609-4719-acaa-331205112d59", breachType: "Market abuse and unlawful disclosure", categories: ["MARKET_ABUSE", "DISCLOSURE"] },
  { sourceRowId: "37728c9c-0a8b-45fd-a531-3fc7a18dbd4e", breachType: "Listing rules and sponsor controls", categories: ["DISCLOSURE", "SYSTEMS_CONTROLS"] },
  { sourceRowId: "9df76312-a841-45ae-ade2-8325e4757b1c", breachType: "Pension advice and individual accountability", categories: ["CONSUMER_PROTECTION", "SUITABILITY", "INDIVIDUAL_ACCOUNTABILITY"] },
  { sourceRowId: "b8e63327-8e64-44ae-9937-6bb7e518601c", breachType: "Pension advice and individual accountability", categories: ["CONSUMER_PROTECTION", "SUITABILITY", "INDIVIDUAL_ACCOUNTABILITY"] },
  { sourceRowId: "1ddbe244-b9ed-479c-8668-95a062896e62", breachType: "Listing rules and sponsor controls", categories: ["DISCLOSURE", "SYSTEMS_CONTROLS"] },
  { sourceRowId: "4bee2642-92cd-49f4-81b6-fb4e326baf8e", breachType: "Client assets and custody controls", categories: ["CLIENT_ASSETS", "SYSTEMS_CONTROLS"] },
  { sourceRowId: "dc5dfdc3-ee6f-45a0-8d1e-747af234f24e", breachType: "Conduct, integrity and consumer protection", categories: ["CONSUMER_PROTECTION", "INDIVIDUAL_ACCOUNTABILITY", "INTEGRITY"] },
  { sourceRowId: "77190177-cc6e-4072-aa1e-9cbad90f7897", breachType: "Individual accountability and integrity", categories: ["INDIVIDUAL_ACCOUNTABILITY", "INTEGRITY"] },
  { sourceRowId: "cfab1fa0-733a-4d79-8374-0a7b3a7226ee", breachType: "Benchmark manipulation and market conduct", categories: ["MARKET_ABUSE", "BENCHMARKS"] },
  { sourceRowId: "f2cd38d2-6d5b-4a3e-b66d-564dc6e70b1f", breachType: "Consumer protection and fitness", categories: ["CONSUMER_PROTECTION", "INDIVIDUAL_ACCOUNTABILITY"] },
  { sourceRowId: "33f0d267-db3c-46c2-bf5e-88fe7b13f3d1", breachType: "Individual accountability and document falsification", categories: ["INDIVIDUAL_ACCOUNTABILITY", "INTEGRITY"] },
  { sourceRowId: "311e559c-aaa6-47fd-a2e1-4666e69f8d4c", breachType: "Market manipulation", categories: ["MARKET_ABUSE"] },
  { sourceRowId: "cd7f09a8-40fb-4cd4-ba98-5e5907c3e852", breachType: "Client treatment and conflicts", categories: ["CONSUMER_PROTECTION", "CONFLICTS_OF_INTEREST"] },
  { sourceRowId: "620e6187-e3a0-43f2-a8af-b08531071a06", breachType: "Individual accountability and competence", categories: ["INDIVIDUAL_ACCOUNTABILITY", "INTEGRITY"] },
  { sourceRowId: "93241a16-8d03-44db-aca1-e01c722e6432", breachType: "Benchmark manipulation and market conduct", categories: ["MARKET_ABUSE", "BENCHMARKS"] },
  { sourceRowId: "e7003f8c-4422-473e-9861-ad05b1d0a9ff", breachType: "Appointed representative oversight and sales practices", categories: ["CONSUMER_PROTECTION", "SYSTEMS_CONTROLS"] },
  { sourceRowId: "53fd9246-4a30-4c2d-8d6e-b7f42eb37368", breachType: "Compliance oversight and individual accountability", categories: ["INDIVIDUAL_ACCOUNTABILITY", "SYSTEMS_CONTROLS"] },
  { sourceRowId: "55a083bb-d52a-4847-93e6-d46bf91074e9", breachType: "Benchmark manipulation and market conduct", categories: ["MARKET_ABUSE", "BENCHMARKS"] },
  { sourceRowId: "5481d5b4-93f1-4aec-b569-a86c6825d272", breachType: "Individual accountability and integrity", categories: ["INDIVIDUAL_ACCOUNTABILITY", "INTEGRITY"] },
  { sourceRowId: "9cb83b82-8d24-44d4-9c3c-9595534117ed", breachType: "Individual accountability and competence", categories: ["INDIVIDUAL_ACCOUNTABILITY", "GOVERNANCE"] },
  { sourceRowId: "fb389e62-6574-4f49-93aa-ebfdbead0042", breachType: "Regulatory cooperation and governance", categories: ["GOVERNANCE", "REGULATORY_REPORTING"] },
  { sourceRowId: "240edfbd-a5a2-4200-b9c5-afeb2d96a393", breachType: "Listing rules and disclosure", categories: ["DISCLOSURE", "LISTING_RULES"] },
  { sourceRowId: "20b01faf-2e76-4d6b-8bac-f207eb983621", breachType: "Listing rules and disclosure", categories: ["DISCLOSURE", "LISTING_RULES"] },
  { sourceRowId: "37db1c86-f06b-4f69-b069-e872eec6005f", breachType: "Benchmark manipulation and market conduct", categories: ["MARKET_ABUSE", "BENCHMARKS"] },
  { sourceRowId: "624a11d6-b26e-417e-97f5-6494a703be5f", breachType: "Misappropriation and consumer harm", categories: ["CONSUMER_PROTECTION", "FINANCIAL_CRIME", "INDIVIDUAL_ACCOUNTABILITY"] },
];

const SOURCE_REPAIRS = new Map<string, string>([
  ["890f7a35-ef0f-4831-a449-4e0f1c7d24bb", "https://www.fca.org.uk/publication/final-notices/christopher-john-riches.pdf"],
  ["d3adfedf-16d3-422b-9c76-069c9ab26e45", "https://www.fca.org.uk/publication/final-notices/final-notice-craig-mcneil.pdf"],
  ["599a1a96-c6b6-4142-96f9-9a6f81931b50", "https://www.fca.org.uk/news/press-releases/fca-secures-high-court-judgment-awarding-injunction-and-over-%C2%A37-million"],
  ["b73d71e2-d3c8-450f-83a5-b319c5f537d7", "https://www.fca.org.uk/publication/final-notices/gurpreet-singh-chadda.pdf"],
  ["1b7ff08e-7d6a-45ed-a6a5-53efec263e6c", "https://www.fca.org.uk/news/press-releases/fca-secures-high-court-judgment-awarding-injunction-and-over-%C2%A37-million"],
  ["8993c72f-016b-413b-bae2-bce494e0a160", "https://www.fca.org.uk/publication/final-notices/jjfs-final-notice.pdf"],
  ["53af10a1-ecc3-4caa-8d94-d3dbc357e727", "https://www.fca.org.uk/news/press-releases/martin-brokers-uk-limited-fined-%C2%A3630000-significant-failings-relation-libor"],
  ["41a567c3-e6b6-470b-8c4b-6300592eaee7", "https://www.fca.org.uk/news/press-releases/fca-secures-high-court-judgment-awarding-injunction-and-over-%C2%A37-million"],
  ["c084725d-d985-4126-be01-106c66bf3eb5", "https://www.fca.org.uk/news/press-releases/fca-fines-and-bans-former-investment-analyst-aviva-investors"],
  ["66214b2c-12bb-4a38-a52c-a40f53bc7d91", "https://www.fca.org.uk/publication/final-notices/pas.pdf"],
  ["55560c46-0c5b-4231-bf39-1fa5fa5040b5", "https://www.fca.org.uk/publication/final-notices/sesame-limited.pdf"],
  ["b416ca4e-020e-4339-b5c0-880a162ab440", "https://www.fca.org.uk/news/press-releases/fca-secures-high-court-judgment-awarding-injunction-and-over-%C2%A37-million"],
  ["6d50565b-0a08-4f67-8c4b-7e40b0fee299", "https://www.fca.org.uk/news/press-releases/fca-secures-high-court-judgment-awarding-injunction-and-over-%C2%A37-million"],
  ["baf91013-5d59-4eb7-9698-bab0f8436dd2", "https://www.fca.org.uk/publication/final-notices/timothy-alan-roberts.pdf"],
  ["8048cace-8fee-448f-8d79-82bf374e8b98", "https://www.fca.org.uk/publication/final-notices/xcap-securities-plc.pdf"],
]);

async function main() {
  const connectionString = resolveConnectionString();
  if (!connectionString) throw new Error("A database connection string is required");
  const apply = process.argv.includes("--apply");
  const pool = new pg.Pool(buildPgPoolConfig(connectionString));
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const sourceRowIds = BREACH_REPAIRS.map((repair) => repair.sourceRowId);
    const publicIds = [...SOURCE_REPAIRS.keys()];
    const existing = await client.query(
      `SELECT trusted.public_case_id, trusted.id, trusted.firm_individual,
              trusted.breach_type, trusted.breach_categories,
              trusted.notice_url, trusted.summary
       FROM public.all_regulatory_fines_trusted AS trusted
       WHERE trusted.id = ANY($1::text[])
          OR trusted.public_case_id = ANY($2::text[])`,
      [sourceRowIds, publicIds],
    );
    const bySourceRowId = new Map(existing.rows.map((row) => [row.id, row]));
    const byPublicId = new Map(existing.rows.map((row) => [row.public_case_id, row]));
    const missingSourceRows = sourceRowIds.filter((id) => !bySourceRowId.has(id));
    const missingPublicIds = publicIds.filter((id) => !byPublicId.has(id));
    if (missingSourceRows.length || missingPublicIds.length) {
      throw new Error(
        `Repair targets missing from trusted view: source=${missingSourceRows.join(", ")} public=${missingPublicIds.join(", ")}`,
      );
    }

    for (const repair of BREACH_REPAIRS) {
      const row = bySourceRowId.get(repair.sourceRowId)!;
      if (row.breach_type || (Array.isArray(row.breach_categories) && row.breach_categories.length)) {
        const existingCategories = Array.isArray(row.breach_categories)
          ? row.breach_categories.map(String).sort()
          : [];
        const expectedCategories = [...repair.categories].sort();
        if (
          row.breach_type === repair.breachType
          && JSON.stringify(existingCategories) === JSON.stringify(expectedCategories)
        ) {
          continue;
        }
        throw new Error(
          `Breach repair target ${repair.sourceRowId} has a conflicting classification`,
        );
      }
      if (!String(row.summary ?? "").trim()) {
        throw new Error(`Breach repair target ${repair.sourceRowId} has no source summary`);
      }
      await client.query(
        `UPDATE public.fca_fines
         SET breach_type = $1, breach_categories = $2::jsonb
         WHERE id = $3`,
        [repair.breachType, JSON.stringify(repair.categories), row.id],
      );
    }

    for (const [publicId, finalNoticeUrl] of SOURCE_REPAIRS) {
      const row = byPublicId.get(publicId)!;
      await client.query(
        `UPDATE public.fca_fines
         SET final_notice_url = $1
         WHERE id = $2`,
        [finalNoticeUrl, row.id],
      );
    }

    if (!apply) {
      await client.query("ROLLBACK");
      console.log(JSON.stringify({
        mode: "check",
        breachRepairs: BREACH_REPAIRS.length,
        sourceRepairs: SOURCE_REPAIRS.size,
        sourceRows: existing.rows.length,
      }, null, 2));
      return;
    }

    await client.query("SELECT public.refresh_all_fines()");
    await client.query(`
      UPDATE public.regulatory_case_registry AS registry
      SET current_fingerprint = canonical.canonical_case_id,
          updated_at = now()
      FROM public.all_regulatory_fines_canonical AS canonical
      WHERE registry.source_row_id = canonical.id::text
        AND registry.current_fingerprint IS DISTINCT FROM canonical.canonical_case_id
    `);
    await client.query(`
      INSERT INTO public.regulatory_case_aliases (fingerprint, public_case_id)
      SELECT registry.current_fingerprint, registry.public_case_id
      FROM public.regulatory_case_registry AS registry
      ON CONFLICT (fingerprint) DO NOTHING
    `);
    await client.query("COMMIT");
    console.log(JSON.stringify({
      mode: "apply",
      breachRepairs: BREACH_REPAIRS.length,
      sourceRepairs: SOURCE_REPAIRS.size,
      sourceRows: existing.rows.length,
    }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

void main().catch((error) => {
  console.error("FCA evidence repair failed", error);
  process.exitCode = 1;
});
