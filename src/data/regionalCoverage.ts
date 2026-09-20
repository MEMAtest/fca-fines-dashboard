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
  "Latin America": ["Chile"],
};

const REGIONAL_ROADMAP: Partial<Record<RegulatorCoverage["region"], string>> = {
  Europe: "Prioritised later roadmap: CONSOB and Banco de Portugal ingestion, then ESMA internal promotion evidence.",
  "Latin America": "Mexico (CNBV), Brazil (CVM) and Argentina (CNV) are live. Prioritised later roadmap: Chile (CMF), subject to official-source ingestion gates.",
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
