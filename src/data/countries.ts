/**
 * Canonical country reference — the keystone for RegActions Country Risk Reports.
 *
 * Every country-risk artefact (FATF status, sanctions, WGI, enforcement rollups)
 * keys off the ISO codes here. `resolveCountry()` reconciles the many name
 * variants that appear across source data (FATF "Democratic People's Republic of
 * Korea", OFAC "Korea, North", WGI "Korea, Dem. People's Rep.", enforcement "GB"
 * pseudo-codes, crown dependencies absent from WGI, Kosovo/Taiwan/Türkiye naming).
 *
 * Source of truth is curated (not scraped) — it changes at most a few times a
 * decade. Region grouping mirrors the World Bank / UN M49 macro-regions used by
 * the risk pillars.
 */

export type CountryRegion =
  | "Africa"
  | "Americas"
  | "Asia Pacific"
  | "Europe"
  | "Middle East"
  | "Offshore / IFC";

export interface Country {
  iso2: string; // ISO 3166-1 alpha-2 (primary key everywhere)
  iso3: string; // ISO 3166-1 alpha-3
  name: string; // canonical display name (house style)
  region: CountryRegion;
  subregion: string;
  unMember: boolean;
  /** iso2 of the sovereign parent for dependencies/territories (e.g. JE -> GB). */
  parent?: string;
  /** extra names/spellings seen in source feeds, for resolveCountry(). */
  aliases?: string[];
}

/** Flag emoji from an ISO alpha-2 code (regional indicator symbols). */
export function flagEmoji(iso2: string): string {
  if (!/^[A-Za-z]{2}$/.test(iso2)) return "🏳️";
  const cps = iso2
    .toUpperCase()
    .split("")
    .map((ch) => 0x1f1e6 + (ch.charCodeAt(0) - 65));
  return String.fromCodePoint(...cps);
}

// Compact constructor — keeps the table one line per country.
function c(
  iso2: string,
  iso3: string,
  name: string,
  region: CountryRegion,
  subregion: string,
  opts: { unMember?: boolean; parent?: string; aliases?: string[] } = {},
): Country {
  return {
    iso2,
    iso3,
    name,
    region,
    subregion,
    unMember: opts.unMember ?? true,
    parent: opts.parent,
    aliases: opts.aliases,
  };
}

export const COUNTRIES: Country[] = [
  // ── Africa ────────────────────────────────────────────────────────────────
  c("DZ", "DZA", "Algeria", "Africa", "North Africa"),
  c("AO", "AGO", "Angola", "Africa", "Central Africa"),
  c("BJ", "BEN", "Benin", "Africa", "West Africa"),
  c("BW", "BWA", "Botswana", "Africa", "Southern Africa"),
  c("BF", "BFA", "Burkina Faso", "Africa", "West Africa"),
  c("BI", "BDI", "Burundi", "Africa", "East Africa"),
  c("CV", "CPV", "Cabo Verde", "Africa", "West Africa", { aliases: ["Cape Verde"] }),
  c("CM", "CMR", "Cameroon", "Africa", "Central Africa"),
  c("CF", "CAF", "Central African Republic", "Africa", "Central Africa"),
  c("TD", "TCD", "Chad", "Africa", "Central Africa"),
  c("KM", "COM", "Comoros", "Africa", "East Africa"),
  c("CG", "COG", "Republic of the Congo", "Africa", "Central Africa", { aliases: ["Congo", "Congo, Rep."] }),
  c("CD", "COD", "Democratic Republic of the Congo", "Africa", "Central Africa", { aliases: ["Congo, Dem. Rep.", "DR Congo", "DRC"] }),
  c("CI", "CIV", "Côte d'Ivoire", "Africa", "West Africa", { aliases: ["Ivory Coast", "Cote d'Ivoire"] }),
  c("DJ", "DJI", "Djibouti", "Africa", "East Africa"),
  c("EG", "EGY", "Egypt", "Africa", "North Africa", { aliases: ["Egypt, Arab Rep."] }),
  c("GQ", "GNQ", "Equatorial Guinea", "Africa", "Central Africa"),
  c("ER", "ERI", "Eritrea", "Africa", "East Africa"),
  c("SZ", "SWZ", "Eswatini", "Africa", "Southern Africa", { aliases: ["Swaziland"] }),
  c("ET", "ETH", "Ethiopia", "Africa", "East Africa"),
  c("GA", "GAB", "Gabon", "Africa", "Central Africa"),
  c("GM", "GMB", "The Gambia", "Africa", "West Africa", { aliases: ["Gambia", "Gambia, The"] }),
  c("GH", "GHA", "Ghana", "Africa", "West Africa"),
  c("GN", "GIN", "Guinea", "Africa", "West Africa"),
  c("GW", "GNB", "Guinea-Bissau", "Africa", "West Africa"),
  c("KE", "KEN", "Kenya", "Africa", "East Africa"),
  c("LS", "LSO", "Lesotho", "Africa", "Southern Africa"),
  c("LR", "LBR", "Liberia", "Africa", "West Africa"),
  c("LY", "LBY", "Libya", "Africa", "North Africa"),
  c("MG", "MDG", "Madagascar", "Africa", "East Africa"),
  c("MW", "MWI", "Malawi", "Africa", "East Africa"),
  c("ML", "MLI", "Mali", "Africa", "West Africa"),
  c("MR", "MRT", "Mauritania", "Africa", "West Africa"),
  c("MU", "MUS", "Mauritius", "Africa", "East Africa"),
  c("MA", "MAR", "Morocco", "Africa", "North Africa"),
  c("MZ", "MOZ", "Mozambique", "Africa", "East Africa"),
  c("NA", "NAM", "Namibia", "Africa", "Southern Africa"),
  c("NE", "NER", "Niger", "Africa", "West Africa"),
  c("NG", "NGA", "Nigeria", "Africa", "West Africa"),
  c("RW", "RWA", "Rwanda", "Africa", "East Africa"),
  c("ST", "STP", "São Tomé and Príncipe", "Africa", "Central Africa", { aliases: ["Sao Tome and Principe"] }),
  c("SN", "SEN", "Senegal", "Africa", "West Africa"),
  c("SC", "SYC", "Seychelles", "Africa", "East Africa"),
  c("SL", "SLE", "Sierra Leone", "Africa", "West Africa"),
  c("SO", "SOM", "Somalia", "Africa", "East Africa"),
  c("ZA", "ZAF", "South Africa", "Africa", "Southern Africa"),
  c("SS", "SSD", "South Sudan", "Africa", "East Africa"),
  c("SD", "SDN", "Sudan", "Africa", "North Africa"),
  c("TZ", "TZA", "Tanzania", "Africa", "East Africa"),
  c("TG", "TGO", "Togo", "Africa", "West Africa"),
  c("TN", "TUN", "Tunisia", "Africa", "North Africa"),
  c("UG", "UGA", "Uganda", "Africa", "East Africa"),
  c("ZM", "ZMB", "Zambia", "Africa", "East Africa"),
  c("ZW", "ZWE", "Zimbabwe", "Africa", "East Africa"),

  // ── Americas ──────────────────────────────────────────────────────────────
  c("AR", "ARG", "Argentina", "Americas", "South America"),
  c("BO", "BOL", "Bolivia", "Americas", "South America"),
  c("BR", "BRA", "Brazil", "Americas", "South America"),
  c("CA", "CAN", "Canada", "Americas", "North America"),
  c("CL", "CHL", "Chile", "Americas", "South America"),
  c("CO", "COL", "Colombia", "Americas", "South America"),
  c("CR", "CRI", "Costa Rica", "Americas", "Central America"),
  c("CU", "CUB", "Cuba", "Americas", "Caribbean"),
  c("DO", "DOM", "Dominican Republic", "Americas", "Caribbean"),
  c("EC", "ECU", "Ecuador", "Americas", "South America"),
  c("SV", "SLV", "El Salvador", "Americas", "Central America"),
  c("GT", "GTM", "Guatemala", "Americas", "Central America"),
  c("GY", "GUY", "Guyana", "Americas", "South America"),
  c("HT", "HTI", "Haiti", "Americas", "Caribbean"),
  c("HN", "HND", "Honduras", "Americas", "Central America"),
  c("JM", "JAM", "Jamaica", "Americas", "Caribbean"),
  c("MX", "MEX", "Mexico", "Americas", "North America"),
  c("NI", "NIC", "Nicaragua", "Americas", "Central America"),
  c("PA", "PAN", "Panama", "Americas", "Central America"),
  c("PY", "PRY", "Paraguay", "Americas", "South America"),
  c("PE", "PER", "Peru", "Americas", "South America"),
  c("SR", "SUR", "Suriname", "Americas", "South America"),
  c("TT", "TTO", "Trinidad and Tobago", "Americas", "Caribbean"),
  c("US", "USA", "United States", "Americas", "North America", { aliases: ["USA", "United States of America"] }),
  c("UY", "URY", "Uruguay", "Americas", "South America"),
  c("VE", "VEN", "Venezuela", "Americas", "South America", { aliases: ["Venezuela, RB"] }),

  // ── Asia Pacific ──────────────────────────────────────────────────────────
  c("AF", "AFG", "Afghanistan", "Asia Pacific", "South Asia"),
  c("AU", "AUS", "Australia", "Asia Pacific", "Oceania"),
  c("BD", "BGD", "Bangladesh", "Asia Pacific", "South Asia"),
  c("BT", "BTN", "Bhutan", "Asia Pacific", "South Asia"),
  c("BN", "BRN", "Brunei", "Asia Pacific", "Southeast Asia", { aliases: ["Brunei Darussalam"] }),
  c("KH", "KHM", "Cambodia", "Asia Pacific", "Southeast Asia"),
  c("CN", "CHN", "China", "Asia Pacific", "East Asia"),
  c("FJ", "FJI", "Fiji", "Asia Pacific", "Oceania"),
  c("IN", "IND", "India", "Asia Pacific", "South Asia"),
  c("ID", "IDN", "Indonesia", "Asia Pacific", "Southeast Asia"),
  c("JP", "JPN", "Japan", "Asia Pacific", "East Asia"),
  c("KZ", "KAZ", "Kazakhstan", "Asia Pacific", "Central Asia"),
  c("KP", "PRK", "North Korea", "Asia Pacific", "East Asia", { aliases: ["Korea, North", "Korea, Dem. People's Rep.", "Democratic People's Republic of Korea", "DPRK"] }),
  c("KR", "KOR", "South Korea", "Asia Pacific", "East Asia", { aliases: ["Korea, South", "Korea, Rep.", "Republic of Korea"] }),
  c("KG", "KGZ", "Kyrgyzstan", "Asia Pacific", "Central Asia", { aliases: ["Kyrgyz Republic"] }),
  c("LA", "LAO", "Laos", "Asia Pacific", "Southeast Asia", { aliases: ["Lao PDR"] }),
  c("MY", "MYS", "Malaysia", "Asia Pacific", "Southeast Asia"),
  c("MV", "MDV", "Maldives", "Asia Pacific", "South Asia"),
  c("MN", "MNG", "Mongolia", "Asia Pacific", "East Asia"),
  c("MM", "MMR", "Myanmar", "Asia Pacific", "Southeast Asia", { aliases: ["Burma"] }),
  c("NP", "NPL", "Nepal", "Asia Pacific", "South Asia"),
  c("NZ", "NZL", "New Zealand", "Asia Pacific", "Oceania"),
  c("PK", "PAK", "Pakistan", "Asia Pacific", "South Asia"),
  c("PG", "PNG", "Papua New Guinea", "Asia Pacific", "Oceania"),
  c("PH", "PHL", "Philippines", "Asia Pacific", "Southeast Asia"),
  c("WS", "WSM", "Samoa", "Asia Pacific", "Oceania"),
  c("SG", "SGP", "Singapore", "Asia Pacific", "Southeast Asia"),
  c("LK", "LKA", "Sri Lanka", "Asia Pacific", "South Asia"),
  c("TW", "TWN", "Taiwan", "Asia Pacific", "East Asia", { unMember: false, aliases: ["Taiwan, China", "Chinese Taipei", "Taiwan Province of China"] }),
  c("TJ", "TJK", "Tajikistan", "Asia Pacific", "Central Asia"),
  c("TH", "THA", "Thailand", "Asia Pacific", "Southeast Asia"),
  c("TL", "TLS", "Timor-Leste", "Asia Pacific", "Southeast Asia", { aliases: ["East Timor"] }),
  c("TM", "TKM", "Turkmenistan", "Asia Pacific", "Central Asia"),
  c("UZ", "UZB", "Uzbekistan", "Asia Pacific", "Central Asia"),
  c("VU", "VUT", "Vanuatu", "Asia Pacific", "Oceania"),
  c("VN", "VNM", "Vietnam", "Asia Pacific", "Southeast Asia", { aliases: ["Viet Nam"] }),
  c("HK", "HKG", "Hong Kong", "Asia Pacific", "East Asia", { unMember: false, parent: "CN", aliases: ["Hong Kong SAR, China"] }),
  c("MO", "MAC", "Macau", "Asia Pacific", "East Asia", { unMember: false, parent: "CN", aliases: ["Macao", "Macao SAR, China"] }),

  // ── Europe ────────────────────────────────────────────────────────────────
  c("AL", "ALB", "Albania", "Europe", "Southern Europe"),
  c("AD", "AND", "Andorra", "Europe", "Southern Europe"),
  c("AT", "AUT", "Austria", "Europe", "Western Europe"),
  c("BY", "BLR", "Belarus", "Europe", "Eastern Europe"),
  c("BE", "BEL", "Belgium", "Europe", "Western Europe"),
  c("BA", "BIH", "Bosnia and Herzegovina", "Europe", "Southern Europe"),
  c("BG", "BGR", "Bulgaria", "Europe", "Eastern Europe"),
  c("HR", "HRV", "Croatia", "Europe", "Southern Europe"),
  c("CY", "CYP", "Cyprus", "Europe", "Southern Europe"),
  c("CZ", "CZE", "Czechia", "Europe", "Eastern Europe", { aliases: ["Czech Republic"] }),
  c("DK", "DNK", "Denmark", "Europe", "Northern Europe"),
  c("EE", "EST", "Estonia", "Europe", "Northern Europe"),
  c("FI", "FIN", "Finland", "Europe", "Northern Europe"),
  c("FR", "FRA", "France", "Europe", "Western Europe"),
  c("DE", "DEU", "Germany", "Europe", "Western Europe"),
  c("GR", "GRC", "Greece", "Europe", "Southern Europe"),
  c("HU", "HUN", "Hungary", "Europe", "Eastern Europe"),
  c("IS", "ISL", "Iceland", "Europe", "Northern Europe"),
  c("IE", "IRL", "Ireland", "Europe", "Northern Europe"),
  c("IT", "ITA", "Italy", "Europe", "Southern Europe"),
  c("XK", "XKX", "Kosovo", "Europe", "Southern Europe", { unMember: false, aliases: ["Republic of Kosovo"] }),
  c("LV", "LVA", "Latvia", "Europe", "Northern Europe"),
  c("LI", "LIE", "Liechtenstein", "Europe", "Western Europe"),
  c("LT", "LTU", "Lithuania", "Europe", "Northern Europe"),
  c("LU", "LUX", "Luxembourg", "Europe", "Western Europe"),
  c("MT", "MLT", "Malta", "Europe", "Southern Europe"),
  c("MD", "MDA", "Moldova", "Europe", "Eastern Europe"),
  c("MC", "MCO", "Monaco", "Europe", "Western Europe"),
  c("ME", "MNE", "Montenegro", "Europe", "Southern Europe"),
  c("NL", "NLD", "Netherlands", "Europe", "Western Europe"),
  c("MK", "MKD", "North Macedonia", "Europe", "Southern Europe", { aliases: ["Macedonia", "North Macedonia, Rep."] }),
  c("NO", "NOR", "Norway", "Europe", "Northern Europe"),
  c("PL", "POL", "Poland", "Europe", "Eastern Europe"),
  c("PT", "PRT", "Portugal", "Europe", "Southern Europe"),
  c("RO", "ROU", "Romania", "Europe", "Eastern Europe"),
  c("RU", "RUS", "Russia", "Europe", "Eastern Europe", { aliases: ["Russian Federation"] }),
  c("SM", "SMR", "San Marino", "Europe", "Southern Europe"),
  c("RS", "SRB", "Serbia", "Europe", "Southern Europe"),
  c("SK", "SVK", "Slovakia", "Europe", "Eastern Europe", { aliases: ["Slovak Republic"] }),
  c("SI", "SVN", "Slovenia", "Europe", "Southern Europe"),
  c("ES", "ESP", "Spain", "Europe", "Southern Europe"),
  c("SE", "SWE", "Sweden", "Europe", "Northern Europe"),
  c("CH", "CHE", "Switzerland", "Europe", "Western Europe"),
  c("UA", "UKR", "Ukraine", "Europe", "Eastern Europe"),
  c("GB", "GBR", "United Kingdom", "Europe", "Northern Europe", { aliases: ["UK", "Great Britain", "United Kingdom of Great Britain and Northern Ireland"] }),
  c("VA", "VAT", "Vatican City", "Europe", "Southern Europe", { unMember: false, aliases: ["Holy See"] }),

  // ── Middle East ───────────────────────────────────────────────────────────
  c("BH", "BHR", "Bahrain", "Middle East", "Gulf"),
  c("IR", "IRN", "Iran", "Middle East", "Western Asia", { aliases: ["Iran, Islamic Rep.", "Islamic Republic of Iran"] }),
  c("IQ", "IRQ", "Iraq", "Middle East", "Western Asia"),
  c("IL", "ISR", "Israel", "Middle East", "Western Asia"),
  c("JO", "JOR", "Jordan", "Middle East", "Western Asia"),
  c("KW", "KWT", "Kuwait", "Middle East", "Gulf"),
  c("LB", "LBN", "Lebanon", "Middle East", "Western Asia"),
  c("OM", "OMN", "Oman", "Middle East", "Gulf"),
  c("PS", "PSE", "Palestine", "Middle East", "Western Asia", { unMember: false, aliases: ["West Bank and Gaza", "State of Palestine"] }),
  c("QA", "QAT", "Qatar", "Middle East", "Gulf"),
  c("SA", "SAU", "Saudi Arabia", "Middle East", "Gulf"),
  c("SY", "SYR", "Syria", "Middle East", "Western Asia", { aliases: ["Syrian Arab Republic"] }),
  c("TR", "TUR", "Türkiye", "Middle East", "Western Asia", { aliases: ["Turkey", "Turkiye"] }),
  c("AE", "ARE", "United Arab Emirates", "Middle East", "Gulf", { aliases: ["UAE"] }),
  c("YE", "YEM", "Yemen", "Middle East", "Western Asia", { aliases: ["Yemen, Rep."] }),

  // ── Offshore / IFC (crown dependencies, overseas territories, IFCs) ────────
  c("JE", "JEY", "Jersey", "Offshore / IFC", "Crown Dependency", { unMember: false, parent: "GB" }),
  c("GG", "GGY", "Guernsey", "Offshore / IFC", "Crown Dependency", { unMember: false, parent: "GB" }),
  c("IM", "IMN", "Isle of Man", "Offshore / IFC", "Crown Dependency", { unMember: false, parent: "GB" }),
  c("GI", "GIB", "Gibraltar", "Offshore / IFC", "British Overseas Territory", { unMember: false, parent: "GB" }),
  c("KY", "CYM", "Cayman Islands", "Offshore / IFC", "British Overseas Territory", { unMember: false, parent: "GB" }),
  c("BM", "BMU", "Bermuda", "Offshore / IFC", "British Overseas Territory", { unMember: false, parent: "GB" }),
  c("VG", "VGB", "British Virgin Islands", "Offshore / IFC", "British Overseas Territory", { unMember: false, parent: "GB", aliases: ["Virgin Islands, British"] }),
  c("TC", "TCA", "Turks and Caicos Islands", "Offshore / IFC", "British Overseas Territory", { unMember: false, parent: "GB" }),
  c("BS", "BHS", "Bahamas", "Offshore / IFC", "Caribbean", { aliases: ["Bahamas, The"] }),
  c("BB", "BRB", "Barbados", "Offshore / IFC", "Caribbean"),
  c("AG", "ATG", "Antigua and Barbuda", "Offshore / IFC", "Caribbean"),
];

// ── Accessors ────────────────────────────────────────────────────────────────

const BY_ISO2 = new Map<string, Country>();
const BY_ISO3 = new Map<string, Country>();
const BY_ALIAS = new Map<string, Country>(); // normalised name/alias -> country

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/[.,'’]/g, "").replace(/\s+/g, " ");
}

for (const country of COUNTRIES) {
  BY_ISO2.set(country.iso2, country);
  BY_ISO3.set(country.iso3, country);
  BY_ALIAS.set(norm(country.name), country);
  for (const a of country.aliases ?? []) BY_ALIAS.set(norm(a), country);
}

export function getCountryByIso2(iso2: string): Country | undefined {
  return BY_ISO2.get(iso2.toUpperCase());
}

export function getCountryByIso3(iso3: string): Country | undefined {
  return BY_ISO3.get(iso3.toUpperCase());
}

/**
 * Reconcile an arbitrary source token (ISO2/ISO3/name/alias) to a canonical
 * Country. Handles the cross-feed naming drift (FATF/OFAC/WGI/enforcement).
 * Returns undefined for genuinely unknown tokens (e.g. the "EU" pseudo-code).
 */
export function resolveCountry(token: string | null | undefined): Country | undefined {
  if (!token) return undefined;
  const t = token.trim();
  if (/^[A-Za-z]{2}$/.test(t)) {
    const hit = BY_ISO2.get(t.toUpperCase());
    if (hit) return hit;
  }
  if (/^[A-Za-z]{3}$/.test(t)) {
    const hit = BY_ISO3.get(t.toUpperCase());
    if (hit) return hit;
  }
  return BY_ALIAS.get(norm(t));
}

const BY_SLUG = new Map<string, Country>();

export function getCountryBySlug(slug: string): Country | undefined {
  if (BY_SLUG.size === 0) {
    for (const country of COUNTRIES) BY_SLUG.set(countrySlug(country), country);
  }
  return BY_SLUG.get(slug.toLowerCase());
}

export function countrySlug(country: Country): string {
  return country.name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
