/**
 * Strict amount extraction from free text.
 *
 * Replaces the old "max of every [\d\s,]+ run after a keyword" behaviour, which
 * glued dates, case numbers, years and space-separated digit runs into
 * trillion-sized amounts. A number is only accepted when
 *   1. it is a well-formed number token (grouped thousands or plain decimal),
 *   2. it is not part of a date / case number / year / duration / percentage, and
 *   3. a currency marker (before or after) or an explicit fine keyword sits
 *      directly next to it.
 * Statutory maxima ("up to", "maks", "inntil", "op til", "bis zu") are ignored,
 * and a full digit group followed by a magnitude word ("R58 793 075 million")
 * is reported as ambiguous instead of being multiplied.
 */

export interface AmountTextOptions {
  currency: string;
  symbols?: string[];
  keywords?: string[];
  /** Words that mark a figure as not the fine (confiscation, compensation...). */
  excludeContext?: string[];
}

export interface AmountTextResult {
  amount: number | null;
  /** True when at least one candidate was refused as ambiguous. */
  ambiguous: boolean;
  /** Human-readable reasons for each refused candidate (for review queues). */
  ambiguousReasons: string[];
  /** Every accepted candidate, in source order. */
  candidates: number[];
}

const DEFAULT_KEYWORDS = ['fine', 'penalty', 'sanction', 'costs', 'disgorge', 'disgorgement'];

const SCALES: Array<[string, number]> = [
  ['milliarden', 1e9], ['milliarde', 1e9], ['milliards', 1e9], ['milliard', 1e9], ['miljarder', 1e9], ['miljard', 1e9],
  ['billion', 1e9], ['bn', 1e9], ['mrd', 1e9],
  ['millionen', 1e6], ['millioner', 1e6], ['millions', 1e6], ['million', 1e6], ['millones', 1e6], ['millón', 1e6],
  ['milioni', 1e6], ['milione', 1e6], ['milhões', 1e6], ['milhão', 1e6], ['miljoen', 1e6], ['miljoner', 1e6],
  ['miljon', 1e6], ['milionů', 1e6], ['milion', 1e6], ['mio', 1e6], ['mn', 1e6], ['m', 1e6],
  ['crore', 1e7], ['lakhs', 1e5], ['lakh', 1e5],
  ['thousand', 1e3], ['tusen', 1e3], ['tusind', 1e3], ['tausend', 1e3], ['tis', 1e3], ['k', 1e3],
];
const SCALE_MAP = new Map(SCALES);
const SCALE_PATTERN = [...SCALES].sort((a, b) => b[0].length - a[0].length).map(([word]) => word).join('|');

const CURRENCY_WORDS: Record<string, string[]> = {
  NOK: ['kr', 'kr.', 'kroner', 'krone', 'kronor', 'nok'],
  DKK: ['kr', 'kr.', 'kroner', 'krone', 'dkk'],
  SEK: ['kr', 'kr.', 'kronor', 'krona', 'sek'],
  EUR: ['€', 'euro', 'euros', 'eur'],
  USD: ['$', 'us$', 'dollar', 'dollars', 'usd'],
  GBP: ['£', 'pound', 'pounds', 'gbp'],
  ZAR: ['R', 'rand', 'zar'],
  HKD: ['HK$', 'hkd'],
  NGN: ['₦', 'naira', 'ngn'],
  CZK: ['Kč', 'kc', 'korun', 'czk'],
  CHF: ['CHF', 'francs', 'franken', 'fr.'],
  AUD: ['A$', 'AUD'],
  CAD: ['C$', 'CAD', 'CA$'],
  SGD: ['S$', 'SGD'],
  JPY: ['¥', 'yen', 'jpy'],
  INR: ['₹', 'Rs', 'Rs.', 'INR'],
};

const CEILING_WORDS = [
  'up to', 'opptil', 'maximum', 'maximal', 'maximum of', 'at most', 'not exceeding', 'not more than', 'ceiling', 'capped at',
  'až do výše', 'nejvýše', 'maximálně', 'horní hranice', 'maks', 'maksimal', 'maksimum', 'maksimalt', 'inntil', 'opp til', 'høyst', 'op til', 'indtil', 'højst',
  'bis zu', 'höchstens', 'maximal', 'jusqu', 'fino a', 'hasta', 'até', 'tot', 'upp till', 'till och med',
];
const CEILING_RE = new RegExp(`(?:^|[^\\p{L}])(?:${CEILING_WORDS.map(escapeRe).join('|')})(?![\\p{L}])`, 'iu');

const NON_MONEY_UNITS_RE = /^\s*(?:days?|dag(?:e|es|s|ar|er|en)?|dagsbøder|dagbøder|dagsbøde|fængsel|dni|jours?|tage|giorni|dias|weeks?|uker|uger|months?|måneder|måneders|måneder|mnd|years?|år|years-old|aar|jaar|ans|jahre|anni|anos|%|per\s*cent|prosent|procent|pct|shares?|aksjer|aktier|points?|poeng|persons?|personer|people|articles?|artikel|artikkel|paragraf)(?![\p{L}])/iu;
const MONTH_RE = '(?:jan(?:uary|uar|uari)?|feb(?:ruary|ruar|ruari)?|mar(?:ch|s|z)?|apr(?:il)?|ma[ij]|mai|jun[ei]?|jul[iy]?|aug(?:ust|usti)?|sep(?:t(?:ember)?)?|o[ck]t(?:ober)?|nov(?:ember)?|de[cs](?:ember)?|dez(?:ember)?)';
const MONTH_BEFORE_RE = new RegExp(`${MONTH_RE}\\.?\\s*$`, 'i');
const MONTH_AFTER_RE = new RegExp(`^\\.?\\s*${MONTH_RE}(?![\\p{L}])`, 'iu');

// Abbreviation full stops must not read as sentence boundaries ("ca. 7.300 kr").
const ABBREVIATION_RE = /(?<![\p{L}])(?:ca|kr|nr|no|jf|fx|dvs|osv|mv|pga|inkl|approx|incl|resp|etc|vs|art|sec|st)\.(?=\s)/giu;

function escapeRe(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeText(text: string) {
  return text.replace(/[   ]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Grouped thousands (consistent or mixed separators) or a plain decimal.
const NUMBER_PATTERN = /(?<![\d.,/\-])(\d{1,2}(?:,\d{2})+,\d{3}(?:\.\d{1,2})?|\d{1,3}(?:[ .,']\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d+)?)(?![\d])(?![.,]\d)(?!\/\d)/g;

interface ParsedNumber {
  value: number | null;
  grouped: boolean;
  /** Plain "1.234" / "1,234" style: a single separator followed by three digits. */
  singleSeparatorTriple: boolean;
  separator: string | null;
}

export function parseNumberToken(token: string, hasScale: boolean): ParsedNumber {
  const t = token.trim();
  const dots = (t.match(/\./g) ?? []).length;
  const commas = (t.match(/,/g) ?? []).length;
  const spaces = (t.match(/[ ']/g) ?? []).length;
  const lastDot = t.lastIndexOf('.');
  const lastComma = t.lastIndexOf(',');

  if (spaces > 0) {
    // Space grouping, possibly with a trailing decimal part.
    const decimalSep = lastComma > -1 || lastDot > -1 ? (lastComma > lastDot ? ',' : '.') : null;
    const intPart = decimalSep ? t.slice(0, t.lastIndexOf(decimalSep)) : t;
    const frac = decimalSep ? t.slice(t.lastIndexOf(decimalSep) + 1) : '';
    const digits = intPart.replace(/[ ',.]/g, '');
    const value = Number.parseFloat(frac ? `${digits}.${frac}` : digits);
    return { value: Number.isFinite(value) ? value : null, grouped: true, singleSeparatorTriple: false, separator: ' ' };
  }
  if (dots > 0 && commas > 0) {
    const decimalSep = lastComma > lastDot ? ',' : '.';
    const groupSep = decimalSep === ',' ? '.' : ',';
    const normalized = t.split(groupSep).join('').replace(decimalSep, '.');
    const value = Number.parseFloat(normalized);
    return { value: Number.isFinite(value) ? value : null, grouped: true, singleSeparatorTriple: false, separator: groupSep };
  }
  const sep = dots > 0 ? '.' : commas > 0 ? ',' : null;
  if (!sep) {
    const value = Number.parseFloat(t);
    return { value: Number.isFinite(value) ? value : null, grouped: false, singleSeparatorTriple: false, separator: null };
  }
  const count = sep === '.' ? dots : commas;
  const parts = t.split(sep);
  const tail = parts[parts.length - 1];
  if (count > 1) {
    // 1.234.567 / 1,234,567 : thousands only.
    const value = Number.parseFloat(parts.join(''));
    return { value: Number.isFinite(value) ? value : null, grouped: true, singleSeparatorTriple: false, separator: sep };
  }
  if (tail.length === 3 && parts[0].length <= 3 && parts[0] !== '0') {
    if (hasScale && sep === '.') {
      // "6.175 million" is a decimal.
      return { value: Number.parseFloat(`${parts[0]}.${tail}`), grouped: false, singleSeparatorTriple: false, separator: sep };
    }
    const value = Number.parseFloat(parts.join(''));
    return { value: Number.isFinite(value) ? value : null, grouped: true, singleSeparatorTriple: true, separator: sep };
  }
  const value = Number.parseFloat(`${parts[0]}.${tail}`);
  return { value: Number.isFinite(value) ? value : null, grouped: false, singleSeparatorTriple: false, separator: sep };
}

function currencyMarkers(options: AmountTextOptions) {
  const words = CURRENCY_WORDS[options.currency.toUpperCase()] ?? [];
  const all = [options.currency, ...(options.symbols ?? []), ...words].filter(Boolean);
  return Array.from(new Set(all)).sort((a, b) => b.length - a.length);
}

function sentenceTail(before: string) {
  // Text since the last sentence boundary; list/colon punctuation is kept so
  // "Penalty: R50 000" still binds, but a full stop followed by a space ends it.
  const idx = Math.max(before.lastIndexOf('. '), before.lastIndexOf('; '), before.lastIndexOf('! '), before.lastIndexOf('? '));
  return idx === -1 ? before : before.slice(idx + 2);
}

export function extractAmountFromText(text: string, options: AmountTextOptions): AmountTextResult {
  const normalized = normalizeText(text);
  const keywords = (options.keywords ?? DEFAULT_KEYWORDS).filter(Boolean);
  const keywordRe = keywords.length
    ? new RegExp(`(?<![\\p{L}])(?:${[...keywords].sort((a, b) => b.length - a.length).map(escapeRe).join('|')})(?![\\p{L}])`, 'giu')
    : null;
  const markers = currencyMarkers(options);
  const markerAlt = markers.map(escapeRe).join('|');
  const preMarkerRe = new RegExp(`(?<![\\p{L}])(?:${markerAlt})\\s*$`, 'iu');
  const postMarkerRe = new RegExp(`^\\s*(?:(?:de|of|di|von)\\s+|d['’])?(?:${markerAlt})(?![\\p{L}])(?!\\s?\\d)`, 'iu');
  const scaleRe = new RegExp(`^\\s*(${SCALE_PATTERN})(?![\\p{L}])`, 'iu');

  const excludeWords = (options.excludeContext ?? []).filter(Boolean);
  const excludeRe = excludeWords.length
    ? new RegExp(`(?<![\\p{L}])(?:${excludeWords.map(escapeRe).join('|')})`, 'iu')
    : null;
  const candidates: number[] = [];
  const keywordBound: number[] = [];
  const ambiguousReasons: string[] = [];

  for (const match of normalized.matchAll(NUMBER_PATTERN)) {
    const token = match[1];
    const start = match.index ?? 0;
    const end = start + token.length;
    const before = normalized
      .slice(Math.max(0, start - 70), start)
      .replace(ABBREVIATION_RE, (abbr) => abbr.replace('.', ','));
    const after = normalized.slice(end, end + 40);

    const tail = sentenceTail(before);
    if (CEILING_RE.test(tail.slice(-60))) continue;
    if (excludeRe && excludeRe.test(tail.slice(-80))) continue;

    const scaleMatch = after.match(scaleRe);
    const scaleWord = scaleMatch ? scaleMatch[1].toLowerCase() : null;
    const afterScale = scaleMatch ? after.slice(scaleMatch[0].length) : after;

    // Dates, years, durations, percentages.
    if (/^\s+(?:19|20)\d{2}(?![\d])/.test(after) && !scaleWord) continue;
    if (MONTH_AFTER_RE.test(after) || MONTH_BEFORE_RE.test(before)) continue;
    if (NON_MONEY_UNITS_RE.test(after)) continue;
    if (/^\s*(?:th|st|nd|rd|\.\s*(?:januar|februar|mars|april|mai|juni|juli))/i.test(after)) continue;

    const hasPre = preMarkerRe.test(before);
    const hasPost = postMarkerRe.test(afterScale);
    let hasKeyword = false;
    if (keywordRe) {
      let lastEnd = -1;
      for (const k of before.matchAll(keywordRe)) lastEnd = (k.index ?? 0) + k[0].length;
      if (lastEnd !== -1) {
        const gap = before.slice(lastEnd);
        hasKeyword = gap.length <= 45 && !/[\d;!?]/.test(gap) && !/\.\s/.test(gap) && !MONTH_BEFORE_RE.test(gap);
      }
    }
    if (!hasPre && !hasPost && !hasKeyword) continue;

    const parsed = parseNumberToken(token, Boolean(scaleWord));
    if (parsed.value === null) continue;

    if (!hasPre && !hasPost) {
      // Keyword-only binding: refuse bare year-like integers and tiny integers.
      if (!parsed.grouped && !scaleWord) {
        if (/^(?:19|20)\d{2}$/.test(token)) continue;
        if (parsed.value < 1000) continue;
      }
    }

    if (scaleWord) {
      // Any grouped integer followed by a magnitude word is ambiguous
      // ("R58 793 075 million", "1,234 million"): flag, do not multiply.
      if (parsed.grouped) {
        ambiguousReasons.push(`"${token} ${scaleWord}" has a grouped digit run followed by a magnitude word; the scale is ambiguous.`);
        continue;
      }
      const multiplier = SCALE_MAP.get(scaleWord) ?? 1;
      const amount = Math.round(parsed.value * multiplier * 100) / 100;
      candidates.push(amount);
      if (hasKeyword) keywordBound.push(amount);
      continue;
    }

    const plain = Math.round(parsed.value * 100) / 100;
    candidates.push(plain);
    if (hasKeyword) keywordBound.push(plain);
  }

  return {
    // An amount bound to an explicit fine keyword beats a bare currency figure
    // elsewhere in the document (capital, turnover, payment totals).
    amount: keywordBound.length > 0
      ? Math.max(...keywordBound)
      : candidates.length > 0 ? Math.max(...candidates) : null,
    ambiguous: ambiguousReasons.length > 0,
    ambiguousReasons,
    candidates,
  };
}
