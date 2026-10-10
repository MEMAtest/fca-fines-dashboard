export interface DigestSourceCopy {
  firm: string;
  authority: string;
  amountOriginal: number | null;
  currency: string;
  breach: string;
  summary: string;
}

export function hasExplicitPenaltyLanguage(value: string): boolean {
  return /\b(?:fine|fined|penalty|penalties|pecuniary penalty|monetary penalty|financial penalty|infringement notice|Geldbu(?:ß|ss)e|Bu(?:ß|ss)geld|Ordnungsgeld|Zwangsgeld|Geldstrafe)\b/i.test(value);
}

function formatOriginalAmount(amount: number, currency: string): string | null {
  if (!Number.isFinite(amount) || amount <= 0 || !/^[A-Z]{3}$/.test(currency)) return null;
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      notation: amount >= 1_000_000 ? 'compact' : 'standard',
      maximumFractionDigits: amount >= 1_000 ? 0 : 2,
    }).format(amount);
  } catch {
    return null;
  }
}

function isUninformativeSummary(value: string, firm: string, authority: string): boolean {
  const normalized = value.trim().replace(/\s+/g, ' ').toLowerCase();
  const normalizedFirm = firm.trim().replace(/\s+/g, ' ').toLowerCase();
  const normalizedAuthority = authority.trim().replace(/\s+/g, ' ').toLowerCase();
  return normalized === normalizedFirm
    || normalized === 'enforcement action'
    || normalized === 'regulatory enforcement action'
    || normalized === 'see source for details.'
    || normalized === `${normalizedAuthority} enforcement action`.trim()
    || (
      /^final notice(?: \d{4})?:\s*.+$/i.test(value.trim())
      && !/[.!?]\s+\S/.test(value.trim())
    );
}

export function buildDigestItemCopy(source: DigestSourceCopy): { title: string; summary: string } {
  const { firm, authority, amountOriginal, currency, breach, summary } = source;
  const evidenceText = `${breach} ${summary}`;
  const amount = amountOriginal === null ? null : formatOriginalAmount(amountOriginal, currency);
  const title = amount && hasExplicitPenaltyLanguage(evidenceText)
    ? `${firm || authority || 'Regulator'} fined ${amount}`
    : firm
      ? `${authority || 'Regulator'} action: ${firm}`
      : 'Regulatory development';

  const preferredSummary = [summary, breach]
    .map(value => value.trim())
    .find(value => value && !isUninformativeSummary(value, firm, authority));

  return {
    title,
    summary: preferredSummary
      || `${authority || 'The regulator'} published an enforcement action concerning ${firm || 'this case'}. Open the official source for the findings and outcome.`,
  };
}

// ---------------------------------------------------------------------------
// English-only copy, specific links and measure wording (sterling digest path)
// ---------------------------------------------------------------------------

const NON_ENGLISH_WORDS =
  /\b(der|die|das|und|hat|hatte|wurde|wurden|gegen|eine|einer|nicht|für|von|mit|auf|dem|den|des|ist|sind|bei|zum|zur|gemäß|nach|über|sowie|le|la|les|une|est|pour|dans|que|qui|sur|avec|el|los|las|una|por|con|della|degli|nel|che|più|uma|não|para|com|het|een|voor|zijn|wordt|heeft)\b/gi;
const NON_ENGLISH_REGULATORS = new Set(['BAFIN', 'CNMV', 'CONSOB', 'CVM', 'ACPR', 'IVASS', 'SESC', 'CMF']);

/** True when the text is clearly not English (German, French, Spanish, Italian, Portuguese, Dutch). */
export function isLikelyNonEnglish(text: string | null | undefined, regulator?: string): boolean {
  const value = (text ?? '').trim();
  if (!value) return false;
  const words = value.split(/\s+/).length;
  const hits = (value.match(NON_ENGLISH_WORDS) ?? []).length;
  if (hits >= 2 && hits / words > 0.06) return true;
  // Regulator-published prose in a known non-English language that slipped detection.
  return Boolean(regulator && NON_ENGLISH_REGULATORS.has(regulator.toUpperCase()) && hits >= 1);
}

const GENERIC_URL =
  /(Servicesuche|Expertensuche|SiteGlobals\/Forms|\/Suche\/|[?&](q|query|search)=|EASearch|\/search(\/|\?|$)|list-content|\/enforcement-cases\/?$|\/dataset\/|processo-sancionador\/?$|\/news-and-announcements\/?$)/i;

export function isHttpUrl(value: unknown): value is string {
  return /^https?:\/\//i.test(String(value ?? '').trim());
}

/** A listing or search form is not the notice. */
export function isGenericListingUrl(url: string | null | undefined): boolean {
  if (!isHttpUrl(url)) return true;
  try {
    const u = new URL(url);
    if (u.pathname === '/' || u.pathname === '') return true;
  } catch {
    return true;
  }
  return GENERIC_URL.test(url);
}

/**
 * Pick the link for a digest item: the specific notice, else a specific source
 * page, else RegActions' own search for the firm. Never a generic listing page.
 */
export function pickItemUrl(
  row: { notice_url?: string | null; source_url?: string | null; firm_name?: string },
  siteUrl: string,
): string | undefined {
  for (const candidate of [row.notice_url, row.source_url]) {
    if (candidate && !isGenericListingUrl(candidate)) return candidate;
  }
  const firm = (row.firm_name ?? '').trim();
  return firm ? `${siteUrl.replace(/\/+$/, '')}/search?q=${encodeURIComponent(firm)}` : undefined;
}

const SYMBOLS: Record<string, string> = {
  GBP: '£', USD: '$', EUR: '€', CAD: 'C$', AUD: 'A$', CHF: 'CHF ', JPY: '¥', HKD: 'HK$', SGD: 'S$',
  INR: '₹', NZD: 'NZ$', BRL: 'R$', MYR: 'RM', KRW: '₩', ZAR: 'R', CZK: 'CZK ', DKK: 'DKK ', SEK: 'SEK ', NOK: 'NOK ',
};

export function currencySymbol(currency: string | null | undefined): string {
  const code = (currency ?? 'GBP').toUpperCase();
  return SYMBOLS[code] ?? `${code} `;
}

/** £4.8m / £614k / €1.2m. Same style everywhere in the digest. */
export function formatMoney(amount: number, currency = 'GBP'): string {
  const symbol = currencySymbol(currency);
  if (amount >= 1_000_000) return `${symbol}${(amount / 1_000_000).toFixed(1)}m`;
  return `${symbol}${(amount / 1_000).toFixed(0)}k`;
}

export interface MoneyFacts {
  gbp: number | null;
  original: number | null;
  currency: string | null;
}

/** "€1.2m (about £1.0m)" for foreign-currency fines, "£614k" for sterling. */
export function describeMoney(m: MoneyFacts): string | null {
  const gbp = m.gbp !== null && Number.isFinite(m.gbp) ? m.gbp : null;
  const cur = (m.currency ?? 'GBP').toUpperCase();
  if (gbp === null || gbp < 1_000) return null;
  if (cur !== 'GBP' && m.original && m.original > 0) {
    return `${formatMoney(m.original, cur)} (about ${formatMoney(gbp)})`;
  }
  return formatMoney(gbp);
}

export type MeasureKind = 'fine' | 'periodic penalty payment' | 'administrative penalty (BfJ)';

/**
 * What kind of monetary measure this is, so we never call everything a "fine".
 * Zwangsgeld is a periodic penalty payment to compel compliance; an Ordnungsgeld
 * from the Bundesamt für Justiz is an administrative penalty for late filings.
 * Detection reads the original text; that text is never shown to the reader.
 */
export function measureKind(...texts: Array<string | null | undefined>): MeasureKind {
  const text = texts.filter(Boolean).join(' ');
  if (/zwangsgeld|periodic penalty/i.test(text)) return 'periodic penalty payment';
  if (/ordnungsgeld|bundesamt für justiz|federal office of justice|\bBfJ\b/i.test(text)) return 'administrative penalty (BfJ)';
  return 'fine';
}

/** Headline for a monetary action, with the verb that matches the measure. */
export function monetaryHeadline(firm: string, kind: MeasureKind, money: string): string {
  return kind === 'fine' ? `${firm} fined ${money}` : `${firm}: ${kind} of ${money}`;
}

/**
 * An English one-line description built only from structured fields. Used when
 * the stored summary is in another language or missing, so a reader never sees
 * foreign-language prose and nothing is invented.
 */
export function describeActionInEnglish(row: {
  regulator: string;
  firm_name: string;
  breach_type?: string | null;
  money: MoneyFacts;
  /** Original text, used only to classify the measure. */
  measureText?: string | null;
}): string {
  const money = describeMoney(row.money);
  const breach = (row.breach_type ?? '').trim();
  const reg = row.regulator;
  const firm = row.firm_name || 'the firm';
  if (money) {
    const kind = measureKind(row.measureText, breach);
    const lead = kind === 'fine' ? `${reg} fined ${firm} ${money}` : `${reg} imposed ${/^[aeiou]/i.test(kind) ? 'an' : 'a'} ${kind} of ${money} on ${firm}`;
    return `${lead}${breach ? ` — ${breach}` : ''}.`;
  }
  const generic = /^(fca |bafin )?enforcement action$/i.test(breach);
  return `${reg} ${generic || !breach ? 'enforcement action' : `action: ${breach}`} against ${firm}. No fine amount is recorded.`;
}
