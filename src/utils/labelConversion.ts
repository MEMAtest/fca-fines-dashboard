/**
 * Convert raw database enum values to human-readable display labels
 */

const LABELS: Record<string, string> = {
  'AML': 'AML',
  'MARKET_ABUSE': 'Market Abuse',
  'GOVERNANCE': 'Governance',
  'CONDUCT': 'Conduct',
  'CLIENT_MONEY': 'Client Money',
  'REPORTING': 'Reporting',
  'SYSTEMS_CONTROLS': 'Systems & Controls',
  'FINANCIAL_PROMOTIONS': 'Financial Promotions',
  'CLIENT_ASSETS': 'Client Assets',
  'FINANCIAL_CRIME': 'Financial Crime',
  'PRUDENTIAL': 'Prudential',
  'CONSUMER_PROTECTION': 'Consumer Protection',
  'PRINCIPLES': 'Principles',
  'AUTHORISATION': 'Authorisation',
  'INSIDER_DEALING': 'Insider Dealing',
};

/**
 * Words that stay upper-case when title-casing an unmapped value.
 *
 * Without this, "AML" would come back as "Aml".
 */
const ACRONYMS = new Set(['AML', 'CASS', 'FCA', 'PRA', 'KYC', 'CFD', 'ESG', 'IT', 'UK', 'EU', 'AI']);

/** Small words that stay lower-case unless they lead the label. */
const MINOR_WORDS = new Set(['and', 'or', 'of', 'the', 'to', 'in', 'for', 'a', 'an']);

export function formatBreachCategory(raw: string): string {
  const mapped = LABELS[raw];
  if (mapped) return mapped;

  // The previous fallback was `raw.replace(/_/g, ' ').replace(/\b\w/g, upper)`,
  // which only ever upper-cased first letters. It left the rest of the string
  // untouched, so a value already stored as "MIS SELLING" (no underscores to
  // strip) rendered as "MIS SELLING" — shouting next to "Client Money" and
  // "Governance" in the same table.
  return raw
    .replace(/_/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => {
      const upper = word.toUpperCase();
      if (ACRONYMS.has(upper)) return upper;
      const lower = word.toLowerCase();
      if (index > 0 && MINOR_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

export function formatBreachCategories(categories: string[]): string[] {
  return categories.map(formatBreachCategory);
}

/**
 * `breach_categories` mixes two different kinds of value in one field.
 *
 * Some describe WHAT THE REGULATOR DID — the instrument or outcome:
 * SUPERVISORY_SANCTION, NON_MONETARY_ORDER, PROHIBITION, CEASE_AND_DESIST.
 * Others describe WHAT IT WAS ABOUT — the subject matter: AML, GOVERNANCE,
 * MARKET_ABUSE, DISCLOSURE.
 *
 * The enforcement table wants those in separate columns. `breach_type` cannot
 * supply the first: it holds the raw notice headline, e.g. "Announcement: FMA
 * imposes sanction on Raiffeisenverband Salzburg eGen for breaches of
 * organisational rules". Parsing that prose would be guesswork.
 *
 * So the action types are enumerated explicitly below and everything else is
 * treated as subject matter. A value we have not seen therefore shows up as a
 * theme rather than being silently dropped or mislabelled as an action, which
 * is the safe direction to fail: 88 distinct values are live today and the
 * scrapers add more.
 */
const ACTION_TYPE_CATEGORIES = new Set([
  "SUPERVISORY_SANCTION",
  "MONETARY_PENALTY",
  "MONETARY_SANCTION",
  "NON_MONETARY_ORDER",
  "ENFORCEMENT_ORDER",
  "ENFORCEMENT_ACTION",
  "ENFORCEMENT",
  "PROHIBITION",
  "INDIVIDUAL_PROHIBITION",
  "CEASE_AND_DESIST",
  "DECISION_NOTICE",
  "SETTLEMENT_NOTICE",
  "WRITTEN_AGREEMENT",
  "DISCIPLINARY_ACTION",
  "DISCIPLINARY_OUTCOME",
  "DISCIPLINARY_SANCTION",
  "HEARING_PANEL",
  "SRO_ENFORCEMENT",
  "PUBLIC_CENSURE",
  "PUBLIC_STATEMENT",
  "CRIMINAL_ACTION",
  "APPEAL_OUTCOME",
  "INJUNCTION",
  "RESTITUTION",
  "FINDING",
]);

/**
 * Severity markers. Neither an action nor a subject, and a table cell reading
 * "Very Serious" under a Theme heading is noise, so they are excluded from
 * both columns rather than given a third.
 */
const SEVERITY_CATEGORIES = new Set(["SERIOUS", "VERY_SERIOUS", "OTHER"]);

function normaliseCategory(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]+/g, "_");
}

export function isActionTypeCategory(value: string): boolean {
  return ACTION_TYPE_CATEGORIES.has(normaliseCategory(value));
}

/**
 * Split a record's categories into the regulator's action and the subject
 * matter. Either may be null; the caller shows an em dash rather than guessing.
 */
export function splitBreachCategories(categories: readonly string[] | null | undefined): {
  action: string | null;
  theme: string | null;
} {
  const values = (categories ?? []).map((value) => String(value)).filter(Boolean);
  const action = values.find((value) => isActionTypeCategory(value)) ?? null;
  const theme = values.find(
    (value) =>
      !isActionTypeCategory(value) && !SEVERITY_CATEGORIES.has(normaliseCategory(value)),
  ) ?? null;
  return { action, theme };
}
