/**
 * FATF listing status — curated, factual, source-of-truth for Stage-1 country pages.
 *
 * FATF publishes two lists three times a year (Feb / Jun / Oct plenaries):
 *   - "call-for-action"     = the black list (High-Risk Jurisdictions)
 *   - "increased-monitoring" = the grey list (Jurisdictions Under Increased Monitoring)
 *
 * This is curated, not scraped: FATF (fatf-gafi.org) is Cloudflare-protected and
 * publishes prose statements, not a data feed. The values below are FACTS extracted
 * from the plenary outcome and cited; a diff-verification job (Stage 1) re-checks the
 * FATF page each plenary and alerts on drift rather than auto-writing.
 *
 * Provenance: FATF Plenary, Paris, 17–19 June 2026 (confirmed across FATF outcome +
 * multiple compliance trackers). Keyed by ISO 3166-1 alpha-2 (see countries.ts).
 */

export type FatfListing = "call-for-action" | "increased-monitoring";

export interface FatfStatus {
  iso2: string;
  listing: FatfListing;
  /** ISO date first listed in the CURRENT spell, where reliably known. */
  since?: string;
  /** Plenary that last reviewed/confirmed the status. */
  lastReviewed: string;
  note?: string;
}

export interface FatfChange {
  date: string; // plenary date
  iso2: string;
  change: "added" | "removed";
  listing: FatfListing;
}

/** Last plenary reflected in this data, and the next scheduled review. */
export const FATF_LAST_PLENARY = "2026-06-19";
export const FATF_NEXT_PLENARY = "2026-10"; // October 2026 plenary (approx.)
export const FATF_SOURCE_URL =
  "https://www.fatf-gafi.org/en/countries/black-and-grey-lists.html";

// Black list — High-Risk Jurisdictions Subject to a Call for Action (unchanged Jun 2026).
const BLACK: FatfStatus[] = [
  { iso2: "IR", listing: "call-for-action", lastReviewed: FATF_LAST_PLENARY, note: "Subject to call for action and countermeasures." },
  { iso2: "KP", listing: "call-for-action", lastReviewed: FATF_LAST_PLENARY, note: "Subject to call for action and countermeasures." },
  { iso2: "MM", listing: "call-for-action", lastReviewed: FATF_LAST_PLENARY, note: "Subject to call for action (enhanced due diligence)." },
];

// Grey list — Jurisdictions Under Increased Monitoring (22 as of Jun 2026 plenary).
const GREY: FatfStatus[] = [
  { iso2: "AO", listing: "increased-monitoring", lastReviewed: FATF_LAST_PLENARY },
  { iso2: "BO", listing: "increased-monitoring", lastReviewed: FATF_LAST_PLENARY },
  { iso2: "BA", listing: "increased-monitoring", since: FATF_LAST_PLENARY, lastReviewed: FATF_LAST_PLENARY, note: "Added to increased monitoring at the June 2026 plenary." },
  { iso2: "BG", listing: "increased-monitoring", lastReviewed: FATF_LAST_PLENARY },
  { iso2: "CM", listing: "increased-monitoring", lastReviewed: FATF_LAST_PLENARY },
  { iso2: "CI", listing: "increased-monitoring", lastReviewed: FATF_LAST_PLENARY },
  { iso2: "CD", listing: "increased-monitoring", lastReviewed: FATF_LAST_PLENARY },
  { iso2: "HT", listing: "increased-monitoring", lastReviewed: FATF_LAST_PLENARY },
  { iso2: "IQ", listing: "increased-monitoring", since: FATF_LAST_PLENARY, lastReviewed: FATF_LAST_PLENARY, note: "Added to increased monitoring at the June 2026 plenary." },
  { iso2: "KE", listing: "increased-monitoring", lastReviewed: FATF_LAST_PLENARY },
  { iso2: "KW", listing: "increased-monitoring", lastReviewed: FATF_LAST_PLENARY },
  { iso2: "LA", listing: "increased-monitoring", lastReviewed: FATF_LAST_PLENARY },
  { iso2: "LB", listing: "increased-monitoring", lastReviewed: FATF_LAST_PLENARY },
  { iso2: "MC", listing: "increased-monitoring", lastReviewed: FATF_LAST_PLENARY },
  { iso2: "NP", listing: "increased-monitoring", lastReviewed: FATF_LAST_PLENARY },
  { iso2: "PG", listing: "increased-monitoring", lastReviewed: FATF_LAST_PLENARY },
  { iso2: "SS", listing: "increased-monitoring", lastReviewed: FATF_LAST_PLENARY },
  { iso2: "SY", listing: "increased-monitoring", lastReviewed: FATF_LAST_PLENARY },
  { iso2: "VE", listing: "increased-monitoring", lastReviewed: FATF_LAST_PLENARY },
  { iso2: "VN", listing: "increased-monitoring", lastReviewed: FATF_LAST_PLENARY },
  { iso2: "VG", listing: "increased-monitoring", lastReviewed: FATF_LAST_PLENARY, note: "British Virgin Islands." },
  { iso2: "YE", listing: "increased-monitoring", lastReviewed: FATF_LAST_PLENARY },
];

export const FATF_STATUS: FatfStatus[] = [...BLACK, ...GREY];

/**
 * Grey-list jurisdictions whose action-plan progress was reviewed/updated at the
 * last plenary (not added or removed — a substantive status note). Curated from
 * the June 2026 plenary outcome.
 */
export const FATF_UPDATED_THIS_CYCLE: string[] = [
  "BO", // Bolivia
  "BG", // Bulgaria
  "CD", // Democratic Republic of the Congo
  "KE", // Kenya
  "MC", // Monaco
  "SY", // Syria
  "VN", // Vietnam
];

export function isFatfUpdatedThisCycle(iso2: string): boolean {
  return FATF_UPDATED_THIS_CYCLE.includes(iso2.toUpperCase());
}

/** Most recent plenary changes — powers the "recent changes" / status-history content. */
export const FATF_RECENT_CHANGES: FatfChange[] = [
  { date: "2026-06-19", iso2: "IQ", change: "added", listing: "increased-monitoring" },
  { date: "2026-06-19", iso2: "BA", change: "added", listing: "increased-monitoring" },
  { date: "2026-06-19", iso2: "DZ", change: "removed", listing: "increased-monitoring" }, // Algeria
  { date: "2026-06-19", iso2: "NA", change: "removed", listing: "increased-monitoring" }, // Namibia
];

// ── Accessors ────────────────────────────────────────────────────────────────

const BY_ISO2 = new Map<string, FatfStatus>(FATF_STATUS.map((s) => [s.iso2, s]));

export function getFatfStatus(iso2: string): FatfStatus | undefined {
  return BY_ISO2.get(iso2.toUpperCase());
}

export function isFatfListed(iso2: string): boolean {
  return BY_ISO2.has(iso2.toUpperCase());
}

/** ISO2 codes of all currently listed jurisdictions (black + grey). */
export function fatfListedIso2(): string[] {
  return FATF_STATUS.map((s) => s.iso2);
}

export function fatfLabel(listing: FatfListing): string {
  return listing === "call-for-action" ? "Black list" : "Grey list";
}
