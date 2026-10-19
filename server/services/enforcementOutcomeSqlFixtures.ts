import type { EnforcementOutcomeInput } from "../../src/data/enforcementOutcomes.js";

/** Synthetic edge cases shared by the SQL parity harness and classifier tests. */
export const ENFORCEMENT_OUTCOME_SQL_FIXTURES: Array<{
  id: string;
  input: EnforcementOutcomeInput;
}> = [
  { id: "trusted-positive-gbp", input: { amountGbp: 125000, requiresAmountReview: false } },
  { id: "trusted-positive-eur", input: { amountEur: 50000, requiresAmountReview: null } },
  { id: "reviewed-positive-amount", input: { amountGbp: 125000, requiresAmountReview: true } },
  { id: "nullable-review-flag", input: { amountGbp: 125000, requiresAmountReview: null } },
  { id: "informational-fine-wording", input: { summary: "Guidance note explains the fine reporting framework." } },
  { id: "phrase-split-across-categories", input: { breachCategories: ["financial", "penalty"] } },
  { id: "final-notice-alert-pending", input: { summary: "Final notice: investor alert after investigation opened." } },
  { id: "alert-only", input: { summary: "Investor alert: unauthorised operator warning list." } },
  { id: "pending-only", input: { summary: "Investigation ongoing and show cause notice issued." } },
  { id: "non-monetary-order", input: { summary: "Non monetary order requiring remediation." } },
  { id: "licence-revocation", input: { summary: "The regulator revoked the firm's licence." } },
  { id: "licence-word-boundary", input: { summary: "The licencee applied for revokation." } },
  { id: "source-url-evidence", input: { sourceUrl: "https://regulator.example/notices/fine-123" } },
  { id: "korean-no-rule-match", input: { summary: "금융회사는 소비자 보호 규정을 위반했습니다." } },
  { id: "ascii-token-next-to-hangul", input: { summary: "한국fine was imposed." } },
  { id: "category-array-final", input: { breachCategories: ["administrative action"], breachType: "" } },
  { id: "category-string-guidance", input: { breachCategories: "policy statement", summary: "Fine reporting guidance" } },
];
