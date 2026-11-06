import type { CountryIndexEntry } from "../data/countryView.js";
import { fatfLabel } from "../data/fatfStatus.js";
import { sanctionsTierLabel } from "../data/sanctionsStatus.js";
import { unscoredStatusLabel } from "../data/unscoredStatus.js";
import { countryRiskV3BandLabel, countryRiskV3ResultKindLabel } from "../data/countryRiskV3Presentation.js";
import { csvCell, csvFooterRow } from "./csvFile.js";

/**
 * CSV export for the countries overview / ratings table.
 *
 * Separate from `utils/export.ts`, whose `exportData` is typed to
 * `FineRecord[]`; country rows are a different shape and forcing them through
 * it would need a cast that defeats the typing.
 */

/** Columns exactly as shown in the Countries overview table. */
export const COUNTRY_CSV_COLUMNS = [
  "Rank",
  "Country",
  "Risk score",
  "Risk",
  "Region",
  "FATF",
  "International sanctions",
] as const;

export const COUNTRY_CSV_SOURCE =
  "RegActions country risk v3 (FATF, World Bank WGI, UN/UK/EU/US sanctions; TI CPI context only)";

/** Re-exported: the guard lives in csvFile.ts so every export shares one implementation. */
export const escapeCsvValue = csvCell;

export interface CountryCsvOptions {
  /** Global rank per ISO2 as shown in the table; falls back to list position. */
  rankOf?: ReadonlyMap<string, number>;
  asOf?: string;
}

export function buildCountryCsv(rows: CountryIndexEntry[], options: CountryCsvOptions = {}): string {
  const header = COUNTRY_CSV_COLUMNS.map(csvCell).join(",");
  const lines = rows.map((e, index) =>
    [
      options.rankOf?.get(e.country.iso2) ?? index + 1,
      e.country.name,
      // Blank rather than 0 for unscored countries: 0 would read as "no risk".
      e.score === null ? "" : e.score.toFixed(1),
      e.band
        ? `${countryRiskV3BandLabel(e.band)} \u00b7 ${countryRiskV3ResultKindLabel(e.resultKind)}${e.nearThreshold ? " \u00b7 near threshold" : ""}`
        : unscoredStatusLabel(e.country.iso2),
      e.country.region,
      e.fatf ? fatfLabel(e.fatf.listing) : "Not listed",
      e.sanctionsCoverageComplete
        ? e.sanctionsTier
          ? sanctionsTierLabel(e.sanctionsTier)
          : "No direct country restrictions"
        : "Information incomplete",
    ]
      .map(csvCell)
      .join(","),
  );
  const asOf = options.asOf ?? new Date().toISOString().slice(0, 10);
  return [header, ...lines, csvFooterRow(COUNTRY_CSV_SOURCE, asOf, "https://regactions.com/countries")].join("\n");
}

export function countryCsvFilename(today: string): string {
  return `regactions-country-risk-${today}.csv`;
}
