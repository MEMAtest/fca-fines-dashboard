#!/usr/bin/env node
/**
 * Report-only coverage, matching and editorial-readiness run.
 *
 * Inputs are local JSON or trusted recent records already ingested by existing
 * scrapers. This script never writes to RegActions tables and never publishes.
 */
import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { resolveConnectionString, buildPgPoolConfig } from "../../server/db.js";
import pg from "pg";
import type {
  CurrentStateSnapshot,
  EnforcementCandidate,
  ExistingEnforcementRecord,
} from "../../src/types/coverageAgent.js";
import { coverageAgentSchemas } from "../../src/types/coverageAgent.js";
import { runCoverageIntelligenceAgent } from "./lib/coverageIntelligence.js";
import { lookupCandidatesViaUnifiedSearch } from "./lib/regactionsLookup.js";

const candidateSchema = z.object({
  id: z.string().min(1), regulator: z.string().min(1), sourceUrl: z.string().url(), sourceContentHash: z.string().nullable().optional(),
  title: z.string().min(1), entity: z.string().nullable().optional(), issuedDate: z.string().nullable().optional(), amount: z.number().nullable().optional(), currency: z.string().nullable().optional(), summary: z.string().nullable().optional(),
  candidateKind: z.enum(["enforcement", "intelligence"]), contentType: z.enum(["penalty", "notice", "press_release", "warning", "investigation", "other"]),
  aggregateAction: z.object({ actionId: z.string().optional(), totalAmount: z.number().optional(), currency: z.string().optional(), participantCount: z.number().int().positive().optional() }).nullable().optional(),
  officialSource: z.boolean().optional(),
});
const recordSchema = z.object({
  id: z.string().min(1), regulator: z.string().min(1), entity: z.string().min(1), sourceUrl: z.string().nullable().optional(), noticeUrl: z.string().nullable().optional(), sourceContentHash: z.string().nullable().optional(), issuedDate: z.string().nullable().optional(), amount: z.number().nullable().optional(), currency: z.string().nullable().optional(), summary: z.string().nullable().optional(), publicCaseId: z.string().nullable().optional(), requiresAmountReview: z.boolean().optional(), amountQuality: z.string().nullable().optional(), aggregateActionId: z.string().nullable().optional(),
});
const inputSchema = z.object({ candidates: z.array(candidateSchema).default([]), existingRecords: z.array(recordSchema).optional(), currentState: z.object({ capturedAt: z.string().optional(), urls: z.array(z.object({ url: z.string().url(), status: z.number().nullable().optional(), title: z.string().nullable().optional(), indexed: z.boolean().optional(), kind: z.enum(["methodology", "blog", "hub", "legacy", "other"]).optional() })).optional(), regulatorHubs: z.array(z.object({ regulator: z.string(), coverageEnd: z.string().nullable().optional(), latestRecordDate: z.string().nullable().optional() })).optional(), notes: z.array(z.string()).optional() }).optional(), });

function arg(name: string) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
}

function usage() {
  console.log(`Usage: npm run coverage:agent -- --input=fixtures/candidates.json --output-dir=artifacts/coverage-agent

Inputs:
  --input=FILE             Official-discovery JSON { candidates, existingRecords?, currentState? }
  --records=FILE           Existing records JSON array or { records: [] }; overrides input records
  --api-base=URL           Read-only /api/unified/search lookup for candidate matching
  --current-state=FILE     Current-state audit JSON; overrides input currentState
  --recent-records=DAYS    Run existing-record duplicate/amount QA only (not discovery)
  --output-dir=DIR         Where four report-only JSON artifacts are written

This command does not scrape the network, publish an article, or mutate any database table.
--recent-records is deliberately not discovery: it cannot identify missing records.`);
}

async function jsonFile(file: string) {
  return JSON.parse(await readFile(file, "utf8")) as unknown;
}

function mapRecord(row: Record<string, unknown>): ExistingEnforcementRecord {
  const value = (camel: string, snake: string) => row[camel] ?? row[snake] ?? null;
  return {
    id: String(value("id", "public_case_id") ?? ""), regulator: String(value("regulator", "regulator") ?? ""), entity: String(value("entity", "firm_individual") ?? ""),
    sourceUrl: value("sourceUrl", "source_url") ? String(value("sourceUrl", "source_url")) : null,
    noticeUrl: value("noticeUrl", "notice_url") ? String(value("noticeUrl", "notice_url")) : null,
    sourceContentHash: value("sourceContentHash", "source_content_hash") ? String(value("sourceContentHash", "source_content_hash")) : null,
    issuedDate: value("issuedDate", "date_issued") ? String(value("issuedDate", "date_issued")) : null,
    amount: value("amount", "amount_original") === null ? null : Number(value("amount", "amount_original")),
    currency: value("currency", "currency") ? String(value("currency", "currency")) : null,
    summary: value("summary", "summary") ? String(value("summary", "summary")) : null,
    publicCaseId: value("publicCaseId", "public_case_id") ? String(value("publicCaseId", "public_case_id")) : null,
    requiresAmountReview: Boolean(value("requiresAmountReview", "requires_amount_review")),
    amountQuality: value("amountQuality", "amount_quality") ? String(value("amountQuality", "amount_quality")) : null,
    aggregateActionId: value("aggregateActionId", "aggregate_action_id") ? String(value("aggregateActionId", "aggregate_action_id")) : null,
  };
}

async function loadRecentRecords(days: number) {
  const connection = resolveConnectionString();
  if (!connection) throw new Error("DATABASE_URL is required for --recent-records. Use --input with fixture records for offline runs.");
  const pool = new pg.Pool(buildPgPoolConfig(connection));
  try {
    const result = await pool.query(`
      SELECT public_case_id::text AS id, regulator, firm_individual, source_url, notice_url,
             source_content_hash, date_issued::text, amount_original, currency, summary,
             requires_amount_review, amount_quality
      FROM public.all_regulatory_fines_trusted
      WHERE date_issued >= CURRENT_DATE - $1::int * INTERVAL '1 day'
      ORDER BY date_issued DESC NULLS LAST, public_case_id ASC
      LIMIT 5000
    `, [days]);
    return result.rows.map((row) => mapRecord(row));
  } finally {
    await pool.end();
  }
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) return usage();
  const inputPath = arg("input");
  const recordsPath = arg("records");
  const currentStatePath = arg("current-state");
  const apiBase = arg("api-base");
  const recentRecordDaysArg = arg("recent-records");
  const recentRecordDays = recentRecordDaysArg === null ? Number.NaN : Number(recentRecordDaysArg);
  const outputDir = arg("output-dir") ?? path.join("artifacts", "coverage-agent", new Date().toISOString().replace(/[:.]/g, "-"));
  if (!inputPath && !Number.isFinite(recentRecordDays)) throw new Error("Provide --input=FILE or --recent-records=DAYS. Use --help for details.");

  const input = inputPath ? inputSchema.parse(await jsonFile(inputPath)) : { candidates: [] as EnforcementCandidate[] };
  let existingRecords: ExistingEnforcementRecord[] = input.existingRecords ?? [];
  if (recordsPath) {
    const raw = await jsonFile(recordsPath);
    const records = Array.isArray(raw) ? raw : (raw as { records?: unknown[] }).records;
    existingRecords = z.array(recordSchema).parse(records);
  }
  if (apiBase && !recordsPath && !input.existingRecords && input.candidates.length) {
    // This calls only the public lookup layer. It remains useful to operators
    // without DB access and fails closed if the API cannot supply evidence.
    existingRecords = await lookupCandidatesViaUnifiedSearch(input.candidates, apiBase);
  }
  let candidates = input.candidates;
  if (Number.isFinite(recentRecordDays)) {
    const recent = await loadRecentRecords(Math.max(1, Math.min(recentRecordDays, 3650)));
    if (!recordsPath && !input.existingRecords) existingRecords = recent;
  }
  const currentState = currentStatePath ? await jsonFile(currentStatePath) as CurrentStateSnapshot : input.currentState;
  const result = runCoverageIntelligenceAgent(candidates, existingRecords, currentState);
  await mkdir(outputDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(outputDir, "coverage-report.json"), `${JSON.stringify(result.coverageReport, null, 2)}\n`),
    writeFile(path.join(outputDir, "missing-record-import-queue.json"), `${JSON.stringify(result.missingRecordImportQueue, null, 2)}\n`),
    writeFile(path.join(outputDir, "qa-issue-queue.json"), `${JSON.stringify(result.qaIssueQueue, null, 2)}\n`),
    writeFile(path.join(outputDir, "article-briefs.json"), `${JSON.stringify({ schemas: coverageAgentSchemas, briefs: result.articleBriefs }, null, 2)}\n`),
  ]);
  console.log(JSON.stringify({ mode: "report_only", outputDir, candidates: candidates.length, decisions: result.coverageReport.totals, qaIssues: result.qaIssueQueue.length }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
