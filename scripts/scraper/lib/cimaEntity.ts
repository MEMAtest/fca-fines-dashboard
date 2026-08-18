/**
 * Firm-name extraction for CIMA (Cayman Islands Monetary Authority).
 *
 * The scraper previously read the party name out of each item's PARAGRAPH,
 * which on cima.ky always opens with the same boilerplate ("The Cayman Islands
 * Monetary Authority (the "Authority") has imposed discretionary administrative
 * fines totalling CI$..."). No company pattern matched and the first sentence
 * exceeded the length guard, so every row fell through to the generic
 * `Enforcement Action <date>` placeholder. All 13 CIMA rows in the canonical
 * table carried that placeholder, which `isGarbageFirmName` then filtered,
 * leaving the hub with no table at all.
 *
 * The party name is in the HEADLINE. Observed shapes on the live listings
 * (verified 2026-08-18 against /administrative-fines and /enforcement-notices):
 *
 *   "Cayman Islands Monetary Authority Fines Blacktower (Cayman) Ltd. CI$85,043.84"
 *   "CIMA Withdraws Fines Against Sterling Asset Management International"
 *   "OneTRADEx Ltd. - In Official Liquidation"
 *   "Global Fidelity Bank, Ltd. (In Official Liquidation) - Licence Revoked"
 *   "Provisional Liquidation - ONETRADEX LTD"
 *   "Appointment of Controllers - Premier Assurance Group SPC Ltd"
 *   "Termination of Struck or Dissolved Entities"   <- genuinely no party
 *
 * Bulk notices naming no party return null. That is deliberate: inventing a
 * name for them would put a fabricated party in an evidence product. The caller
 * leaves those rows without an entity so the display filter keeps excluding
 * them.
 */

/** Separators CIMA uses between a party and an action. Includes en/em dashes. */
const SEPARATOR = /\s+[–—-]\s+/;

/**
 * Left-hand phrases that are an ACTION, not a party. When the headline is
 * "<action> - <party>" the party is on the right.
 */
const ACTION_PREFIXES = [
  /^appointment of controllers?$/i,
  /^provisional liquidation$/i,
  /^controllership$/i,
  /^official liquidation$/i,
  /^licence revoked$/i,
  /^license revoked$/i,
  /^winding up$/i,
  /^cancellation of licence$/i,
  /^extract[\s-]*decision notice$/i,
  /^decision notice$/i,
  /^public statement$/i,
];

/**
 * Headlines that describe a bulk administrative sweep rather than a named
 * party. These legitimately have no entity.
 */
const BULK_NOTICES = [
  /struck (and|or) dissolved/i,
  /^termination of struck/i,
  /^public (notice|warning)/i,
  /^warning notice/i,
  /^general (industry|public) notice/i,
];

/** Trailing monetary amount, e.g. "CI$85,043.84" or "CI$2". */
const TRAILING_AMOUNT = /\s*(?:CI|US|KY)?\$\s*[\d,]+(?:\.\d+)?\s*$/i;

function tidy(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/[\s,;:.–—-]+$/u, "")
    .trim();
}

/**
 * True when a fragment reads like a party rather than a description. Requires
 * either a corporate suffix or at least two capitalised words, which keeps
 * "In Official Liquidation" and "Licence Revoked" out.
 */
function looksLikeParty(value: string): boolean {
  const v = tidy(value);
  if (v.length < 3 || v.length > 120) return false;
  // A bare action phrase is title-cased and multi-word, so it would otherwise
  // pass the capitalised-words fallback below.
  if (ACTION_PREFIXES.some((re) => re.test(v))) return false;
  if (/^in\s+(official|provisional)\s+liquidation$/i.test(v)) return false;
  if (/^(in|the|an?)\s/i.test(v) && !/\b(ltd|limited|inc|llc|plc|corp)\b/i.test(v)) {
    return false;
  }
  if (
    /\b(ltd|ltd\.|limited|inc|inc\.|llc|l\.l\.c|plc|corp|corporation|company|bank|s\.a|n\.v|b\.v|spc|group|holdings|international|partners|capital|management|assurance|insurance|re)\b/i.test(
      v,
    )
  ) {
    return true;
  }
  const capitalised = v
    .split(/\s+/)
    .filter((word) => /^[A-Z][A-Za-z&.'()]*$/.test(word) || /^[A-Z]{2,}$/.test(word));
  return capitalised.length >= 2;
}

/**
 * Extract the party a CIMA notice concerns, or null when the notice names none.
 */
export function extractCimaEntity(headline: string): string | null {
  const text = tidy(headline ?? "");
  if (!text) return null;

  if (BULK_NOTICES.some((re) => re.test(text))) return null;

  // "Cayman Islands Monetary Authority Fines <party> CI$<amount>"
  const finesMatch = text.match(
    /^(?:the\s+)?(?:cayman islands monetary authority|cima)\s+fines\s+(.+)$/i,
  );
  if (finesMatch) {
    const party = tidy(finesMatch[1].replace(TRAILING_AMOUNT, ""));
    if (looksLikeParty(party)) return party;
  }

  // "Cayman Islands Monetary Authority Imposes Administrative Fine of CI$72,800 on <party>"
  // Anchored to the "imposes ... fine ... on" shape so a bare " on " elsewhere
  // in a headline cannot trigger it.
  const imposesMatch = text.match(
    /\bimposes?\b.*?\bfines?\b.*?\bon\s+(.+)$/i,
  );
  if (imposesMatch) {
    const party = tidy(imposesMatch[1].replace(TRAILING_AMOUNT, ""));
    if (looksLikeParty(party)) return party;
  }

  // "<Registration/Licence> Cancelled|Revoked|Suspended for <party>", e.g.
  // "Mutual Fund Registration Cancelled for Praesidium Investment Fund",
  // "Banking Licence Revoked for Trade and Commerce Bank".
  const forMatch = text.match(
    /\b(?:cancelled|canceled|revoked|suspended|withdrawn)\s+for\s+(.+)$/i,
  );
  if (forMatch) {
    const party = tidy(forMatch[1].replace(TRAILING_AMOUNT, ""));
    if (looksLikeParty(party)) return party;
  }

  // "CIMA Withdraws Fines Against <party>" / "... Action Against <party>"
  const againstMatch = text.match(/\bagainst\s+(.+)$/i);
  if (againstMatch) {
    const party = tidy(againstMatch[1].replace(TRAILING_AMOUNT, ""));
    if (looksLikeParty(party)) return party;
  }

  // "<party> - <action>" or "<action> - <party>"
  if (SEPARATOR.test(text)) {
    const parts = text.split(SEPARATOR).map(tidy).filter(Boolean);
    if (parts.length >= 2) {
      const [left, ...rest] = parts;
      const right = rest.join(" - ");
      if (ACTION_PREFIXES.some((re) => re.test(left))) {
        if (looksLikeParty(right)) return right;
      }
      if (looksLikeParty(left)) return left;
      if (looksLikeParty(right)) return right;
    }
  }

  // "<party> Official Liquidation" with no separator, e.g. "Beechwood Re Official Liquidation".
  const trailingAction = text.match(
    /^(.+?)\s+(?:official liquidation|provisional liquidation|licence revoked|license revoked|controllership)$/i,
  );
  if (trailingAction) {
    const party = tidy(trailingAction[1]);
    if (looksLikeParty(party)) return party;
  }

  // A bare party name with no action clause.
  const stripped = tidy(text.replace(TRAILING_AMOUNT, ""));
  if (looksLikeParty(stripped)) return stripped;

  return null;
}
