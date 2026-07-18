import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import postgres, { type Sql } from "postgres";
import "dotenv/config";
import { resolveConnectionString } from "../server/db.js";
import { getRegulatorCoverage } from "../src/data/regulatorCoverage.js";
import {
  deriveSourceLinkStatus,
  type SourceLinkStatus,
} from "../src/utils/sourceLinks.js";

export const CHECKER_VERSION = "source-check-v2";
const MAX_HASH_BYTES = 64 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;

export interface SourceCandidate {
  regulator: string;
  raw_url: string;
  evidence_url: string;
  previous_content_hash: string | null;
  last_successful_content_hash: string | null;
  last_verified_at: string | null;
  consecutive_failures: number | null;
  first_failure_at: string | null;
  review_status: "clear" | "needs_review" | "dismissed" | null;
}

export interface SourceCheckResult {
  status: SourceLinkStatus;
  resolvedUrl: string | null;
  httpStatus: number | null;
  officialDomainMatch: boolean;
  contentHash: string | null;
  errorMessage: string | null;
}

export type SourceCheckOutcome =
  | "success"
  | "transient_failure"
  | "permanent_failure"
  | "not_checkable";

export interface SourceAssessmentDecision {
  outcome: SourceCheckOutcome;
  checkedAt: string;
  nextCheckAt: string;
  lastVerifiedAt: string | null;
  lastSuccessfulContentHash: string | null;
  consecutiveFailures: number;
  firstFailureAt: string | null;
  reviewStatus: "clear" | "needs_review" | "dismissed";
  reviewReason: string | null;
  contentChanged: boolean;
}

export interface SourceCheckSummary {
  checked: number;
  remainingDue: number;
  outcomes: Record<string, number>;
  statuses: Record<string, number>;
  reviewRequired: number;
}

function hostname(value: string) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function officialDomains(regulator: string) {
  return new Set(
    (getRegulatorCoverage(regulator)?.officialSources ?? [])
      .map((source) => hostname(source.url))
      .filter((value): value is string => Boolean(value)),
  );
}

function domainMatches(host: string | null, allowed: Set<string>) {
  if (!host) return false;
  return [...allowed].some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
}

function isVerified(status: SourceLinkStatus) {
  return status === "verified_detail" || status === "verified_publication";
}

function isTransientFailure(result: SourceCheckResult) {
  if (result.status !== "official_unverified" || !result.officialDomainMatch) {
    return false;
  }
  if (result.httpStatus === null) return true;
  return [403, 408, 425, 429].includes(result.httpStatus) || result.httpStatus >= 500;
}

function plusDays(value: string, days: number) {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

export function deriveAssessmentDecision(
  candidate: Pick<
    SourceCandidate,
    | "last_successful_content_hash"
    | "last_verified_at"
    | "consecutive_failures"
    | "first_failure_at"
    | "review_status"
  >,
  result: SourceCheckResult,
  checkedAt = new Date().toISOString(),
): SourceAssessmentDecision {
  if (isVerified(result.status)) {
    const contentChanged = Boolean(
      candidate.last_successful_content_hash &&
      result.contentHash &&
      candidate.last_successful_content_hash !== result.contentHash,
    );
    return {
      outcome: "success",
      checkedAt,
      nextCheckAt: plusDays(checkedAt, 30),
      lastVerifiedAt: checkedAt,
      lastSuccessfulContentHash:
        result.contentHash ?? candidate.last_successful_content_hash,
      consecutiveFailures: 0,
      firstFailureAt: null,
      reviewStatus: contentChanged ? "needs_review" : "clear",
      reviewReason: contentChanged
        ? "Official source content changed since the last successful verification"
        : null,
      contentChanged,
    };
  }

  if (result.status === "listing_only" || result.status === "missing") {
    return {
      outcome: "not_checkable",
      checkedAt,
      nextCheckAt: plusDays(checkedAt, 90),
      lastVerifiedAt: candidate.last_verified_at,
      lastSuccessfulContentHash: candidate.last_successful_content_hash,
      consecutiveFailures: 0,
      firstFailureAt: null,
      reviewStatus: "needs_review",
      reviewReason:
        result.status === "listing_only"
          ? "Only a regulator listing page is available"
          : "No usable official evidence URL is available",
      contentChanged: false,
    };
  }

  const transient = isTransientFailure(result);
  const consecutiveFailures = Number(candidate.consecutive_failures ?? 0) + 1;
  const needsReview = !transient || consecutiveFailures >= 3;
  return {
    outcome: transient ? "transient_failure" : "permanent_failure",
    checkedAt,
    nextCheckAt: plusDays(checkedAt, transient ? 1 : 7),
    lastVerifiedAt: candidate.last_verified_at,
    lastSuccessfulContentHash: candidate.last_successful_content_hash,
    consecutiveFailures,
    firstFailureAt: candidate.first_failure_at ?? checkedAt,
    reviewStatus: needsReview ? "needs_review" : candidate.review_status ?? "clear",
    reviewReason: needsReview
      ? result.errorMessage ?? "Official evidence source could not be verified"
      : null,
    contentChanged: false,
  };
}

async function readHash(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < MAX_HASH_BYTES) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      const remaining = MAX_HASH_BYTES - size;
      const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value;
      chunks.push(chunk);
      size += chunk.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  if (!chunks.length) return null;
  return createHash("sha256")
    .update(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))))
    .digest("hex");
}

export async function checkOfficialSource(
  candidate: Pick<SourceCandidate, "regulator" | "raw_url" | "evidence_url">,
): Promise<SourceCheckResult> {
  const initial = deriveSourceLinkStatus(candidate.regulator, candidate.raw_url, null);
  if (initial === "missing" || initial === "listing_only") {
    return {
      status: initial,
      resolvedUrl: candidate.raw_url || null,
      httpStatus: null,
      officialDomainMatch: domainMatches(
        hostname(candidate.raw_url),
        officialDomains(candidate.regulator),
      ),
      contentHash: null,
      errorMessage: null,
    };
  }

  const allowed = officialDomains(candidate.regulator);
  const initialDomainMatch = domainMatches(hostname(candidate.raw_url), allowed);
  if (!initialDomainMatch) {
    return {
      status: "official_unverified",
      resolvedUrl: candidate.raw_url,
      httpStatus: null,
      officialDomainMatch: false,
      contentHash: null,
      errorMessage: "URL is outside the regulator's configured official domains",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(candidate.raw_url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "RegActionsEvidenceChecker/2.0 (+https://regactions.com/methodology/enforcement)",
        Range: `bytes=0-${MAX_HASH_BYTES - 1}`,
      },
    });
    const resolvedUrl = response.url || candidate.raw_url;
    const resolvedDomainMatch = domainMatches(hostname(resolvedUrl), allowed);
    const contentHash = response.ok ? await readHash(response) : null;
    const isPublication =
      /application\/pdf/i.test(response.headers.get("content-type") ?? "") ||
      /\.pdf(?:$|[?#])/i.test(resolvedUrl);
    return {
      status:
        response.ok && resolvedDomainMatch
          ? isPublication
            ? "verified_publication"
            : "verified_detail"
          : "official_unverified",
      resolvedUrl,
      httpStatus: response.status,
      officialDomainMatch: resolvedDomainMatch,
      contentHash,
      errorMessage: response.ok
        ? resolvedDomainMatch
          ? null
          : "Official source redirected outside the configured regulator domains"
        : `Official source returned HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      status: "official_unverified",
      resolvedUrl: candidate.raw_url,
      httpStatus: null,
      officialDomainMatch: true,
      contentHash: null,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function loadDueCandidates(
  sql: Sql,
  options: { limit: number; regulator?: string; now: string },
) {
  return sql<SourceCandidate[]>`
    WITH due AS (
      SELECT DISTINCT ON (upper(canonical.regulator), evidence.evidence_url)
        upper(canonical.regulator) AS regulator,
        evidence.raw_url,
        evidence.evidence_url,
        assessment.content_hash AS previous_content_hash,
        assessment.last_successful_content_hash,
        assessment.last_verified_at::text,
        assessment.consecutive_failures,
        assessment.first_failure_at::text,
        assessment.review_status
      FROM public.all_regulatory_fines_canonical AS canonical
      CROSS JOIN LATERAL (
        SELECT
          COALESCE(NULLIF(canonical.notice_url, ''), NULLIF(canonical.source_url, ''), '') AS raw_url,
          public.normalise_regulatory_evidence_url(
            COALESCE(NULLIF(canonical.notice_url, ''), NULLIF(canonical.source_url, ''), '')
          ) AS evidence_url
      ) AS evidence
      LEFT JOIN public.regulatory_source_assessments AS assessment
        ON assessment.regulator = upper(canonical.regulator)
       AND assessment.evidence_url = evidence.evidence_url
      WHERE evidence.raw_url <> ''
        AND (${options.regulator ?? null}::text IS NULL OR upper(canonical.regulator) = ${options.regulator ?? null})
        AND (assessment.next_check_at IS NULL OR assessment.next_check_at <= ${options.now}::timestamptz)
      ORDER BY upper(canonical.regulator), evidence.evidence_url, canonical.date_issued DESC
    ), ranked AS (
      SELECT due.*, row_number() OVER (
        PARTITION BY due.regulator ORDER BY due.evidence_url
      ) AS regulator_rank
      FROM due
    )
    SELECT
      regulator, raw_url, evidence_url, previous_content_hash,
      last_successful_content_hash, last_verified_at, consecutive_failures,
      first_failure_at, review_status
    FROM ranked
    ORDER BY regulator_rank, regulator, evidence_url
    LIMIT ${options.limit}
  `;
}

async function persistAssessment(
  sql: Sql,
  candidate: SourceCandidate,
  result: SourceCheckResult,
  decision: SourceAssessmentDecision,
) {
  await sql.begin(async (transaction) => {
    const tx = transaction as unknown as Sql;
    await tx`
      INSERT INTO public.regulatory_source_assessment_history (
        regulator, evidence_url, checked_at, source_status, outcome,
        resolved_url, http_status, official_domain_match, content_hash,
        content_changed, checker_version, error_message
      ) VALUES (
        ${candidate.regulator}, ${candidate.evidence_url}, ${decision.checkedAt},
        ${result.status}, ${decision.outcome}, ${result.resolvedUrl},
        ${result.httpStatus}, ${result.officialDomainMatch}, ${result.contentHash},
        ${decision.contentChanged}, ${CHECKER_VERSION}, ${result.errorMessage}
      )
    `;
    await tx`
      INSERT INTO public.regulatory_source_assessments (
        regulator, evidence_url, source_status, resolved_url, checked_at,
        last_verified_at, next_check_at, consecutive_failures, first_failure_at,
        official_domain_match, http_status, content_hash,
        last_successful_content_hash, checker_version, error_message,
        review_status, review_reason, updated_at
      ) VALUES (
        ${candidate.regulator}, ${candidate.evidence_url}, ${result.status},
        ${result.resolvedUrl}, ${decision.checkedAt}, ${decision.lastVerifiedAt},
        ${decision.nextCheckAt}, ${decision.consecutiveFailures},
        ${decision.firstFailureAt}, ${result.officialDomainMatch},
        ${result.httpStatus}, ${result.contentHash},
        ${decision.lastSuccessfulContentHash}, ${CHECKER_VERSION},
        ${result.errorMessage}, ${decision.reviewStatus},
        ${decision.reviewReason}, now()
      )
      ON CONFLICT (regulator, evidence_url) DO UPDATE SET
        source_status = EXCLUDED.source_status,
        resolved_url = EXCLUDED.resolved_url,
        checked_at = EXCLUDED.checked_at,
        last_verified_at = EXCLUDED.last_verified_at,
        next_check_at = EXCLUDED.next_check_at,
        consecutive_failures = EXCLUDED.consecutive_failures,
        first_failure_at = EXCLUDED.first_failure_at,
        official_domain_match = EXCLUDED.official_domain_match,
        http_status = EXCLUDED.http_status,
        content_hash = EXCLUDED.content_hash,
        last_successful_content_hash = EXCLUDED.last_successful_content_hash,
        checker_version = EXCLUDED.checker_version,
        error_message = EXCLUDED.error_message,
        review_status = EXCLUDED.review_status,
        review_reason = EXCLUDED.review_reason,
        updated_at = now()
    `;
  });
}

export async function runSourceEvidenceChecks(
  sql: Sql,
  options: {
    limit?: number;
    concurrency?: number;
    regulator?: string;
    now?: string;
    check?: typeof checkOfficialSource;
  } = {},
): Promise<SourceCheckSummary> {
  const now = options.now ?? new Date().toISOString();
  const limit = Math.max(1, Math.floor(options.limit ?? 100));
  const concurrency = Math.max(1, Math.min(12, Math.floor(options.concurrency ?? 4)));
  const candidates = await loadDueCandidates(sql, {
    limit,
    regulator: options.regulator?.toUpperCase(),
    now,
  });
  const check = options.check ?? checkOfficialSource;
  const domainQueues = new Map<string, SourceCandidate[]>();
  for (const candidate of candidates) {
    const key = hostname(candidate.raw_url) ?? `invalid:${candidate.evidence_url}`;
    const queue = domainQueues.get(key) ?? [];
    queue.push(candidate);
    domainQueues.set(key, queue);
  }

  const queues = [...domainQueues.values()];
  let queueCursor = 0;
  const completed: Array<{
    result: SourceCheckResult;
    decision: SourceAssessmentDecision;
  }> = [];
  const workers = Array.from({ length: Math.min(concurrency, queues.length) }, async () => {
    while (queueCursor < queues.length) {
      const queue = queues[queueCursor++];
      for (const candidate of queue) {
        const result = await check(candidate);
        const decision = deriveAssessmentDecision(candidate, result, now);
        await persistAssessment(sql, candidate, result, decision);
        completed.push({ result, decision });
      }
    }
  });
  await Promise.all(workers);

  const [{ count: remainingDue = 0 } = { count: 0 }] = await sql<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM (
      SELECT DISTINCT upper(canonical.regulator), evidence.evidence_url
      FROM public.all_regulatory_fines_canonical AS canonical
      CROSS JOIN LATERAL (
        SELECT
          COALESCE(NULLIF(canonical.notice_url, ''), NULLIF(canonical.source_url, ''), '') AS raw_url,
          public.normalise_regulatory_evidence_url(
            COALESCE(NULLIF(canonical.notice_url, ''), NULLIF(canonical.source_url, ''), '')
          ) AS evidence_url
      ) AS evidence
      LEFT JOIN public.regulatory_source_assessments AS assessment
        ON assessment.regulator = upper(canonical.regulator)
       AND assessment.evidence_url = evidence.evidence_url
      WHERE evidence.raw_url <> ''
        AND (${options.regulator?.toUpperCase() ?? null}::text IS NULL OR upper(canonical.regulator) = ${options.regulator?.toUpperCase() ?? null})
        AND (assessment.next_check_at IS NULL OR assessment.next_check_at <= ${now}::timestamptz)
    ) AS remaining
  `;

  return {
    checked: completed.length,
    remainingDue: Number(remainingDue),
    outcomes: completed.reduce<Record<string, number>>((counts, item) => {
      counts[item.decision.outcome] = (counts[item.decision.outcome] ?? 0) + 1;
      return counts;
    }, {}),
    statuses: completed.reduce<Record<string, number>>((counts, item) => {
      counts[item.result.status] = (counts[item.result.status] ?? 0) + 1;
      return counts;
    }, {}),
    reviewRequired: completed.filter((item) => item.decision.reviewStatus === "needs_review").length,
  };
}

function numberArgument(name: string, fallback: number) {
  const match = process.argv.find((arg) => arg.startsWith(`${name}=`));
  const parsed = Number(match?.split("=")[1]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

async function main() {
  const databaseUrl = resolveConnectionString();
  if (!databaseUrl) throw new Error("A production database connection is required");
  const sql = postgres(databaseUrl, {
    ssl: databaseUrl.includes("sslmode=")
      ? { rejectUnauthorized: false }
      : undefined,
  });
  const limit = numberArgument("--limit", 100);
  const concurrency = numberArgument("--concurrency", 4);
  const regulator = process.argv
    .find((arg) => arg.startsWith("--regulator="))
    ?.split("=")[1]
    ?.toUpperCase();
  const runAll = process.argv.includes("--all");

  try {
    const totals: SourceCheckSummary = {
      checked: 0,
      remainingDue: 0,
      outcomes: {},
      statuses: {},
      reviewRequired: 0,
    };
    do {
      const summary = await runSourceEvidenceChecks(sql, {
        limit,
        concurrency,
        regulator,
      });
      totals.checked += summary.checked;
      totals.remainingDue = summary.remainingDue;
      totals.reviewRequired += summary.reviewRequired;
      for (const [key, value] of Object.entries(summary.outcomes)) {
        totals.outcomes[key] = (totals.outcomes[key] ?? 0) + value;
      }
      for (const [key, value] of Object.entries(summary.statuses)) {
        totals.statuses[key] = (totals.statuses[key] ?? 0) + value;
      }
      if (!runAll || summary.checked === 0 || summary.remainingDue === 0) break;
      console.log(JSON.stringify({ batch: summary }, null, 2));
    } while (true);
    console.log(JSON.stringify(totals, null, 2));
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error("Source evidence check failed", error);
    process.exitCode = 1;
  });
}
