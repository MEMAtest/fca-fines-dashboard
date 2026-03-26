/**
 * Name Validation Utilities
 *
 * Shared validation functions to detect and reject generic descriptions,
 * artifacts, and contaminated extractions across all EU fine scrapers.
 */

import { normalizeWhitespace } from './euFineHelpers.js';

/**
 * Check if a name is a generic description (not a specific firm/individual)
 */
export function isGenericDescription(name: string): boolean {
  const normalized = name.toLowerCase().trim();

  // Reject very short names
  if (normalized.length < 3) {
    return true;
  }

  // English patterns
  const genericEnglish = [
    /^(a|an|the)\s+(company|firm|individual|entity|person)/,
    /^(company|firm|individual|entity|person)$/,
    /^(a|an|the)\s+(?:asset management|investment services|financial|depositary|credit institution)/,
    /management company$/,
    /financial services$/,
    /investment firm$/,
    /^(?:asset management company|management company|investment services provider) and its (?:directors?|managers?|chairman)/,
  ];

  // French patterns
  const genericFrench = [
    /^la société$/,
    /^l'entreprise$/,
    /^une société/,
    /^un établissement/,
  ];

  // Dutch patterns
  const genericDutch = [
    /^de onderneming$/,
    /^het bedrijf$/,
    /^een financiële/,
  ];

  // German patterns
  const genericGerman = [
    /^das unternehmen$/,
    /^die gesellschaft$/,
    /^ein finanzinstitut$/,
  ];

  const allPatterns = [
    ...genericEnglish,
    ...genericFrench,
    ...genericDutch,
    ...genericGerman,
  ];

  return allPatterns.some(pattern => pattern.test(normalized));
}

/**
 * Validate an extracted name and reject if it's generic, contaminated, or invalid
 */
export function validateExtractedName(name: string | null): string | null {
  if (!name) {
    return null;
  }

  const cleaned = normalizeWhitespace(name);

  // Reject if too short
  if (cleaned.length < 3) {
    return null;
  }

  // Reject if generic description
  if (isGenericDescription(cleaned)) {
    return null;
  }

  // Reject if contains common artifacts or contaminations
  const contaminations = [
    /\band fines?\b/i,
    /\band bans?\b/i,
    /\band reprimands?\b/i,
    /\band suspends?\b/i,
    /\band prohibits?\b/i,
    /published|press release|statement/i,
    /^\d+$/, // Just numbers
    /fined by the enforcement committee/i,
    /by the autorité/i,
  ];

  if (contaminations.some(p => p.test(cleaned))) {
    return null;
  }

  // Reject if too long (likely full title, not a name)
  if (cleaned.length > 150) {
    return null;
  }

  return cleaned;
}

/**
 * Normalize a firm name by cleaning common artifacts
 */
export function normalizeFirmName(name: string): string {
  return normalizeWhitespace(name)
    // Remove currency amounts
    .replace(/\s+[A-Z]{3}\s*[\d.,]+\s*(?:million|billion|thousand)?/gi, '')
    .replace(/\s+US?\$[\d.,]+\s*(?:million|billion|thousand)?/gi, '')
    .replace(/\s+£[\d.,]+\s*(?:million|billion|thousand)?/gi, '')
    .replace(/\s+€[\d.,]+\s*(?:million|billion|thousand)?/gi, '')
    .replace(/\s+HK\$[\d.,]+\s*(?:million|billion|thousand)?/gi, '')
    // Remove common prefixes
    .replace(/^and fines?\s+/i, '')
    .replace(/^and bans?\s+/i, '')
    .replace(/^and (?:reprimands?|suspends?|prohibits?)\s+/i, '')
    // Clean up whitespace
    .trim();
}
