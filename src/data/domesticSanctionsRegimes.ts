/**
 * Countries that run their OWN sanctions regime (beyond applying UN measures),
 * curated by hand from official government pages.
 *
 * A country that is not in this file simply has no entry: the site says nothing
 * about a domestic regime for it. Absence here is never a claim that none exists.
 *
 * Each entry names the laws, the official list a firm screens against, and the
 * official page that was read. Wording is our own.
 */
export interface DomesticSanctionsRegime {
  /** ISO 3166-1 alpha-2 codes the entry applies to. */
  iso2: string[];
  laws: string[];
  /** Name of the official list firms screen against. */
  listName: string;
  /** Official page (government domain) that confirms the laws and the list. */
  sourceUrl: string;
  /** Official page that holds the list itself. */
  listUrl: string;
  /** Date the official pages were read (YYYY-MM-DD). */
  reviewed: string;
  /** Set when the regime is an EU-level one that applies in each member state. */
  supranational?: "EU";
}

const REVIEWED = "2026-11-27";

const EU_MEMBERS = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE",
  "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
];

export const DOMESTIC_SANCTIONS_REGIMES: DomesticSanctionsRegime[] = [
  {
    iso2: ["CA"],
    laws: [
      "Special Economic Measures Act",
      "Justice for Victims of Corrupt Foreign Officials Act (Sergei Magnitsky Law)",
      "United Nations Act",
    ],
    listName: "Consolidated Canadian Autonomous Sanctions List",
    sourceUrl: "https://www.international.gc.ca/world-monde/international_relations-relations_internationales/sanctions/legislation-lois.aspx?lang=eng",
    listUrl: "https://www.international.gc.ca/world-monde/international_relations-relations_internationales/sanctions/consolidated-consolide.aspx?lang=eng",
    reviewed: REVIEWED,
  },
  {
    iso2: ["GB"],
    laws: ["Sanctions and Anti-Money Laundering Act 2018"],
    listName: "UK Sanctions List",
    sourceUrl: "https://www.gov.uk/government/publications/the-uk-sanctions-list",
    listUrl: "https://www.gov.uk/government/publications/the-uk-sanctions-list",
    reviewed: REVIEWED,
  },
  {
    iso2: ["US"],
    laws: ["International Emergency Economic Powers Act and other federal sanctions laws, run by OFAC"],
    listName: "OFAC Specially Designated Nationals (SDN) List",
    sourceUrl: "https://ofac.treasury.gov/sanctions-list-service",
    listUrl: "https://ofac.treasury.gov/sanctions-list-service",
    reviewed: REVIEWED,
  },
  {
    iso2: EU_MEMBERS,
    laws: ["EU restrictive measures adopted by the Council, which apply in every member state"],
    listName: "EU consolidated list of persons, groups and entities subject to financial sanctions",
    sourceUrl: "https://finance.ec.europa.eu/eu-and-world/sanctions-restrictive-measures/overview-sanctions-and-related-resources_en",
    listUrl: "https://finance.ec.europa.eu/eu-and-world/sanctions-restrictive-measures/overview-sanctions-and-related-resources_en",
    reviewed: REVIEWED,
    supranational: "EU",
  },
  {
    iso2: ["NZ"],
    laws: ["Russia Sanctions Act 2022", "United Nations Act 1946 (for UN Security Council sanctions)"],
    listName: "Russia Sanctions Register",
    sourceUrl: "https://www.mfat.govt.nz/en/countries-and-regions/europe/ukraine/russian-invasion-of-ukraine/sanctions/overview-of-sanctions-against-russia",
    listUrl: "https://www.mfat.govt.nz/en/countries-and-regions/europe/ukraine/russian-invasion-of-ukraine/sanctions/russia-sanctions-register",
    reviewed: REVIEWED,
  },
  {
    iso2: ["AU"],
    laws: ["Autonomous Sanctions Act 2011", "Charter of the United Nations Act 1945"],
    listName: "Australian Sanctions Consolidated List (DFAT)",
    sourceUrl: "https://www.dfat.gov.au/international-relations/security/sanctions/consolidated-list",
    listUrl: "https://www.dfat.gov.au/international-relations/security/sanctions/consolidated-list",
    reviewed: REVIEWED,
  },
  {
    iso2: ["CH"],
    laws: ["Embargo Act (EmbA)"],
    listName: "SECO list of sanctioned individuals, companies and organisations",
    sourceUrl: "https://www.fedlex.admin.ch/eli/cc/2002/564/en",
    listUrl: "https://www.seco.admin.ch/seco/en/home/Aussenwirtschaftspolitik_Wirtschaftliche_Zusammenarbeit/Wirtschaftsbeziehungen/exportkontrollen-und-sanktionen/sanktionen-embargos.html",
    reviewed: REVIEWED,
  },
  {
    iso2: ["JP"],
    laws: ["Foreign Exchange and Foreign Trade Act"],
    listName: "Ministry of Finance list of sanctions targets (published in Japanese)",
    sourceUrl: "https://www.mofa.go.jp/press/release/pressite_000001_02701.html",
    listUrl: "https://www.mof.go.jp/policy/international_policy/gaitame_kawase/gaitame/economic_sanctions/list.html",
    reviewed: REVIEWED,
  },
];

const BY_ISO2 = new Map<string, DomesticSanctionsRegime>();
for (const regime of DOMESTIC_SANCTIONS_REGIMES) {
  for (const code of regime.iso2) BY_ISO2.set(code, regime);
}

export function getDomesticSanctionsRegime(iso2: string): DomesticSanctionsRegime | undefined {
  return BY_ISO2.get(iso2.toUpperCase());
}

export function domesticSanctionsCountries(): string[] {
  return [...BY_ISO2.keys()].sort();
}
