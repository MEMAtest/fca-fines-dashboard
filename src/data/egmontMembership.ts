/**
 * Egmont Group of Financial Intelligence Units — membership register.
 *
 * The Egmont Group is the global network of Financial Intelligence Units (FIUs)
 * that securely exchange financial-crime intelligence to combat money laundering
 * and terrorist financing. Membership signals a jurisdiction has an operational,
 * internationally connected FIU — a licence-clean framework signal for country
 * pages (a National-regulators / FIU line in the Regulators & legal framework card).
 *
 * Provenance — compiled 17 July 2026 from the official Egmont Group directory:
 *   Members by region:
 *     https://egmontgroup.org/members-by-region/
 *   Member FIU information (full directory, per-region FIU names/acronyms):
 *     https://egmontgroup.org/members-by-region/eg-member-fiu-information/
 *   Cross-checked against the Egmont Group FAQ (182 member FIUs, as published) and
 *   the Wikipedia consolidated roster (Cyprus, Georgia, Pakistan and Seychelles
 *   confirmed as members, absent from the truncated directory fetch).
 *
 * FIU names/acronyms are stored where cheaply extractable from the directory;
 * where an acronym was not reliably attributable, the entry carries membership
 * only (no `fiu`). Keyed by ISO 3166-1 alpha-2 (see countries.ts).
 */

export const EGMONT_SOURCE_URL = "https://egmontgroup.org/members-by-region/";

/** Date this membership register was last compiled/verified. */
export const EGMONT_REVIEWED = "2026-07-17";

export interface EgmontMember {
  iso2: string;
  /** FIU name or acronym, where cheaply extractable from the directory. */
  fiu?: string;
}

/**
 * Egmont Group member jurisdictions, keyed by ISO2. Compiled from the official
 * Egmont "Members by region" directory (Europe I & II, Eurasia, Asia & Pacific,
 * Americas, West & Central Africa, East & Southern Africa, MENA).
 */
export const EGMONT_MEMBERS: EgmontMember[] = [
  // ── Europe I ──
  { iso2: "AT", fiu: "A-FIU" },
  { iso2: "BE", fiu: "CTIF-CFI" },
  { iso2: "BG", fiu: "FID-SANS" },
  { iso2: "HR", fiu: "AMLO" },
  { iso2: "CY", fiu: "MOKAS" },
  { iso2: "CZ", fiu: "FAU" },
  { iso2: "DK", fiu: "FIU-Denmark" },
  { iso2: "EE", fiu: "Estonian FIU" },
  { iso2: "FI", fiu: "FIU Finland" },
  { iso2: "FR", fiu: "TRACFIN" },
  { iso2: "DE", fiu: "FIU" },
  { iso2: "GR", fiu: "Hellenic FIU" },
  { iso2: "HU", fiu: "HFIU" },
  { iso2: "IS" },
  { iso2: "IE", fiu: "FIU-Ireland" },
  { iso2: "IT", fiu: "UIF" },
  { iso2: "LV", fiu: "FID" },
  { iso2: "LI", fiu: "EFFI" },
  { iso2: "LT", fiu: "FCIS" },
  { iso2: "LU", fiu: "CRF" },
  { iso2: "MT", fiu: "FIAU" },
  { iso2: "NL", fiu: "FIU-Netherlands" },
  { iso2: "NO", fiu: "EFE" },
  { iso2: "PL", fiu: "GIIF" },
  { iso2: "PT", fiu: "UIF" },
  { iso2: "RO", fiu: "ONPCSB" },
  { iso2: "SK" },
  { iso2: "SI", fiu: "OMLP" },
  { iso2: "ES", fiu: "SEPBLAC" },
  { iso2: "SE", fiu: "FIPO" },
  { iso2: "CH", fiu: "MROS" },
  // ── Europe II ──
  { iso2: "AL", fiu: "GDPML" },
  { iso2: "AD", fiu: "UIFAND" },
  { iso2: "AM", fiu: "FMC" },
  { iso2: "AZ", fiu: "FMS" },
  { iso2: "BA", fiu: "FID" },
  { iso2: "GE", fiu: "FMS Georgia" },
  { iso2: "GI", fiu: "GFIU" },
  { iso2: "GG", fiu: "FIS" },
  { iso2: "VA", fiu: "ASIF" }, // Holy See / Vatican City
  { iso2: "IM", fiu: "FIU-IOM" },
  { iso2: "IL", fiu: "IMPA" },
  { iso2: "JE", fiu: "JFCU" },
  { iso2: "XK", fiu: "NJIF-K" }, // Kosovo
  { iso2: "MD", fiu: "SPCSB" },
  { iso2: "MC", fiu: "SICFIN" },
  { iso2: "ME" },
  { iso2: "MK", fiu: "MLPD" },
  { iso2: "SM", fiu: "AIF" },
  { iso2: "RS", fiu: "APML" },
  { iso2: "TR", fiu: "MASAK" },
  { iso2: "UA", fiu: "SFMS" },
  { iso2: "GB", fiu: "UKFIU (NCA)" },
  // ── Eurasia ──
  { iso2: "BY", fiu: "DFM" },
  { iso2: "KZ", fiu: "CFM" },
  { iso2: "KG", fiu: "FIS" },
  { iso2: "RU", fiu: "Rosfinmonitoring" },
  { iso2: "TJ", fiu: "FMD" },
  { iso2: "TM", fiu: "FMS" },
  { iso2: "UZ" },
  // ── Asia & Pacific ──
  { iso2: "AU", fiu: "AUSTRAC" },
  { iso2: "BD", fiu: "BFIU" },
  { iso2: "BT", fiu: "FID Bhutan" },
  { iso2: "BN", fiu: "FIU Brunei" },
  { iso2: "KH", fiu: "CAFIU" },
  { iso2: "CK", fiu: "CIFIU" },
  { iso2: "FJ", fiu: "Fiji FIU" },
  { iso2: "HK", fiu: "JFIU" },
  { iso2: "IN", fiu: "FIU-IND" },
  { iso2: "ID", fiu: "INTRAC" },
  { iso2: "JP", fiu: "JAFIC" },
  { iso2: "LA", fiu: "AMLIO" },
  { iso2: "MO", fiu: "GIF" },
  { iso2: "MY", fiu: "UPWBNM" },
  { iso2: "MV", fiu: "MMA-FIU" },
  { iso2: "MH", fiu: "RMI-FIU" },
  { iso2: "MN", fiu: "FIU-Mongolia" },
  { iso2: "NP", fiu: "FIU-Nepal" },
  { iso2: "NZ", fiu: "FIU-NZ" },
  { iso2: "NU", fiu: "FIU-Niue" },
  { iso2: "PK", fiu: "FMU" },
  { iso2: "PG", fiu: "FASU" },
  { iso2: "PH", fiu: "AMLC" },
  { iso2: "KR", fiu: "KoFIU" },
  { iso2: "WS", fiu: "SFIU" }, // Samoa
  { iso2: "SG", fiu: "STRO" },
  { iso2: "SB", fiu: "SIFIU" },
  { iso2: "LK", fiu: "FIU Sri Lanka" },
  { iso2: "TW", fiu: "AMLD" },
  { iso2: "TH", fiu: "AMLO" },
  { iso2: "TL", fiu: "UIF Timor-Leste" },
  { iso2: "VU", fiu: "FIU-VU" },
  // ── Americas ──
  { iso2: "AI", fiu: "MLRA" },
  { iso2: "AG", fiu: "ONDCP" },
  { iso2: "AR", fiu: "UIF" },
  { iso2: "AW", fiu: "FIU-Aruba" },
  { iso2: "BS", fiu: "FIU-Bahamas" },
  { iso2: "BB", fiu: "AMLA" },
  { iso2: "BZ", fiu: "FIU-Belize" },
  { iso2: "BM", fiu: "FIA" },
  { iso2: "BO", fiu: "UIF" },
  { iso2: "BR", fiu: "COAF" },
  { iso2: "CA", fiu: "FINTRAC" },
  { iso2: "KY", fiu: "FRA" },
  { iso2: "CL", fiu: "UAF" },
  { iso2: "CO", fiu: "UIAF" },
  { iso2: "CR", fiu: "UAF" },
  { iso2: "CU", fiu: "DGIOF" },
  { iso2: "CW", fiu: "FIU Curaçao" },
  { iso2: "DM", fiu: "FIU-Dominica" },
  { iso2: "DO", fiu: "UAF" },
  { iso2: "EC", fiu: "UAFE" },
  { iso2: "SV", fiu: "UIF" },
  { iso2: "GD", fiu: "FIU-Grenada" },
  { iso2: "GT", fiu: "IVE" },
  { iso2: "GY", fiu: "FIU-Guyana" },
  { iso2: "HN", fiu: "UIF" },
  { iso2: "JM", fiu: "FID-Jamaica" },
  { iso2: "MX", fiu: "UIF" },
  { iso2: "PA", fiu: "UAF-Panama" },
  { iso2: "PY", fiu: "SEPRELAD" },
  { iso2: "PE", fiu: "UIF-Peru" },
  { iso2: "KN", fiu: "FIU-KN" },
  { iso2: "LC", fiu: "FIA" },
  { iso2: "VC", fiu: "FIU-VC" },
  { iso2: "SX", fiu: "MOT-SM" },
  { iso2: "SR", fiu: "FIU Suriname" },
  { iso2: "TT", fiu: "FIUTT" },
  { iso2: "TC", fiu: "FIA-TCI" },
  { iso2: "US", fiu: "FinCEN" },
  { iso2: "UY", fiu: "UIAF" },
  { iso2: "VE", fiu: "UNIF" },
  { iso2: "VG", fiu: "FIA" }, // British Virgin Islands
  // ── West & Central Africa ──
  { iso2: "BJ", fiu: "CENTIF-Benin" },
  { iso2: "BF", fiu: "CENTIF-BF" },
  { iso2: "CM", fiu: "NAFI" },
  { iso2: "CV", fiu: "UIF Cape Verde" },
  { iso2: "TD", fiu: "ANIF-Tchad" },
  { iso2: "CG", fiu: "ANIF-Congo" },
  { iso2: "CI", fiu: "CENTIF-CI" },
  { iso2: "GQ", fiu: "ANIF" },
  { iso2: "GA", fiu: "NAFI-Gabon" },
  { iso2: "GM", fiu: "FIU-The Gambia" },
  { iso2: "GH", fiu: "FIC-Ghana" },
  { iso2: "LR", fiu: "FIA-Liberia" },
  { iso2: "ML", fiu: "CENTIF-Mali" },
  { iso2: "NE", fiu: "CENTIF-Niger" },
  { iso2: "NG", fiu: "NFIU" },
  { iso2: "SN", fiu: "CENTIF" },
  { iso2: "SL", fiu: "FIU Sierra Leone" },
  { iso2: "TG", fiu: "CENTIF-Togo" },
  // ── East & Southern Africa ──
  { iso2: "AO", fiu: "UIF-Angola" },
  { iso2: "BW", fiu: "FIA-Botswana" },
  { iso2: "ET", fiu: "EFIS" },
  { iso2: "KE", fiu: "FRC Kenya" },
  { iso2: "LS", fiu: "FIU-Lesotho" },
  { iso2: "MW", fiu: "FIA-Malawi" },
  { iso2: "MU", fiu: "FIU-Mauritius" },
  { iso2: "MZ", fiu: "GIFiM" },
  { iso2: "NA", fiu: "FIC-Namibia" },
  { iso2: "SC", fiu: "Seychelles FIU" },
  { iso2: "ZA", fiu: "FIC" },
  { iso2: "TZ", fiu: "TFIU" },
  { iso2: "UG", fiu: "Uganda-FIA" },
  { iso2: "ZM", fiu: "FIC-Zambia" },
  { iso2: "ZW", fiu: "FIU-Zimbabwe" },
  // ── Middle East & North Africa ──
  { iso2: "DZ", fiu: "CTRF" },
  { iso2: "BH", fiu: "Bahrain FIU" },
  { iso2: "EG", fiu: "EMLCU" },
  { iso2: "IQ", fiu: "IQFIU" },
  { iso2: "JO", fiu: "AMLCTFU" },
  { iso2: "KW", fiu: "KwFIU" },
  { iso2: "LB", fiu: "SIC" },
  { iso2: "MA", fiu: "ANRF" },
  { iso2: "OM", fiu: "NCFI" },
  { iso2: "PS", fiu: "FFU-Palestine" },
  { iso2: "QA", fiu: "QFIU" },
  { iso2: "SA", fiu: "SAFIU" },
  { iso2: "SD", fiu: "FIUSU" },
  { iso2: "SY", fiu: "CMLC" },
  { iso2: "TN", fiu: "CTAF" },
  { iso2: "AE", fiu: "UAE FIU" },
];

const BY_ISO2 = new Map<string, EgmontMember>(
  EGMONT_MEMBERS.map((m) => [m.iso2, m]),
);

/** True if the jurisdiction's FIU is an Egmont Group member. */
export function isEgmontMember(iso2: string): boolean {
  return BY_ISO2.has(iso2.toUpperCase());
}

/** The Egmont member record (with FIU name where held), or undefined. */
export function getEgmontMember(iso2: string): EgmontMember | undefined {
  return BY_ISO2.get(iso2.toUpperCase());
}

/** ISO2 codes of all Egmont member jurisdictions. */
export function egmontMemberIso2(): string[] {
  return EGMONT_MEMBERS.map((m) => m.iso2);
}
