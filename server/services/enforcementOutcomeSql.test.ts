import { describe, expect, it } from "vitest";
import { classifyEnforcementOutcome } from "../../src/data/enforcementOutcomes.js";
import { enforcementOutcomePredicate } from "./enforcementOutcomeSql.js";
import { ENFORCEMENT_OUTCOME_SQL_FIXTURES } from "./enforcementOutcomeSqlFixtures.js";

describe("Fines outcome SQL predicate", () => {
  it("uses trusted disclosed amounts and canonical monetary wording, excluding informational items", () => {
    const predicate = enforcementOutcomePredicate("Monetary")!;
    expect(predicate).toContain("requires_amount_review");
    expect(predicate).toContain("amount_gbp");
    expect(predicate).toContain("amount_eur");
    expect(predicate).toContain("financial penalty");
    expect(predicate).toContain("NOT");
    expect(predicate).toContain("COALESCE");
  });

  it("treats non-monetary as a concluded action without monetary classification", () => {
    const predicate = enforcementOutcomePredicate("Non-monetary")!;
    expect(predicate).toContain("NOT");
    expect(predicate).toContain("licen[cs]e");
    expect(predicate).toContain(".{0,45}");
    expect(predicate).toContain("final notice");
  });

  it("applies final-outcome precedence before pending and alert wording", () => {
    const predicate = enforcementOutcomePredicate("Pending and alerts")!;
    expect(predicate).toContain("investor alert");
    expect(predicate).toContain("show cause notice");
    expect(predicate.match(/NOT \(/g)?.length).toBeGreaterThan(0);
    expect(enforcementOutcomePredicate("All")).toBeNull();
  });

  it("anchors the executable SQL parity matrix to canonical classifier outcomes", () => {
    const outcomes = new Map(ENFORCEMENT_OUTCOME_SQL_FIXTURES.map(({ id, input }) => [
      id,
      classifyEnforcementOutcome(input),
    ]));
    expect(outcomes.get("trusted-positive-gbp")?.outcomeTypes).toContain("monetary_penalty");
    expect(outcomes.get("reviewed-positive-amount")?.outcomeTypes).not.toContain("monetary_penalty");
    expect(outcomes.get("informational-fine-wording")?.recordClass).toBe("informational_notice");
    expect(outcomes.get("phrase-split-across-categories")?.outcomeTypes).toContain("monetary_penalty");
    expect(outcomes.get("final-notice-alert-pending")?.recordClass).toBe("enforcement_outcome");
    expect(outcomes.get("alert-only")?.recordClass).toBe("regulatory_alert");
    expect(outcomes.get("pending-only")?.recordClass).toBe("proceeding");
    expect(outcomes.get("non-monetary-order")?.recordClass).toBe("enforcement_outcome");
    expect(outcomes.get("licence-revocation")?.primaryOutcome).toBe("licence_restriction_revocation");
    expect(outcomes.get("licence-word-boundary")?.recordClass).toBe("unknown");
    expect(outcomes.get("korean-no-rule-match")?.recordClass).toBe("unknown");
    expect(outcomes.get("ascii-token-next-to-hangul")?.outcomeTypes).toContain("monetary_penalty");
    expect(outcomes.get("source-url-evidence")?.outcomeTypes).toContain("monetary_penalty");
  });
});
