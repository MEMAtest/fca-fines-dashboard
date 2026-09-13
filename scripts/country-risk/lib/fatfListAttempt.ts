import { createHash } from "node:crypto";
import type { CountryRiskSourceStatus } from "../../../src/data/countryRiskSources.js";

export type FatfListAttemptOutcome = "verified" | "drift" | "unavailable" | "error";

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
  status: "succeeded" | "failed" | "review_required";
  sourceUrl: string;
  attemptedAt: string;
  effectiveAt: string | null;
  sha256: string | null;
  recordCount: number;
  errorMessage: string | null;
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
  const isVerified = outcome === "verified";
  const recordCount = isDrift || isVerified
    ? (report.liveBlack?.length ?? 0) + (report.liveGrey?.length ?? 0)
    : 0;
  const hasInSyncDiff = typeof report.diff === "object"
    && report.diff !== null
    && "inSync" in report.diff
    && report.diff.inSync === true;
  if (isVerified && (!report.sha256 || recordCount <= 0 || !hasInSyncDiff)) {
    throw new Error("A verified FATF list attempt requires a source hash, an in-sync comparison and at least one listed jurisdiction");
  }
  const errorMessage = isVerified
    ? null
    : isDrift
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
    status: isVerified ? "succeeded" : isDrift ? "review_required" : "failed",
    sourceUrl: report.sourceUrl ?? retainedSource.sourceUrl,
    attemptedAt,
    effectiveAt: retainedSource.effectiveAt,
    sha256: isDrift || isVerified ? report.sha256 ?? null : null,
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
