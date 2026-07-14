/**
 * Sanctions posture by country — curated, sourced, conservative.
 *
 * This is a *country-level programme* view (is a jurisdiction subject to a
 * comprehensive embargo / sectoral / targeted regime by a major imposer), NOT a
 * count of individual SDN designations. Almost every country has *some* listed
 * persons; that does not make the country "sanctioned". So we only record a
 * programme where a major imposer maintains a jurisdiction-level regime, and we
 * cite the source and a review date per row. Mislabelling a country is a
 * reputational risk, so this table is hand-curated, not scraped.
 *
 * Tiers:
 *   comprehensive — broad embargo (virtually all trade/finance prohibited)
 *   sectoral      — whole sectors (finance/energy/defence) restricted
 *   targeted      — asset freezes / travel bans on listed persons + some measures
 *
 * Sources: OFAC (ofac.treasury.gov), UK (gov.uk sanctions), EU (sanctionsmap.eu),
 * UN Security Council. Reviewed 2026-07. Sanctions change often — verify before
 * relying operationally.
 */

export type SanctionsImposer = "OFAC" | "UK" | "EU" | "UN";
export type SanctionsTier = "comprehensive" | "sectoral" | "targeted";

export interface SanctionsProgram {
  imposer: SanctionsImposer;
  tier: SanctionsTier;
  program: string;
  sourceUrl: string;
  reviewed: string; // YYYY-MM
}

export interface CountrySanctions {
  iso2: string;
  programs: SanctionsProgram[];
}

export const SANCTIONS_REVIEWED = "2026-07";

const SRC = {
  OFAC: "https://ofac.treasury.gov/sanctions-programs-and-country-information",
  UK: "https://www.gov.uk/government/collections/uk-sanctions-regimes-under-the-sanctions-act",
  EU: "https://www.sanctionsmap.eu/",
  UN: "https://main.un.org/securitycouncil/en/sanctions/information",
} as const;

function p(
  imposer: SanctionsImposer,
  tier: SanctionsTier,
  program: string,
): SanctionsProgram {
  return { imposer, tier, program, sourceUrl: SRC[imposer], reviewed: SANCTIONS_REVIEWED };
}

export const SANCTIONS_STATUS: CountrySanctions[] = [
  {
    iso2: "CU",
    programs: [p("OFAC", "comprehensive", "Cuban Assets Control Regulations")],
  },
  {
    iso2: "IR",
    programs: [
      p("OFAC", "comprehensive", "Iran embargo (ITSR)"),
      p("EU", "targeted", "Iran restrictive measures"),
      p("UK", "targeted", "Iran (Sanctions) Regulations"),
      p("UN", "targeted", "Iran proliferation measures"),
    ],
  },
  {
    iso2: "KP",
    programs: [
      p("OFAC", "comprehensive", "North Korea Sanctions Regulations"),
      p("UN", "sectoral", "DPRK 1718 regime (arms, finance, sectoral)"),
      p("EU", "sectoral", "DPRK restrictive measures"),
      p("UK", "sectoral", "North Korea (Sanctions) Regulations"),
    ],
  },
  {
    iso2: "SY",
    programs: [
      p("OFAC", "comprehensive", "Syria Sanctions Regulations"),
      p("EU", "targeted", "Syria restrictive measures"),
      p("UK", "targeted", "Syria (Sanctions) Regulations"),
    ],
  },
  {
    iso2: "RU",
    programs: [
      p("OFAC", "sectoral", "Russian Harmful Foreign Activities (finance/energy/defence)"),
      p("EU", "sectoral", "Russia restrictive measures"),
      p("UK", "sectoral", "Russia (Sanctions) Regulations"),
    ],
  },
  {
    iso2: "BY",
    programs: [
      p("OFAC", "targeted", "Belarus Sanctions Regulations"),
      p("EU", "sectoral", "Belarus restrictive measures"),
      p("UK", "sectoral", "Belarus (Sanctions) Regulations"),
    ],
  },
  {
    iso2: "VE",
    programs: [p("OFAC", "targeted", "Venezuela Sanctions Regulations")],
  },
  {
    iso2: "MM",
    programs: [
      p("OFAC", "targeted", "Burma Sanctions Regulations"),
      p("EU", "targeted", "Myanmar restrictive measures"),
      p("UK", "targeted", "Myanmar (Sanctions) Regulations"),
    ],
  },
];

// ── Accessors ────────────────────────────────────────────────────────────────

const BY_ISO2 = new Map<string, CountrySanctions>(
  SANCTIONS_STATUS.map((s) => [s.iso2, s]),
);

const TIER_RANK: Record<SanctionsTier, number> = {
  comprehensive: 3,
  sectoral: 2,
  targeted: 1,
};

export function getSanctions(iso2: string): CountrySanctions | undefined {
  return BY_ISO2.get(iso2.toUpperCase());
}

export function isSanctioned(iso2: string): boolean {
  return BY_ISO2.has(iso2.toUpperCase());
}

/** Highest tier across all imposers (for the headline label), or undefined. */
export function highestSanctionsTier(iso2: string): SanctionsTier | undefined {
  const rec = BY_ISO2.get(iso2.toUpperCase());
  if (!rec || rec.programs.length === 0) return undefined;
  return rec.programs.reduce<SanctionsTier>(
    (top, prog) => (TIER_RANK[prog.tier] > TIER_RANK[top] ? prog.tier : top),
    rec.programs[0].tier,
  );
}

export function sanctionsTierLabel(tier: SanctionsTier): string {
  return tier === "comprehensive"
    ? "Comprehensive"
    : tier === "sectoral"
      ? "Sectoral"
      : "Targeted";
}

/** Distinct imposers with a programme for a country (e.g. ["OFAC","EU","UK"]). */
export function sanctionsImposers(iso2: string): SanctionsImposer[] {
  const rec = BY_ISO2.get(iso2.toUpperCase());
  if (!rec) return [];
  return [...new Set(rec.programs.map((prog) => prog.imposer))];
}
