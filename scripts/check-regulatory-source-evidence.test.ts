import { describe, expect, it } from "vitest";
import {
  deriveAssessmentDecision,
  type SourceCandidate,
  type SourceCheckResult,
} from "./check-regulatory-source-evidence.js";

const checkedAt = "2026-07-18T09:00:00.000Z";

function candidate(overrides: Partial<SourceCandidate> = {}): SourceCandidate {
  return {
    regulator: "FCA",
    raw_url: "https://www.fca.org.uk/news/example",
    evidence_url: "https://www.fca.org.uk/news/example",
    previous_content_hash: null,
    last_successful_content_hash: "previous-hash",
    last_verified_at: "2026-06-18T09:00:00.000Z",
    consecutive_failures: 0,
    first_failure_at: null,
    review_status: "clear",
    ...overrides,
  };
}

function result(overrides: Partial<SourceCheckResult> = {}): SourceCheckResult {
  return {
    status: "verified_detail",
    resolvedUrl: "https://www.fca.org.uk/news/example",
    httpStatus: 200,
    officialDomainMatch: true,
    contentHash: "previous-hash",
    errorMessage: null,
    ...overrides,
  };
}

describe("source assessment decisions", () => {
  it("renews a successful source without creating a review item", () => {
    const decision = deriveAssessmentDecision(candidate(), result(), checkedAt);
    expect(decision).toMatchObject({
      outcome: "success",
      lastVerifiedAt: checkedAt,
      consecutiveFailures: 0,
      reviewStatus: "clear",
      contentChanged: false,
    });
    expect(decision.nextCheckAt).toBe("2026-08-17T09:00:00.000Z");
  });

  it("keeps verification but queues changed official content for review", () => {
    const decision = deriveAssessmentDecision(
      candidate(),
      result({ contentHash: "new-hash" }),
      checkedAt,
    );
    expect(decision).toMatchObject({
      outcome: "success",
      reviewStatus: "needs_review",
      contentChanged: true,
      lastSuccessfulContentHash: "new-hash",
    });
  });

  it("preserves last-known-good evidence through a transient block", () => {
    const decision = deriveAssessmentDecision(
      candidate(),
      result({
        status: "official_unverified",
        httpStatus: 429,
        contentHash: null,
        errorMessage: "Official source returned HTTP 429",
      }),
      checkedAt,
    );
    expect(decision).toMatchObject({
      outcome: "transient_failure",
      consecutiveFailures: 1,
      reviewStatus: "clear",
      lastVerifiedAt: "2026-06-18T09:00:00.000Z",
      lastSuccessfulContentHash: "previous-hash",
    });
    expect(decision.nextCheckAt).toBe("2026-07-19T09:00:00.000Z");
  });

  it("queues a source after three consecutive transient failures", () => {
    const decision = deriveAssessmentDecision(
      candidate({ consecutive_failures: 2, first_failure_at: "2026-07-16T09:00:00.000Z" }),
      result({
        status: "official_unverified",
        httpStatus: 503,
        contentHash: null,
        errorMessage: "Official source returned HTTP 503",
      }),
      checkedAt,
    );
    expect(decision).toMatchObject({
      outcome: "transient_failure",
      consecutiveFailures: 3,
      reviewStatus: "needs_review",
      firstFailureAt: "2026-07-16T09:00:00.000Z",
    });
  });

  it("immediately queues a redirect outside official domains", () => {
    const decision = deriveAssessmentDecision(
      candidate(),
      result({
        status: "official_unverified",
        resolvedUrl: "https://example.com/case",
        officialDomainMatch: false,
        contentHash: null,
        errorMessage: "Official source redirected outside the configured regulator domains",
      }),
      checkedAt,
    );
    expect(decision).toMatchObject({
      outcome: "permanent_failure",
      consecutiveFailures: 1,
      reviewStatus: "needs_review",
    });
  });

  it("records listing-only evidence explicitly without treating it as reachable", () => {
    const decision = deriveAssessmentDecision(
      candidate(),
      result({
        status: "listing_only",
        httpStatus: null,
        contentHash: null,
      }),
      checkedAt,
    );
    expect(decision).toMatchObject({
      outcome: "not_checkable",
      reviewStatus: "needs_review",
      consecutiveFailures: 0,
    });
  });
});
