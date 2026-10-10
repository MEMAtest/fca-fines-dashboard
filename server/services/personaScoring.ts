/**
 * Persona Scoring — Pure Functions
 *
 * Scores enforcement rows against persona profiles.
 * No database or network dependencies — fully testable in isolation.
 */

import type { DigestItem } from './personaDigestEmail.js';
import { buildDigestItemCopy, describeActionInEnglish, hasExplicitPenaltyLanguage, describeMoney, isLikelyNonEnglish, measureKind, monetaryHeadline, pickItemUrl } from './personaDigestContent.js';

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
  /** Specific notice page, preferred over source_url (often a generic listing). */
  notice_url?: string | null;
  /** When set, `amount` is sterling and these carry the original-currency fine. */
  amount_gbp?: number | null;
  amount_original?: number | null;
}

export interface PersonaProfile {
  sectors: string[];
  regulators: string[];
  keywords: string[];
  relevanceBoosts: Record<string, number>;
  /** firm_category values that are themselves evidence of the persona's sector. */
  categories?: string[];
  /** Word prefixes in the firm NAME that identify the sector. */
  nameHints?: string[];
}

/**
 * Terms that appear in almost every enforcement notice. They add score but can
 * never, on their own, make a firm relevant to a sector.
 */
const GENERIC_TERMS = new Set([
  'aml', 'conduct', 'advice', 'registration', 'authorisation', 'culture', 'conflicts', 'whistleblowing',
  'value', 'fund', 'investment', 'credit', 'debt', 'lending', 'trading', 'complaints', 'token',
  'financial promotion', 'financial crime', 'reporting', 'governance',
]);

/** Firm categories that need a real sector signal, not just a matching keyword. */
const RESTRICTED_CATEGORIES = new Set(['listed company', 'insurer']);

/**
 * Stem/prefix match so "payment" finds "payments", "crypto" finds "cryptoasset" and
 * "Kryptowerte", and "Zahlungsinstitut" finds "Zahlungsinstituts". Short terms
 * (BNPL, DeFi, 3-4 letters) must match a whole word to avoid accidental hits.
 */
function hasTerm(text: string, term: string): boolean {
  const t = term.toLowerCase().trim();
  const escape = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const stem = t.length >= 6 ? t.replace(/(ments|ment|ies|s)$/, (m) => (m === 'ments' ? 'ment' : '')) : t;
  const suffix = stem.length >= 5 ? '' : '($|[^a-z0-9])';
  return new RegExp(`(^|[^a-z0-9])${escape(stem)}${suffix}`, 'i').test(text);
}

/**
 * Boilerplate that mentions "payment" without being about the payments sector: the fine itself
 * is being paid ("awaiting payment of the fine", BCB; "pagamento da multa").
 */
export function stripPenaltyPaymentBoilerplate(text: string): string {
  return text
    .replace(/\b(?:awaiting|await(?:s|ing)?|pending|due|overdue)\s+(?:the\s+)?payment\b(?:\s+of\s+(?:the\s+|a\s+|an\s+)?(?:fine|penalty|penalties|sanction|multa|monetary\s+\w+)s?)?/gi, ' ')
    .replace(/\bpayments?\s+(?:of|for)\s+(?:the\s+|a\s+|an\s+)?(?:administrative\s+)?(?:fine|penalty|penalties|sanction|multa)s?\b/gi, ' ')
    .replace(/\bpagamento\s+d[aeo]s?\s+(?:multa|penalidade|sanç(?:ão|ões))s?\b/gi, ' ');
}

/**
 * Whether a row is genuinely about the persona's sector. A regulator match
 * alone never qualifies a row: BaFin or FCA publish about every sector.
 */
export function qualifiesForPersona(row: EnforcementRow, profile: PersonaProfile): boolean {
  const text = stripPenaltyPaymentBoilerplate(`${row.firm_name} ${row.breach_type} ${row.summary} ${row.firm_category}`).toLowerCase();
  const category = (row.firm_category || '').toLowerCase();
  const sectorSignal =
    profile.sectors.some((s) => hasTerm(text, s)) ||
    Boolean(profile.categories?.some((c) => c.toLowerCase() === category)) ||
    Boolean(profile.nameHints?.some((h) => new RegExp(`(^|[^a-z0-9])${h.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`, 'i').test(row.firm_name || '')));
  if (sectorSignal) return true;
  const specific = profile.keywords.filter((kw) => !GENERIC_TERMS.has(kw.toLowerCase()) && hasTerm(text, kw));
  if (specific.length === 0) return false;
  return !RESTRICTED_CATEGORIES.has(category);
}

/**
 * Score a single enforcement row against a persona profile.
 * Returns 0 if nothing matches.
 */
export function scoreRowForPersona(
  row: EnforcementRow,
  profile: PersonaProfile,
): number {
  const combinedText = stripPenaltyPaymentBoilerplate(`${row.firm_name} ${row.breach_type} ${row.summary} ${row.firm_category}`).toLowerCase();

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

  // Collective labels used by regulators for groups of firms ("Multiple Entities", "Two Individuals")
  // are not a person's name, even though they look like "Firstname Lastname".
  if (/\b(entities|individuals|multiple|several|others|persons|respondents|defendants|parties|firms|companies|resident)\b/i.test(name)) return false;

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
    // These are honest placeholders for records whose source does not identify
    // the sanctioned party. Keep them in the evidence corpus, but never show a
    // client-facing digest card headed "Unnamed party".
    if (row.firm_category.trim().toLowerCase() === 'unnamed party') continue;

    // Skip individual enforcement actions — less relevant for firm-level briefs
    if (isLikelyIndividual(row.firm_name)) continue;

    const score = scoreRowForPersona(row, profile);
    if (score < minScore) continue;
    if (!qualifiesForPersona(row, profile)) continue;

    const firm = row.firm_name || '';
    const sterling = row.amount_gbp !== undefined;
    const money = describeMoney({
      gbp: sterling ? Number(row.amount_gbp ?? NaN) : null,
      original: row.amount_original ?? null,
      currency: row.currency,
    });
    // Sterling digest path: a monetary headline needs BOTH a real amount and evidence that the
    // action is a penalty (a stray 0.10 on a share suspension must never read as a fine).
    const evidence = `${row.breach_type} ${row.summary}`;
    const penaltyEvidence = sterling && hasExplicitPenaltyLanguage(evidence);
    const moneyHeadline = sterling && penaltyEvidence ? money : null;

    let title: string;
    let summaryText: string;
    if (sterling) {
      title = moneyHeadline
        ? monetaryHeadline(firm, measureKind(row.summary, row.breach_type), moneyHeadline)
        : firm
          ? `${row.regulator} action: ${firm}`
          : 'Regulatory development';
      // Never show another language: describe the action from structured fields instead.
      if (!row.summary || isLikelyNonEnglish(row.summary, row.regulator)) {
        summaryText = describeActionInEnglish({
          regulator: row.regulator,
          firm_name: firm,
          breach_type: row.breach_type,
          money: { gbp: moneyHeadline ? Number(row.amount_gbp ?? NaN) : null, original: row.amount_original ?? null, currency: row.currency },
          measureText: row.summary,
        });
      } else {
        summaryText = buildDigestItemCopy({
          firm,
          authority: row.regulator,
          amountOriginal: null,
          currency: row.currency,
          breach: row.breach_type,
          summary: row.summary,
        }).summary;
      }
    } else {
      // Legacy path: `amount` is already in `currency` units.
      const amount = row.amount;
      const currencySymbol = getCurrencySymbol(row.currency);
      const legacyAmount = amount && amount >= 1_000
        ? amount >= 1_000_000
          ? `${currencySymbol}${(amount / 1_000_000).toFixed(1)}m`
          : `${currencySymbol}${(amount / 1_000).toFixed(0)}k`
        : '';
      const breachContext = row.breach_type && !legacyAmount ? ` — ${truncateSummary(row.breach_type, 80)}` : '';
      title = legacyAmount ? `${firm} fined ${legacyAmount}` : firm ? `${firm}${breachContext}` : 'Regulatory development';
      summaryText = truncateSummary(row.summary || row.breach_type || 'See source for details.');
    }

    scored.push({
      title,
      authority: row.regulator,
      date: new Date(row.date_issued).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
      summary: summaryText,
      url: sterling ? pickItemUrl(row, process.env.NEXT_PUBLIC_BASE_URL?.trim() || 'https://regactions.com') : row.source_url || undefined,
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
