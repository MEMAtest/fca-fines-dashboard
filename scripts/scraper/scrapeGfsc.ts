import 'dotenv/config';
import * as cheerio from 'cheerio';
import { fileURLToPath } from 'node:url';
import {
  buildEuFineRecord,
  fetchText,
  normalizeWhitespace,
  parseMonthNameDate,
  parsePlainAmount,
} from './lib/euFineHelpers.js';
import { runScraper } from './lib/runScraper.js';

const GFSC_URL = 'https://www.gfsc.gg/commission/enforcement/public-statements';

interface GfscRecord {
  dateIssued: string;
  firmIndividual: string;
  amount: number | null;
  summary: string;
}

const PERSON_TITLE = /^(?:Mr|Mrs|Ms|Miss|Dr|Sir|Dame|Lord|Lady)\b/i;
const CORPORATE_SUFFIX =
  /\b(?:Limited|Ltd|PLC|LLP|LP|LLC|Inc|Company|Co|Bank|Branch|Trust|Trustees|Exchange|Group|Services|Insurance|Brokers)\b\.?/i;

/** Drop trailing defined-term / explanatory parentheses, keep "(Guernsey)" style name parts. */
function stripGfscNoise(name: string) {
  return normalizeWhitespace(
    name.replace(/\s*\((?:[“"'‘]|reduced|formerly|now |the |together|collectively|in |each)[^)]*\)?/gi, '').replace(/\s*\([^)]*£[^)]*$/, ''),
  );
}

/** First entity of a notice heading, e.g. the licensee: "Safehaven International Limited, Mr Bach, ..." */
export function firstGfscHeadingEntity(heading: string) {
  const cleaned = stripGfscNoise(heading);
  const first = cleaned.split(/,\s+|\s+and\s+|\s*&\s*/i)[0];
  return normalizeWhitespace(first);
}

function isIndividual(name: string) {
  return PERSON_TITLE.test(name);
}

function resolveGfscEntity(summaryText: string, extractedEntity: string) {
  const name = stripGfscNoise(extractedEntity.replace(/^each of\s+/i, ''));
  const headingFirst = summaryText ? firstGfscHeadingEntity(summaryText) : '';

  // "the Licensee" / "the Company" / "the Firm": the licensee is the heading's first entity.
  if (/^the\s+/i.test(name)) {
    return headingFirst || name;
  }
  // Defined short forms (Vida, Willow, GIGL, CHSL, Louvre ...) are not entity names.
  if (!isIndividual(name) && !CORPORATE_SUFFIX.test(name)) {
    return headingFirst || name;
  }
  return name;
}

/**
 * The decision date appears in several layouts: "On 4 June 2026, the
 * Guernsey Financial Services Commission", "On 18 July 2025 the Guernsey ...",
 * "On 8th June 2018, the ...", "ON 22 OCTOBER 2009 THE GUERNSEY ..." and
 * "decided that from 30 December 2022 it would ...". Prefer a date that is
 * directly followed by the Commission decision wording, then fall back to the
 * first "On <date>," occurrence.
 */
export function extractGfscDecisionDate(bodyText: string): string | null {
  const date = String.raw`(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})`;
  const patterns = [
    new RegExp(String.raw`\bOn\s+${date},?\s+(?:the\s+)?(?:Guernsey|Commission)`, 'i'),
    new RegExp(String.raw`\bdecided\s+that\s+from\s+${date}`, 'i'),
    new RegExp(String.raw`\bOn\s+${date},`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = bodyText.match(pattern);
    if (match) {
      const parsed = parseMonthNameDate(`${match[1]} ${match[2]} ${match[3]}`);
      if (parsed) {
        return parsed;
      }
    }
  }
  return null;
}

export function parseGfscHtml(html: string): GfscRecord[] {
  // Insert whitespace between block elements so adjacent text nodes never fuse
  // ("STATEMENTOn 28 July 2015" otherwise defeats the date patterns).
  const $ = cheerio.load(html.replace(/<\/(?:p|div|li|h[1-6]|summary|td|th|tr|ul|ol)>|<br\s*\/?>/gi, '$& '));
  const records: GfscRecord[] = [];

  $('details').each((_, element) => {
    const summaryText = normalizeWhitespace($(element).find('summary').first().text());
    const bodyText = normalizeWhitespace($(element).text());
    const dateIssued = extractGfscDecisionDate(bodyText);

    if (!dateIssued) {
      return;
    }

    const penaltyMatches = bodyText.matchAll(
      /financial penalty of £([\d,]+(?:\.\d+)?)(?:\s+under\s+[Ss]ection\s+[^;.]*?)? on ([A-Z][^.;]+?)(?: under|;| and|,|\.|$)/gi,
    );

    for (const match of penaltyMatches) {
      const firmIndividual = resolveGfscEntity(summaryText, match[2]);
      if (!firmIndividual || /[£\d]/.test(firmIndividual)) {
        continue;
      }
      records.push({
        dateIssued,
        firmIndividual,
        amount: parsePlainAmount(match[1]),
        // A few anonymised GFSC notices have a short summary (for example
        // "Mr X"). Keep the official notice text as evidence rather than
        // emitting a summary that the shared validator must quarantine.
        summary: summaryText.length >= 10 ? summaryText : bodyText.slice(0, 300),
      });
    }
  });

  return records;
}

export function buildGfscRecords(rows: GfscRecord[]) {
  return rows.map((row) =>
    buildEuFineRecord({
      regulator: 'GFSC',
      regulatorFullName: 'Guernsey Financial Services Commission',
      countryCode: 'GG',
      countryName: 'Guernsey',
      firmIndividual: row.firmIndividual,
      firmCategory: 'Firm or Individual',
      amount: row.amount,
      currency: 'GBP',
      dateIssued: row.dateIssued,
      breachType: 'Public statement financial penalty',
      breachCategories: ['AML', 'CONTROLS', 'PUBLIC_STATEMENT'],
      summary: row.summary,
      finalNoticeUrl: GFSC_URL,
      sourceUrl: GFSC_URL,
      rawPayload: row,
    }),
  );
}

export async function loadGfscLiveRecords() {
  const html = await fetchText(GFSC_URL);
  return buildGfscRecords(parseGfscHtml(html));
}

export async function main() {
  await runScraper({
    name: '🇬🇬 GFSC Public Statements Scraper',
    liveLoader: loadGfscLiveRecords,
    testLoader: loadGfscLiveRecords,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error('❌ GFSC scraper failed:', error);
    process.exit(1);
  });
}
