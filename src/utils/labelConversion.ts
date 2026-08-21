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
