import rulesDocument from "./data/fmanzCaseAmountReviewRules.json" with { type: "json" };

export interface FmanzCaseAmountReviewRule {
  sourceUrl: string;
  reason: string;
}

const REVIEW_RULES = rulesDocument as {
  version: number;
  regulator: string;
  rules: FmanzCaseAmountReviewRule[];
};

if (REVIEW_RULES.version !== 1 || REVIEW_RULES.regulator !== "FMANZ" || REVIEW_RULES.rules.length !== 3) {
  throw new Error("FMANZ case amount review rules must be explicitly versioned and contain the reviewed three-case set.");
}

export function normalizeFmanzReviewSourceUrl(value: string | null | undefined) {
  return (value ?? "").trim().replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
}

const REVIEW_RULES_BY_SOURCE = new Map(
  REVIEW_RULES.rules.map((rule) => [normalizeFmanzReviewSourceUrl(rule.sourceUrl), rule]),
);

export function getFmanzCaseAmountReviewRule(sourceUrls: Array<string | null | undefined>) {
  for (const sourceUrl of sourceUrls) {
    const rule = REVIEW_RULES_BY_SOURCE.get(normalizeFmanzReviewSourceUrl(sourceUrl));
    if (rule) return rule;
  }
  return null;
}

export function getFmanzCaseAmountReviewRules() {
  return REVIEW_RULES.rules;
}

if (REVIEW_RULES_BY_SOURCE.size !== REVIEW_RULES.rules.length) {
  throw new Error("FMANZ case amount review rules contain duplicate normalized source URLs.");
}
