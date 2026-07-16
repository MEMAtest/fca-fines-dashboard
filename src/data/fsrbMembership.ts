/**
 * FATF network membership — curated, factual, source-of-truth for the country
 * "Regulators & legal framework" module.
 *
 * The global AML/CFT network is the FATF (40 direct members) plus nine
 * FATF-Style Regional Bodies (FSRBs). Every jurisdiction assessed against the
 * FATF Recommendations sits in the network either as a direct FATF member or via
 * one (occasionally more) FSRB. A handful of isolated jurisdictions (e.g. Iran,
 * North Korea, Kosovo) belong to none; those are represented honestly as "not
 * part of the FATF regional network" rather than force-fitted.
 *
 * This is curated, not scraped: the FSRB and FATF membership sites are not data
 * feeds (several are Cloudflare-protected). Values below are FACTS compiled from
 * the official membership pages and cross-checked; a periodic re-review (see
 * FSRB_REVIEWED) re-verifies rather than auto-writing. Keyed by ISO 3166-1
 * alpha-2 (see countries.ts).
 *
 * Sources reviewed 2026-07 (official pages, plus FATF global-network mirrors used
 * where a body's own site was unreachable):
 *   FATF members ....... https://www.fatf-gafi.org/en/countries.html
 *   APG ................ https://www.apgml.org/about-us/members/overview-apg-members
 *   CFATF ............. https://www.cfatf-gafic.org/member-countries
 *   EAG ............... https://eurasiangroup.org/en/about-eag
 *   ESAAMLG ........... https://www.esaamlg.org/index.php/about
 *   GABAC ............. https://www.fatf-gafi.org/en/countries/global-network/gabac.html
 *   GIABA ............. https://www.giaba.org/about-giaba/index.html
 *   MENAFATF .......... https://www.menafatf.org/about
 *   MONEYVAL .......... https://www.coe.int/en/web/moneyval/moneyval-brief/members
 *   GAFILAT ........... https://www.gafilat.org/index.php/es/gafilat/que-es-gafilat
 *
 * Notable accuracy points captured below:
 *   - Indonesia (ID) became the 40th direct FATF member in October 2023.
 *   - Russia (RU): direct FATF membership SUSPENDED since 24 Feb 2023 (flagged
 *     `suspended`), and EXCLUDED from MONEYVAL / the Council of Europe in 2022.
 *     Russia therefore maps to EAG only, not EAG + MONEYVAL.
 *   - DR Congo (CD) is a GABAC associate member (its FSRB), not ESAAMLG.
 *   - Comoros (KM) and Sao Tome (ST) are GIABA members despite the wider region.
 *   - UK Crown Dependencies Jersey (JE) and Guernsey (GG) are individually
 *     MONEYVAL-evaluated (not covered only via the UK).
 *   - APG includes the seven Pacific island members represented in countries.ts:
 *     Cook Islands, Marshall Islands, Nauru, Niue, Palau, Solomon Islands and Tonga.
 *   - CFATF membership includes its Caribbean territories as separate assessed
 *     jurisdictions, including Anguilla, Aruba, Curaçao, Montserrat, Sint Maarten
 *     and the Turks and Caicos Islands.
 *   - MONEYVAL separately evaluates Armenia, Azerbaijan, Georgia, Gibraltar,
 *     the Holy See/Vatican City and the Isle of Man.
 */

export type FsrbCode =
  | "APG"
  | "CFATF"
  | "EAG"
  | "ESAAMLG"
  | "GABAC"
  | "GIABA"
  | "MENAFATF"
  | "MONEYVAL"
  | "GAFILAT";

export interface Fsrb {
  code: FsrbCode;
  fullName: string;
  region: string;
  url: string;
}

/** The nine FATF-Style Regional Bodies, with their official sites. */
export const FSRBS: Record<FsrbCode, Fsrb> = {
  APG: {
    code: "APG",
    fullName: "Asia/Pacific Group on Money Laundering",
    region: "Asia Pacific",
    url: "https://www.apgml.org/",
  },
  CFATF: {
    code: "CFATF",
    fullName: "Caribbean Financial Action Task Force",
    region: "Caribbean",
    url: "https://www.cfatf-gafic.org/",
  },
  EAG: {
    code: "EAG",
    fullName: "Eurasian Group on Combating Money Laundering and Financing of Terrorism",
    region: "Eurasia",
    url: "https://eurasiangroup.org/en",
  },
  ESAAMLG: {
    code: "ESAAMLG",
    fullName: "Eastern and Southern Africa Anti-Money Laundering Group",
    region: "Eastern and Southern Africa",
    url: "https://www.esaamlg.org/",
  },
  GABAC: {
    code: "GABAC",
    fullName: "Action Group against Money Laundering in Central Africa",
    region: "Central Africa",
    url: "https://www.fatf-gafi.org/en/countries/global-network/gabac.html",
  },
  GIABA: {
    code: "GIABA",
    fullName:
      "Inter Governmental Action Group against Money Laundering in West Africa",
    region: "West Africa",
    url: "https://www.giaba.org/",
  },
  MENAFATF: {
    code: "MENAFATF",
    fullName: "Middle East and North Africa Financial Action Task Force",
    region: "Middle East and North Africa",
    url: "https://www.menafatf.org/",
  },
  MONEYVAL: {
    code: "MONEYVAL",
    fullName:
      "Committee of Experts on the Evaluation of Anti-Money Laundering Measures (MONEYVAL)",
    region: "Europe",
    url: "https://www.coe.int/en/web/moneyval",
  },
  GAFILAT: {
    code: "GAFILAT",
    fullName: "Financial Action Task Force of Latin America",
    region: "Latin America",
    url: "https://www.gafilat.org/",
  },
};

/** The FATF itself, for network-context copy. */
export const FATF_BODY = {
  fullName: "Financial Action Task Force",
  url: "https://www.fatf-gafi.org/",
};

/** Date the memberships below were last re-verified against the official sources. */
export const FSRB_REVIEWED = "2026-07";

/**
 * ISO2 codes of the direct FATF members (37 active jurisdictions + Russia, whose
 * membership is suspended). The European Commission and the Gulf Co-operation
 * Council are also FATF members but are organisations, not jurisdictions, so they
 * are not represented here. Verified against fatf-gafi.org/en/countries.html.
 */
export const FATF_MEMBERS: string[] = [
  "AR", "AU", "AT", "BE", "BR", "CA", "CN", "DK", "FI", "FR",
  "DE", "GR", "HK", "IS", "IN", "ID", "IE", "IL", "IT", "JP",
  "LU", "MY", "MX", "NL", "NZ", "NO", "PT", "RU", "SA", "SG",
  "ZA", "KR", "ES", "SE", "CH", "TR", "GB", "US",
];

/** Direct FATF members whose membership is currently suspended (Russia, Feb 2023). */
export const FATF_SUSPENDED: string[] = ["RU"];

/**
 * ISO2 -> FSRB code(s). A jurisdiction can belong to more than one body (e.g. the
 * Comoros sits in GIABA; India sits in both APG and EAG). Direct FATF members are
 * frequently also FSRB members (e.g. China: FATF + EAG + APG); those FSRB
 * memberships are recorded here too. Jurisdictions genuinely in no FSRB (Iran,
 * North Korea, Kosovo) are omitted rather than guessed.
 */
export const FSRB_MEMBERSHIP: Record<string, FsrbCode[]> = {
  // ── APG (Asia/Pacific Group on Money Laundering) ──────────────────────────
  AF: ["APG"],
  AU: ["APG"],
  BD: ["APG"],
  BT: ["APG"],
  BN: ["APG"],
  KH: ["APG"],
  CK: ["APG"],
  CN: ["APG", "EAG"],
  FJ: ["APG"],
  HK: ["APG"],
  IN: ["APG", "EAG"],
  ID: ["APG"],
  JP: ["APG"],
  KR: ["APG"],
  LA: ["APG"],
  MO: ["APG"],
  MH: ["APG"],
  MY: ["APG"],
  MV: ["APG"],
  MN: ["APG"],
  MM: ["APG"],
  NP: ["APG"],
  NR: ["APG"],
  NU: ["APG"],
  NZ: ["APG"],
  PK: ["APG"],
  PW: ["APG"],
  PG: ["APG"],
  PH: ["APG"],
  WS: ["APG"],
  SG: ["APG"],
  SB: ["APG"],
  LK: ["APG"],
  TW: ["APG"],
  TH: ["APG"],
  TL: ["APG"],
  TO: ["APG"],
  US: ["APG", "CFATF"],
  VU: ["APG"],
  VN: ["APG"],

  // ── CFATF (Caribbean Financial Action Task Force) ─────────────────────────
  AG: ["CFATF"],
  AI: ["CFATF"],
  AW: ["CFATF"],
  BS: ["CFATF"],
  BB: ["CFATF"],
  BZ: ["CFATF"],
  BM: ["CFATF"],
  VG: ["CFATF"],
  KY: ["CFATF"],
  CW: ["CFATF"],
  DM: ["CFATF"],
  GD: ["CFATF"],
  DO: ["CFATF", "GAFILAT"],
  SV: ["CFATF", "GAFILAT"],
  GT: ["CFATF", "GAFILAT"],
  GY: ["CFATF"],
  HT: ["CFATF"],
  JM: ["CFATF"],
  MS: ["CFATF"],
  KN: ["CFATF"],
  LC: ["CFATF"],
  SX: ["CFATF"],
  VC: ["CFATF"],
  SR: ["CFATF"],
  TT: ["CFATF"],
  TC: ["CFATF"],
  VE: ["CFATF"],

  // ── EAG (Eurasian Group) ──────────────────────────────────────────────────
  BY: ["EAG"],
  KZ: ["EAG"],
  KG: ["EAG"],
  RU: ["EAG"],
  TJ: ["EAG"],
  TM: ["EAG"],
  UZ: ["EAG"],

  // ── ESAAMLG (Eastern and Southern Africa) ─────────────────────────────────
  AO: ["ESAAMLG"],
  BW: ["ESAAMLG"],
  BI: ["ESAAMLG"],
  ER: ["ESAAMLG"],
  SZ: ["ESAAMLG"],
  ET: ["ESAAMLG"],
  KE: ["ESAAMLG"],
  LS: ["ESAAMLG"],
  MG: ["ESAAMLG"],
  MW: ["ESAAMLG"],
  MU: ["ESAAMLG"],
  MZ: ["ESAAMLG"],
  NA: ["ESAAMLG"],
  RW: ["ESAAMLG"],
  SC: ["ESAAMLG"],
  ZA: ["ESAAMLG"],
  SS: ["ESAAMLG"],
  TZ: ["ESAAMLG"],
  UG: ["ESAAMLG"],
  ZM: ["ESAAMLG"],
  ZW: ["ESAAMLG"],

  // ── GABAC (Central Africa) ────────────────────────────────────────────────
  CM: ["GABAC"],
  CF: ["GABAC"],
  CG: ["GABAC"],
  GA: ["GABAC"],
  GQ: ["GABAC"],
  TD: ["GABAC"],
  CD: ["GABAC"], // associate member

  // ── GIABA (West Africa) ───────────────────────────────────────────────────
  BJ: ["GIABA"],
  BF: ["GIABA"],
  CV: ["GIABA"],
  CI: ["GIABA"],
  GM: ["GIABA"],
  GH: ["GIABA"],
  GN: ["GIABA"],
  GW: ["GIABA"],
  LR: ["GIABA"],
  ML: ["GIABA"],
  NE: ["GIABA"],
  NG: ["GIABA"],
  SN: ["GIABA"],
  SL: ["GIABA"],
  TG: ["GIABA"],
  KM: ["GIABA"], // non-ECOWAS GIABA member
  ST: ["GIABA"], // non-ECOWAS GIABA member

  // ── MENAFATF (Middle East and North Africa) ───────────────────────────────
  DZ: ["MENAFATF"],
  BH: ["MENAFATF"],
  DJ: ["MENAFATF"],
  EG: ["MENAFATF"],
  IQ: ["MENAFATF"],
  JO: ["MENAFATF"],
  KW: ["MENAFATF"],
  LB: ["MENAFATF"],
  LY: ["MENAFATF"],
  MR: ["MENAFATF"],
  MA: ["MENAFATF"],
  OM: ["MENAFATF"],
  QA: ["MENAFATF"],
  PS: ["MENAFATF"],
  SA: ["MENAFATF"],
  SO: ["MENAFATF"],
  SD: ["MENAFATF"],
  SY: ["MENAFATF"],
  TN: ["MENAFATF"],
  AE: ["MENAFATF"],
  YE: ["MENAFATF"],

  // ── MONEYVAL (Council of Europe network) ──────────────────────────────────
  // Russia is deliberately absent: excluded from MONEYVAL / the Council of
  // Europe in 2022. It appears under EAG only.
  AL: ["MONEYVAL"],
  AD: ["MONEYVAL"],
  AM: ["MONEYVAL"],
  AZ: ["MONEYVAL"],
  BA: ["MONEYVAL"],
  BG: ["MONEYVAL"],
  HR: ["MONEYVAL"],
  CY: ["MONEYVAL"],
  CZ: ["MONEYVAL"],
  EE: ["MONEYVAL"],
  GE: ["MONEYVAL"],
  GI: ["MONEYVAL"],
  HU: ["MONEYVAL"],
  LV: ["MONEYVAL"],
  LI: ["MONEYVAL"],
  LT: ["MONEYVAL"],
  MT: ["MONEYVAL"],
  MD: ["MONEYVAL"],
  MC: ["MONEYVAL"],
  ME: ["MONEYVAL"],
  MK: ["MONEYVAL"],
  PL: ["MONEYVAL"],
  RO: ["MONEYVAL"],
  SM: ["MONEYVAL"],
  RS: ["MONEYVAL"],
  SK: ["MONEYVAL"],
  SI: ["MONEYVAL"],
  UA: ["MONEYVAL"],
  IL: ["MONEYVAL"], // jointly evaluated by FATF and MONEYVAL
  IM: ["MONEYVAL"], // UK Crown Dependency, individually evaluated
  JE: ["MONEYVAL"], // UK Crown Dependency, individually evaluated
  GG: ["MONEYVAL"], // UK Crown Dependency, individually evaluated
  VA: ["MONEYVAL"], // Holy See, including Vatican City State

  // ── GAFILAT (Latin America) ───────────────────────────────────────────────
  AR: ["GAFILAT"],
  BO: ["GAFILAT"],
  BR: ["GAFILAT"],
  CL: ["GAFILAT"],
  CO: ["GAFILAT"],
  CR: ["GAFILAT"],
  CU: ["GAFILAT"],
  EC: ["GAFILAT"],
  HN: ["GAFILAT"],
  MX: ["GAFILAT"],
  NI: ["GAFILAT"],
  PA: ["GAFILAT"],
  PY: ["GAFILAT"],
  PE: ["GAFILAT"],
  UY: ["GAFILAT"],
};

export interface FatfNetwork {
  /** True if the country is a direct FATF member. */
  fatfMember: boolean;
  /** True if that direct membership is currently suspended (Russia). */
  suspended?: boolean;
  /** Resolved FSRB body records the country belongs to (may be empty). */
  fsrbs: Fsrb[];
}

/**
 * FATF-network membership for a country: direct FATF status (with suspension
 * flag) and any FSRB memberships. Returns an empty `fsrbs` array for the handful
 * of jurisdictions in no regional body (e.g. Iran, North Korea, Kosovo).
 */
export function getFatfNetwork(iso2: string): FatfNetwork {
  const code = iso2.toUpperCase();
  const fatfMember = FATF_MEMBERS.includes(code);
  const suspended = fatfMember && FATF_SUSPENDED.includes(code);
  const fsrbCodes = FSRB_MEMBERSHIP[code] ?? [];
  const fsrbs = fsrbCodes.map((c) => FSRBS[c]);
  return { fatfMember, suspended: suspended || undefined, fsrbs };
}

/** True if the country sits in the FATF network at all (direct member or an FSRB). */
export function inFatfNetwork(iso2: string): boolean {
  const net = getFatfNetwork(iso2);
  return net.fatfMember || net.fsrbs.length > 0;
}
