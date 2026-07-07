/**
 * Persona Scoring — Pure Functions
 *
 * Scores enforcement rows against persona profiles.
 * No database or network dependencies — fully testable in isolation.
 */

import type { DigestItem } from './personaDigestEmail.js';

export interface EnforcementRow {
  firm_name: string;
  regulator: string;
  date_issued: string;
  amount: number | null;
  currency: string;
  breach_type: string;
  summary: string;
  source_url: string | null;
  firm_category: string;
  content_hash: string;
}

export interface PersonaProfile {
  sectors: string[];
  regulators: string[];
  keywords: string[];
  relevanceBoosts: Record<string, number>;
}

/**
 * Score a single enforcement row against a persona profile.
 * Returns 0 if nothing matches.
 */
export function scoreRowForPersona(
  row: EnforcementRow,
  profile: PersonaProfile,
): number {
  const combinedText = `${row.firm_name} ${row.breach_type} ${row.summary} ${row.firm_category}`.toLowerCase();

  let score = 0;

  // Sector match (20%) — check firm_category and combined text against persona sectors
  if (profile.sectors.some(s => combinedText.includes(s.toLowerCase()))) {
    score += 20;
  }

  // Regulator match (30%)
  if (profile.regulators.some(r => row.regulator.toUpperCase().includes(r.toUpperCase()))) {
    score += 30;
  }

  // Keyword match (40%)
  const matchedKeywords = profile.keywords.filter(kw => combinedText.includes(kw.toLowerCase()));
  score += Math.min(40, matchedKeywords.length * 10);

  // Apply relevance boosts (multiplicative)
  for (const [term, boost] of Object.entries(profile.relevanceBoosts)) {
    if (combinedText.includes(term.toLowerCase())) {
      score *= boost;
    }
  }

  return score;
}

export type ScoredItem = DigestItem & {
  category: string;
  score: number;
  identifier: string;
};

/**
 * Detect if a firm_name is likely an individual (not a firm/company).
 * Individual enforcement actions are less relevant for firm-level briefs.
 */
function isLikelyIndividual(name: string): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();

  // Firm indicators — if present, definitely a firm
  const firmIndicators = [
    'ltd', 'limited', 'plc', 'inc', 'corp', 'llc', 'llp', 'gmbh', 's.a.',
    'ag', 'n.v.', 'b.v.', 'pty', 'co.', 'company', 'group', 'bank',
    'capital', 'asset', 'fund', 'insurance', 'securities', 'partners',
    'management', 'services', 'financial', 'holdings', 'trust',
  ];
  if (firmIndicators.some(ind => lower.includes(ind))) return false;

  // Individual patterns — short name with 2-4 words, no firm indicators
  const words = name.trim().split(/\s+/);
  if (words.length >= 2 && words.length <= 4) {
    // Check if it looks like "FirstName LastName" (all capitalized words, no numbers)
    const allCapWords = words.every(w =>
      /^[A-Z][a-zà-ÿ'-]+$/.test(w) ||          // Standard: "David", "Smith"
      /^[A-Z]{2,}$/.test(w) ||                   // Acronym: "DR"
      /^(Mc|Mac|O')[A-Z][a-z]+$/.test(w) ||      // Celtic: "McEwen", "MacDonald"
      /^[A-Z]\.?$/.test(w) ||                     // Initial: "E.", "J"
      /^(de|der|von|van|di|du|le|la|el|al|bin|ibn|den|het|dos|das)$/i.test(w),  // Particle: "de", "van", "der"
    );
    if (allCapWords) return true;
  }

  // Known title prefixes
  if (/^(mr|mrs|ms|dr|sir|dame|professor)\b/i.test(name)) return true;

  return false;
}

/**
 * Truncate text to a maximum character length, breaking at word boundaries.
 */
function truncateSummary(text: string, maxLength: number = 120): string {
  if (!text || text.length <= maxLength) return text;
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > maxLength * 0.6 ? truncated.slice(0, lastSpace) : truncated) + '...';
}

/**
 * Score, filter, and rank enforcement rows for a persona profile.
 * Pure function — no DB access.
 */
export function scoreAndRankRows(
  rows: EnforcementRow[],
  profile: PersonaProfile,
  options: { minScore?: number; maxPerAuthority?: number; maxTotal?: number } = {},
): ScoredItem[] {
  const minScore = options.minScore ?? 10;
  const maxPerAuthority = options.maxPerAuthority ?? 10;
  const maxTotal = options.maxTotal ?? 20;

  const scored: ScoredItem[] = [];

  for (const row of rows) {
    // Skip individual enforcement actions — less relevant for firm-level briefs
    if (isLikelyIndividual(row.firm_name)) continue;

    const score = scoreRowForPersona(row, profile);
    if (score < minScore) continue;

    const amount = row.amount;
    const currencySymbol = getCurrencySymbol(row.currency);
    const formattedAmount = amount && amount > 0
      ? amount >= 1_000_000
        ? `${currencySymbol}${(amount / 1_000_000).toFixed(1)}m`
        : amount >= 1_000
          ? `${currencySymbol}${(amount / 1_000).toFixed(0)}k`
          : `${currencySymbol}${amount}`
      : '';

    const firm = row.firm_name || '';
    // Build a meaningful title: include breach_type for non-fine actions
    const breachContext = row.breach_type && !formattedAmount ? ` — ${truncateSummary(row.breach_type, 80)}` : '';
    const title = formattedAmount
      ? `${firm} fined ${formattedAmount}`
      : firm
        ? `${firm}${breachContext}`
        : 'Regulatory development';

    scored.push({
      title,
      authority: row.regulator,
      date: new Date(row.date_issued).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
      summary: truncateSummary(row.summary || row.breach_type || 'See source for details.'),
      url: row.source_url || undefined,
      relevanceScore: Math.round(score),
      category: getEnforcementCategory(row.breach_type, row.summary),
      score,
      identifier: row.content_hash || `${row.regulator}-${firm}-${row.date_issued}`,
    });
  }

  // Sort by relevance score descending
  scored.sort((a, b) => b.score - a.score);

  // Dedup by source_url + firm_name (many scrapers produce multiple rows per page)
  const seen = new Set<string>();
  const deduped: ScoredItem[] = [];
  for (const item of scored) {
    const dedupKey = `${item.url || ''}|${item.title}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    deduped.push(item);
  }

  // Balance: cap per authority
  const byAuthority = new Map<string, number>();
  const balanced: ScoredItem[] = [];

  for (const item of deduped) {
    const count = byAuthority.get(item.authority) || 0;
    if (count >= maxPerAuthority) continue;
    byAuthority.set(item.authority, count + 1);
    balanced.push(item);
    if (balanced.length >= maxTotal) break;
  }

  return balanced;
}

/**
 * Determine enforcement category from breach type and summary text.
 * Used for icon mapping in digest emails.
 */
export function getEnforcementCategory(breachType: string, summary: string): string {
  const text = `${breachType} ${summary}`.toLowerCase();
  if (text.match(/aml|money laundering|financial crime|sanctions/)) return 'financial-crime';
  if (text.match(/market abuse|insider|manipulation|mar\b/)) return 'market-abuse';
  if (text.match(/consumer|conduct|tcf|suitability|mis-sell/)) return 'consumer';
  if (text.match(/licence|authorization|withdrawal|registration/)) return 'licensing';
  if (text.match(/capital|prudential|solvency|liquidity/)) return 'prudential';
  if (text.match(/report|disclosure|transparency|publish/)) return 'reporting';
  return 'enforcement';
}

// Export helpers for testing
export { isLikelyIndividual, truncateSummary };

function getCurrencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    GBP: '£', USD: '$', EUR: '€', CAD: 'C$', AUD: 'A$',
    CHF: 'CHF ', JPY: '¥', HKD: 'HK$', SGD: 'S$', INR: '₹',
    NZD: 'NZ$', BRL: 'R$', MYR: 'RM', KRW: '₩', ZAR: 'R',
    CZK: 'CZK ', DKK: 'DKK ', SEK: 'SEK ', NOK: 'NOK ',
    BMD: '$', KYD: 'CI$',
  };
  return symbols[currency?.toUpperCase()] || (currency ? `${currency} ` : '£');
}
