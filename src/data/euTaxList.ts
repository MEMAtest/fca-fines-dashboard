/**
 * EU list of non-cooperative jurisdictions for tax purposes — "Annex I" (the
 * tax blacklist). A licence-clean, curated framework signal for country pages.
 *
 * The Council of the EU updates the list twice a year (typically February and
 * October). Annex I names jurisdictions that have failed to engage constructively
 * on tax good-governance or to deliver on their commitments (tax transparency,
 * fair taxation, BEPS minimum standards).
 *
 * Provenance — verified 17 July 2026 against the 17 February 2026 Council update:
 *   Council press release (17 Feb 2026):
 *     https://www.consilium.europa.eu/en/press/press-releases/2026/02/17/taxation-council-updates-the-eu-list-of-non-cooperative-jurisdictions-for-tax-purposes/
 *   Policy page (Annex I, current list):
 *     https://www.consilium.europa.eu/en/policies/eu-list-of-non-cooperative-jurisdictions/
 *   Cross-checked: KPMG EU Tax Centre ETF-574; Weil Tax blog (17 Feb 2026).
 *
 * The 17 Feb 2026 update added Vietnam and the Turks and Caicos Islands, and
 * removed Fiji, Samoa and Trinidad and Tobago. Next scheduled revision: Oct 2026.
 *
 * Keyed by ISO 3166-1 alpha-2 (see countries.ts).
 */

export const EU_TAX_LIST_SOURCE_URL =
  "https://www.consilium.europa.eu/en/policies/eu-list-of-non-cooperative-jurisdictions/";

/** Date of the Council update reflected in this data. */
export const EU_TAX_LIST_REVIEWED = "2026-02-17";

/**
 * Genuine deltas of the 17 Feb 2026 Council update (per the press release):
 * additions and removals only. Long-listed jurisdictions were re-confirmed,
 * which is NOT a change and must not be presented as one.
 */
export const EU_TAX_LIST_CHANGES: {
  date: string;
  added: { iso2: string; name: string }[];
  removed: { iso2: string; name: string }[];
} = {
  date: EU_TAX_LIST_REVIEWED,
  added: [
    { iso2: "VN", name: "Vietnam" },
    { iso2: "TC", name: "Turks and Caicos Islands" },
  ],
  removed: [
    { iso2: "FJ", name: "Fiji" },
    { iso2: "WS", name: "Samoa" },
    { iso2: "TT", name: "Trinidad and Tobago" },
  ],
};

/** Next scheduled Council revision of the list. */
export const EU_TAX_LIST_NEXT_REVIEW = "2026-10";

export interface EuTaxListing {
  iso2: string;
  /** Display name as published by the Council (for provenance / QA). */
  name: string;
}

/**
 * Annex I — the EU list of non-cooperative jurisdictions for tax purposes,
 * as adopted on 17 February 2026 (10 jurisdictions). Full Council wording:
 * "American Samoa, Anguilla, Guam, Palau, Panama, the Russian Federation,
 *  Turks and Caicos, US Virgin Islands, Vanuatu and Viet Nam."
 */
export const EU_TAX_LIST: EuTaxListing[] = [
  { iso2: "AS", name: "American Samoa" },
  { iso2: "AI", name: "Anguilla" },
  { iso2: "GU", name: "Guam" },
  { iso2: "PW", name: "Palau" },
  { iso2: "PA", name: "Panama" },
  { iso2: "RU", name: "Russia" }, // Russian Federation
  { iso2: "TC", name: "Turks and Caicos Islands" },
  { iso2: "VI", name: "US Virgin Islands" },
  { iso2: "VU", name: "Vanuatu" },
  { iso2: "VN", name: "Vietnam" }, // Viet Nam
];

const LISTED_ISO2 = new Set<string>(EU_TAX_LIST.map((e) => e.iso2));

/** True if the jurisdiction is on the EU tax blacklist (Annex I). */
export function isEuTaxListed(iso2: string): boolean {
  return LISTED_ISO2.has(iso2.toUpperCase());
}

/** ISO2 codes of all Annex I jurisdictions. */
export function euTaxListedIso2(): string[] {
  return EU_TAX_LIST.map((e) => e.iso2);
}
