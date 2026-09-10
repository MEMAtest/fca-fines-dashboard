import { createHash } from "node:crypto";
import type { CountryRiskSourceStatus } from "../../../src/data/countryRiskSources.js";

export type FatfListAttemptOutcome = "drift" | "unavailable" | "error";

export interface FatfListReviewReport {
  checkedAt?: string;
  sourceUrl?: string;
  sha256?: string;
  liveBlack?: string[];
  liveGrey?: string[];
  diff?: unknown;
  error?: string;
}

export interface PersistableFatfListAttempt {
  attemptKey: string;
  status: "failed" | "review_required";
  sourceUrl: string;
  attemptedAt: string;
  effectiveAt: string | null;
  sha256: string | null;
  recordCount: number;
  errorMessage: string;
  metadata: Record<string, unknown>;
}

export function buildFatfListAttempt(input: {
  outcome: FatfListAttemptOutcome;
  report: FatfListReviewReport;
  retainedSource: CountryRiskSourceStatus;
  now?: Date;
}): PersistableFatfListAttempt {
  const { outcome, report, retainedSource } = input;
  const attemptedAt = report.checkedAt ?? (input.now ?? new Date()).toISOString();
  if (!Number.isFinite(new Date(attemptedAt).getTime())) {
    throw new Error(`Invalid FATF attempt timestamp: ${attemptedAt}`);
  }

  const isDrift = outcome === "drift";
  const recordCount = isDrift
    ? (report.liveBlack?.length ?? 0) + (report.liveGrey?.length ?? 0)
    : 0;
  const errorMessage = isDrift
    ? "The live FATF black or grey list differs from the approved snapshot."
    : outcome === "unavailable"
      ? report.error ?? "The live FATF list could not be obtained automatically."
      : report.error ?? "The FATF verifier ended with an unexpected error.";
  const attemptKey = createHash("sha256").update(JSON.stringify({
    outcome,
    attemptedAt,
    sourceUrl: report.sourceUrl ?? retainedSource.sourceUrl,
    sha256: report.sha256 ?? null,
    diff: report.diff ?? null,
    errorMessage,
  })).digest("hex");

  return {
    attemptKey,
    status: isDrift ? "review_required" : "failed",
    sourceUrl: report.sourceUrl ?? retainedSource.sourceUrl,
    attemptedAt,
    effectiveAt: retainedSource.effectiveAt,
    sha256: isDrift ? report.sha256 ?? null : null,
    recordCount,
    errorMessage,
    metadata: {
      attemptKey,
      outcome,
      retainedEvidence: outcome === "unavailable",
      retainedRetrievedAt: retainedSource.retrievedAt,
      retainedEffectiveAt: retainedSource.effectiveAt,
      retainedSha256: retainedSource.sha256,
      liveBlackCount: report.liveBlack?.length ?? null,
      liveGreyCount: report.liveGrey?.length ?? null,
      diff: report.diff ?? null,
    },
  };
}
