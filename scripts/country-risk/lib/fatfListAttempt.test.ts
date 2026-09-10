import { describe, expect, it } from "vitest";
import type { CountryRiskSourceStatus } from "../../../src/data/countryRiskSources.js";
import { buildFatfListAttempt } from "./fatfListAttempt.js";

const retainedSource: CountryRiskSourceStatus = {
  id: "fatf-lists",
  name: "FATF monitored jurisdictions",
  sourceUrl: "https://www.fatf-gafi.org/en/countries/black-and-grey-lists.html",
  scored: true,
  cadence: "weekly",
  state: "current",
  effectiveAt: "2026-06-19",
  retrievedAt: "2026-07-16",
  sha256: "retained-hash",
  note: "",
};

describe("FATF list attempt persistence", () => {
  it("records transport unavailability without pretending retained evidence was retrieved again", () => {
    const attempt = buildFatfListAttempt({
      outcome: "unavailable",
      retainedSource,
      report: {
        checkedAt: "2026-07-20T06:23:00.000Z",
        sourceUrl: retainedSource.sourceUrl,
        error: "Direct and Playwright lanes failed",
      },
    });

    expect(attempt).toMatchObject({
      status: "failed",
      attemptedAt: "2026-07-20T06:23:00.000Z",
      sha256: null,
      recordCount: 0,
      errorMessage: "Direct and Playwright lanes failed",
      metadata: {
        outcome: "unavailable",
        retainedEvidence: true,
        retainedRetrievedAt: "2026-07-16",
        retainedSha256: "retained-hash",
      },
    });
  });

  it("records detected drift as review-required with the live evidence summary", () => {
    const attempt = buildFatfListAttempt({
      outcome: "drift",
      retainedSource,
      report: {
        checkedAt: "2026-07-20T06:23:00.000Z",
        sourceUrl: retainedSource.sourceUrl,
        sha256: "live-hash",
        liveBlack: ["IR", "MM", "KP"],
        liveGrey: ["AE", "BG"],
        diff: { inSync: false, addedToGrey: ["BG"] },
      },
    });

    expect(attempt).toMatchObject({
      status: "review_required",
      sha256: "live-hash",
      recordCount: 5,
      metadata: {
        outcome: "drift",
        retainedEvidence: false,
        liveBlackCount: 3,
        liveGreyCount: 2,
      },
    });
  });
});
