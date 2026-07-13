/**
 * Article Quality Gate — 16 Checks
 *
 * Validates AI-generated articles for data accuracy, structure, and editorial quality.
 * Adapted from MEMA platform's quality system, simplified for blog editorial content.
 *
 * Pass criteria: all required checks and all soft checks pass.
 */

import {
  getCitationEligibleEntities,
  getRequiredCaseCitationCount,
  getRequiredVerifiedAmountCount,
  type EnforcementRecord,
} from './articleData.js';
import { getHouseStyleIssues } from './editorialWorkflow.js';

export interface QualityCheck {
  id: string;
  name: string;
  weight: 'required' | 'soft';
  passed: boolean;
  message: string;
}

export interface QualityReport {
  passed: boolean;
  score: number;           // 0-100
  checks: QualityCheck[];
  requiredPassed: number;
  requiredTotal: number;
  softPassed: number;
  softTotal: number;
}

export interface ArticleContent {
  title: string;
  excerpt: string;
  content: string;         // markdown body
  keywords: string[];
}

export interface ArticleQualityOptions {
  minimumWords?: number;
  maximumWords?: number;
}

export function getArticleQualityWordRange(articleType?: string): Required<ArticleQualityOptions> {
  if (articleType === 'monthly') return { minimumWords: 1200, maximumWords: 1600 };
  if (articleType === 'comparison' || articleType === 'persona') {
    return { minimumWords: 1350, maximumWords: 1800 };
  }
  if (articleType === 'forensic') return { minimumWords: 1350, maximumWords: 2200 };
  return { minimumWords: 1100, maximumWords: 1600 };
}

// ─── Main Quality Gate ─────────────────────────────────────────────────────────

export function runQualityGate(
  article: ArticleContent,
  sourceData: EnforcementRecord[],
  options: ArticleQualityOptions = {},
): QualityReport {
  const { minimumWords = 1100, maximumWords = 1600 } = options;
  const checks: QualityCheck[] = [
    checkWordCount(article.content, minimumWords, maximumWords),
    checkSectionStructure(article.content),
    checkTakeawayStructure(article.content),
    checkDataAccuracy(article.content, sourceData),
    checkAmountAccuracy(article.content, sourceData),
    checkNoTruncation(article.content),
    checkNoDuplicates(article.content),
    checkNoHallucinatedFirms(article.content, sourceData),
    checkNoInternalRecordIds(article.content, sourceData),
    checkTitleQuality(article.title, article.excerpt),
    checkHouseStyle(article),
    checkDataUsage(article.content, sourceData),
    checkSpecificity(article.content, sourceData),
    checkKeywordCount(article.keywords),
    checkEditorialTone(article.content),
    checkReadability(article.content),
  ];

  const required = checks.filter(c => c.weight === 'required');
  const soft = checks.filter(c => c.weight === 'soft');
  const requiredPassed = required.filter(c => c.passed).length;
  const softPassed = soft.filter(c => c.passed).length;

  const passed = requiredPassed === required.length && softPassed >= soft.length;
  const score = Math.round(
    ((requiredPassed / required.length) * 70 + (softPassed / soft.length) * 30)
  );

  return {
    passed,
    score,
    checks,
    requiredPassed,
    requiredTotal: required.length,
    softPassed,
    softTotal: soft.length,
  };
}

function checkTakeawayStructure(content: string): QualityCheck {
  const match = content.match(/(?:^|\n)## Key Takeaways\s*\n([\s\S]*?)(?=\n## |\s*$)/);
  const bulletCount = (match?.[1].match(/^[-*] /gm) || []).length;
  const passed = Boolean(match) && bulletCount >= 5 && bulletCount <= 6;
  return {
    id: 'takeaway_structure',
    name: 'Key Takeaway Structure',
    weight: 'required',
    passed,
    message: passed
      ? `${bulletCount} substantive Markdown bullets`
      : `Key Takeaways must contain 5-6 Markdown bullets (found ${bulletCount})`,
  };
}

function checkNoInternalRecordIds(content: string, sourceData: EnforcementRecord[]): QualityCheck {
  const leaked = sourceData
    .filter((record) => record.id && content.includes(record.id))
    .map((record) => record.id);
  return {
    id: 'no_internal_record_ids',
    name: 'No Internal Record IDs',
    weight: 'required',
    passed: leaked.length === 0,
    message: leaked.length === 0
      ? 'No internal evidence identifiers exposed'
      : `Internal evidence identifiers exposed: ${leaked.slice(0, 3).join(', ')}`,
  };
}

function checkHouseStyle(article: ArticleContent): QualityCheck {
  const issues = getHouseStyleIssues(article);
  return {
    id: 'house_style',
    name: 'RegActions House Style',
    weight: 'required',
    passed: issues.length === 0,
    message: issues.length === 0 ? 'UK English and punctuation rules passed' : issues.slice(0, 4).join('; '),
  };
}

/**
 * Format quality report as a human-readable summary (for logs and emails).
 */
export function formatQualityReport(report: QualityReport): string {
  const lines: string[] = [
    `Quality Score: ${report.score}/100 (${report.passed ? 'PASS' : 'FAIL'})`,
    `Required: ${report.requiredPassed}/${report.requiredTotal} | Soft: ${report.softPassed}/${report.softTotal}`,
    '',
    'Checks:',
  ];

  for (const check of report.checks) {
    const icon = check.passed ? '✅' : '❌';
    const weight = check.weight === 'required' ? '[REQ]' : '[SOFT]';
    lines.push(`  ${icon} ${weight} ${check.name}: ${check.message}`);
  }

  return lines.join('\n');
}

// ─── Individual Checks ─────────────────────────────────────────────────────────

// 1. Word Count — REQUIRED, with article-type-specific bounds supplied by callers.
function checkWordCount(content: string, minimumWords: number, maximumWords: number): QualityCheck {
  const words = countWords(content);
  return {
    id: 'word_count',
    name: 'Word Count',
    weight: 'required',
    passed: words >= minimumWords && words <= maximumWords,
    message: `${words} words (required ${minimumWords}-${maximumWords})`,
  };
}

// 2. Section Structure (≥4 H2 sections, each ≥80 chars) — REQUIRED
function checkSectionStructure(content: string): QualityCheck {
  const sections = content.split(/^##\s+/m).slice(1); // split on H2 headers
  const validSections = sections.filter(s => s.trim().length >= 80);
  return {
    id: 'section_structure',
    name: 'Section Structure',
    weight: 'required',
    passed: validSections.length >= 4,
    message: `${validSections.length} valid H2 sections (min 4)`,
  };
}

// 3. Data Accuracy — regulator names exist in source — REQUIRED
function checkDataAccuracy(content: string, sourceData: EnforcementRecord[]): QualityCheck {
  if (sourceData.length === 0) {
    return { id: 'data_accuracy', name: 'Data Accuracy', weight: 'required', passed: true, message: 'No source data to validate against' };
  }

  // Build normalised set: include both full names AND known acronyms that appear as substrings
  const knownRegulators = new Set(sourceData.map(r => r.regulator.toUpperCase()));
  const mentioned = extractRegulatorMentions(content);

  // A mention is valid if: exact match OR the acronym appears as a substring of any known
  // regulator name (e.g. "FCA" inside "Financial Conduct Authority") or vice versa
  const unknown = mentioned.filter(acronym => {
    const up = acronym.toUpperCase();
    if (knownRegulators.has(up)) return false;
    for (const known of knownRegulators) {
      if (known.includes(up) || up.includes(known)) return false;
    }
    // Also pass if it's in our canonical acronym list — it's a real regulator,
    // just not represented in this particular dataset slice
    return !KNOWN_REGULATORS.includes(acronym);
  });

  return {
    id: 'data_accuracy',
    name: 'Data Accuracy (Regulators)',
    weight: 'required',
    passed: unknown.length === 0,
    message: unknown.length === 0
      ? `All ${mentioned.length} regulator mentions verified`
      : `Unrecognised regulators: ${unknown.join(', ')}`,
  };
}

// 4. Amount Accuracy — monetary values exist in source (±5%) — REQUIRED
function checkAmountAccuracy(content: string, sourceData: EnforcementRecord[]): QualityCheck {
  if (sourceData.length === 0) {
    return { id: 'amount_accuracy', name: 'Amount Accuracy', weight: 'required', passed: true, message: 'No source data to validate against' };
  }

  const verifiedSources = sourceData.filter((record) => record.amount_verified !== false);
  const mentioned = extractAmounts(content);
  const unverified: string[] = [];

  if (verifiedSources.length === 0) {
    return {
      id: 'amount_accuracy',
      name: 'Amount Accuracy',
      weight: 'required',
      passed: mentioned.length === 0,
      message: mentioned.length === 0 ? 'No monetary claims in a non-monetary source set' : 'Article cites amounts but no source amount is verified as a penalty',
    };
  }

  for (const claim of mentioned) {
    if (!isVerifiedAmount(claim, verifiedSources)) {
      unverified.push(formatCurrency(claim));
    }
  }

  const pairingIssues: string[] = [];
  const segments = content.split(/\n+|[!?]\s+|\.(?!\d)\s+/).filter(Boolean);
  for (const segment of segments) {
    if (/\brange(?:s|d)?\s+from\b/i.test(segment)) continue;
    const entityRecords = verifiedSources.filter((record) => contentMentionsFirm(record.firm_individual, segment));
    if (entityRecords.length !== 1) continue;
    for (const claim of extractAmounts(segment)) {
      if (!isVerifiedAmount(claim, entityRecords)) {
        pairingIssues.push(`${entityRecords.map((record) => record.firm_individual).join(" / ")} -> ${formatCurrency(claim)}`);
      }
    }
  }

  return {
    id: 'amount_accuracy',
    name: 'Amount Accuracy',
    weight: 'required',
    passed: unverified.length === 0 && pairingIssues.length === 0,
    message: unverified.length === 0 && pairingIssues.length === 0
      ? `All ${mentioned.length} amounts verified`
      : [
        unverified.length > 0 ? `Unverified amounts: ${unverified.slice(0, 3).join(', ')}` : "",
        pairingIssues.length > 0 ? `Entity-amount mismatch: ${pairingIssues.slice(0, 2).join('; ')}` : "",
      ].filter(Boolean).join(". "),
  };
}

// 5. No Truncation — no dangling sentences — REQUIRED
function checkNoTruncation(content: string): QualityCheck {
  const lines = content.split('\n').filter(l => l.trim().length > 20);
  const lastLine = lines[lines.length - 1]?.trim() || '';
  const truncated = lastLine.length > 0 &&
    !lastLine.endsWith('.') &&
    !lastLine.endsWith('!') &&
    !lastLine.endsWith('?') &&
    !lastLine.endsWith(':') &&
    !lastLine.endsWith(')') &&
    !lastLine.startsWith('#') &&
    !lastLine.startsWith('-') &&
    !lastLine.startsWith('*');

  // Also check for mid-word cuts (word ending without vowel pattern)
  const midWordCut = /\w{3,}$/.test(lastLine) && truncated;

  return {
    id: 'no_truncation',
    name: 'No Truncation',
    weight: 'required',
    passed: !midWordCut,
    message: midWordCut ? `Possible truncation: "${lastLine.slice(-40)}"` : 'Content ends cleanly',
  };
}

// 6. No Duplicates — no repeated paragraphs ≥80 chars — REQUIRED
function checkNoDuplicates(content: string): QualityCheck {
  const paragraphs = content.split(/\n\n+/)
    .map(p => p.trim())
    .filter(p => p.length >= 80);

  const seen = new Set<string>();
  const duplicates: string[] = [];

  for (const p of paragraphs) {
    const normalized = p.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(normalized)) {
      duplicates.push(p.slice(0, 50) + '...');
    }
    seen.add(normalized);
  }

  return {
    id: 'no_duplicates',
    name: 'No Duplicates',
    weight: 'required',
    passed: duplicates.length === 0,
    message: duplicates.length === 0
      ? 'No duplicate paragraphs'
      : `${duplicates.length} duplicate(s) found`,
  };
}

// 7. No Hallucinated Firms — firm names exist in source — REQUIRED
function checkNoHallucinatedFirms(content: string, sourceData: EnforcementRecord[]): QualityCheck {
  if (sourceData.length === 0) {
    return { id: 'no_hallucinated_firms', name: 'No Hallucinated Firms', weight: 'required', passed: true, message: 'No source data to validate against' };
  }

  const knownFirms = new Set(sourceData.map(r => r.firm_individual.toLowerCase()).filter(Boolean));
  const mentioned = extractFirmMentions(content, sourceData);
  const unknown = mentioned.filter(f => !fuzzyMatchFirm(f, knownFirms));

  return {
    id: 'no_hallucinated_firms',
    name: 'No Hallucinated Firms',
    weight: 'required',
    passed: unknown.length <= 1, // Allow 1 unmatched (could be generic reference)
    message: unknown.length <= 1
      ? `Firm references verified (${mentioned.length} found)`
      : `Possibly hallucinated firms: ${unknown.slice(0, 3).join(', ')}`,
  };
}

// 8. Title Quality — title ≤70 chars, excerpt ≥120 chars — REQUIRED
function checkTitleQuality(title: string, excerpt: string): QualityCheck {
  const titleOk = title.length > 0 && title.length <= 70;
  const excerptOk = excerpt.length >= 120
    && excerpt.length <= 220
    && /[.!?]$/.test(excerpt.trim())
    && !/\.\.\.$/.test(excerpt.trim())
    && !/\b(?:GBP|USD|EUR|AUD|NZD|CAD|CHF|SGD|HKD)\s+\d+\.$/.test(excerpt.trim());

  return {
    id: 'title_quality',
    name: 'Title & Excerpt Quality',
    weight: 'required',
    passed: titleOk && excerptOk,
    message: `Title: ${title.length} chars (max 70), Excerpt: ${excerpt.length} chars (120-220, complete sentence required)`,
  };
}

// 9. Data Usage — named firm/individual citations from source — REQUIRED
function checkDataUsage(content: string, sourceData: EnforcementRecord[]): QualityCheck {
  if (sourceData.length === 0) {
    return { id: 'data_usage', name: 'Data Usage (Firm Citations)', weight: 'required', passed: true, message: 'No source data to validate against' };
  }

  // Deduplicate: a firm appearing 8× in source still only counts as one distinct name
  const namedFirms = getCitationEligibleEntities(sourceData);

  const cited = namedFirms.filter(firm => contentMentionsFirm(firm, content));

  const minRequired = getRequiredCaseCitationCount(sourceData);
  const passed = cited.length >= minRequired;

  return {
    id: 'data_usage',
    name: 'Data Usage (Firm Citations)',
    weight: 'required',
    passed,
    message: passed
      ? `${cited.length}/${namedFirms.length} named firms cited`
      : `Only ${cited.length} of ${namedFirms.length} source firms cited (need ≥${minRequired}). Add: ${namedFirms.filter(f => !contentMentionsFirm(f, content)).slice(0, 4).join(', ')}`,
  };
}

// 10. Keyword Count — 5-8 SEO keywords — SOFT
function checkKeywordCount(keywords: string[]): QualityCheck {
  return {
    id: 'keyword_count',
    name: 'Keyword Count',
    weight: 'soft',
    passed: keywords.length >= 5 && keywords.length <= 8,
    message: `${keywords.length} keywords (target 5-8)`,
  };
}

// 10. Editorial Tone — no first person, no hedging — SOFT
function checkEditorialTone(content: string): QualityCheck {
  const issues: string[] = [];
  const lower = content.toLowerCase();

  // First person
  if (/\b(i |i'm|i've|we |we're|we've|our |my )\b/i.test(content)) {
    issues.push('first person detected');
  }

  // Hedging
  const hedges = ['might', 'perhaps', 'could potentially', 'it seems', 'arguably'];
  for (const hedge of hedges) {
    if (lower.includes(hedge)) {
      issues.push(`hedging: "${hedge}"`);
      break;
    }
  }

  return {
    id: 'editorial_tone',
    name: 'Editorial Tone',
    weight: 'soft',
    passed: issues.length === 0,
    message: issues.length === 0 ? 'Professional tone maintained' : issues.join('; '),
  };
}

// 10b. Specificity — ≥8 source-backed enforcement amounts cited — REQUIRED
function checkSpecificity(content: string, sourceData: EnforcementRecord[]): QualityCheck {
  const mentioned = extractAmounts(content);

  const sourceAmounts = [...new Map(
    sourceData
      .filter((record) => record.amount_verified && record.amount > 0 && CURRENCY_CODES.has(record.currency))
      .map((record) => {
        const claim = { amount: record.amount, currency: record.currency as MonetaryClaim['currency'] };
        return [`${claim.currency}:${claim.amount}`, claim] as const;
      }),
  ).values()];

  // Count distinct source amounts cited in the correct currency within 5%.
  const citedCount = sourceAmounts.filter((source) =>
    mentioned.some((claim) =>
      claim.currency === source.currency
      && Math.abs(claim.amount - source.amount) / Math.max(source.amount, 1) < 0.05)
  ).length;

  const minRequired = getRequiredVerifiedAmountCount(sourceData);

  return {
    id: 'specificity',
    name: 'Specificity',
    weight: 'required',
    passed: citedCount >= minRequired,
    message: `${citedCount} source-backed amounts cited (need ≥${minRequired})`,
  };
}

// 12. Readability — avg sentence <35 words, no sentence >60 words — SOFT
function checkReadability(content: string): QualityCheck {
  // Strip markdown headers and list markers
  const prose = content
    .replace(/^#+\s+.*/gm, '')
    .replace(/^\s*\|.*$/gm, '')
    .replace(/^[-*]\s+/gm, '')
    .trim();

  const sentences = prose.split(/[.!?]+/).filter(s => s.trim().length > 10);
  if (sentences.length === 0) {
    return { id: 'readability', name: 'Readability', weight: 'soft', passed: true, message: 'No prose to evaluate' };
  }

  const wordCounts = sentences.map(s => s.trim().split(/\s+/).length);
  const avg = wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length;
  const maxSentence = Math.max(...wordCounts);

  return {
    id: 'readability',
    name: 'Readability',
    weight: 'soft',
    passed: avg < 35 && maxSentence <= 60,
    message: `Avg ${avg.toFixed(1)} words/sentence (max 35), longest: ${maxSentence} words (max 60)`,
  };
}

// ─── Extraction Helpers ────────────────────────────────────────────────────────

// Known regulator acronyms to look for in article text
const KNOWN_REGULATORS = [
  'FCA', 'PRA', 'SEC', 'CFTC', 'FINRA', 'OCC', 'FDIC', 'FRB', 'FinCEN',
  'ESMA', 'BaFin', 'AMF', 'CNMV', 'AFM', 'DNB', 'CBI', 'ECB', 'CONSOB',
  'FINMA', 'MAS', 'HKMA', 'ASIC', 'SFC', 'SEBI', 'CSRC', 'SESC', 'JFSC',
  'GFSC', 'DFSA', 'FSRA', 'CBUAE', 'CIRO', 'OSC', 'CNBV', 'CVM', 'CMF',
  'FSCA', 'FMANZ', 'TWFSC', 'FTDK', 'CSSF',
];

function extractRegulatorMentions(content: string): string[] {
  const found = new Set<string>();
  for (const reg of KNOWN_REGULATORS) {
    const pattern = new RegExp(`\\b${reg}\\b`, 'g');
    if (pattern.test(content)) {
      found.add(reg);
    }
  }
  return Array.from(found);
}

interface MonetaryClaim {
  amount: number;
  currency: string;
}

const CURRENCY_CODES = new Set([
  'AED', 'AUD', 'BRL', 'CAD', 'CHF', 'CLP', 'CNY', 'DKK', 'EUR', 'GBP', 'HKD',
  'INR', 'JPY', 'KRW', 'MXN', 'NOK', 'NZD', 'SAR', 'SEK', 'SGD', 'TWD', 'USD', 'ZAR',
]);

function extractAmounts(content: string): MonetaryClaim[] {
  const amounts: MonetaryClaim[] = [];
  // Single regex that matches £1.2M, $500K, €2.3B, £1,234,567 with optional multiplier
  const pattern = /([£$€])\s*([\d,.]+)\s*(billion|million|B|M|K|bn|mn)?\b/gi;

  let match;
  while ((match = pattern.exec(content)) !== null) {
    const raw = match[2].replace(/,/g, '');
    const multiplier = match[3]?.toLowerCase();
    let value = parseFloat(raw);

    if (multiplier) {
      if (multiplier === 'b' || multiplier === 'bn' || multiplier === 'billion') value *= 1_000_000_000;
      else if (multiplier === 'm' || multiplier === 'mn' || multiplier === 'million') value *= 1_000_000;
      else if (multiplier === 'k') value *= 1_000;
    }

    if (value > 0 && !isNaN(value)) {
      amounts.push({
        amount: value,
        currency: match[1] === '£' ? 'GBP' : match[1] === '$' ? 'USD' : 'EUR',
      });
    }
  }

  const isoPattern = /\b([A-Z]{3})\s+([\d,.]+)\s*(billion|million|B|M|K|bn|mn)?\b/g;
  while ((match = isoPattern.exec(content)) !== null) {
    const raw = match[2].replace(/,/g, '');
    const multiplier = match[3]?.toLowerCase();
    let value = parseFloat(raw);
    if (multiplier === 'b' || multiplier === 'bn' || multiplier === 'billion') value *= 1_000_000_000;
    else if (multiplier === 'm' || multiplier === 'mn' || multiplier === 'million') value *= 1_000_000;
    else if (multiplier === 'k') value *= 1_000;
    if (value > 0 && !isNaN(value) && CURRENCY_CODES.has(match[1])) {
      amounts.push({ amount: value, currency: match[1] });
    }
  }

  return [...new Map(amounts.map((claim) => [`${claim.currency}:${claim.amount}`, claim])).values()];
}

function extractFirmMentions(content: string, sourceData: EnforcementRecord[]): string[] {
  // Only look for firms that are multi-word or capitalized proper nouns
  const firms = new Set<string>();
  for (const record of sourceData) {
    const firm = record.firm_individual;
    if (firm && firm.length > 3 && content.includes(firm)) {
      firms.add(firm);
    }
  }

  // Also check for quoted firm names in the article
  const quoted = content.match(/"([A-Z][^"]{3,30})"/g);
  if (quoted) {
    for (const q of quoted) {
      firms.add(q.replace(/"/g, ''));
    }
  }

  return Array.from(firms);
}

function contentMentionsFirm(firm: string, content: string): boolean {
  const lower = content.toLowerCase();
  const firmLower = firm.toLowerCase();
  if (lower.includes(firmLower)) return true;
  // Also try without common corporate suffixes (mirrors fuzzyMatchFirm for citation checks)
  const stripped = firmLower.replace(/\s*(ltd|plc|inc|llc|limited|corp|pty|ag|gmbh|bv|sa|mgmt|management)\s*\.?$/i, '').trim();
  if (stripped.length > 3 && lower.includes(stripped)) return true;
  return false;
}

function fuzzyMatchFirm(firm: string, knownFirms: Set<string>): boolean {
  const lower = firm.toLowerCase();
  if (knownFirms.has(lower)) return true;

  // Partial match: if firm contains a known firm name or vice versa
  for (const known of knownFirms) {
    if (known.includes(lower) || lower.includes(known)) return true;
    // Also check without common suffixes
    const stripped = lower.replace(/\s*(ltd|plc|inc|llc|limited|corp)\s*\.?$/i, '').trim();
    if (known.includes(stripped) || stripped.includes(known)) return true;
  }

  return false;
}

function verifiedAmountClaims(sourceData: EnforcementRecord[]) {
  const claims: MonetaryClaim[] = [];
  for (const record of sourceData.filter((candidate) => candidate.amount_verified)) {
    if (record.amount > 0 && CURRENCY_CODES.has(record.currency)) {
      claims.push({ amount: record.amount, currency: record.currency });
    }
    if (record.amount_gbp > 0 && record.currency !== 'GBP') {
      claims.push({ amount: record.amount_gbp, currency: 'GBP' });
    }
  }
  return [...new Map(claims.map((claim) => [`${claim.currency}:${claim.amount}`, claim])).values()];
}

function isVerifiedAmount(claim: MonetaryClaim, sourceData: EnforcementRecord[]): boolean {
  const amount = claim.amount;
  const knownAmounts = verifiedAmountClaims(sourceData)
    .filter((candidate) => candidate.currency === claim.currency)
    .map((candidate) => candidate.amount);
  if (knownAmounts.length === 0) return false;

  // Direct match within 5% (accounts for currency conversion rounding)
  for (const known of knownAmounts) {
    if (Math.abs(amount - known) / Math.max(known, 1) < 0.05) return true;
  }

  // Check if it's a valid aggregate (sum of all or subset)
  const totalFines = knownAmounts.reduce((a, b) => a + b, 0);
  if (totalFines > 0 && Math.abs(amount - totalFines) / totalFines < 0.05) return true;

  if (knownAmounts.length > 0) {
    // Check if it's a valid average
    const avg = totalFines / knownAmounts.length;
    if (Math.abs(amount - avg) / Math.max(avg, 1) < 0.1) return true;

    // Whitelist median, p75, and p75×3 — buildStatisticalSummary injects these into prompts,
    // so the AI legitimately cites them; the gate must not reject them as unverified.
    const sorted = [...knownAmounts].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0
      ? (sorted[mid - 1]! + sorted[mid]!) / 2
      : sorted[mid]!;
    if (Math.abs(amount - median) / Math.max(median, 1) < 0.05) return true;
    const p75idx = Math.floor(sorted.length * 0.75);
    const p75 = sorted[p75idx] ?? sorted[sorted.length - 1]!;
    if (Math.abs(amount - p75) / Math.max(p75, 1) < 0.05) return true;
    const outlierThreshold = p75 * 3;
    if (outlierThreshold > 0 && Math.abs(amount - outlierThreshold) / outlierThreshold < 0.05) return true;
  }

  if (claim.currency === 'GBP') {
    const groupTotals = new Map<string, number>();
    for (const record of sourceData.filter((candidate) => candidate.amount_verified && candidate.amount_gbp > 0)) {
      const keys = [`regulator:${record.regulator}`, `year:${record.date_issued.slice(0, 4)}`];
      for (const key of keys) groupTotals.set(key, (groupTotals.get(key) || 0) + record.amount_gbp);
    }
    if ([...groupTotals.values()].some((total) => Math.abs(amount - total) / Math.max(total, 1) < 0.05)) {
      return true;
    }
  }

  // Check partial sums (sum of any 2+ consecutive amounts)
  for (let i = 0; i < knownAmounts.length; i++) {
    let sum = 0;
    for (let j = i; j < knownAmounts.length; j++) {
      sum += knownAmounts[j];
      if (j > i && Math.abs(amount - sum) / Math.max(sum, 1) < 0.05) return true;
    }
  }

  return false;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

function formatCurrency(claim: MonetaryClaim): string {
  const prefix = claim.currency === 'GBP' ? '£' : claim.currency === 'USD' ? '$' : claim.currency === 'EUR' ? '€' : `${claim.currency} `;
  if (claim.amount >= 1_000_000_000) return `${prefix}${(claim.amount / 1_000_000_000).toFixed(1)}B`;
  if (claim.amount >= 1_000_000) return `${prefix}${(claim.amount / 1_000_000).toFixed(1)}M`;
  if (claim.amount >= 1_000) return `${prefix}${(claim.amount / 1_000).toFixed(0)}K`;
  return `${prefix}${claim.amount.toLocaleString()}`;
}
