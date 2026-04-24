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
import {
  scrapeAllUKEnforcementSources,
  scrapeCmaEnforcement,
  scrapeFrcEnforcement,
  scrapeIcoEnforcement,
  scrapeOfsiEnforcement,
  scrapePraEnforcement,
  scrapePsrEnforcement,
  scrapeTprEnforcement,
} from "./ukEnforcementScrapers.js";

interface DbUKEnforcementRecord extends UKEnforcementSeedRecord {
  id: string;
  contentHash: string;
  amountGbp: number | null;
  amountEur: number | null;
  yearIssued: number;
  monthIssued: number;
}

interface UKEnforcementSourceLoader {
  regulator: string;
  load: () => Promise<UKEnforcementSeedRecord[]>;
}

interface SuccessfulSourceRun {
  regulator: string;
  records: UKEnforcementSeedRecord[];
  runId: number | null;
  startedAt: Date;
}

interface FailedSourceRun {
  regulator: string;
  error: Error;
}

const UK_ENFORCEMENT_SOURCE_LOADERS: UKEnforcementSourceLoader[] = [
  { regulator: "PRA", load: scrapePraEnforcement },
  { regulator: "PSR", load: scrapePsrEnforcement },
  { regulator: "OFSI", load: scrapeOfsiEnforcement },
  { regulator: "ICO", load: scrapeIcoEnforcement },
  { regulator: "CMA", load: scrapeCmaEnforcement },
  { regulator: "FRC", load: scrapeFrcEnforcement },
  { regulator: "TPR", load: scrapeTprEnforcement },
];

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
  const byRegulator = new Map<string, { inserted: number; updated: number }>();

  const recordOutcome = (regulator: string, insertedRow: boolean) => {
    const current = byRegulator.get(regulator) ?? { inserted: 0, updated: 0 };
    if (insertedRow) {
      current.inserted += 1;
    } else {
      current.updated += 1;
    }
    byRegulator.set(regulator, current);
  };

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
      recordOutcome(record.regulator, true);
    } else {
      updated += 1;
      recordOutcome(record.regulator, false);
    }
  }

  return { inserted, updated, byRegulator };
}

function getWorkflowRunUrl() {
  const server = process.env.GITHUB_SERVER_URL;
  const repository = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;

  return server && repository && runId
    ? `${server}/${repository}/actions/runs/${runId}`
    : null;
}

async function insertScraperRun(
  sql: postgres.Sql,
  regulator: string,
  startedAt: Date,
) {
  try {
    const result = await sql`
      INSERT INTO scraper_runs (
        regulator,
        region,
        started_at,
        status,
        source,
        run_url
      )
      VALUES (
        ${regulator},
        ${"UK Enforcement"},
        ${startedAt.toISOString()},
        ${"running"},
        ${process.env.GITHUB_ACTIONS ? "github-actions" : "manual"},
        ${getWorkflowRunUrl()}
      )
      RETURNING id
    `;

    return Number(result[0]?.id ?? null) || null;
  } catch {
    console.warn(`Could not create scraper_runs row for ${regulator}`);
    return null;
  }
}

async function updateScraperRun(
  sql: postgres.Sql,
  runId: number | null,
  {
    status,
    recordsPrepared,
    inserted,
    updated,
    errorMessage,
    startedAt,
  }: {
    status: "success" | "error";
    recordsPrepared: number;
    inserted: number;
    updated: number;
    errorMessage: string | null;
    startedAt: Date;
  },
) {
  if (!runId) return;

  const finishedAt = new Date();

  try {
    await sql`
      UPDATE scraper_runs
      SET
        finished_at = ${finishedAt.toISOString()},
        status = ${status},
        records_prepared = ${recordsPrepared},
        records_inserted = ${inserted},
        records_updated = ${updated},
        errors = ${status === "error" ? 1 : 0},
        error_message = ${errorMessage},
        duration_ms = ${finishedAt.getTime() - startedAt.getTime()}
      WHERE id = ${runId}
    `;
  } catch {
    console.warn(`Could not update scraper_runs row ${runId}`);
  }
}

async function scrapeSourceWithRunTracking(
  sql: postgres.Sql,
  source: UKEnforcementSourceLoader,
): Promise<SuccessfulSourceRun> {
  const startedAt = new Date();
  const runId = await insertScraperRun(sql, source.regulator, startedAt);

  try {
    const records = await source.load();
    if (records.length === 0) {
      throw new Error(`${source.regulator} returned zero records`);
    }

    return {
      regulator: source.regulator,
      records,
      runId,
      startedAt,
    };
  } catch (error) {
    const normalizedError =
      error instanceof Error ? error : new Error(String(error));

    await updateScraperRun(sql, runId, {
      status: "error",
      recordsPrepared: 0,
      inserted: 0,
      updated: 0,
      errorMessage: normalizedError.message,
      startedAt,
    });

    throw normalizedError;
  }
}

async function scrapeUKEnforcementSourcesWithTracking(sql: postgres.Sql) {
  const settled = await Promise.allSettled(
    UK_ENFORCEMENT_SOURCE_LOADERS.map(async (source) => ({
      source,
      result: await scrapeSourceWithRunTracking(sql, source),
    })),
  );
  const successful: SuccessfulSourceRun[] = [];
  const failures: FailedSourceRun[] = [];

  settled.forEach((outcome, index) => {
    const source = UK_ENFORCEMENT_SOURCE_LOADERS[index];
    if (outcome.status === "fulfilled") {
      successful.push(outcome.value.result);
      return;
    }

    failures.push({
      regulator: source.regulator,
      error:
        outcome.reason instanceof Error
          ? outcome.reason
          : new Error(String(outcome.reason)),
    });
  });

  return { successful, failures };
}

export async function main() {
  const flags = getCliFlags();
  let sql: postgres.Sql | null = null;
  let successfulRuns: SuccessfulSourceRun[] = [];
  let failures: FailedSourceRun[] = [];
  let sourceRecords: UKEnforcementSeedRecord[];

  console.log(
    flags.seedOnly
      ? `UK Enforcement official-source seed loader`
      : `UK Enforcement official-source scraper`,
  );

  if (flags.seedOnly) {
    sourceRecords = UK_ENFORCEMENT_SEED_RECORDS;
  } else if (flags.dryRun) {
    sourceRecords = await scrapeAllUKEnforcementSources();
  } else {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required unless running with --dry-run");
    }

    sql = postgres(databaseUrl, {
      ssl: databaseUrl.includes("sslmode=")
        ? { rejectUnauthorized: false }
        : undefined,
    });

    const scrapeResult = await scrapeUKEnforcementSourcesWithTracking(sql);
    successfulRuns = scrapeResult.successful;
    failures = scrapeResult.failures;
    sourceRecords = successfulRuns.flatMap((run) => run.records);
  }

  const records = limitRecords(buildUKEnforcementRecords(sourceRecords), flags.limit);
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

  try {
    if (!sql) {
      const databaseUrl = process.env.DATABASE_URL?.trim();
      if (!databaseUrl) {
        throw new Error("DATABASE_URL is required unless running with --dry-run");
      }

      sql = postgres(databaseUrl, {
        ssl: databaseUrl.includes("sslmode=")
          ? { rejectUnauthorized: false }
          : undefined,
      });
    }

    const result = await upsertUKEnforcementRecords(
      sql,
      records,
      !flags.seedOnly && !flags.limit,
    );
    console.log(`Inserted: ${result.inserted}`);
    console.log(`Updated: ${result.updated}`);

    await Promise.all(
      successfulRuns.map((run) => {
        const outcome = result.byRegulator.get(run.regulator) ?? {
          inserted: 0,
          updated: 0,
        };

        return updateScraperRun(sql!, run.runId, {
          status: "success",
          recordsPrepared: run.records.length,
          inserted: outcome.inserted,
          updated: outcome.updated,
          errorMessage: null,
          startedAt: run.startedAt,
        });
      }),
    );

    if (failures.length > 0) {
      throw new Error(
        `UK enforcement source failures: ${failures
          .map((failure) => `${failure.regulator}: ${failure.error.message}`)
          .join("; ")}`,
      );
    }
  } finally {
    if (sql) {
      await sql.end();
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("UK enforcement loader failed:", error);
    process.exitCode = 1;
  });
}
