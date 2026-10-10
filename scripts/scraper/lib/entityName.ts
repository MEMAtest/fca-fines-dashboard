/**
 * Shared entity-name hygiene for enforcement scrapers.
 *
 * Three concerns live here:
 *  1. cleanEntityName(): HTML-entity decoding + whitespace normalisation for names.
 *  2. assessEntityName(): the validator that spots headline fragments stored as a
 *     firm ("Pre-trial review set", "CIRO Hearing Panel accepts settlement ...").
 *  3. unnamedParty(): the honest label for actions whose party is genuinely
 *     anonymous at source. Such rows get firm_category = UNNAMED_PARTY_CATEGORY so
 *     rankings and firm search can exclude them. A name is never invented.
 *
 * Content-hash identity is a separate matter: scrapers keep the OLD name for the
 * hash through ParsedEnforcementRecord.identityFirm (see buildEuFineRecord).
 */
import { createHash } from 'node:crypto';

/** firm_category value marking a row whose real party is not public. */
export const UNNAMED_PARTY_CATEGORY = 'Unnamed party';

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '-', mdash: '-',
  rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', eacute: 'é', egrave: 'è', agrave: 'à',
  ouml: 'ö', uuml: 'ü', auml: 'ä', szlig: 'ß', ccedil: 'ç', oacute: 'ó', aacute: 'á',
  iacute: 'í', uacute: 'ú', ntilde: 'ñ', ecirc: 'ê', ocirc: 'ô', acirc: 'â',
};

export function decodeHtmlEntities(value: string): string {
  let current = value;
  // Twice, to undo double-encoding such as "&amp;amp;".
  for (let pass = 0; pass < 2; pass += 1) {
    const next = current
      .replace(/&#x([0-9a-f]+);/gi, (m, hex) => safeCodePoint(parseInt(hex, 16), m))
      .replace(/&#(\d+);/g, (m, dec) => safeCodePoint(parseInt(dec, 10), m))
      .replace(/&([a-z][a-z0-9]*);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
    if (next === current) break;
    current = next;
  }
  return current;
}

function safeCodePoint(code: number, fallback: string) {
  try {
    return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : fallback;
  } catch {
    return fallback;
  }
}

/** Decode HTML entities, collapse whitespace and trim stray separators. */
export function cleanEntityName(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/[ ​]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;:.\-–—]+|[\s,;:\-–—]+$/g, '')
    .trim();
}

export type UnnamedKind = 'individual' | 'individuals' | 'firm' | 'bank' | 'party';

/** Honest label for a row whose party is anonymised at source. */
export function unnamedParty(regulator: string, kind: UnnamedKind = 'party') {
  return {
    name: `Unnamed ${kind} (${regulator})`,
    category: UNNAMED_PARTY_CATEGORY,
  };
}

export function isUnnamedPartyName(name: string): boolean {
  return /^Unnamed (?:individuals?|firm|bank|party) \([A-Za-z0-9-]+\)$/.test(name.trim());
}

const MONTHS = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

const HEADLINE_VERBS =
  /\b(?:fines|fined|sentenced|adjourned|revokes?|revoked|accepts|issued|imposes|imposed|imposition|sanctions|bans|suspends|settles|charged|publishes|announces|reprimands|penalises|penalizes|orders|jailed|convicted|convicts|arraigned|remanded)\b/i;

const CORPORATE_SUFFIX =
  /(?:^|[\s,])(?:a\/s|b\.?v\.?|n\.?v\.?|s\.?a\.?|a\.?g\.?|s\.?r\.?l\.?|s\.?r\.?o\.?|a\.?s\.?|spol\.? s r\.?o\.?|gmbh|ltd\.?|limited|inc\.?|llc|plc|oy|ab|asa|se|spa|s\.?p\.?a\.?|corp\.?|co\.?|kft|zrt|sarl)(?=$|[\s,])/i;

/** Lower-case words that open a headline fragment rather than a brand. */
const HEADLINE_LEAD =
  /^(?:dealings|revokes?|suspends?|bans?|fines?|secures?|commences?|commence|former|its|his|her|their|each|both|all|any|an?|and|of|in|for|to|at|by|with|en|og|den|det|et|un|une|des|die|der|das|ein|eine|und|fund|court|hearing|l['\u2019]\w*)$/i;

function theFragment_(value: string) {
  return /^the (?:code|act|rules?|regulations?|ordinance|guidelines?|law|laws|standards?|requirements?|directive|policy|provisions?|relevant|said|following|same|firm|company|individual|person|investor|fund)\b/i.test(value) || /^the [a-z]/.test(value);
}

const LEGAL_FORM_END =
  /(?:^|[\s,])(?:ltd|limited|llc|llp|lp|inc|incorporated|plc|s\.?a|s\.?a\.?s|ag|gmbh|kg|b\.?v|n\.?v|s\.?p\.?a|s\.?r\.?l|sarl|a\/s|as|ab|oy|oyj|asa|se|pty(?: ltd)?|corp|corporation|co|company|k\.?k|pte(?: ltd)?|bhd|kft|zrt|s\.?r\.?o|a\.?s)\.?$/i;
/** "SFC fines X Limited", "CIRO Hearing Panel accepts ... Ltd": a regulator or court is the subject, so it is still a headline. */
const REGULATOR_SUBJECT_VERB =
  /\b(?:SFC|SFAT|SEC|FCA|PRA|CIRO|MFDA|IIROC|AMF|CMA|ICO|OFSI|FRC|MMT|CBI|DNB|FSMA|Court|Tribunal|Panel|Commission|Authority|Regulator|Committee)\s+(?:\w+\s+){0,3}?(?:fines|fined|sentenced|adjourned|revokes?|revoked|accepts|issued|imposes|imposed|sanctions|bans|suspends|settles|charged|publishes|announces|reprimands|penalises|penalizes|orders|jailed|convicted|convicts)\b/i;

const NAME_PARTICLES = new Set([
  'de', 'del', 'della', 'der', 'den', 'van', 'von', 'das', 'dos', 'du', 'bin', 'ibn', 'ten', 'ter', 'zu', 'af', 'av',
]);

const COUNT_WORD = '(?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|several|multiple|various|other|former|certain)';
const PLURAL_ROLE_NOUN =
  '(?:banks|exchange houses|insurance brokers|insurance companies|insurers|finance companies|hawala providers|individuals|persons|people|firms|companies|entities|executives|officers|directors|employees|branches|residents|citizens|traders|brokers|advis[eo]rs|representatives|service providers|platforms|clubs)';
/** "Two Individuals", "Former Executives", "Five banks and two insurance companies": a count plus a plural role noun. */
const DESCRIPTOR_PHRASE = new RegExp(`^${COUNT_WORD}\\s+(?:[\\w'-]+\\s+){0,4}?${PLURAL_ROLE_NOUN}(?:[\\s,].*)?$`, 'i');
/** "A bank", "An exchange house", "A non-authorised individual ...": an article then an all-lower-case description. */
const LOWERCASE_ARTICLE_DESCRIPTION = /^[Aa]n?\s+[a-z][a-z\s'-]*$/;
const OPERATING_IN = /\b(?:operating|located|licen[cs]ed|registered|based) in (?:the )?(?:UAE|United|Dubai|Abu Dhabi|[A-Z]{2,})\b/;
const KOREAN_SENTENCE = /[\uAC00-\uD7A3].*(?:습니다|합니다|하겠다|했다|한다)\.?$/;

const GENERIC_DESCRIPTOR =
  /^(?:unknown|n\/a|none|tbc|it also|in this|in particular|if any|committee|en person|vedkommende|a person|an individual|a company|a firm|two (?:individuals|persons|firms|companies)|former (?:executives?|officers?|directors?)|winding up|order of prohibition|civil penalt(?:y|ies)|crypto service provider|accountant|actuary|mr|mrs|ms|miss|dr|mme|monsieur|madame|(?:de |het |een )?(?:onderneming|bedrijf)|l'?entreprise|la soci[e\u00e9]t[e\u00e9]|(?:monsieur|madame|mme|mr|mrs|ms|m\.|herr|frau)\s*[A-Z])$/i;

export interface EntityAssessment {
  ok: boolean;
  /** Reasons that make the value unusable as a party name. */
  reasons: string[];
  /** Soft signals (for example unusual length) that never reject on their own. */
  flags: string[];
}

/**
 * Decides whether a string can be shown as the sanctioned party. Hard reasons
 * mean "this is a headline or descriptor"; flags are informational.
 */
export function assessEntityName(name: string | null | undefined): EntityAssessment {
  const value = (name ?? '').replace(/\s+/g, ' ').trim();
  const reasons: string[] = [];
  const flags: string[] = [];
  if (!value) return { ok: false, reasons: ['empty'], flags };
  if (isUnnamedPartyName(value)) return { ok: true, reasons, flags };

  if (/&(?:[a-z]+|#\d+|#x[0-9a-f]+);/i.test(value)) reasons.push('html_entity');
  if (GENERIC_DESCRIPTOR.test(value) || DESCRIPTOR_PHRASE.test(value) || LOWERCASE_ARTICLE_DESCRIPTION.test(value) || OPERATING_IN.test(value)) reasons.push('generic_descriptor');
  if (KOREAN_SENTENCE.test(value)) reasons.push('headline_sentence');
  if (/\b(?:pre-trial|trial|hearing|mention|review) (?:review )?(?:set|fixed|adjourned|listed)\b/i.test(value) || /\(press release\)/i.test(value) || /^(?:ponzi|breaking|news|alert|update):/i.test(value)) {
    reasons.push('headline_phrase');
  }
  // A trailing legal form ("Sanctions Compliance Partners Ltd", "Charged Capital Ltd") makes a
  // verb-looking first word part of a company name, unless a regulator/court subject drives it.
  const legalFormEnd = LEGAL_FORM_END.test(value) && !REGULATOR_SUBJECT_VERB.test(value);
  if (HEADLINE_VERBS.test(value) && !legalFormEnd) reasons.push('headline_verb');
  if (value.length > 120) flags.push('long');

  const first = value.split(' ')[0] ?? '';
  const startsLower = /^\p{Ll}/u.test(first);
  const camelBrand = /^\p{Ll}+\p{Lu}/u.test(first); // iShares, eToro
  // Lower-case brands with a legal suffix are real names: "bunq B.V.", "kompasbank a/s".
  const domainLike = /^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\.?$/i.test(first); // www.example.com
  const lowerBrandWithSuffix = value.split(" ").length <= 12 && CORPORATE_SUFFIX.test(value) && !HEADLINE_LEAD.test(first);
  const lowerTheName = first === 'the' && !theFragment_(value);
  if (startsLower && !camelBrand && !domainLike && !lowerTheName && !lowerBrandWithSuffix && !NAME_PARTICLES.has(first.toLowerCase().replace(/\.$/, ''))) {
    // A lower-case opener is a hard failure when it is a headline/function word, a lone
    // lower-case token or text with no capital at all. "banque Delubac et Cie" and
    // "soci\u00e9t\u00e9 Abeille Vie" carry a proper name after a common noun: flagged, not rejected.
    const hard = HEADLINE_LEAD.test(first) || first === 'the' || value.split(' ').length === 1 || !/\p{Lu}/u.test(value);
    if (hard) reasons.push('starts_lowercase');
    else flags.push('lowercase_prefix');
  }
  // "the Code of Conduct" is a fragment; "the New York Branch of Metropolitan Bank & Trust Company" is a name.
  if (/^the /.test(value) && theFragment_(value)) reasons.push('starts_with_the');
  if (/for (?:the )?(?:failure|failing|failures|breach(?:es)?|violat\w*|contravent\w*|non-?compliance)\b/i.test(value)) {
    reasons.push('failure_clause');
  }
  if (/^(?:decision|final|supervisory) notices?\b/i.test(value) || /^enforcement action\b/i.test(value)) {
    reasons.push('notice_prefix');
  }

  const datePatterns = [
    new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTHS}\\.?,?\\s+(?:19|20)\\d{2}\\b`, 'i'),
    new RegExp(`\\b${MONTHS}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+(?:19|20)\\d{2}\\b`, 'i'),
    /\b(?:19|20)\d{2}-\d{2}-\d{2}\b/,
    /^\d{1,2}[./]\d{1,2}[./](?:19|20)\d{2}\b/,
  ];
  if (datePatterns.some((pattern) => pattern.test(value))) reasons.push('contains_date');

  return { ok: reasons.length === 0, reasons, flags };
}

export function looksLikeHeadline(name: string | null | undefined): boolean {
  return !assessEntityName(name).ok;
}

function defaultCollisionRehash(record: { contentHash: string; firmIndividual: string; dateIssued: string; finalNoticeUrl?: string | null }) {
  return createHash('sha256')
    .update(JSON.stringify({ base: record.contentHash, firm: record.firmIndividual, date: record.dateIssued, url: record.finalNoticeUrl ?? null }))
    .digest('hex');
}

/**
 * When the legacy extractor collapsed several distinct parties onto one hash (same
 * date, URL and placeholder name), keep the legacy hash for the first and re-key the
 * others on their real name so no party is silently overwritten.
 */
export function separateIdentityCollisions<T extends { contentHash: string; firmIndividual: string; dateIssued: string; finalNoticeUrl?: string | null }>(
  records: T[],
  rehash: (record: T) => string = defaultCollisionRehash,
): T[] {
  const seen = new Set<string>();
  return records.map((record) => {
    if (!seen.has(record.contentHash)) {
      seen.add(record.contentHash);
      return record;
    }
    const contentHash = rehash(record);
    seen.add(contentHash);
    return { ...record, contentHash };
  });
}
