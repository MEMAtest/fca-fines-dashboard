import "dotenv/config";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import {
  convertToEur,
  convertToGbp,
  limitRecords,
} from "./lib/euFineHelpers.js";
import { UK_ENFORCEMENT_SEED_RECORDS, type UKEnforcementSeedRecord } from "./data/ukEnforcementSeed.js";
import { scrapeAllUKEnforcementSources } from "./ukEnforcementScrapers.js";

interface DbUKEnforcementRecord extends UKEnforcementSeedRecord {
  id: string;
  contentHash: string;
  amountGbp: number | null;
  amountEur: number | null;
  yearIssued: number;
  monthIssued: number;
}

function getCliFlags() {
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? Number.parseInt(limitArg.split("=")[1] || "", 10) : null;

  return {
    dryRun: process.argv.includes("--dry-run"),
    seedOnly: process.argv.includes("--seed-only"),
    limit: Number.isFinite(limit) ? limit : null,
  };
}

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

function buildContentHash(record: UKEnforcementSeedRecord) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        regulator: record.regulator,
        firmIndividual: record.firmIndividual,
        amount: record.amount,
        currency: record.currency,
        dateIssued: record.dateIssued,
        noticeUrl: record.noticeUrl,
      }),
    )
    .digest("hex");
}

export function buildUKEnforcementRecords(
  seeds: UKEnforcementSeedRecord[] = UK_ENFORCEMENT_SEED_RECORDS,
): DbUKEnforcementRecord[] {
  return seeds.map((record) => {
    const issuedAt = new Date(`${record.dateIssued}T00:00:00Z`);
    if (Number.isNaN(issuedAt.getTime())) {
      throw new Error(`Invalid UK enforcement date: ${record.dateIssued}`);
    }

    const contentHash = buildContentHash(record);
    return {
      ...record,
      id: `${record.regulator}-${record.dateIssued}-${slugify(record.firmIndividual)}-${contentHash.slice(0, 8)}`,
      contentHash,
      amountGbp: convertToGbp(record.amount, record.currency),
      amountEur: convertToEur(record.amount, record.currency),
      yearIssued: issuedAt.getUTCFullYear(),
      monthIssued: issuedAt.getUTCMonth() + 1,
    };
  });
}

async function upsertUKEnforcementRecords(
  sql: postgres.Sql,
  records: DbUKEnforcementRecord[],
  replaceRegulators: boolean,
) {
  let inserted = 0;
  let updated = 0;

  if (replaceRegulators && records.length > 0) {
    const regulators = [...new Set(records.map((record) => record.regulator))];
    await sql`
      DELETE FROM uk_enforcement_actions
      WHERE regulator = ANY(${regulators})
    `;
  }

  for (const record of records) {
    const result = await sql`
      INSERT INTO uk_enforcement_actions (
        id,
        content_hash,
        regulator,
        regulator_full_name,
        source_domain,
        country_code,
        country_name,
        firm_individual,
        firm_category,
        amount_original,
        currency,
        amount_gbp,
        amount_eur,
        date_issued,
        year_issued,
        month_issued,
        breach_type,
        breach_categories,
        summary,
        notice_url,
        source_url,
        source_window_note,
        aliases,
        raw_payload
      ) VALUES (
        ${record.id},
        ${record.contentHash},
        ${record.regulator},
        ${record.regulatorFullName},
        ${record.sourceDomain},
        ${"GB"},
        ${"United Kingdom"},
        ${record.firmIndividual},
        ${record.firmCategory},
        ${record.amount},
        ${record.currency},
        ${record.amountGbp},
        ${record.amountEur},
        ${record.dateIssued},
        ${record.yearIssued},
        ${record.monthIssued},
        ${record.breachType},
        ${sql.json(record.breachCategories)},
        ${record.summary},
        ${record.noticeUrl},
        ${record.sourceUrl},
        ${record.sourceWindowNote},
        ${record.aliases ?? []},
        ${sql.json(JSON.parse(JSON.stringify(record)))}
      )
      ON CONFLICT (id) DO UPDATE SET
        content_hash = EXCLUDED.content_hash,
        regulator_full_name = EXCLUDED.regulator_full_name,
        source_domain = EXCLUDED.source_domain,
        firm_individual = EXCLUDED.firm_individual,
        firm_category = EXCLUDED.firm_category,
        amount_original = EXCLUDED.amount_original,
        currency = EXCLUDED.currency,
        amount_gbp = EXCLUDED.amount_gbp,
        amount_eur = EXCLUDED.amount_eur,
        date_issued = EXCLUDED.date_issued,
        year_issued = EXCLUDED.year_issued,
        month_issued = EXCLUDED.month_issued,
        breach_type = EXCLUDED.breach_type,
        breach_categories = EXCLUDED.breach_categories,
        summary = EXCLUDED.summary,
        notice_url = EXCLUDED.notice_url,
        source_url = EXCLUDED.source_url,
        source_window_note = EXCLUDED.source_window_note,
        aliases = EXCLUDED.aliases,
        raw_payload = EXCLUDED.raw_payload
      RETURNING (xmax = 0) AS inserted
    `;

    if (result[0]?.inserted) {
      inserted += 1;
    } else {
      updated += 1;
    }
  }

  return { inserted, updated };
}

export async function main() {
  const flags = getCliFlags();
  const sourceRecords = flags.seedOnly
    ? UK_ENFORCEMENT_SEED_RECORDS
    : await scrapeAllUKEnforcementSources();
  const records = limitRecords(buildUKEnforcementRecords(sourceRecords), flags.limit);

  console.log(
    flags.seedOnly
      ? `UK Enforcement official-source seed loader`
      : `UK Enforcement official-source scraper`,
  );
  console.log(`Prepared ${records.length} records`);

  if (flags.dryRun) {
    records.forEach((record, index) => {
      const amount =
        record.amount === null
          ? "non-monetary"
          : `${record.currency} ${record.amount.toLocaleString("en-GB")}`;
      console.log(
        `${String(index + 1).padStart(2, " ")}. ${record.regulator} | ${record.firmIndividual} | ${amount} | ${record.dateIssued}`,
      );
    });
    return;
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required unless running with --dry-run");
  }

  const sql = postgres(databaseUrl, {
    ssl: databaseUrl.includes("sslmode=")
      ? { rejectUnauthorized: false }
      : undefined,
  });

  try {
    const result = await upsertUKEnforcementRecords(
      sql,
      records,
      !flags.seedOnly && !flags.limit,
    );
    console.log(`Inserted: ${result.inserted}`);
    console.log(`Updated: ${result.updated}`);
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("UK enforcement loader failed:", error);
    process.exitCode = 1;
  });
}
