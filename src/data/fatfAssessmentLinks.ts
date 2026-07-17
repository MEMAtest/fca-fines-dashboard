/**
 * FATF mutual-evaluation dates + report links — a licence-clean framework signal.
 *
 * The mutual-evaluation DATES already live in `fatfAssessmentData.ts` (generated
 * from the official FATF assessment workbooks): `assessmentDate` (when the on-site
 * evaluation concluded / MER adopted) and `ratingsDate` (when the ratings table
 * was last published). This module does NOT duplicate that data — it reads it and
 * pairs it with the public FATF country page so the country card can show:
 *
 *   "Last mutual evaluation: <year> · report →"
 *
 * linking to the jurisdiction's FATF country page, which hosts the mutual
 * evaluation report (MER) and follow-up reports. Facts and links only: no
 * licensed FATF ratings text is reproduced (the consolidated ratings table is
 * licensed; the dates and the public country-page URL are not).
 *
 * FATF country-page URL pattern (verified 17 July 2026 against real pages —
 * Malta, Germany, United Kingdom, Korea, Türkiye, Lao PDR):
 *   https://www.fatf-gafi.org/en/countries/detail/<Country>.html
 * where <Country> is the FATF English country name with each run of
 * non-alphanumeric characters replaced by a single hyphen, original word
 * capitalisation preserved (e.g. "United-Kingdom", "Lao-People-s-Democratic-Republic").
 * A few RegActions display names differ from FATF's English page name (e.g.
 * RegActions "South Korea" -> FATF "Korea"); those are handled by FATF_NAME_OVERRIDES.
 *
 * Provenance / source of truth for the URL host + pattern:
 *   FATF Countries index: https://www.fatf-gafi.org/en/countries.html
 *   Assessment ratings:   see FATF_ASSESSMENT_SOURCE in fatfAssessmentData.ts
 */

import { getCountryByIso2 } from "./countries.js";
import {
  getFatfAssessment,
  FATF_ASSESSMENT_SOURCE,
  type FatfAssessmentRecord,
} from "./fatfAssessmentData.js";

export const FATF_COUNTRY_PAGE_BASE =
  "https://www.fatf-gafi.org/en/countries/detail/";

/** Re-export the ratings source for callers that cite the dates' provenance. */
export { FATF_ASSESSMENT_SOURCE };

/**
 * RegActions display name -> FATF English country-page name, only where they
 * differ. Keyed by ISO2. Where a country is absent, the RegActions name is used
 * directly (it already matches FATF's English page name).
 */
const FATF_NAME_OVERRIDES: Record<string, string> = {
  KR: "Korea", // RegActions "South Korea" -> FATF "Korea"
  TR: "Turkey", // FATF URL slug uses "Turkey" (page title shows "Türkiye")
  CZ: "Czech Republic", // RegActions "Czechia"
  SK: "Slovak Republic", // RegActions "Slovakia"
  LA: "Lao People's Democratic Republic", // RegActions "Laos"
  VA: "Holy See", // RegActions "Vatican City"
  CD: "Democratic Republic of the Congo",
  CG: "Congo", // RegActions "Republic of the Congo" -> FATF "Congo"
  CI: "Cote d'Ivoire", // FATF uses the ASCII spelling in the slug
  VN: "Viet Nam", // RegActions "Vietnam"
  MK: "North Macedonia",
  US: "United States",
  GB: "United Kingdom",
  AE: "United Arab Emirates",
};

/**
 * Build a FATF country-page slug from an English country name: each run of
 * non-alphanumeric characters becomes a single hyphen, capitalisation preserved,
 * no leading/trailing hyphens. Matches the observed FATF URL scheme.
 */
export function fatfCountrySlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics (Türkiye -> Turkiye, handled via override anyway)
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The public FATF country-page URL for a jurisdiction, or undefined if unknown. */
export function fatfCountryUrl(iso2: string): string | undefined {
  const code = iso2.toUpperCase();
  const country = getCountryByIso2(code);
  const name = FATF_NAME_OVERRIDES[code] ?? country?.name;
  if (!name) return undefined;
  return `${FATF_COUNTRY_PAGE_BASE}${fatfCountrySlug(name)}.html`;
}

export interface FatfAssessmentLink {
  iso2: string;
  /** Mutual-evaluation year (from assessmentDate, else ratingsDate). */
  year: number;
  /** Whether the year is the on-site evaluation date or the ratings-publish date. */
  yearSource: "evaluation" | "ratings";
  /** Public FATF country page hosting the MER + follow-up reports. */
  reportUrl: string;
}

/** Extract a 4-digit year from a partial ISO date (YYYY / YYYY-MM / YYYY-MM-DD). */
function yearOf(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const m = /^(\d{4})/.exec(value);
  return m ? Number(m[1]) : undefined;
}

/**
 * FATF mutual-evaluation link + date for a jurisdiction, or undefined when there
 * is no FATF assessment record. The date is the on-site evaluation year where
 * held (assessmentDate), else the ratings-publish year (ratingsDate).
 */
export function getFatfAssessmentLink(iso2: string): FatfAssessmentLink | undefined {
  const rec: FatfAssessmentRecord | undefined = getFatfAssessment(iso2);
  if (!rec) return undefined;
  const evalYear = yearOf(rec.assessmentDate);
  const ratingsYear = yearOf(rec.ratingsDate);
  const year = evalYear ?? ratingsYear;
  if (year === undefined) return undefined;
  const url = fatfCountryUrl(iso2);
  if (!url) return undefined;
  return {
    iso2: rec.iso2,
    year,
    yearSource: evalYear !== undefined ? "evaluation" : "ratings",
    reportUrl: url,
  };
}
