import { REGULATOR_NAV_ITEMS, type RegulatorCoverage } from "./regulatorCoverage.js";

export interface RegionalCoverageSummary {
  region: RegulatorCoverage["region"];
  live: number;
  pipeline: number;
  internal: number;
  researched: number;
  tracked: number;
  gaps: string[];
  roadmap: string;
}

const REGIONAL_GAPS: Partial<Record<RegulatorCoverage["region"], string[]>> = {
  Europe: ["CONSOB", "Banco de Portugal", "ESMA (internal)"],
  "Latin America": ["Colombia", "Peru"],
};

const REGIONAL_ROADMAP: Partial<Record<RegulatorCoverage["region"], string>> = {
  Europe: "Prioritised later roadmap: CONSOB and Banco de Portugal ingestion, then ESMA internal promotion evidence.",
  "Latin America": "Mexico (CNBV), Brazil (CVM and BCB), Argentina (CNV) and Chile (CMF sanctions and UAF anti-money-laundering sanctions) are live. Colombia, Peru and other Latin American jurisdictions are not yet tracked and are not represented as covered.",
};

export function getRegionalCoverageSummary(region: RegulatorCoverage["region"]): RegionalCoverageSummary {
  const entries = REGULATOR_NAV_ITEMS.filter((item) => item.region === region);
  return {
    region,
    live: entries.filter((item) => item.stage === "live").length,
    pipeline: entries.filter((item) => item.stage === "pipeline").length,
    internal: entries.filter((item) => item.stage === "internal").length,
    researched: entries.length,
    tracked: entries.length,
    gaps: REGIONAL_GAPS[region] ?? [],
    roadmap: REGIONAL_ROADMAP[region] ?? "Additional regional regulators remain outside the current tracked set and are not represented as covered.",
  };
}

export const HONEST_REGIONAL_COVERAGE = (["Europe", "Latin America"] as const).map(getRegionalCoverageSummary);

export interface UncoveredSource {
  regulator: string;
  country: string;
  reason: string;
}

/**
 * Regulators whose enforcement publications were checked (14 Nov 2026) and are not
 * reachable by an official machine-readable route. They are not tracked and must not
 * be described as covered. See docs/coverage/blocked-regulators-open-data.md.
 */
export const NOT_MACHINE_ACCESSIBLE_SOURCES: readonly UncoveredSource[] = [
  {
    regulator: "FSC Mauritius",
    country: "Mauritius",
    reason: "Enforcement pages sit behind a bot-protection challenge and there is no open-data feed. Not tracked.",
  },
  {
    regulator: "CMA Saudi Arabia",
    country: "Saudi Arabia",
    reason: "Violations and decisions pages reject automated requests; open publications give only aggregate annual-report totals with no named firms. Not tracked.",
  },
  {
    regulator: "SEC Philippines",
    country: "Philippines",
    reason: "The regulator's website refuses automated requests and publishes no feed or open dataset. Not tracked.",
  },
  {
    regulator: "SEC Thailand",
    country: "Thailand",
    reason: "The regulator's website and its open-data portal refuse automated requests. Not tracked.",
  },
  {
    regulator: "CNBV Mexico (other notices)",
    country: "Mexico",
    reason: "Only the official sanctions register is tracked; further CNBV enforcement notices are not available on an open route.",
  },
  {
    regulator: "OJK Indonesia (outside capital markets)",
    country: "Indonesia",
    reason: "Only capital-market administrative-sanction announcements are tracked; banking, insurance and fintech sanctions are not published on a machine-readable route.",
  },
];
