import { describe, expect, it } from "vitest";
import {
  SANCTIONS_AUTOMATED_DECISION_ACTOR,
  SANCTIONS_AUTOMATED_DECISION_ORGANISATION,
} from "./deterministicSanctionsDecision.js";
import { canRefreshAutomatedSanctionsDecision } from "./sanctionsReviewRefresh.js";

const existing = {
  status: "approved",
  relationship: "direct-country-exposure",
  proposed_tier: "sectoral",
  final_tier: "sectoral",
  legal_status: "active",
  coverage_state: "active-direct",
  reviewed_by: SANCTIONS_AUTOMATED_DECISION_ACTOR,
  reviewer_organisation: SANCTIONS_AUTOMATED_DECISION_ORGANISATION,
};

const incoming = {
  status: "approved",
  relationship: "direct-country-exposure",
  proposed_tier: "sectoral",
  final_tier: "sectoral",
  legal_status: "active",
  coverage_state: "active-direct",
  reviewed_by: SANCTIONS_AUTOMATED_DECISION_ACTOR,
  reviewer_organisation: SANCTIONS_AUTOMATED_DECISION_ORGANISATION,
};

describe("automated sanctions decision refresh", () => {
  it("allows refreshed official evidence when the deterministic outcome is unchanged", () => {
    expect(canRefreshAutomatedSanctionsDecision(existing, incoming)).toBe(true);
  });

  it("never overwrites a manually reviewed decision", () => {
    expect(canRefreshAutomatedSanctionsDecision({ ...existing, reviewed_by: "Human reviewer" }, incoming)).toBe(false);
  });

  it("fails closed when refreshed evidence changes the classification", () => {
    expect(canRefreshAutomatedSanctionsDecision(existing, { ...incoming, final_tier: "targeted" })).toBe(false);
    expect(canRefreshAutomatedSanctionsDecision(existing, { ...incoming, coverage_state: "unknown" })).toBe(false);
  });
});
