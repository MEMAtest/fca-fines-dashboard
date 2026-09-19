import { describe, expect, it } from "vitest";
import { classifyEnforcementOutcome } from "./enforcementOutcomes.js";

describe("classifyEnforcementOutcome", () => {
  it("retains multiple outcomes for a disclosed fine and prohibition", () => {
    const result = classifyEnforcementOutcome({
      amountGbp: 2_400_000,
      breachType: "Final Notice",
      summary: "The FCA fined the individual and prohibited them from performing regulated activities.",
    });
    expect(result.recordClass).toBe("enforcement_outcome");
    expect(result.monetaryPenaltyStatus).toBe("disclosed");
    expect(result.outcomeTypes).toEqual(expect.arrayContaining(["monetary_penalty", "prohibition_debarment"]));
    expect(result.publicationType).toBe("final_notice");
  });

  it("marks a licence revocation as non-monetary rather than a zero fine", () => {
    const result = classifyEnforcementOutcome({
      breachType: "Public Notice",
      summary: "The central bank revoked the institution's licence with immediate effect.",
    });
    expect(result.recordClass).toBe("enforcement_outcome");
    expect(result.outcomeTypes).toContain("licence_restriction_revocation");
    expect(result.monetaryPenaltyStatus).toBe("none");
  });

  it("keeps an illegal operator warning outside concluded enforcement totals", () => {
    const result = classifyEnforcementOutcome({
      breachType: "Investor Alert",
      summary: "Investor alert concerning an illegal operator and unauthorised entity.",
    });
    expect(result.recordClass).toBe("regulatory_alert");
    expect(result.proceduralStatus).toBe("alert_only");
    expect(result.monetaryPenaltyStatus).toBe("unknown");
  });

  it("does not treat guidance containing the word penalty as an imposed fine", () => {
    const result = classifyEnforcementOutcome({
      breachType: "Guidance",
      summary: "Consultation on the financial penalty policy and supervisory framework.",
    });
    expect(result.recordClass).toBe("informational_notice");
    expect(result.monetaryPenaltyStatus).toBe("unknown");
  });

  it("distinguishes an undisclosed fine from a non-monetary outcome", () => {
    const result = classifyEnforcementOutcome({ summary: "The authority imposed a financial penalty; the amount was not disclosed." });
    expect(result.recordClass).toBe("enforcement_outcome");
    expect(result.monetaryPenaltyStatus).toBe("undisclosed");
  });

  it("does not trust a held amount", () => {
    const result = classifyEnforcementOutcome({
      amountGbp: 500_000,
      requiresAmountReview: true,
      summary: "The firm was fined following the investigation.",
    });
    expect(result.monetaryPenaltyStatus).toBe("undisclosed");
  });

  it("marks censure without a penalty as non-monetary", () => {
    const result = classifyEnforcementOutcome({ summary: "The regulator publicly censured the firm." });
    expect(result.outcomeTypes).toContain("public_censure_reprimand");
    expect(result.monetaryPenaltyStatus).toBe("none");
  });

  it("marks filed charges as pending", () => {
    const result = classifyEnforcementOutcome({ summary: "Charges were filed and proceedings commenced." });
    expect(result.recordClass).toBe("proceeding");
    expect(result.proceduralStatus).toBe("pending");
  });

  it("does not infer an outcome from the word notice alone", () => {
    const result = classifyEnforcementOutcome({ breachType: "Notice", summary: "Notice concerning a market update." });
    expect(result.recordClass).toBe("unknown");
    expect(result.outcomeTypes).toEqual([]);
  });

  it("uses normalized action categories without replacing source wording", () => {
    const result = classifyEnforcementOutcome({ breachCategories: ["SUPERVISORY_SANCTION"] });
    expect(result.recordClass).toBe("enforcement_outcome");
    expect(result.primaryOutcome).toBe("other");
    expect(result.monetaryPenaltyStatus).toBe("none");
  });
});
