import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  buildLiveRegulatorHealthReport,
  getTargetLiveRegulatorCodes,
  type LiveRegulatorCadence,
  type LiveRegulatorHealthResult,
  type LiveRegulatorHealthSeverity,
} from "../scraper/lib/liveRegulatorHealth.js";
import {
  createSqlClient,
  requireDatabaseUrl,
} from "../scraper/lib/euFineHelpers.js";
import { loadLiveRegulatorStats } from "../scraper/checkLiveRegulatorFreshness.js";

type AssuranceStatus = LiveRegulatorHealthSeverity;
type AiTriageStatus = "skipped" | "success" | "error";

interface CliOptions {
  cadence: LiveRegulatorCadence | "all";
  json: boolean;
  outputFile: string | null;
  sesOutputFile: string | null;
  forceAi: boolean;
  noAi: boolean;
  exitCode: boolean;
}

export interface RecentScraperRun {
  regulator: string;
  status: string;
  startedAt: string;
  errorMessage: string | null;
  runUrl: string | null;
  recordsPrepared: number | null;
}

export interface ScraperRunIssue {
  regulator: string;
  severity: Exclude<AssuranceStatus, "ok">;
  latestStatus: string;
  latestStartedAt: string;
  latestErrorMessage: string | null;
  consecutiveErrors: number;
  runUrl: string | null;
  message: string;
}

export interface AssuranceDecision {
  status: AssuranceStatus;
  alertRequired: boolean;
  shouldCallAi: boolean;
  criticalCount: number;
  actionRequiredCount: number;
  watchCount: number;
}

export interface AiTriageResult {
  status: AiTriageStatus;
  provider: string;
  model: string;
  summary: string;
  likelyCause: string | null;
  impactedRegulators: string[];
  nextAction: string | null;
  confidence: "low" | "medium" | "high" | null;
  usage: {
    inputTokens: number;
    outputTokens: number;
  } | null;
  costEstimateUsd: number;
  errorMessage: string | null;
}

export interface AssuranceReport {
  generatedAt: string;
  status: AssuranceStatus;
  cadence: LiveRegulatorCadence | "all";
  totals: {
    checked: number;
    ok: number;
    watch: number;
    actionRequired: number;
    critical: number;
    scraperRunIssues: number;
  };
  health: LiveRegulatorHealthResult[];
  scraperRunIssues: ScraperRunIssue[];
  aiTriage: AiTriageResult;
  costEstimate: {
    provider: string;
    model: string;
    usd: number;
  };
  workflowUrl: string | null;
}

const DEEPSEEK_PROVIDER = "deepseek";
const DEEPSEEK_MODEL = "deepseek-v4-flash";
const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEEPSEEK_INPUT_PER_MILLION_USD = 0.14;
const DEEPSEEK_OUTPUT_PER_MILLION_USD = 0.28;

function parseCliOptions(): CliOptions {
  const cadence = getStringArg("cadence");

  return {
    cadence: cadence === "daily" || cadence === "fragile" ? cadence : "all",
    json: process.argv.includes("--json"),
    outputFile: getStringArg("output"),
    sesOutputFile: getStringArg("ses-output"),
    forceAi: process.argv.includes("--force-ai"),
    noAi: process.argv.includes("--no-ai"),
    exitCode: process.argv.includes("--exit-code"),
  };
}

function getStringArg(name: string) {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length).trim() : null;
}

export async function loadRecentScraperRuns(
  windowDays = 14,
): Promise<RecentScraperRun[]> {
  requireDatabaseUrl();
  const sql = createSqlClient();

  try {
    const rows = await sql`
      SELECT
        regulator,
        status,
        started_at::text AS "startedAt",
        error_message AS "errorMessage",
        run_url AS "runUrl",
        records_prepared::int AS "recordsPrepared"
      FROM scraper_runs
      WHERE started_at > NOW() - make_interval(days => ${windowDays})
      ORDER BY regulator ASC, started_at DESC
    `;

    return rows.map((row) => ({
      regulator: String(row.regulator),
      status: String(row.status),
      startedAt: String(row.startedAt),
      errorMessage: row.errorMessage ? redactText(String(row.errorMessage)) : null,
      runUrl: row.runUrl ? String(row.runUrl) : null,
      recordsPrepared:
        row.recordsPrepared === null || row.recordsPrepared === undefined
          ? null
          : Number(row.recordsPrepared),
    }));
  } catch (error) {
    console.warn(
      `Could not load recent scraper_runs data: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  } finally {
    await sql.end();
  }
}

export function buildScraperRunIssues(
  runs: RecentScraperRun[],
): ScraperRunIssue[] {
  const byRegulator = new Map<string, RecentScraperRun[]>();
  for (const run of runs) {
    const key = run.regulator.toUpperCase();
    byRegulator.set(key, [...(byRegulator.get(key) ?? []), run]);
  }

  const issues: ScraperRunIssue[] = [];

  for (const [regulator, regulatorRuns] of byRegulator.entries()) {
    const ordered = [...regulatorRuns].sort(
      (left, right) =>
        new Date(right.startedAt).getTime() -
        new Date(left.startedAt).getTime(),
    );
    const latest = ordered[0];
    const recentTwo = ordered.slice(0, 2);
    const consecutiveErrors = recentTwo.filter(
      (run) => run.status === "error",
    ).length;

    if (!latest || latest.status !== "error") {
      continue;
    }

    const isConsecutiveFailure =
      recentTwo.length >= 2 &&
      recentTwo.every((run) => run.status === "error");

    issues.push({
      regulator,
      severity: isConsecutiveFailure ? "action_required" : "watch",
      latestStatus: latest.status,
      latestStartedAt: latest.startedAt,
      latestErrorMessage: latest.errorMessage,
      consecutiveErrors,
      runUrl: latest.runUrl,
      message: isConsecutiveFailure
        ? `${regulator} has failed its two most recent scraper runs.`
        : `${regulator} failed its latest scraper run but has not yet crossed the consecutive-failure threshold.`,
    });
  }

  return issues.sort((left, right) => {
    const severityRank = { action_required: 0, critical: 0, watch: 1 };
    return (
      severityRank[left.severity] - severityRank[right.severity] ||
      left.regulator.localeCompare(right.regulator)
    );
  });
}

export function buildAssuranceDecision(
  health: LiveRegulatorHealthResult[],
  scraperRunIssues: ScraperRunIssue[],
  options: { forceAi?: boolean; noAi?: boolean } = {},
): AssuranceDecision {
  const criticalCount =
    health.filter((result) => result.severity === "critical").length +
    scraperRunIssues.filter((issue) => issue.severity === "critical").length;
  const actionRequiredCount =
    health.filter((result) => result.severity === "action_required").length +
    scraperRunIssues.filter((issue) => issue.severity === "action_required")
      .length;
  const watchCount =
    health.filter((result) => result.severity === "watch").length +
    scraperRunIssues.filter((issue) => issue.severity === "watch").length;
  const status: AssuranceStatus =
    criticalCount > 0
      ? "critical"
      : actionRequiredCount > 0
        ? "action_required"
        : watchCount > 0
          ? "watch"
          : "ok";
  const alertRequired = status === "critical" || status === "action_required";

  return {
    status,
    alertRequired,
    shouldCallAi:
      !options.noAi &&
      (options.forceAi || alertRequired) &&
      getMaxAiCallsPerRun() > 0,
    criticalCount,
    actionRequiredCount,
    watchCount,
  };
}

export function redactText(value: string) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/(postgres(?:ql)?:\/\/)[^\s@]+@/gi, "$1[redacted]@")
    .replace(/(api[_-]?key|token|secret|password)=([^&\s]+)/gi, "$1=[redacted]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[redacted-token]");
}

export function buildDeepSeekMessages(input: {
  status: AssuranceStatus;
  health: LiveRegulatorHealthResult[];
  scraperRunIssues: ScraperRunIssue[];
  workflowUrl: string | null;
}) {
  const maxInputTokens = getNumberEnv("AI_TRIAGE_MAX_INPUT_TOKENS", 30000);
  const payload = {
    status: input.status,
    workflowUrl: input.workflowUrl,
    actionRequiredHealth: input.health
      .filter((result) =>
        ["critical", "action_required"].includes(result.severity),
      )
      .slice(0, 25)
      .map(compactHealthResult),
    watchHealth: input.health
      .filter((result) => result.severity === "watch")
      .slice(0, 25)
      .map(compactHealthResult),
    scraperRunIssues: input.scraperRunIssues.slice(0, 25),
  };
  const redactedPayload = redactText(JSON.stringify(payload, null, 2));
  const maxChars = Math.max(2000, maxInputTokens * 4);
  const compactPayload =
    redactedPayload.length > maxChars
      ? `${redactedPayload.slice(0, maxChars)}\n[truncated]`
      : redactedPayload;

  return [
    {
      role: "system",
      content:
        "You triage regulator scraper monitoring for RegActions. Return JSON only with keys: summary, likelyCause, impactedRegulators, nextAction, confidence. Keep it operational and concise. Do not invent facts outside the payload.",
    },
    {
      role: "user",
      content: compactPayload,
    },
  ];
}

function compactHealthResult(result: LiveRegulatorHealthResult) {
  return {
    regulator: result.regulator,
    status: result.status,
    severity: result.severity,
    cadence: result.cadence,
    records: result.recordCount,
    latest: result.latestRecordDate,
    futureRecordCount: result.futureRecordCount,
    latestFutureRecordDate: result.latestFutureRecordDate,
    ageDays: result.ageDays,
    staleAfterDays: result.freshnessWindowDays,
    minimumHealthyRecords: result.minimumHealthyRecords,
    sourceContract: result.sourceContractSummary,
    operatorAction: result.operatorAction,
    message: result.message,
  };
}

export async function runAiTriage(input: {
  status: AssuranceStatus;
  health: LiveRegulatorHealthResult[];
  scraperRunIssues: ScraperRunIssue[];
  workflowUrl: string | null;
}): Promise<AiTriageResult> {
  const provider = process.env.AI_TRIAGE_PROVIDER?.trim() || DEEPSEEK_PROVIDER;
  const model = process.env.AI_TRIAGE_MODEL?.trim() || DEEPSEEK_MODEL;

  if (provider !== DEEPSEEK_PROVIDER) {
    return skippedAi(provider, model, `Unsupported AI_TRIAGE_PROVIDER: ${provider}`);
  }

  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) {
    return skippedAi(provider, model, "DEEPSEEK_API_KEY is not configured");
  }

  const messages = buildDeepSeekMessages(input);
  const maxOutputTokens = getNumberEnv("AI_TRIAGE_MAX_OUTPUT_TOKENS", 1200);

  try {
    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: maxOutputTokens,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `DeepSeek request failed with HTTP ${response.status}: ${redactText(body).slice(0, 500)}`,
      );
    }

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = body.choices?.[0]?.message?.content?.trim() || "{}";
    const parsed = parseAiJson(content);
    const inputTokens = Number(body.usage?.prompt_tokens ?? 0);
    const outputTokens = Number(body.usage?.completion_tokens ?? 0);

    return {
      status: "success",
      provider,
      model,
      summary: getOptionalString(parsed.summary) || "AI triage completed.",
      likelyCause: getOptionalString(parsed.likelyCause),
      impactedRegulators: Array.isArray(parsed.impactedRegulators)
        ? parsed.impactedRegulators.map(String)
        : [],
      nextAction: getOptionalString(parsed.nextAction),
      confidence: normalizeConfidence(parsed.confidence),
      usage: {
        inputTokens,
        outputTokens,
      },
      costEstimateUsd: estimateDeepSeekCost(inputTokens, outputTokens),
      errorMessage: null,
    };
  } catch (error) {
    return {
      status: "error",
      provider,
      model,
      summary: "AI triage failed; use deterministic findings.",
      likelyCause: null,
      impactedRegulators: [],
      nextAction: null,
      confidence: null,
      usage: null,
      costEstimateUsd: 0,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

function parseAiJson(content: string) {
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return {
      summary: redactText(content).slice(0, 1000),
      likelyCause: null,
      impactedRegulators: [],
      nextAction: null,
      confidence: "low",
    };
  }
}

function normalizeConfidence(value: unknown): "low" | "medium" | "high" | null {
  return value === "low" || value === "medium" || value === "high"
    ? value
    : null;
}

function getOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function skippedAi(provider: string, model: string, reason: string): AiTriageResult {
  return {
    status: "skipped",
    provider,
    model,
    summary: reason,
    likelyCause: null,
    impactedRegulators: [],
    nextAction: null,
    confidence: null,
    usage: null,
    costEstimateUsd: 0,
    errorMessage: null,
  };
}

export function estimateDeepSeekCost(inputTokens: number, outputTokens: number) {
  return Number(
    (
      (inputTokens / 1_000_000) * DEEPSEEK_INPUT_PER_MILLION_USD +
      (outputTokens / 1_000_000) * DEEPSEEK_OUTPUT_PER_MILLION_USD
    ).toFixed(6),
  );
}

export function buildSesEmailInput(report: AssuranceReport, toAddress: string) {
  const subjectPrefix =
    report.status === "critical" ? "CRITICAL" : "SCRAPER ALERT";
  const findings = [
    ...report.health
      .filter((result) =>
        ["critical", "action_required"].includes(result.severity),
      )
      .map(
        (result) =>
          `- ${result.regulator}: ${result.severity} (${result.message})`,
      ),
    ...report.scraperRunIssues
      .filter((issue) =>
        ["critical", "action_required"].includes(issue.severity),
      )
      .map((issue) => `- ${issue.regulator}: ${issue.message}`),
  ];

  const body = [
    "RegActions Scraper Assurance Agent",
    "",
    `Status: ${report.status}`,
    `Checked: ${report.totals.checked}`,
    `Action required: ${report.totals.actionRequired}`,
    `Critical: ${report.totals.critical}`,
    `Watch-only: ${report.totals.watch}`,
    "",
    "Deterministic findings:",
    findings.length > 0 ? findings.join("\n") : "- None",
    "",
    "AI triage:",
    `- Status: ${report.aiTriage.status}`,
    `- Summary: ${report.aiTriage.summary}`,
    report.aiTriage.likelyCause
      ? `- Likely cause: ${report.aiTriage.likelyCause}`
      : null,
    report.aiTriage.nextAction
      ? `- Next action: ${report.aiTriage.nextAction}`
      : null,
    report.aiTriage.confidence
      ? `- Confidence: ${report.aiTriage.confidence}`
      : null,
    "",
    `Estimated AI cost this run: $${report.costEstimate.usd.toFixed(6)}`,
    report.workflowUrl ? `Workflow: ${report.workflowUrl}` : null,
    `Generated: ${report.generatedAt}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return {
    Source: process.env.SES_FROM_EMAIL?.trim() || "alerts@memaconsultants.com",
    Destination: {
      ToAddresses: [toAddress],
    },
    Message: {
      Subject: {
        Data: `${subjectPrefix}: RegActions scraper assurance requires action`,
      },
      Body: {
        Text: {
          Data: body,
        },
      },
    },
  };
}

function getMaxAiCallsPerRun() {
  return getNumberEnv(
    "AI_TRIAGE_MAX_CALLS_PER_RUN",
    getNumberEnv("AI_TRIAGE_MAX_CALLS_PER_DAY", 1),
  );
}

function getNumberEnv(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function writeJsonFile(path: string | null, value: unknown) {
  if (!path) {
    return;
  }

  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function main() {
  const options = parseCliOptions();
  const rows = await loadLiveRegulatorStats();
  const targetCodes = getTargetLiveRegulatorCodes(options.cadence);
  const health = buildLiveRegulatorHealthReport(
    rows,
    options.cadence,
  ).filter((result) => targetCodes.includes(result.regulator));
  const recentRuns = await loadRecentScraperRuns(
    options.cadence === "fragile" ? 30 : 14,
  );
  const scraperRunIssues = buildScraperRunIssues(recentRuns);
  const decision = buildAssuranceDecision(health, scraperRunIssues, options);
  const workflowUrl = process.env.WORKFLOW_URL?.trim() || null;
  const aiTriage = decision.shouldCallAi
    ? await runAiTriage({
        status: decision.status,
        health,
        scraperRunIssues,
        workflowUrl,
      })
    : skippedAi(
        process.env.AI_TRIAGE_PROVIDER?.trim() || DEEPSEEK_PROVIDER,
        process.env.AI_TRIAGE_MODEL?.trim() || DEEPSEEK_MODEL,
        decision.alertRequired
          ? "AI triage disabled by configuration"
          : "No action-required scraper findings",
      );

  const report: AssuranceReport = {
    generatedAt: new Date().toISOString(),
    status: decision.status,
    cadence: options.cadence,
    totals: {
      checked: health.length,
      ok: health.filter((result) => result.severity === "ok").length,
      watch: decision.watchCount,
      actionRequired: decision.actionRequiredCount,
      critical: decision.criticalCount,
      scraperRunIssues: scraperRunIssues.length,
    },
    health,
    scraperRunIssues,
    aiTriage,
    costEstimate: {
      provider: aiTriage.provider,
      model: aiTriage.model,
      usd: aiTriage.costEstimateUsd,
    },
    workflowUrl,
  };

  await writeJsonFile(options.outputFile, report);

  if (decision.alertRequired && options.sesOutputFile) {
    await writeJsonFile(
      options.sesOutputFile,
      buildSesEmailInput(
        report,
        process.env.ALERT_EMAIL?.trim() || "ademola@memaconsultants.com",
      ),
    );
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(
      `Scraper assurance status: ${report.status} (${report.totals.checked} checked, ${report.totals.actionRequired} action required, ${report.totals.critical} critical, ${report.totals.watch} watch-only)`,
    );
    console.log(`AI triage: ${report.aiTriage.status}`);
    console.log(`Estimated AI cost: $${report.costEstimate.usd.toFixed(6)}`);
  }

  if (options.exitCode && decision.alertRequired) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(
      `Scraper assurance agent failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  });
}
