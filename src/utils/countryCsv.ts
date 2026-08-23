import type { CountryIndexEntry } from "../data/countryView.js";
import { fatfLabel } from "../data/fatfStatus.js";
import { sanctionsTierLabel } from "../data/sanctionsStatus.js";

/**
 * CSV export for the countries overview / ratings table.
 *
 * Separate from `utils/export.ts`, whose `exportData` is typed to
 * `FineRecord[]`; country rows are a different shape and forcing them through
 * it would need a cast that defeats the typing.
 */

export const COUNTRY_CSV_COLUMNS = [
  "Rank",
  "Country",
  "ISO2",
  "Region",
  "Risk score",
  "Risk band",
  "Status",
  "FATF listing",
  "Sanctions tier",
  "Control strength",
  "Enforcement exposure",
  "Result kind",
  "Near threshold",
  "Weight sensitivity range",
] as const;

/**
 * Spreadsheet formula injection guard.
 *
 * A country or region name is regulator-sourced text, and a value beginning
 * `=`, `+`, `-`, `@` (or a leading tab/CR) is executed as a formula when the
 * file is opened in Excel or Sheets. Prefixing with an apostrophe renders the
 * value as literal text. This is an evidence export that compliance teams open
 * directly, so it must not carry executable content.
 */
export function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  if (/[",\n\r]/.test(text)) {
    text = `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function bandLabelFor(band: string | null): string {
  if (!band) return "Not rated";
  return band
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function buildCountryCsv(rows: CountryIndexEntry[]): string {
  const header = COUNTRY_CSV_COLUMNS.map(escapeCsvValue).join(",");
  const lines = rows.map((entry, index) =>
    [
      index + 1,
      entry.country.name,
      entry.country.iso2,
      entry.country.region,
      // Deliberately blank rather than 0 for unscored countries: a 0 would read
      // as "no risk" when it means "not enough information".
      entry.score === null ? "" : entry.score.toFixed(1),
      bandLabelFor(entry.band),
      entry.status,
      // Reuse the same label helpers the table renders with, so the export
      // cannot drift from what the user sees on screen.
      entry.fatf ? fatfLabel(entry.fatf.listing) : "Not listed",
      entry.sanctionsTier ? sanctionsTierLabel(entry.sanctionsTier) : "None",
      entry.controlStrength === null ? "" : entry.controlStrength.toFixed(1),
      entry.enforcementExposure.toFixed(1),
      entry.resultKind ?? "",
      entry.nearThreshold ? "Yes" : "No",
      entry.sensitivityRange ? `${entry.sensitivityRange.low.toFixed(1)}-${entry.sensitivityRange.high.toFixed(1)}` : "",
    ]
      .map(escapeCsvValue)
      .join(","),
  );
  return [header, ...lines].join("\n");
}

export function countryCsvFilename(today: string): string {
  return `regactions-country-risk-${today}.csv`;
}
