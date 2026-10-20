import rulesDocument from "./data/fmanzCaseAmountReviewRules.json" with { type: "json" };

export interface FmanzCaseAmountReviewRule {
  sourceUrl: string;
  firm?: string;
  date?: string;
  reason: string;
}

const REVIEW_RULES = rulesDocument as {
  version: number;
  regulator: string;
  rules: FmanzCaseAmountReviewRule[];
};

if (REVIEW_RULES.version !== 2 || REVIEW_RULES.regulator !== "FMANZ" || REVIEW_RULES.rules.length !== 3) {
  throw new Error("FMANZ case amount review rules must be explicitly versioned and contain the reviewed three-case set.");
}

export function normalizeFmanzReviewSourceUrl(value: string | null | undefined) {
  return (value ?? "").trim().replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
}

const REVIEW_RULES_BY_SOURCE = new Map(
  REVIEW_RULES.rules.map((rule) => [normalizeFmanzReviewSourceUrl(rule.sourceUrl), rule]),
);

export function getFmanzCaseAmountReviewRule(
  sourceUrls: Array<string | null | undefined>,
  contexts: Array<{ firm: string; date: string; sourceUrl: string }> = [],
) {
  for (const sourceUrl of sourceUrls) {
    const rule = REVIEW_RULES_BY_SOURCE.get(normalizeFmanzReviewSourceUrl(sourceUrl));
    if (!rule) continue;
    const reviewedFirm = rule.firm;
    const reviewedDate = rule.date;
    if (reviewedFirm && reviewedDate) {
      const match = contexts.some((context) =>
        normalizeFmanzReviewSourceUrl(context.sourceUrl) === normalizeFmanzReviewSourceUrl(rule.sourceUrl)
        && context.date === reviewedDate
        && context.firm.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase()
          === reviewedFirm.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase(),
      );
      if (!match) continue;
    }
    return rule;
  }
  return null;
}

export function getFmanzCaseAmountReviewRules() {
  return REVIEW_RULES.rules;
}

if (REVIEW_RULES_BY_SOURCE.size !== REVIEW_RULES.rules.length) {
  throw new Error("FMANZ case amount review rules contain duplicate normalized source URLs.");
}
