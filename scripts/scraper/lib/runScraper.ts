import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { DbReadyRecord } from "./euFineHelpers.js";
import {
  resolveScraperQualityContract,
  type ResolvedScraperQualityContract,
  type ScraperQualityContractOverride,
} from "./scraperQualityContract.js";
import {
  createSqlClient,
  getCliFlags,
  limitRecords,
  printDryRunSummary,
  requireDatabaseUrl,
  upsertEuFines,
} from "./euFineHelpers.js";
import {
  persistPreparedDiscoveryCandidates,
  validateDiscoveryCandidate,
} from "./coverageDiscoveryCandidates.js";

export interface RunnerOptions {
  name: string;
  regulatorCode?: string;
  region?: string;
  liveLoader: () => Promise<DbReadyRecord[]>;
  testLoader?: () => Promise<DbReadyRecord[]>;
  afterUpsert?: (
    sql: ReturnType<typeof createSqlClient>,
    records: DbReadyRecord[],
  ) => Promise<void>;
  retryOnTransientFailure?: boolean;
  maxRetries?: number;
  qualityContract?: ScraperQualityContractOverride;
}

interface ScraperRunSummary {
  name: string;
  status: "success" | "error" | "dry-run";
  recordsPrepared: number;
  inserted: number;
  updated: number;
  errors: number;
  startedAt: string;
  finishedAt: string | null;
  errorMessage: string | null;
  durationMs: number | null;
  retryAttempt: number;
  regulatorCode: string;
  contractVersion: string;
  sourceClass: string;
  qualityStatus: "unknown" | "passed" | "quarantined";
  recordsQuarantined: number;
  latestPreparedDate: string | null;
  reconciliation: {
    prepared: number;
    valid: number;
    quarantined: number;
    quarantineReasons: Record<string, number>;
  };
}

const DEFAULT_RETRY_DELAY_MS = 60_000;

function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    message.includes("etimedout") ||
    message.includes("eai_again") ||
    message.includes("enotfound") ||
    message.includes("socket hang up") ||
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("status code 500") ||
    message.includes("status code 504") ||
    message.includes("status code 403") ||
    message.includes("503") ||
    message.includes("502") ||
    message.includes("429")
  );
}

export async function runScraper(options: RunnerOptions) {
  const flags = getCliFlags();
  const startedAt = new Date();
  const maxRetries = options.retryOnTransientFailure === false ? 0 : (options.maxRetries ?? 1);
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      await runScraperAttempt(options, flags, startedAt, attempt);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries && isTransientError(error)) {
        console.warn(
          `\n⚠️ Transient failure on attempt ${attempt + 1}/${maxRetries + 1}: ${error instanceof Error ? error.message : String(error)}`,
        );
        console.warn(`   Retrying in ${DEFAULT_RETRY_DELAY_MS / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, DEFAULT_RETRY_DELAY_MS));
      } else {
        throw error;
      }
    }
  }

  throw lastError;
}

async function runScraperAttempt(
  options: RunnerOptions,
  flags: ReturnType<typeof getCliFlags>,
  startedAt: Date,
  attempt: number,
) {
  const regulatorCode = options.regulatorCode ?? extractRegulatorCode(options.name);
  const contract = resolveScraperQualityContract(regulatorCode, options.qualityContract);
  const summary: ScraperRunSummary = {
    name: options.name,
    status: flags.dryRun ? "dry-run" : "success",
    recordsPrepared: 0,
    inserted: 0,
    updated: 0,
    errors: 0,
    startedAt: startedAt.toISOString(),
    finishedAt: null,
    errorMessage: null,
    durationMs: null,
    retryAttempt: attempt,
    regulatorCode: contract.regulatorCode,
    contractVersion: contract.version,
    sourceClass: contract.sourceClass,
    qualityStatus: "unknown",
    recordsQuarantined: 0,
    latestPreparedDate: null,
    reconciliation: { prepared: 0, valid: 0, quarantined: 0, quarantineReasons: {} },
  };
  let sql: ReturnType<typeof createSqlClient> | null = null;
  let scraperRunId: string | number | null = null;
  let heartbeatTimer: NodeJS.Timeout | null = null;

  if (attempt === 0) {
    console.log(`${options.name}\n`);
  } else {
    console.log(`\n${options.name} (retry attempt ${attempt})\n`);
  }

  try {
    if (!flags.dryRun) {
      requireDatabaseUrl();
      sql = createSqlClient();
      scraperRunId = await insertScraperRun(sql, options, contract, startedAt);
      const heartbeatIntervalMs = Math.min(60_000, Math.max(15_000, Math.floor(contract.runningTimeoutMinutes * 60_000 / 3)));
      heartbeatTimer = setInterval(() => {
        void heartbeatScraperRun(sql, scraperRunId).catch((error) => {
          console.warn(`⚠️ ${options.name} heartbeat failed: ${error instanceof Error ? error.message : String(error)}`);
        });
      }, heartbeatIntervalMs);
      heartbeatTimer.unref?.();
    }

    let records =
      flags.useTestData && options.testLoader
        ? await options.testLoader()
        : await options.liveLoader();

    records = limitRecords(records, flags.limit);
    summary.recordsPrepared = records.length;

    const validation = validatePreparedRecords(records, scraperRunId ?? 0);
    summary.recordsQuarantined = validation.invalid.length;
    summary.reconciliation = {
      prepared: records.length,
      valid: validation.valid.length,
      quarantined: validation.invalid.length,
      quarantineReasons: validation.invalid.reduce<Record<string, number>>((counts, item) => {
        for (const issue of item.issues) counts[issue.code] = (counts[issue.code] ?? 0) + 1;
        return counts;
      }, {}),
    };
    if (validation.invalid.length > 0 && sql && scraperRunId !== null) {
      await persistPreparedDiscoveryCandidates(sql, records, scraperRunId);
    }
    const batchDecision = assessPreparedBatchValidation(records.length, validation.invalid.length, contract);
    if (batchDecision.hold) {
      throw new Error(
        `${options.name} quarantined: ${validation.invalid.length} of ${records.length} prepared records failed row validation (maximum ${contract.maximumInvalidRecordCount} and ${(contract.maximumInvalidRecordFraction * 100).toFixed(2)}%).`,
      );
    }
    records = validation.valid;
    summary.latestPreparedDate = records.reduce<string | null>((latest, record) =>
      !latest || record.dateIssued > latest ? record.dateIssued : latest, null);

    assertPreparedBatch(options, records, flags, contract);

    console.log(`📊 Prepared ${records.length} records`);

    if (flags.dryRun) {
      printDryRunSummary(records);
      return;
    }

    if (!sql || scraperRunId === null) {
      throw new Error(`${options.name} cannot promote without an operational scraper run record.`);
    }

    await assertPreparedCountContinuity(sql, options, contract, records.length, summary.latestPreparedDate, flags);

    // Persist the official, prepared source evidence before any public-record
    // upsert. This creates a reviewable discovery queue even if the following
    // upsert fails; it never changes an existing candidate's human status.
    const discoveryCandidates = await persistPreparedDiscoveryCandidates(sql, records, scraperRunId);
    console.log(`🔎 Persisted ${discoveryCandidates} coverage discovery candidate${discoveryCandidates === 1 ? "" : "s"}`);

    const result = await upsertEuFines(sql, records);
    summary.inserted = result.inserted;
    summary.updated = result.updated;
    summary.errors = result.errors;
    console.log(`\n💾 Upsert summary`);
    console.log(`   Inserted: ${result.inserted}`);
    console.log(`   Updated: ${result.updated}`);
    console.log(`   Errors: ${result.errors}`);

    if (result.errors > 0) {
      throw new Error(
        `${options.name} quarantined: ${result.errors} database upsert error${result.errors === 1 ? "" : "s"}. The public view was not refreshed.`,
      );
    }

    if (options.afterUpsert) {
      await options.afterUpsert(sql, records);
    }

    console.log("\n🔄 Refreshing unified regulatory fines view...");
    await refreshUnifiedView(sql);
    console.log("✅ View refreshed");

    summary.qualityStatus = "passed";
    await updateScraperRun(sql, scraperRunId, summary);
  } catch (error) {
    summary.status = "error";
    summary.qualityStatus = "quarantined";
    summary.errorMessage =
      error instanceof Error ? error.message : String(error);

    if (sql && scraperRunId !== null) {
      try {
        await updateScraperRun(sql, scraperRunId, summary);
      } catch {
        // Metrics persistence failure should not mask the original error
      }
    }

    throw error;
  } finally {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (sql) {
      await sql.end();
    }

    summary.finishedAt = new Date().toISOString();
    summary.durationMs = Date.now() - startedAt.getTime();
    await writeScraperRunSummary(summary);
  }
}

export function assertPreparedBatch(
  options: RunnerOptions,
  records: DbReadyRecord[],
  flags: ReturnType<typeof getCliFlags>,
  resolvedContract?: ResolvedScraperQualityContract,
) {
  const regulatorCode = options.regulatorCode ?? extractRegulatorCode(options.name);
  const contract = resolvedContract ?? resolveScraperQualityContract(regulatorCode, options.qualityContract);

  if (!flags.useTestData && records.length === 0 && !contract.allowZeroRecords) {
    throw new Error(
      `${options.name} quarantined: the official source returned zero records, contrary to its source contract.`,
    );
  }

  const invalid = records.filter((record) => {
    if (!record.contentHash || !record.regulator || !record.firmIndividual || !record.dateIssued) return true;
    if (!record.sourceUrl) return true;
    if (record.amount !== null && (!Number.isFinite(record.amount) || record.amount < 0)) return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(record.dateIssued)) return true;
    if (/<[^>]+>|\b(?:navigation|read more|cookie policy|page title)\b/i.test(record.firmIndividual)) return true;
    if (!record.summary || /<\/?(?:html|body|nav|script|style)[^>]*>/i.test(record.summary)) return true;
    try {
      const source = new URL(record.sourceUrl);
      return source.protocol !== "https:" && source.protocol !== "http:";
    } catch {
      return true;
    }
  });

  if (invalid.length > 0) {
    throw new Error(
      `${options.name} quarantined: ${invalid.length} record${invalid.length === 1 ? "" : "s"} failed required-field or official-source URL validation.`,
    );
  }

  const canonicalCode = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const mismatched = records.filter((record) => canonicalCode(record.regulator) !== canonicalCode(contract.regulatorCode));
  if (mismatched.length > 0) {
    throw new Error(
      `${options.name} quarantined: ${mismatched.length} record${mismatched.length === 1 ? " has" : "s have"} a regulator code outside the ${contract.regulatorCode} source contract.`,
    );
  }

  const minimum = contract.minimumPreparedRecords;
  if (!flags.useTestData && !flags.limit && records.length < minimum) {
    throw new Error(
      `${options.name} quarantined: ${records.length} records were prepared, below the configured minimum of ${minimum}.`,
    );
  }
}

async function assertPreparedCountContinuity(
  sql: ReturnType<typeof createSqlClient>,
  options: RunnerOptions,
  contract: ResolvedScraperQualityContract,
  currentCount: number,
  currentLatestDate: string | null,
  flags: ReturnType<typeof getCliFlags>,
) {
  const maximumDrop = contract.maximumPreparedCountDropFraction;
  // Incremental public feeds are deliberately not complete archive snapshots:
  // comparing their recent-window batch with an earlier historical backfill
  // would quarantine healthy updates. Their non-zero/minimum batch and source
  // evidence gates still apply before any database write.
  if (flags.limit || flags.useTestData || contract.preparedBatchScope === "incremental") return;

  const previous = await sql`
    SELECT records_prepared::int AS count
      , latest_prepared_date::text AS latest_date
    FROM scraper_runs
    WHERE regulator = ${contract.regulatorCode}
      AND status = 'success'
      AND records_prepared IS NOT NULL
    ORDER BY started_at DESC
    LIMIT 1
  `.catch(() => []);
  const previousCount = Number(previous[0]?.count ?? 0);
  if (previousCount <= 0) return;

  const previousLatestDate = previous[0]?.latest_date ? String(previous[0].latest_date) : null;
  if (currentLatestDate && previousLatestDate && currentLatestDate < previousLatestDate) {
    throw new Error(
      `${options.name} quarantined: latest prepared date regressed from ${previousLatestDate} to ${currentLatestDate}.`,
    );
  }

  const floor = Math.ceil(previousCount * (1 - maximumDrop));
  if (currentCount < floor) {
    throw new Error(
      `${options.name} quarantined: prepared record count fell from ${previousCount} to ${currentCount}, below the configured continuity floor of ${floor}.`,
    );
  }
}

async function insertScraperRun(
  sql: ReturnType<typeof createSqlClient>,
  options: RunnerOptions,
  contract: ResolvedScraperQualityContract,
  startedAt: Date,
): Promise<string | number> {
    const region = options.region ?? "Unknown";
    const runUrl = process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : null;

    const result = await sql`
      INSERT INTO scraper_runs (
        regulator, region, started_at, status, source, run_url,
        contract_version, source_class, feed_cadence, allow_zero_records,
        minimum_prepared_records, maximum_count_drop_fraction, stale_after_days,
        quality_status, heartbeat_at, running_timeout_minutes
      ) VALUES (
        ${contract.regulatorCode}, ${region}, ${startedAt.toISOString()}, 'running', 'github-actions', ${runUrl},
        ${contract.version}, ${contract.sourceClass}, ${contract.cadence}, ${contract.allowZeroRecords},
        ${contract.minimumPreparedRecords}, ${contract.maximumPreparedCountDropFraction}, ${contract.staleAfterDays},
        'unknown', ${startedAt.toISOString()}, ${contract.runningTimeoutMinutes}
      )
      RETURNING id
    `;

    if (result[0]?.id === undefined || result[0]?.id === null) {
      throw new Error(`${options.name} cannot promote because scraper run tracking did not return an id.`);
    }
    return result[0].id as string | number;
}

async function heartbeatScraperRun(
  sql: ReturnType<typeof createSqlClient> | null,
  runId: string | number | null,
) {
  if (!sql || runId === null) return;
  await sql`
    UPDATE scraper_runs
    SET heartbeat_at = now()
    WHERE id = ${runId} AND status = 'running'
  `;
}

async function updateScraperRun(
  sql: ReturnType<typeof createSqlClient>,
  runId: string | number,
  summary: ScraperRunSummary,
) {
  try {
    const finishedAt = new Date().toISOString();
    const durationMs = Date.now() - new Date(summary.startedAt).getTime();

    await sql`
      UPDATE scraper_runs
      SET
        finished_at = ${finishedAt},
        status = ${summary.status},
        records_prepared = ${summary.recordsPrepared},
        records_inserted = ${summary.inserted},
        records_updated = ${summary.updated},
        errors = ${summary.errors},
        records_quarantined = ${summary.recordsQuarantined},
        latest_prepared_date = ${summary.latestPreparedDate},
        reconciliation = ${sql.json(summary.reconciliation)},
        heartbeat_at = now(),
        error_message = ${summary.errorMessage},
        duration_ms = ${durationMs},
        quality_status = ${summary.qualityStatus},
        quarantine_reason = ${summary.qualityStatus === "quarantined" ? summary.errorMessage : null}
      WHERE id = ${runId}
    `;
  } catch (error) {
    console.error("Could not update the operational scraper run record", error);
    throw error;
  }
}

export function validatePreparedRecords(
  records: DbReadyRecord[],
  scraperRunId: string | number,
) {
  const valid: DbReadyRecord[] = [];
  const invalid: Array<{ record: DbReadyRecord; issues: ReturnType<typeof validateDiscoveryCandidate>["issues"] }> = [];
  for (const record of records) {
    const result = validateDiscoveryCandidate(record, scraperRunId);
    if (result.row) valid.push(record);
    else invalid.push({ record, issues: result.issues });
  }
  return { valid, invalid };
}

export function assessPreparedBatchValidation(
  prepared: number,
  quarantined: number,
  contract: Pick<ResolvedScraperQualityContract, "maximumInvalidRecordCount" | "maximumInvalidRecordFraction">,
) {
  const fraction = prepared > 0 ? quarantined / prepared : 0;
  return {
    fraction,
    hold: quarantined > contract.maximumInvalidRecordCount || fraction > contract.maximumInvalidRecordFraction,
  };
}

const REGULATOR_CODE_ALIASES: Array<[string, string]> = [
  ["Banca d'Italia", "BDI"],
  ["Czech National Bank", "CNBCZ"],
  ["Finanstilsynet Denmark", "FTDK"],
  ["Finanstilsynet Norway", "FTNO"],
  ["Finansinspektionen", "FISE"],
  ["FMA New Zealand", "FMANZ"],
  ["FMA Austria", "FMAAT"],
  ["ADGM FSRA", "FSRA"],
  ["SC Malaysia", "SC"],
  ["FSC Korea", "FSC-KR"],
];

const KNOWN_REGULATOR_CODES = [
  "AUSTRAC",
  "BaFin",
  "ACPR",
  "ASIC",
  "BMA",
  "CBI",
  "CBN",
  "CBUAE",
  "CIRO",
  "CIMA",
  "CMVM",
  "CNBCZ",
  "CNMV",
  "CSSF",
  "CVM",
  "CYSEC",
  "DFSA",
  "ECB",
  "FIN-FSA",
  "FINCEN",
  "FINMA",
  "FINRA",
  "FMAAT",
  "FMANZ",
  "FSCA",
  "FSMA",
  "FSRA",
  "GFSC",
  "HKMA",
  "IVASS",
  "JFSC",
  "MAS",
  "MFSA",
  "OCC",
  "OSC",
  "SEC",
  "SEBI",
  "SESC",
];

export function extractRegulatorCode(scraperName: string): string {
  for (const [alias, code] of REGULATOR_CODE_ALIASES) {
    if (scraperName.toLowerCase().includes(alias.toLowerCase())) {
      return code;
    }
  }

  for (const code of KNOWN_REGULATOR_CODES) {
    const escapedCode = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|[^A-Za-z0-9-])${escapedCode}([^A-Za-z0-9-]|$)`, "i");
    if (pattern.test(scraperName)) {
      return code === "FIN-FSA" ? "FINFSA" : code;
    }
  }

  const match = scraperName.match(/(?:[\p{Emoji}\s]+)?(\S+)/u);
  return match?.[1]?.replace(/[^A-Za-z-]/g, "") || "UNKNOWN";
}

async function refreshUnifiedView(sql: ReturnType<typeof createSqlClient>) {
  try {
    await sql`SELECT refresh_all_fines()`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (!message.includes("cannot refresh materialized view")) {
      throw error;
    }

    console.warn(
      "⚠️ Concurrent refresh unavailable, falling back to standard refresh",
    );
    await sql`REFRESH MATERIALIZED VIEW all_regulatory_fines`;
  }
}

async function writeScraperRunSummary(summary: ScraperRunSummary) {
  const outputFile = process.env.SCRAPER_RUN_SUMMARY_FILE?.trim();

  if (!outputFile) {
    return;
  }

  await mkdir(dirname(outputFile), { recursive: true });
  await writeFile(outputFile, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
}
