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
 * Provenance: official FATF black/grey-list publication for the Paris plenary,
 * 17–19 June 2026, directly reverified through a browser on 16 July 2026.
 * Keyed by ISO 3166-1 alpha-2 (see countries.ts).
 */

export type FatfListing = "call-for-action" | "increased-monitoring";

export interface FatfStatus {
  iso2: string;
  listing: FatfListing;
  /** FATF's required treatment for call-for-action jurisdictions. */
  requiredAction?: "countermeasures" | "enhanced-due-diligence";
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
/** Last direct verification of both official list pages (Playwright browser check). */
export const FATF_VERIFIED_AT = "2026-07-16";
/** SHA-256 of the official page HTML retained by the latest verification run. */
export const FATF_LIST_SHA256 = "844e7892b6c6589aca8648f9f24ea907473357e43e20181fc8478adae61de531";
export const FATF_NEXT_PLENARY = "2026-10"; // October 2026 plenary (month precision)
/**
 * Scheduled start of the next FATF plenary, for the live countdown. The October
 * 2026 plenary is scheduled for 26-30 October 2026 (Paris, first under the UK
 * Presidency), confirmed on the FATF events calendar:
 *   https://www.fatf-gafi.org/en/calendars/events.html
 */
export const FATF_NEXT_PLENARY_START = "2026-10-26";
export const FATF_SOURCE_URL =
  "https://www.fatf-gafi.org/en/countries/black-and-grey-lists.html";

// Black list — High-Risk Jurisdictions Subject to a Call for Action (unchanged Jun 2026).
const BLACK: FatfStatus[] = [
  { iso2: "IR", listing: "call-for-action", requiredAction: "countermeasures", lastReviewed: FATF_LAST_PLENARY, note: "Subject to call for action and countermeasures." },
  { iso2: "KP", listing: "call-for-action", requiredAction: "countermeasures", lastReviewed: FATF_LAST_PLENARY, note: "Subject to call for action and countermeasures." },
  { iso2: "MM", listing: "call-for-action", requiredAction: "enhanced-due-diligence", lastReviewed: FATF_LAST_PLENARY, note: "Subject to call for action (enhanced due diligence)." },
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

/**
 * Most recent (current-cycle) plenary changes — powers the "this cycle" added /
 * removed content and the "New" badge. Kept scoped to the LATEST plenary so the
 * "newly added / removed this cycle" semantics stay honest; the full multi-cycle
 * history lives in FATF_CHANGE_LOG below.
 */
export const FATF_RECENT_CHANGES: FatfChange[] = [
  { date: "2026-06-19", iso2: "IQ", change: "added", listing: "increased-monitoring" },
  { date: "2026-06-19", iso2: "BA", change: "added", listing: "increased-monitoring" },
  { date: "2026-06-19", iso2: "DZ", change: "removed", listing: "increased-monitoring" }, // Algeria
  { date: "2026-06-19", iso2: "NA", change: "removed", listing: "increased-monitoring" }, // Namibia
];

/**
 * Multi-cycle plenary change-log — drives the tracker's change-log section.
 * Newest-first. Every prior cycle below was verified against the official FATF
 * plenary-outcome and increased-monitoring pages (URLs cited); changes are not
 * inferred from secondary summaries alone.
 *
 * Paris plenary, 17-19 June 2026 (added Iraq + Bosnia & Herzegovina; removed
 * Algeria + Namibia; grey list = 22):
 *   https://www.fatf-gafi.org/en/publications/Fatfgeneral/outcomes-fatf-plenary-june-2026.html
 *
 * Plenary, 9-13 February 2026 (added Kuwait + Papua New Guinea; no removals) —
 * increased-monitoring statement dated 13 Feb 2026:
 *   https://www.fatf-gafi.org/en/publications/High-risk-and-other-monitored-jurisdictions/increased-monitoring-february-2026.html
 *
 * Plenary, 22-24 October 2025 (removed Burkina Faso, Mozambique, Nigeria and
 * South Africa; no additions) — statement dated 24 Oct 2025:
 *   https://www.fatf-gafi.org/en/publications/High-risk-and-other-monitored-jurisdictions/increased-monitoring-october-2025.html
 *   https://www.fatf-gafi.org/en/publications/Fatfgeneral/outcomes-FATF-plenary-october-2025.html
 */
export const FATF_CHANGE_LOG: FatfChange[] = [
  ...FATF_RECENT_CHANGES,
  // Plenary, 9-13 February 2026.
  { date: "2026-02-13", iso2: "KW", change: "added", listing: "increased-monitoring" }, // Kuwait
  { date: "2026-02-13", iso2: "PG", change: "added", listing: "increased-monitoring" }, // Papua New Guinea
  // Plenary, 22-24 October 2025.
  { date: "2025-10-24", iso2: "BF", change: "removed", listing: "increased-monitoring" }, // Burkina Faso
  { date: "2025-10-24", iso2: "MZ", change: "removed", listing: "increased-monitoring" }, // Mozambique
  { date: "2025-10-24", iso2: "NG", change: "removed", listing: "increased-monitoring" }, // Nigeria
  { date: "2025-10-24", iso2: "ZA", change: "removed", listing: "increased-monitoring" }, // South Africa
];

/** A grouped plenary cycle for the change-log UI (newest-first). */
export interface FatfPlenaryCycle {
  /** Plenary end date (ISO). */
  date: string;
  /** Human label, e.g. "June 2026 plenary". */
  label: string;
  added: FatfChange[];
  removed: FatfChange[];
}

/** Group FATF_CHANGE_LOG by plenary date, newest-first, for the change-log. */
export function fatfChangesByCycle(): FatfPlenaryCycle[] {
  const byDate = new Map<string, FatfChange[]>();
  for (const c of FATF_CHANGE_LOG) {
    const arr = byDate.get(c.date) ?? [];
    arr.push(c);
    byDate.set(c.date, arr);
  }
  const monthName = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, changes]) => ({
      date,
      label: `${monthName(date)} plenary`,
      added: changes.filter((c) => c.change === "added"),
      removed: changes.filter((c) => c.change === "removed"),
    }));
}

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
