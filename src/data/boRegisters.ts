/**
 * Beneficial-ownership (BO) register availability, per jurisdiction.
 *
 * A licence-clean framework signal for country pages: does the jurisdiction run
 * a live beneficial-ownership register, and can the general public access it, or
 * only competent authorities / obliged entities? Public UBO registers are a
 * material AML/CFT transparency signal (they make it harder to hide behind shell
 * companies), so a one-line "BO register: Public" / "Restricted" flag is a cheap,
 * high-value addition next to the FATF, sanctions and Egmont signals.
 *
 * Source & licence — Open Ownership "Worldwide action on beneficial ownership
 * transparency" map (CC BY 4.0). Compiled 17 July 2026 from the official map
 * country-data download:
 *   Map:  https://www.openownership.org/en/map/
 *   Data: https://www.openownership.org/en/map/oo_all_country_data.csv
 *   Licence: Creative Commons Attribution 4.0 International (CC BY 4.0)
 *            https://creativecommons.org/licenses/by/4.0/
 *
 * We surface only the facts the source publishes: it records live registers and,
 * per register, which audiences may access them ("Who can access"). We do NOT
 * invent an access taxonomy — the source's own audience field drives the flag:
 *
 *   - "General public" is among the register's audiences  -> live-public
 *   - only competent authorities / obliged entities        -> live-restricted
 *
 * Where a country runs several registers (e.g. the UK's Companies House PSC
 * register, the Register of Overseas Entities and HMRC's Trust Registration),
 * the most-open register is taken, so the UK resolves to a public register (its
 * PSC register, live since 2016) and the US to a restricted register (FinCEN's
 * Beneficial Ownership Information System, 2024). Countries the source does not
 * list as running a live register are simply absent (treated as "none identified"
 * by getBoRegister — the source does not confirm a register for them).
 *
 * Two ISO2 codes present in the source (GL Greenland, SH Saint Helena) are not
 * RegActions-profiled jurisdictions and are omitted so every entry resolves in
 * countries.ts.
 *
 * Keyed by ISO 3166-1 alpha-2 (see countries.ts).
 */

export const BO_REGISTERS_SOURCE_URL = "https://www.openownership.org/en/map/";

/** Open Ownership map data download this register was compiled from. */
export const BO_REGISTERS_DATA_URL =
  "https://www.openownership.org/en/map/oo_all_country_data.csv";

/** Data licence — Open Ownership map (CC BY 4.0). */
export const BO_REGISTERS_LICENCE = "CC BY 4.0";
export const BO_REGISTERS_LICENCE_URL =
  "https://creativecommons.org/licenses/by/4.0/";

/** Date this register availability data was last compiled/verified. */
export const BO_REGISTERS_REVIEWED = "2026-07-17";

/**
 * BO register status. Only statuses the source publishes are used:
 *  - `live-public`     — a live register the general public can access.
 *  - `live-restricted` — a live register limited to competent authorities /
 *                        obliged entities (no general-public access).
 */
export type BoRegisterStatus = "live-public" | "live-restricted";

export interface BoRegister {
  iso2: string;
  status: BoRegisterStatus;
  /** Year (or YYYY-MM) the register launched, where the source records it. */
  since?: string;
}

/**
 * Live beneficial-ownership registers, keyed by ISO2. Compiled from the Open
 * Ownership map country-data download (CC BY 4.0); the most-open register per
 * country is taken where several exist. Countries absent here are not confirmed
 * by the source as running a live register.
 */
export const BO_REGISTERS: BoRegister[] = [
  { iso2: "AI", status: "live-restricted", since: "2022" },  // Anguilla
  { iso2: "AL", status: "live-public", since: "2021" },  // Albania
  { iso2: "AM", status: "live-public", since: "2020" },  // Armenia
  { iso2: "AR", status: "live-restricted", since: "2020" },  // Argentina
  { iso2: "AT", status: "live-restricted", since: "2018" },  // Austria
  { iso2: "BA", status: "live-restricted" },  // Bosnia and Herzegovina
  { iso2: "BE", status: "live-restricted", since: "2018" },  // Belgium
  { iso2: "BG", status: "live-public", since: "2019" },  // Bulgaria
  { iso2: "BM", status: "live-restricted", since: "2018" },  // Bermuda
  { iso2: "BN", status: "live-restricted", since: "2021" },  // Brunei Darussalam
  { iso2: "BR", status: "live-restricted", since: "2017" },  // Brazil
  { iso2: "BW", status: "live-public", since: "2019" },  // Botswana
  { iso2: "BZ", status: "live-restricted", since: "2023" },  // Belize
  { iso2: "CA", status: "live-public", since: "2024" },  // Canada
  { iso2: "CD", status: "live-public" },  // Democratic Republic of the Congo
  { iso2: "CN", status: "live-restricted", since: "2024" },  // China
  { iso2: "CO", status: "live-restricted", since: "2022" },  // Colombia
  { iso2: "CR", status: "live-restricted", since: "2019" },  // Costa Rica
  { iso2: "CY", status: "live-restricted", since: "2022" },  // Cyprus
  { iso2: "CZ", status: "live-public", since: "2021" },  // Czech Republic
  { iso2: "DE", status: "live-restricted", since: "2017" },  // Germany
  { iso2: "DK", status: "live-public", since: "2017" },  // Denmark
  { iso2: "DZ", status: "live-public", since: "2023" },  // Algeria
  { iso2: "EC", status: "live-public" },  // Ecuador
  { iso2: "EE", status: "live-public", since: "2018" },  // Estonia
  { iso2: "EG", status: "live-restricted", since: "2020" },  // Egypt
  { iso2: "ES", status: "live-public", since: "2018" },  // Spain
  { iso2: "FI", status: "live-restricted", since: "2019" },  // Finland
  { iso2: "FR", status: "live-public", since: "2018" },  // France
  { iso2: "GB", status: "live-public", since: "2016" },  // United Kingdom (Companies House PSC register)
  { iso2: "GG", status: "live-restricted", since: "2018" },  // Guernsey
  { iso2: "GH", status: "live-public", since: "2020" },  // Ghana
  { iso2: "GI", status: "live-public", since: "2020" },  // Gibraltar
  { iso2: "GR", status: "live-restricted", since: "2021" },  // Greece
  { iso2: "GY", status: "live-public" },  // Guyana
  { iso2: "HR", status: "live-restricted", since: "2020" },  // Croatia
  { iso2: "HU", status: "live-public", since: "2021" },  // Hungary
  { iso2: "ID", status: "live-public", since: "2019" },  // Indonesia
  { iso2: "IE", status: "live-restricted", since: "2019" },  // Ireland
  { iso2: "IM", status: "live-restricted", since: "2017" },  // Isle of Man
  { iso2: "IN", status: "live-restricted", since: "2018" },  // India
  { iso2: "IS", status: "live-public", since: "2019" },  // Iceland
  { iso2: "IT", status: "live-public", since: "2023" },  // Italy
  { iso2: "JE", status: "live-restricted", since: "2021" },  // Jersey
  { iso2: "JM", status: "live-restricted", since: "2023" },  // Jamaica
  { iso2: "JP", status: "live-restricted", since: "2022" },  // Japan
  { iso2: "KE", status: "live-public", since: "2020" },  // Kenya
  { iso2: "KN", status: "live-restricted" },  // Saint Kitts and Nevis
  { iso2: "KW", status: "live-restricted", since: "2025" },  // Kuwait
  { iso2: "KY", status: "live-restricted", since: "2017" },  // Cayman Islands
  { iso2: "KZ", status: "live-restricted", since: "2023" },  // Kazakhstan
  { iso2: "LT", status: "live-public", since: "2022" },  // Lithuania
  { iso2: "LU", status: "live-restricted", since: "2019" },  // Luxembourg
  { iso2: "LV", status: "live-public", since: "2017" },  // Latvia
  { iso2: "MA", status: "live-public", since: "2022" },  // Morocco
  { iso2: "MC", status: "live-public", since: "2018" },  // Monaco
  { iso2: "MK", status: "live-public", since: "2021" },  // North Macedonia
  { iso2: "MN", status: "live-public", since: "2022" },  // Mongolia
  { iso2: "MS", status: "live-restricted", since: "2024" },  // Montserrat
  { iso2: "MT", status: "live-restricted", since: "2018" },  // Malta
  { iso2: "MU", status: "live-restricted", since: "2020" },  // Mauritius
  { iso2: "MW", status: "live-public", since: "2022" },  // Malawi
  { iso2: "MY", status: "live-public", since: "2024" },  // Malaysia
  { iso2: "NA", status: "live-public", since: "2023" },  // Namibia
  { iso2: "NG", status: "live-public", since: "2022" },  // Nigeria
  { iso2: "NI", status: "live-restricted", since: "2021" },  // Nicaragua
  { iso2: "NL", status: "live-restricted", since: "2020" },  // Netherlands
  { iso2: "NO", status: "live-restricted", since: "2024" },  // Norway
  { iso2: "PA", status: "live-restricted", since: "2020" },  // Panama
  { iso2: "PE", status: "live-restricted", since: "2021" },  // Peru
  { iso2: "PH", status: "live-public", since: "2021" },  // Philippines
  { iso2: "PL", status: "live-public", since: "2019" },  // Poland
  { iso2: "PT", status: "live-public", since: "2018" },  // Portugal
  { iso2: "PY", status: "live-restricted", since: "2020" },  // Paraguay
  { iso2: "QA", status: "live-restricted", since: "2021" },  // Qatar
  { iso2: "RO", status: "live-public", since: "2019" },  // Romania
  { iso2: "RS", status: "live-public", since: "2018" },  // Serbia
  { iso2: "RW", status: "live-restricted", since: "2023" },  // Rwanda
  { iso2: "SC", status: "live-restricted" },  // Seychelles
  { iso2: "SE", status: "live-public", since: "2017" },  // Sweden
  { iso2: "SG", status: "live-restricted", since: "2020" },  // Singapore
  { iso2: "SI", status: "live-public", since: "2019" },  // Slovenia
  { iso2: "SK", status: "live-public", since: "2018" },  // Slovak Republic
  { iso2: "SN", status: "live-public" },  // Senegal
  { iso2: "TC", status: "live-restricted", since: "2019" },  // Turks and Caicos Islands
  { iso2: "TJ", status: "live-public", since: "2021" },  // Tajikistan
  { iso2: "TR", status: "live-restricted", since: "2021" },  // Turkey
  { iso2: "TT", status: "live-public", since: "2020" },  // Trinidad and Tobago
  { iso2: "TZ", status: "live-restricted", since: "2021" },  // Tanzania
  { iso2: "UA", status: "live-public", since: "2015" },  // Ukraine
  { iso2: "US", status: "live-restricted", since: "2024" },  // United States (FinCEN BOIS)
  { iso2: "UY", status: "live-restricted", since: "2017" },  // Uruguay
  { iso2: "VG", status: "live-restricted", since: "2017" },  // British Virgin Islands
  { iso2: "ZA", status: "live-restricted", since: "2023" },  // South Africa
  { iso2: "ZM", status: "live-public", since: "2019" },  // Zambia
];

const BY_ISO2 = new Map<string, BoRegister>(
  BO_REGISTERS.map((r) => [r.iso2, r]),
);

/** The BO register record for a jurisdiction, or undefined if none identified. */
export function getBoRegister(iso2: string): BoRegister | undefined {
  return BY_ISO2.get(iso2.toUpperCase());
}

/** Short human label for the BO register status ("Public" | "Restricted"). */
export function boRegisterLabel(status: BoRegisterStatus): string {
  return status === "live-public" ? "Public" : "Restricted";
}

/**
 * One-line framework-signal value for a jurisdiction's BO register, e.g.
 * "Public (live since 2016)" / "Restricted access" / "None identified".
 * Deterministic and derived only from the sourced data (never invented).
 */
export function boRegisterSignal(iso2: string): string {
  const reg = getBoRegister(iso2);
  if (!reg) return "None identified";
  const label = boRegisterLabel(reg.status);
  return reg.since ? `${label} (live since ${reg.since})` : `${label} (live)`;
}

/** ISO2 codes of all jurisdictions with a live BO register in the source. */
export function boRegisterIso2(): string[] {
  return BO_REGISTERS.map((r) => r.iso2);
}
