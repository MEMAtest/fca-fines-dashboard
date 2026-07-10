/**
 * BaFin (Federal Financial Supervisory Authority) Scraper
 *
 * Rewritten 2026-06-01 after BaFin restructured its website.
 *
 * What changed:
 *   - The old English securities-only listing
 *     (/EN/Aufsicht/BoersenMaerkte/Massnahmen/massnahmen_sanktionen_node.html)
 *     was removed and now returns 404. The English listing pages are gone.
 *   - BaFin moved to a new component-based site (c-* BEM markup) and replaced the
 *     old numeric list anchors (#ID_19584194) and `div.wrapperTable` layout.
 *
 * New strategy:
 *   - Crawl the aggregated German "all measures & sanctions" listing, which still
 *     renders a static HTML table (`table.textualData.links`) covering every
 *     measure type (securities, banking, AML) — broader than the old page.
 *   - Pagination is server-side via `?gtp=<tableId>_unnamed%253D<page>`.
 *   - Detail/case pages still resolve (HTTP 200) and are enriched for the firm
 *     name and fine amount from German meta description + body text.
 *
 * Runs on the shared runScraper framework, so it records to `scraper_runs`,
 * supports --dry-run / --limit, upserts into eu_fines, and refreshes the
 * unified view automatically.
 */

import * as cheerio from 'cheerio';
import { fileURLToPath } from 'node:url';
import {
  buildEuFineRecord,
  fetchText,
  getCliFlags,
  mapWithConcurrency,
  normalizeWhitespace,
  parseScaledAmount,
  type DbReadyRecord,
  type ParsedEnforcementRecord,
} from './lib/euFineHelpers.js';
import { runScraper } from './lib/runScraper.js';

const BAFIN = {
  baseUrl: 'https://www.bafin.de',
  // Aggregated "all measures & sanctions" listing (German). The English
  // equivalent was removed in the 2026 site restructure.
  listingPath:
    '/DE/die-bafin/aktuelles-presse/massnahmen-sanktionen/massnahmen-alle/massnahmen-alle_node.html',
  // Pagination/list identifier for the measures table (see `#table_150012`).
  listTableId: '150012',
  maxPages: 10,
  maxRecords: 150,
  detailConcurrency: 3,
};

interface BaFinRow {
  date: string;
  title: string;
  firm: string | null;
  link: string;
  listingUrl: string;
}

/** Build the URL for a given 1-based listing page. */
function listingPageUrl(page: number): string {
  const base = BAFIN.baseUrl + BAFIN.listingPath;
  if (page <= 1) {
    return base;
  }
  // `=` must be double-encoded (%253D) exactly as BaFin's pagination links emit.
  return `${base}?gtp=${BAFIN.listTableId}_unnamed%253D${page}`;
}

function absoluteUrl(href: string | null | undefined): string | null {
  if (!href) {
    return null;
  }
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.toLowerCase().startsWith('javascript:')) {
    return null;
  }
  const absolute = trimmed.startsWith('http')
    ? trimmed
    : new URL(trimmed, BAFIN.baseUrl).toString();
  const url = new URL(absolute);
  url.hash = '';
  url.pathname = url.pathname.replace(/;jsessionid=[^/?#]+/i, '');
  return url.toString();
}

function parseGermanDate(dateText: string): string | null {
  const match = dateText.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!match) {
    return null;
  }
  const day = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const year = Number.parseInt(match[3], 10);
  return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

// Tokens that mean a candidate is a sentence fragment or a cited law/regulation
// ("gegen die Marktmissbrauchsverordnung verstoßen") rather than a firm name.
const SENTENCE_TOKENS = /\b(hat|hatte|wurde|verhängt|festgesetzt|angeordnet|verwarnt|spricht|verstoßen|verstößt|in Höhe|Euro|Ordnungsgeld|Bußgeld|Geldbuße|Maßnahme|Verordnung|Wertpapierhandelsgesetz\w*|Marktmissbrauchsverordnung|Pflichten|Vorschriften|WpHG|MAR|Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\b/i;
// Topic prefixes BaFin uses for anonymised / thematic announcements.
const TOPIC_ONLY = /^(finanzberichterstattung|marktmanipulation|marktmissbrauch|insiderhandel|geldwäsche\w*|mangelhafte|mängel|eigengeschäfte|geschäftsleiter|mitteilungspflichten|stimmrechte|eigenmittel|wohlverhaltensaufsicht)\b/i;

function normalizeFirmName(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const cleaned = normalizeWhitespace(
    value
      .replace(/^(?:die|der|das|the)\s+/i, '')
      // Drop trailing descriptors BaFin appends to a firm name.
      .replace(/\s+mit Sitz in\b.*$/i, '')
      .replace(/[.;:,]+$/g, ''),
  );
  if (!cleaned || cleaned.length < 3 || cleaned.length > 120) {
    return null;
  }
  // Reject sentence fragments and topic-only / anonymised subjects.
  if (cleaned.split(/\s+/).length > 9 || SENTENCE_TOKENS.test(cleaned) || TOPIC_ONLY.test(cleaned)) {
    return null;
  }
  return cleaned;
}

/**
 * Extract the firm/individual from a German announcement title.
 *
 * BaFin og:titles follow a small set of grammars:
 *   - "<Firm>: Bafin <action> ..."                              (most measures)
 *   - "Finanzberichterstattung: ... gegen die <Firm>"           (BfJ reporting penalties)
 *   - "... zulasten der <Firm> festgesetzt"                     (BfJ, body text)
 *   - "<Firm> muss ..."                                          (org-failure orders)
 *
 * Genuinely anonymised announcements ("Eigengeschäfte nicht gemeldet",
 * "Geschäftsleiter: BaFin verwarnt ...") carry no named entity and return null,
 * so the row is skipped rather than polluting the dataset with a sentence.
 */
function extractFirm(...sources: string[]): string | null {
  const patterns: RegExp[] = [
    /^(.+?):\s*BaFin\b/i,
    // Terminate on a keyword, a sentence-ending dot/comma (followed by a capital
    // or end-of-string), or end. This keeps "pferdewetten.de AG" and
    // "IHS Nr. 2 GS GmbH" intact while still stopping at real sentence breaks.
    /gegen\s+(?:die|den|das)\s+(.+?)(?:\s+(?:wegen|in Höhe|Bußgeld|Geldbuße|Ordnungsgeld|festgesetzt|verhängt|angeordnet|aus)\b|[.,](?=\s+[A-ZÄÖÜ]|$)|$)/i,
    /zulasten\s+(?:der|des|von)\s+(.+?)(?:\s+(?:festgesetzt|verhängt|wegen|in Höhe)\b|[.,](?=\s+[A-ZÄÖÜ]|$)|$)/i,
    /^Bekanntmachung\s+(?:zur|zum|zu der|über die|betreffend|gegenüber)\s+(.+?)(?:[.,](?=\s+[A-ZÄÖÜ]|$)|$)/i,
    /^(.+?)\s+muss\b/i,
  ];

  for (const source of sources) {
    if (!source) {
      continue;
    }
    for (const pattern of patterns) {
      const match = source.match(pattern);
      const firm = normalizeFirmName(match?.[1]);
      if (firm) {
        return firm;
      }
    }
  }

  return null;
}

function classifyFirm(text: string): string {
  const lower = text.toLowerCase();
  if (/\bbank\b|kreditinstitut|sparkasse|cronbank/.test(lower)) {
    return 'Bank';
  }
  if (/versicherung|insurance|rückversicher/.test(lower)) {
    return 'Insurer';
  }
  if (/leasing|kapitalverwaltung|zahlungsinstitut|wertpapierinstitut|investment|fondsgesellschaft|institut/.test(lower)) {
    return 'Financial Institution';
  }
  if (/\bag\b|aktiengesellschaft|\bse\b|\bn\.?v\.?\b|gmbh|kgaa|holding/.test(lower)) {
    return 'Listed Company';
  }
  return 'Financial Institution';
}

const GERMAN_SCALES: Record<string, string> = {
  mio: 'million',
  millionen: 'million',
  million: 'million',
  mrd: 'billion',
  milliarden: 'billion',
  milliarde: 'billion',
  tausend: 'thousand',
};

const MONETARY_SANCTION_CONTEXT = /\b(Geldbuße|Geldbusse|Bußgeld|Bussgeld|Ordnungsgeld|Zwangsgeld|Geldstrafe|finanzielle Sanktion|festgesetzt|verhängt|auferlegt)\b/i;

/** Pull any monetary reference from the page. This value is retained only for
 * stable record identity when the page is not a monetary sanction. */
export function extractReferencedAmount(texts: string[]): number | null {
  // Number followed by an optional scale word and a euro token.
  const trailing = /(\d[\d.,]*)\s*(Mio\.?|Mrd\.?|Millionen|Milliarden|Milliarde|Tausend)?\s*(?:Euro|EUR|€)/gi;
  // Euro symbol leading the number.
  const leading = /€\s*(\d[\d.,]*)\s*(Mio\.?|Mrd\.?|Millionen|Milliarden|Milliarde|Tausend)?/gi;

  for (const text of texts) {
    if (!text) {
      continue;
    }
    const amounts: number[] = [];
    for (const regex of [trailing, leading]) {
      regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        const scaleWord = (match[2] || '').toLowerCase().replace(/\.$/, '');
        const scale = GERMAN_SCALES[scaleWord] ?? null;
        const value = parseScaledAmount(match[1], scale);
        if (value !== null && value > 0) {
          amounts.push(value);
        }
      }
    }
    if (amounts.length > 0) {
      // Announcements state the headline total first ("insgesamt X Euro");
      // taking the max within the most authoritative text avoids summing
      // sub-penalties mentioned later in the body.
      return Math.max(...amounts);
    }
  }
  return null;
}

/** Extract an amount only when the surrounding source language explicitly
 * describes a monetary sanction. This prevents accounting balances, tax
 * receivables, turnover and assets from being recorded as BaFin fines. */
export function extractSanctionAmount(texts: string[]): number | null {
  const trailing = /(\d[\d.,]*)\s*(Mio\.?|Mrd\.?|Millionen|Milliarden|Milliarde|Tausend)?\s*(?:Euro|EUR|€)/gi;
  const leading = /€\s*(\d[\d.,]*)\s*(Mio\.?|Mrd\.?|Millionen|Milliarden|Milliarde|Tausend)?/gi;
  const verified: number[] = [];

  for (const text of texts) {
    if (!text) continue;
    for (const regex of [trailing, leading]) {
      regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        const start = Math.max(0, match.index - 140);
        const end = Math.min(text.length, match.index + match[0].length + 140);
        if (!MONETARY_SANCTION_CONTEXT.test(text.slice(start, end))) continue;
        const scaleWord = (match[2] || '').toLowerCase().replace(/\.$/, '');
        const value = parseScaledAmount(match[1], GERMAN_SCALES[scaleWord] ?? null);
        if (value !== null && value > 0) verified.push(value);
      }
    }
  }

  return verified.length > 0 ? Math.max(...verified) : null;
}

function germanBreachType(text: string): string {
  const lower = text.toLowerCase();
  if (/geldwäsche|geldwaesche|\bgwg\b/.test(lower)) {
    return 'Anti-Money Laundering (GwG) Violations';
  }
  if (/marktmanipulation/.test(lower)) {
    return 'Market Manipulation';
  }
  if (/insider/.test(lower)) {
    return 'Insider Dealing';
  }
  if (/finanzbericht|rechnungslegung|bilanz|jahresabschluss|ordnungsgeld/.test(lower)) {
    return 'Financial Reporting Failures';
  }
  if (/prospekt/.test(lower)) {
    return 'Prospectus / Disclosure Violations';
  }
  if (/stimmrecht|meldepflicht|beteiligung/.test(lower)) {
    return 'Disclosure of Major Holdings';
  }
  if (/marktmissbrauch|mmvo|\bmar\b/.test(lower)) {
    return 'Market Abuse Regulation Violations';
  }
  return 'Securities / Supervisory Violations';
}

function germanBreachCategories(text: string): string[] {
  const lower = text.toLowerCase();
  const categories: string[] = [];
  if (/geldwäsche|geldwaesche|\bgwg\b/.test(lower)) {
    categories.push('AML');
  }
  if (/marktmanipulation/.test(lower)) {
    categories.push('MARKET_MANIPULATION');
  }
  if (/insider/.test(lower)) {
    categories.push('INSIDER_DEALING');
  }
  if (/marktmissbrauch|mmvo|\bmar\b/.test(lower)) {
    categories.push('MARKET_ABUSE');
  }
  if (/finanzbericht|rechnungslegung|bilanz|jahresabschluss|ordnungsgeld/.test(lower)) {
    categories.push('DISCLOSURE', 'REPORTING');
  }
  if (/prospekt/.test(lower)) {
    categories.push('DISCLOSURE');
  }
  if (/stimmrecht|meldepflicht|beteiligung/.test(lower)) {
    categories.push('DISCLOSURE');
  }
  return [...new Set(categories)];
}

function extractBodyText($: cheerio.CheerioAPI): string {
  const selectors = ['.l-article__content p', '.c-richtext p', '.abstract p', '#content p', 'main p'];
  for (const selector of selectors) {
    const parts = $(selector)
      .map((_, element) => normalizeWhitespace($(element).text()))
      .get()
      .filter((part) => part.length > 30);
    if (parts.length > 0) {
      return normalizeWhitespace(parts.slice(0, 4).join(' '));
    }
  }
  return '';
}

function extractRows($: cheerio.CheerioAPI, pageUrl: string): BaFinRow[] {
  const table = $('table.textualData.links').first();
  const rows: BaFinRow[] = [];

  table.find('tr').each((_, element) => {
    const cells = $(element).find('td');
    if (cells.length < 2) {
      return; // header row or layout row
    }
    const date = parseGermanDate(normalizeWhitespace(cells.eq(0).text()));
    const linkElement = cells.eq(1).find('a').first();
    const title = normalizeWhitespace(linkElement.text());
    const link = absoluteUrl(linkElement.attr('href'));

    if (!date || !title || !link) {
      return;
    }

    rows.push({
      date,
      title,
      firm: extractFirm(title),
      link,
      listingUrl: pageUrl,
    });
  });

  return rows;
}

async function enrichRow(row: BaFinRow): Promise<ParsedEnforcementRecord | null> {
  const html = await fetchText(row.link);
  const $ = cheerio.load(html);

  const ogTitle = normalizeWhitespace(
    $('meta[property="og:title"]').attr('content')
      || $('title').first().text().replace(/\s*\|\s*BaFin\s*$/i, '')
      || row.title,
  );
  const metaDescription = normalizeWhitespace(
    $('meta[name="description"]').attr('content')
      || $('meta[property="og:description"]').attr('content')
      || '',
  );
  const bodyText = extractBodyText($);
  const summary = metaDescription || bodyText || row.title;

  // Prefer the og:title grammar; fall back to the listing title, then the
  // description sentence (strict validation rejects sentence fragments).
  const firm = extractFirm(ogTitle, row.title, summary) || row.firm;
  if (!firm) {
    return null;
  }

  const canonical = absoluteUrl($('link[rel="canonical"]').attr('href')) || row.link;
  const corpus = `${ogTitle} ${summary}`;
  const amountTexts = [metaDescription, bodyText, ogTitle, row.title];
  const identityAmount = extractReferencedAmount(amountTexts);
  const amount = extractSanctionAmount(amountTexts);

  return {
    regulator: 'BaFin',
    regulatorFullName: 'Federal Financial Supervisory Authority',
    countryCode: 'DE',
    countryName: 'Germany',
    firmIndividual: firm,
    firmCategory: classifyFirm(`${firm} ${corpus}`),
    amount,
    identityAmount,
    currency: 'EUR',
    dateIssued: row.date,
    breachType: germanBreachType(corpus),
    breachCategories: germanBreachCategories(corpus),
    summary,
    finalNoticeUrl: canonical,
    sourceUrl: row.listingUrl,
    // Dedupe on the action's identity, not the URL: BaFin republishes some
    // cases (e.g. BfJ reporting penalties) under multiple listing entries.
    dedupeKey: `${firm}|${row.date}|${identityAmount ?? ''}`,
    rawPayload: {
      ...row,
      ogTitle,
      metaDescription: metaDescription.slice(0, 500),
      monetaryReference: identityAmount,
      monetarySanctionVerified: amount !== null,
    },
  };
}

async function collectRows(): Promise<BaFinRow[]> {
  const rows: BaFinRow[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= BAFIN.maxPages && rows.length < BAFIN.maxRecords; page += 1) {
    const pageUrl = listingPageUrl(page);
    console.log(`📄 Fetching BaFin listing page ${page}: ${pageUrl}`);

    const html = await fetchText(pageUrl);
    const $ = cheerio.load(html);
    const pageRows = extractRows($, pageUrl);

    let added = 0;
    for (const row of pageRows) {
      const key = `${row.link}|${row.date}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      rows.push(row);
      added += 1;
    }

    console.log(`   Found ${pageRows.length} rows (${added} new)`);

    // BaFin clamps out-of-range pages back to the last page, so a page that
    // adds nothing new means we have reached the end of the archive.
    if (added === 0) {
      break;
    }
  }

  return rows;
}

async function loadBaFinLiveRecords(): Promise<DbReadyRecord[]> {
  const flags = getCliFlags();

  const rows = await collectRows();
  const limited = flags.limit && flags.limit > 0 ? rows.slice(0, flags.limit) : rows;
  console.log(`\n🔎 Enriching ${limited.length} BaFin case pages...`);

  const enriched = await mapWithConcurrency(limited, BAFIN.detailConcurrency, async (row) => {
    try {
      const record = await enrichRow(row);
      if (record) {
        console.log(`   ✓ ${record.firmIndividual} — €${record.amount?.toLocaleString() ?? 'N/A'} (${record.dateIssued})`);
      }
      return record;
    } catch {
      console.log(`   ✗ Failed to enrich ${row.link}`);
      return null;
    }
  });

  const deduped = new Map<string, ParsedEnforcementRecord>();
  for (const record of enriched) {
    if (!record) {
      continue;
    }
    const key = `${record.firmIndividual}|${record.dateIssued}|${record.amount ?? ''}`;
    if (!deduped.has(key)) {
      deduped.set(key, record);
    }
  }

  const records = [...deduped.values()].map(buildEuFineRecord);

  if (records.length === 0) {
    throw new Error('BaFin: no enforcement records were extracted from the live listing.');
  }

  console.log(`\n📊 Prepared ${records.length} unique BaFin records (from ${enriched.filter(Boolean).length} parsed).`);
  return records;
}

export async function main() {
  await runScraper({
    name: '🇩🇪 BaFin Enforcement Actions Scraper',
    regulatorCode: 'BaFin',
    region: 'Europe',
    liveLoader: loadBaFinLiveRecords,
    testLoader: loadBaFinLiveRecords,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error('❌ BaFin scraper failed:', error);
    process.exit(1);
  });
}
