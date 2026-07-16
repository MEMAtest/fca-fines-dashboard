import { getCountryByIso2 } from "./countries.js";
import type { SanctionsImposer, SanctionsTier } from "./sanctionsStatus.js";

/**
 * Reviewable v2 sanctions taxonomy.
 *
 * These records are deliberately NOT consumed by the score engine. They are a
 * complete candidate catalogue derived from each imposer's official geographic
 * regime index. A named regime is not enough to prove that ordinary dealings
 * with the named country are restricted, so every row remains pending until a
 * compliance reviewer confirms both `relationship` and `proposedTier` against
 * the linked legal-measure page.
 */

export type SanctionsRegimeRelationship =
  | "direct-country-exposure"
  | "situation-related";

export type SanctionsCandidateReviewStatus = "pending-independent-review" | "approved" | "rejected";

export interface SanctionsRegimeCandidate {
  iso2: string;
  imposer: SanctionsImposer;
  regime: string;
  proposedTier: SanctionsTier;
  relationship: SanctionsRegimeRelationship;
  catalogueUrl: string;
  measureEvidenceUrl: string;
  rationale: string;
  reviewedAsOf: string;
  reviewStatus: SanctionsCandidateReviewStatus;
}

export interface SanctionsCatalogueCoverage {
  imposer: SanctionsImposer;
  catalogueUrl: string;
  reviewedAsOf: string;
  countryRegimeCount: number;
  excludedProgrammes: string[];
  note: string;
}

export const SANCTIONS_CATALOGUE_REVIEWED_AS_OF = "2026-07-16";

export const SANCTIONS_TIER_RULES: Record<SanctionsTier, string> = {
  comprehensive:
    "Broad country-wide trade and financial prohibitions; ordinary dealings are generally prohibited unless licensed.",
  sectoral:
    "A non-designation restriction applies to a material class of country transactions, goods or an economic sector, including a country-wide arms embargo.",
  targeted:
    "Restrictions attach principally to designated persons, entities, vessels or their owned/controlled entities; no material country-wide class of ordinary transactions is evidenced.",
};

const CATALOGUE = {
  OFAC: "https://ofac.treasury.gov/sanctions-programs-and-country-information",
  UK: "https://www.gov.uk/government/collections/uk-sanctions-regimes-under-the-sanctions-act",
  EU: "https://www.consilium.europa.eu/en/topics/sanctions/",
  UN: "https://main.un.org/securitycouncil/en/sanctions/information",
} as const;

type CandidateSpec = readonly [
  iso2: string,
  proposedTier: SanctionsTier,
  regime: string,
  measureEvidenceUrl: string,
  rationale: string,
  relationship?: SanctionsRegimeRelationship,
];

function candidates(imposer: SanctionsImposer, specs: readonly CandidateSpec[]): SanctionsRegimeCandidate[] {
  return specs.map(([iso2, proposedTier, regime, measureEvidenceUrl, rationale, relationship]) => ({
    iso2,
    imposer,
    regime,
    proposedTier,
    relationship: relationship ?? "direct-country-exposure",
    catalogueUrl: CATALOGUE[imposer],
    measureEvidenceUrl,
    rationale,
    reviewedAsOf: SANCTIONS_CATALOGUE_REVIEWED_AS_OF,
    reviewStatus: "pending-independent-review",
  }));
}

const OFAC = "https://ofac.treasury.gov/sanctions-programs-and-country-information";
const UK = "https://www.gov.uk";
const EU = CATALOGUE.EU;
const UN = "https://main.un.org/securitycouncil/en/sanctions";

const OFAC_CANDIDATES = candidates("OFAC", [
  ["AF", "targeted", "Afghanistan-Related Sanctions", `${OFAC}/afghanistan-related-sanctions`, "Designation-led Taliban-related programme."],
  ["BY", "sectoral", "Belarus Sanctions", `${OFAC}/belarus-sanctions`, "Includes restrictions beyond named persons, including sovereign-debt exposure."],
  ["MM", "targeted", "Burma-Related Sanctions", `${OFAC}/burma`, "Designation-led programme; no broad country embargo identified."],
  ["CF", "targeted", "Central African Republic Sanctions", `${OFAC}/central-african-republic-sanctions`, "Designation-led conflict programme."],
  ["CN", "targeted", "Chinese Military Companies Sanctions", `${OFAC}/chinese-military-companies-sanctions`, "Restrictions attach to identified military companies, not China generally."],
  ["CD", "targeted", "Democratic Republic of the Congo-Related Sanctions", `${OFAC}/democratic-republic-of-the-congo-related-sanctions`, "Designation-led conflict programme."],
  ["ET", "targeted", "Ethiopia-Related Sanctions", `${OFAC}/ethiopia`, "Designation authority related to the Ethiopian conflict."],
  ["HK", "targeted", "Hong Kong-Related Sanctions", `${OFAC}/hong-kong-related-sanctions`, "Restrictions attach to designated persons rather than Hong Kong generally."],
  ["CU", "comprehensive", "Cuba Sanctions", `${OFAC}/cuba-sanctions`, "OFAC identifies Cuba as a broad-based geographic programme and administers country-wide transaction controls."],
  ["IR", "comprehensive", "Iran Sanctions", `${OFAC}/iran-sanctions`, "OFAC identifies Iran as a broad-based geographic programme with extensive trade and finance prohibitions."],
  ["IQ", "targeted", "Iraq-Related Sanctions", `${OFAC}/iraq-related-sanctions`, "Restrictions principally concern designated former-regime persons and assets."],
  ["LB", "targeted", "Lebanon-Related Sanctions", `${OFAC}/lebanon-related-sanctions`, "Designation-led programme."],
  ["LY", "targeted", "Libya Sanctions", `${OFAC}/libya-sanctions`, "Restrictions principally concern blocked persons and specified state assets."],
  ["ML", "targeted", "Mali-Related Sanctions", `${OFAC}/mali-related-sanctions`, "Designation-led programme."],
  ["NI", "targeted", "Nicaragua-Related Sanctions", `${OFAC}/nicaragua-related-sanctions`, "Designation-led programme."],
  ["KP", "comprehensive", "North Korea Sanctions", `${OFAC}/north-korea-sanctions`, "Broad country-wide trade and financial prohibitions operate alongside designations."],
  ["SY", "targeted", "Promoting Accountability for Assad and Regional Stabilization Sanctions", `${OFAC}/paarss`, "OFAC removed broad Syria sanctions effective 1 July 2025; remaining measures target Assad and other specified actors."],
  ["RU", "sectoral", "Russian Harmful Foreign Activities and Ukraine-/Russia-related Sanctions", `${OFAC}/russian-harmful-foreign-activities-sanctions`, "Finance, energy, services and other sector-level restrictions apply."],
  ["SO", "targeted", "Somalia Sanctions", `${OFAC}/somalia-sanctions`, "OFAC programme is primarily designation-led; UN measures are assessed separately."],
  ["SS", "targeted", "South Sudan-Related Sanctions", `${OFAC}/south-sudan-related-sanctions`, "Designation-led conflict programme."],
  ["SD", "targeted", "Sudan and Darfur Sanctions", `${OFAC}/sudan-and-darfur-sanctions`, "Current programme is designation-led; the former country-wide Sudan embargo is inactive."],
  ["VE", "sectoral", "Venezuela-Related Sanctions", `${OFAC}/venezuela-related-sanctions`, "Restrictions extend to sovereign debt, state oil interests and other material transaction classes."],
  ["YE", "targeted", "Yemen-Related Sanctions", `${OFAC}/yemen-related-sanctions`, "Designation-led conflict programme."],
]);

const UK_GUIDANCE: readonly CandidateSpec[] = [
  ["AF", "targeted", "Afghanistan sanctions", `${UK}/government/publications/afghanistan-sanctions-guidance`, "Designation-led Taliban regime."],
  ["BY", "sectoral", "Republic of Belarus sanctions", `${UK}/government/publications/republic-of-belarus-sanctions-guidance`, "Trade and financial restrictions apply beyond designated persons."],
  ["BA", "targeted", "Bosnia and Herzegovina sanctions", `${UK}/government/publications/bosnia-and-herzegovina-sanctions-guidance`, "Designation-led peace and stability regime."],
  ["CF", "sectoral", "Central African Republic sanctions", `${UK}/government/publications/central-african-republic-sanctions-guidance`, "Includes an arms embargo in addition to designations."],
  ["CN", "sectoral", "UK arms embargo on mainland China and Hong Kong", `${UK}/guidance/uk-arms-embargo-on-mainland-china-and-hong-kong`, "Country-level arms restrictions apply.", "direct-country-exposure"],
  ["HK", "sectoral", "UK arms embargo on mainland China and Hong Kong", `${UK}/guidance/uk-arms-embargo-on-mainland-china-and-hong-kong`, "Territory-level arms restrictions apply.", "direct-country-exposure"],
  ["CD", "sectoral", "Democratic Republic of the Congo sanctions", `${UK}/government/publications/the-democratic-republic-of-the-congo-guidance`, "Includes arms-related restrictions in addition to designations."],
  ["KP", "sectoral", "Democratic People's Republic of Korea sanctions", `${UK}/government/publications/democratic-peoples-republic-of-korea-sanctions-guidance`, "Multiple country-wide trade, finance and sector restrictions apply."],
  ["GN", "targeted", "Guinea sanctions", `${UK}/government/publications/guinea-sanctions-guidance`, "Designation-led regime."],
  ["GW", "targeted", "Republic of Guinea-Bissau sanctions", `${UK}/government/publications/guinea-bissau-sanctions-guidance`, "Designation-led regime."],
  ["HT", "targeted", "Haiti sanctions", `${UK}/government/publications/haiti-sanctions-guidance`, "Designation-led regime."],
  ["IR", "sectoral", "Iran and Iran nuclear sanctions", `${UK}/government/publications/iran-sanctions-guidance`, "Trade, transport and financial restrictions apply beyond designated persons."],
  ["IQ", "targeted", "Iraq sanctions", `${UK}/government/publications/iraq-sanctions-guidance`, "Restrictions principally concern designated former-regime persons and assets."],
  ["LB", "targeted", "Lebanon sanctions", `${UK}/government/publications/lebanon-sanctions-guidance`, "Designation-led regime."],
  ["LY", "sectoral", "Libya sanctions", `${UK}/government/publications/libya-sanctions-guidance`, "Arms and petroleum-related restrictions apply beyond designations."],
  ["ML", "targeted", "Mali sanctions", `${UK}/government/publications/mali-sanctions-guidance`, "Designation-led regime."],
  ["MM", "sectoral", "Myanmar sanctions", `${UK}/government/publications/myanmar-sanctions-guidance`, "Arms and specified goods restrictions apply beyond designations."],
  ["NI", "targeted", "Nicaragua sanctions", `${UK}/government/publications/nicaragua-sanctions-guidance`, "Designation-led regime."],
  ["RU", "sectoral", "Russia sanctions", `${UK}/government/publications/russia-sanctions-guidance`, "Extensive trade, finance, transport and services restrictions apply."],
  ["SO", "sectoral", "Somalia sanctions", `${UK}/government/publications/somalia-sanctions-guidance`, "Arms, charcoal and specified-goods restrictions apply."],
  ["SS", "sectoral", "South Sudan sanctions", `${UK}/government/publications/south-sudan-sanctions-guidance`, "Arms restrictions apply in addition to designations."],
  ["SD", "sectoral", "Sudan sanctions", `${UK}/government/publications/sudan-sanctions-guidance`, "Arms restrictions apply in addition to designations."],
  ["SY", "sectoral", "Syria sanctions", `${UK}/government/publications/syria-sanctions-guidance`, "Trade, finance and sector restrictions apply beyond designations."],
  ["VE", "targeted", "Venezuela sanctions", `${UK}/government/publications/venezuela-sanctions-guidance`, "Designation-led regime."],
  ["YE", "targeted", "Yemen sanctions", `${UK}/government/publications/yemen-sanctions-guidance`, "Designation-led regime."],
  ["ZW", "sectoral", "Zimbabwe sanctions", `${UK}/government/publications/zimbabwe-sanctions-guidance`, "Arms restrictions apply in addition to designations."],
];

const UK_CANDIDATES = candidates("UK", UK_GUIDANCE);

const EU_COUNTRIES: ReadonlyArray<readonly [string, SanctionsTier, SanctionsRegimeRelationship?]> = [
  ["AF", "targeted"], ["BY", "sectoral"], ["BA", "targeted"], ["BI", "targeted"],
  ["CF", "sectoral"], ["CD", "sectoral"], ["GT", "targeted", "situation-related"],
  ["GN", "targeted"], ["GW", "targeted"], ["HT", "targeted"], ["IR", "sectoral"],
  ["IQ", "targeted"], ["LB", "targeted"], ["LY", "sectoral"], ["ML", "targeted"],
  ["MD", "targeted", "situation-related"], ["MM", "sectoral"], ["NI", "targeted"],
  ["NE", "targeted"], ["KP", "sectoral"], ["RU", "sectoral"], ["SO", "sectoral"],
  ["SS", "sectoral"], ["SD", "sectoral"], ["SY", "sectoral"], ["TN", "targeted"],
  ["TR", "targeted", "situation-related"], ["UA", "targeted", "situation-related"],
  ["VE", "targeted"], ["YE", "targeted"], ["ZW", "sectoral"],
];

const EU_CANDIDATES = candidates("EU", EU_COUNTRIES.map(([iso2, tier, relationship]) => [
  iso2,
  tier,
  `${getCountryByIso2(iso2)?.name ?? iso2} restrictive measures`,
  EU,
  tier === "targeted"
    ? "Official EU country-regime catalogue; direct legal act and designation nexus must be confirmed before approval."
    : "Official EU country-regime catalogue; proposed broad-measure tier must be confirmed against the applicable Council legal acts.",
  relationship,
] as const));

const UN_CANDIDATES = candidates("UN", [
  ["SO", "sectoral", "Al-Shabaab / Somalia sanctions", `${UN}/2713`, "Arms, charcoal and specified-component restrictions apply alongside designations."],
  ["IQ", "targeted", "1518 Iraq sanctions", `${UN}/1518`, "Asset restrictions concern listed former-regime persons and entities."],
  ["CD", "sectoral", "1533 Democratic Republic of the Congo sanctions", `${UN}/1533`, "Arms-related restrictions apply alongside designations."],
  ["SD", "sectoral", "1591 Sudan sanctions", `${UN}/1591`, "Darfur arms restrictions apply alongside designations."],
  ["LB", "targeted", "1636 Lebanon sanctions", `${UN}/1636`, "Measures attach to persons designated in connection with the Hariri assassination."],
  ["KP", "sectoral", "1718 DPRK sanctions", `${UN}/1718`, "Extensive sector, commodity, finance and transport restrictions apply."],
  ["IR", "sectoral", "1737 Iran sanctions", `${UN}/1737`, "Proliferation-related embargo and business restrictions were re-applied on 27 September 2025."],
  ["LY", "sectoral", "1970 Libya sanctions", `${UN}/1970`, "Arms and petroleum-related measures apply alongside designations."],
  ["AF", "targeted", "1988 Taliban sanctions", `${UN}/1988`, "Measures attach to listed Taliban-associated persons and entities."],
  ["GW", "targeted", "2048 Guinea-Bissau sanctions", `${UN}/2048`, "Designation-led travel restrictions."],
  ["YE", "targeted", "2140 Yemen sanctions", `${UN}/2140`, "Measures attach to designated persons and entities."],
  ["SS", "sectoral", "2206 South Sudan sanctions", `${UN}/2206`, "Arms restrictions apply alongside designations."],
  ["HT", "targeted", "2653 Haiti sanctions", `${UN}/2653`, "Measures attach to designated persons and entities."],
  ["CF", "sectoral", "2745 Central African Republic sanctions", `${UN}/2745`, "Arms-related restrictions apply alongside designations."],
]);

export const SANCTIONS_REGIME_CANDIDATES: SanctionsRegimeCandidate[] = [
  ...OFAC_CANDIDATES,
  ...UK_CANDIDATES,
  ...EU_CANDIDATES,
  ...UN_CANDIDATES,
];

export const SANCTIONS_CATALOGUE_COVERAGE: SanctionsCatalogueCoverage[] = [
  {
    imposer: "OFAC",
    catalogueUrl: CATALOGUE.OFAC,
    reviewedAsOf: SANCTIONS_CATALOGUE_REVIEWED_AS_OF,
    countryRegimeCount: OFAC_CANDIDATES.length,
    excludedProgrammes: [
      "Balkans-Related Sanctions (regional designation programme; no country-wide nexus inferred)",
      "Thematic programmes such as counter-terrorism, cyber and Global Magnitsky",
      "Ukraine-/Russia-related measures are represented against Russia; Ukraine is not treated as the sanctioned country",
    ],
    note: "OFAC expressly warns that it has no simple sanctioned-country list and that programme scope varies.",
  },
  {
    imposer: "UK",
    catalogueUrl: CATALOGUE.UK,
    reviewedAsOf: SANCTIONS_CATALOGUE_REVIEWED_AS_OF,
    countryRegimeCount: UK_CANDIDATES.length,
    excludedProgrammes: ["Thematic regimes", "Duplicate Iran, Lebanon and Syria sub-regimes are consolidated per country"],
    note: "Includes the separately published mainland China and Hong Kong arms embargo.",
  },
  {
    imposer: "EU",
    catalogueUrl: CATALOGUE.EU,
    reviewedAsOf: SANCTIONS_CATALOGUE_REVIEWED_AS_OF,
    countryRegimeCount: EU_CANDIDATES.length,
    excludedProgrammes: ["Thematic human-rights, terrorism, chemical-weapons and cyber regimes"],
    note: "Coverage follows the Council's current text list of countries where a sanctions regime applies.",
  },
  {
    imposer: "UN",
    catalogueUrl: CATALOGUE.UN,
    reviewedAsOf: SANCTIONS_CATALOGUE_REVIEWED_AS_OF,
    countryRegimeCount: UN_CANDIDATES.length,
    excludedProgrammes: ["ISIL (Da'esh) and Al-Qaida global thematic regime"],
    note: "Includes the re-applied 1737 Iran regime effective 27 September 2025.",
  },
];

export const SANCTIONS_CANDIDATE_COUNTRY_COUNT = new Set(
  SANCTIONS_REGIME_CANDIDATES.map((candidate) => candidate.iso2),
).size;

export const SANCTIONS_CANDIDATE_SCORING_READY = SANCTIONS_REGIME_CANDIDATES.every(
  (candidate) => candidate.reviewStatus === "approved",
);

export function getSanctionsRegimeCandidates(iso2: string): SanctionsRegimeCandidate[] {
  return SANCTIONS_REGIME_CANDIDATES.filter((candidate) => candidate.iso2 === iso2.toUpperCase());
}
