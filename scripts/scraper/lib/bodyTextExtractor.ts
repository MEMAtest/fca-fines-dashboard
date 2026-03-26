/**
 * Body Text Extraction Utilities
 *
 * Extract firm/individual names from enforcement notice body text
 * when title-based extraction fails. Supports multiple languages.
 */

import { normalizeWhitespace } from './euFineHelpers.js';
import { isGenericDescription } from './nameValidation.js';

export type Language = 'en' | 'fr' | 'nl' | 'de';

/**
 * Extract name from body HTML using language-specific patterns
 */
export function extractNameFromBodyText(
  html: string,
  language: Language = 'en'
): string | null {
  // Strip HTML tags and normalize whitespace
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const patterns = getLanguagePatterns(language);

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const extracted = normalizeWhitespace(match[1]);

      // Validate minimum length
      if (extracted.length < 5) {
        continue;
      }

      // Reject if generic
      if (isGenericDescription(extracted)) {
        continue;
      }

      return extracted;
    }
  }

  return null;
}

/**
 * Get language-specific extraction patterns
 */
function getLanguagePatterns(language: Language): RegExp[] {
  const patterns: Record<Language, RegExp[]> = {
    en: [
      // "against [Name]", "fined [Name]", "sanctioned [Name]"
      /(?:against|fined|sanctioned|penalty on)\s+([A-Z][A-Za-z\s&\.]{3,50})/i,
      // "[Name] has/have breached/violated"
      /([A-Z][A-Za-z\s&\.]{3,50})\s+(?:has|have)\s+(?:breached|violated)/i,
      // "enforcement action against [Name]"
      /enforcement action[^.]{0,20}against\s+([A-Z][A-Za-z\s&\.]{3,50})/i,
      // "[Name] (the Company/the Firm)"
      /([A-Z][A-Za-z\s&\.]{3,50})\s+\((?:the Company|the Firm)\)/i,
    ],

    fr: [
      // "sanctionné [Name]", "contre [Name]"
      /(?:sanctionné|contre)\s+([A-Z][A-Za-zéèàçùÉÈÀÇÙ\s&\.]{3,50})/i,
      // "la société [Name]"
      /la société\s+([A-Z][A-Za-zéèàçùÉÈÀÇÙ\s&\.]{3,50})/i,
      // "l'entreprise [Name]"
      /l'entreprise\s+([A-Z][A-Za-zéèàçùÉÈÀÇÙ\s&\.]{3,50})/i,
      // "M. [FirstName] [LastName]" (Mr. FirstName LastName)
      /M\.\s+([A-Z][a-zéèàçù]+\s+[A-Z][a-zéèàçù]+)/i,
    ],

    nl: [
      // "sanctie tegen [Name]", "boete aan [Name]"
      /(?:sanctie|boete).*?(?:tegen|aan)\s+([A-Z][A-Za-z\s\.&ëïö]{3,50})/i,
      // "[Name] heeft overtreden"
      /([A-Z][A-Za-z\s\.&ëïö]{3,50})\s+heeft\s+overtred/i,
      // "aan [ALL CAPS COMPANY]" (Dutch companies often use all caps)
      /(?:aan|tegen)\s+([A-Z][A-Z\s\.&]{3,50}(?:\s+B\.?V\.?|\s+N\.?V\.?)?)/i,
      // "De onderneming [Name]" (The company [Name])
      /De onderneming\s+([A-Z][A-Za-z\s\.&ëïö]{3,50})/i,
    ],

    de: [
      // "gegen [Name]", "Sanktion gegen [Name]"
      /(?:gegen|Sanktion(?:en)?)\s+([A-Z][A-Za-zÄÖÜäöüß\s&\.]{3,50})/i,
      // "[Name] hat verstoßen"
      /([A-Z][A-Za-zÄÖÜäöüß\s&\.]{3,50})\s+hat\s+(?:verstoßen|verletzt)/i,
      // "Das Unternehmen [Name]"
      /Das Unternehmen\s+([A-Z][A-Za-zÄÖÜäöüß\s&\.]{3,50})/i,
    ],
  };

  return patterns[language] || patterns.en;
}

/**
 * Extract name from body text with multiple language attempts
 */
export function extractNameMultiLanguage(
  html: string,
  primaryLanguage: Language = 'en'
): string | null {
  // Try primary language first
  const primaryResult = extractNameFromBodyText(html, primaryLanguage);
  if (primaryResult) {
    return primaryResult;
  }

  // Try English as fallback (if not primary)
  if (primaryLanguage !== 'en') {
    const englishResult = extractNameFromBodyText(html, 'en');
    if (englishResult) {
      return englishResult;
    }
  }

  return null;
}
