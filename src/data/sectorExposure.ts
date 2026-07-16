/**
 * Sector exposure — which sectors carry elevated financial-crime risk for a
 * country, DERIVED (not invented) from the structured modules RegActions already
 * maintains. There is no per-country sector dataset; this module deterministically
 * projects existing signals onto five compliance-relevant sectors so the country
 * workspace can flag where enhanced controls are most likely to bite.
 *
 * Inputs (all sourced, dated and attributed elsewhere):
 *   - sanctions programmes  (sanctionsStatus.ts): tier + programme NAME
 *   - FATF listing          (fatfStatus.ts): grey / black
 *   - WGI governance domains (countryRiskScore.ts): 0-10 risk, higher = worse
 *       corruption · ruleOfLaw · politicalStability · accountability
 *   - CPI score             (cpiData.ts): 0-100, higher = cleaner (display only)
 *
 * Levels: Low < Elevated < High, plus Review when the evidence needed to make a
 * low-exposure conclusion is unavailable. Rules are DETERMINISTIC and MONOTONE — a worse
 * input can only raise a sector, never lower it (see sectorExposure.test.ts).
 * Every rationale NAMES the driving datum and stays <= ~90 chars, no em-dashes.
 *
 * Derivation rules (one per sector):
 *
 *  1. Banking & payments
 *       FATF black                                     -> High     (call for action)
 *       FATF grey                                      -> Elevated (correspondent-banking risk)
 *       rule-of-law domain >= 6                        -> Elevated
 *       else                                           -> Low
 *  2. Trade & export controls
 *       comprehensive sanctions                        -> High
 *       sectoral sanctions                             -> High     (rationale names the programme)
 *       FATF black                                     -> High     (dual-use diversion)
 *       targeted sanctions                             -> Elevated
 *       else                                           -> Low
 *  3. Crypto & virtual assets
 *       FATF black                                     -> High
 *       FATF grey                                      -> Elevated (VASP supervision gaps)
 *       accountability domain >= 6                     -> Elevated
 *       else                                           -> Low
 *  4. Real estate & luxury assets
 *       CPI < 25                                       -> High     (rationale names CPI)
 *       CPI < 40 or corruption domain >= 6             -> Elevated
 *       else                                           -> Low
 *  5. State-linked & procurement
 *       comprehensive sanctions                        -> High
 *       political-stability domain >= 7 or corruption domain >= 7 -> High
 *       political-stability >= 6 or corruption >= 6    -> Elevated
 *       else                                           -> Low
 */

export type SectorLevel = "Review" | "Low" | "Elevated" | "High";

export interface SectorRow {
  /** Sector name (stable label, e.g. "Banking & payments"). */
  sector: string;
  /** Derived exposure level. */
  level: SectorLevel;
  /** One-line rationale naming the driving datum (<= ~90 chars, no em-dash). */
  rationale: string;
}

/** Sanctions tier feeding the sector rules (mirrors sanctionsStatus SanctionsTier). */
export type SectorSanctionsTier = "comprehensive" | "sectoral" | "targeted";

export interface SectorExposureInput {
  /** Highest sanctions tier across imposers, or undefined if none. */
  sanctionsTier?: SectorSanctionsTier;
  /** Names of sectoral sanctions programmes (used to name the driver on Trade). */
  sectoralPrograms: string[];
  /** Whether the absence of a sanctions tier is supported by complete reviewed coverage. */
  sanctionsEvidenceComplete?: boolean;
  /** FATF listing: "black" (call for action), "grey" (increased monitoring), or undefined. */
  fatf?: "black" | "grey";
  /** WGI governance domain risks (0-10, higher = worse), null when no data. */
  domains: {
    corruption: number | null;
    ruleOfLaw: number | null;
    politicalStability: number | null;
    accountability: number | null;
  };
  /** CPI score (0-100, higher = cleaner), or undefined when no CPI entry. */
  cpi?: number;
}

const LEVEL_RANK: Record<SectorLevel, number> = { Review: -1, Low: 0, Elevated: 1, High: 2 };

/** Higher of two levels (keeps the rules monotone when several fire). */
function maxLevel(a: SectorLevel, b: SectorLevel): SectorLevel {
  return LEVEL_RANK[b] > LEVEL_RANK[a] ? b : a;
}

/** A domain risk crosses a threshold only when it is present (null never fires). */
function atLeast(value: number | null, threshold: number): boolean {
  return value !== null && value >= threshold;
}

/** Truncate a joined programme list so the rationale stays within budget. */
function firstProgram(programs: string[]): string | undefined {
  return programs.length > 0 ? programs[0] : undefined;
}

function bankingRow(input: SectorExposureInput): SectorRow {
  const rol = input.domains.ruleOfLaw;
  if (input.fatf === "black") {
    return {
      sector: "Banking & payments",
      level: "High",
      rationale: "FATF black-list call for action, correspondent lines likely severed",
    };
  }
  if (input.fatf === "grey") {
    return {
      sector: "Banking & payments",
      level: "Elevated",
      rationale: "FATF grey-list status elevates correspondent-banking risk",
    };
  }
  if (atLeast(rol, 6)) {
    return {
      sector: "Banking & payments",
      level: "Elevated",
      rationale: `Weak rule-of-law governance (WGI ${rol!.toFixed(1)}/10 risk)`,
    };
  }
  if (rol === null) {
    return {
      sector: "Banking & payments",
      level: "Review",
      rationale: "Rule-of-law evidence unavailable; no low-exposure conclusion",
    };
  }
  return {
    sector: "Banking & payments",
    level: "Low",
    rationale: "No FATF listing, rule-of-law governance within normal range",
  };
}

function tradeRow(input: SectorExposureInput): SectorRow {
  const sector = "Trade & export controls";
  if (input.sanctionsTier === "comprehensive") {
    return {
      sector,
      level: "High",
      rationale: "Comprehensive sanctions embargo restricts most cross-border trade",
    };
  }
  if (input.sanctionsTier === "sectoral") {
    const prog = firstProgram(input.sectoralPrograms);
    return {
      sector,
      level: "High",
      rationale: prog
        ? `Sectoral sanctions: ${prog}`
        : "Sectoral sanctions restrict whole trade sectors",
    };
  }
  if (input.fatf === "black") {
    return {
      sector,
      level: "High",
      rationale: "FATF black-list status raises dual-use goods diversion risk",
    };
  }
  if (input.sanctionsTier === "targeted") {
    return {
      sector,
      level: "Elevated",
      rationale: "Targeted sanctions require screening of listed counterparties",
    };
  }
  if (input.sanctionsEvidenceComplete === false) {
    return {
      sector,
      level: "Review",
      rationale: "Sanctions classification incomplete; no low-exposure conclusion",
    };
  }
  return {
    sector,
    level: "Low",
    rationale: "No sanctions programme or FATF black-list constraint identified",
  };
}

function cryptoRow(input: SectorExposureInput): SectorRow {
  const sector = "Crypto & virtual assets";
  const acct = input.domains.accountability;
  if (input.fatf === "black") {
    return {
      sector,
      level: "High",
      rationale: "FATF black-list status signals severe VASP supervision gaps",
    };
  }
  if (input.fatf === "grey") {
    return {
      sector,
      level: "Elevated",
      rationale: "FATF grey-list VASP supervision gaps raise virtual-asset risk",
    };
  }
  if (atLeast(acct, 6)) {
    return {
      sector,
      level: "Elevated",
      rationale: `Weak accountability governance (WGI ${acct!.toFixed(1)}/10 risk)`,
    };
  }
  if (acct === null) {
    return {
      sector,
      level: "Review",
      rationale: "Accountability evidence unavailable; no low-exposure conclusion",
    };
  }
  return {
    sector,
    level: "Low",
    rationale: "No FATF listing, accountability governance within normal range",
  };
}

function realEstateRow(input: SectorExposureInput): SectorRow {
  const sector = "Real estate & luxury assets";
  const corr = input.domains.corruption;
  const cpi = input.cpi;
  if (cpi !== undefined && cpi < 25) {
    return {
      sector,
      level: "High",
      rationale: `Severe corruption exposure (CPI ${cpi}/100) drives laundering risk`,
    };
  }
  if (cpi !== undefined && cpi < 40) {
    return {
      sector,
      level: "Elevated",
      rationale: `Elevated corruption exposure (CPI ${cpi}/100)`,
    };
  }
  if (atLeast(corr, 6)) {
    return {
      sector,
      level: "Elevated",
      rationale: `Weak corruption-control governance (WGI ${corr!.toFixed(1)}/10 risk)`,
    };
  }
  if (corr === null) {
    return {
      sector,
      level: "Review",
      rationale: "Corruption-control evidence unavailable; no low-exposure conclusion",
    };
  }
  return {
    sector,
    level: "Low",
    rationale: "Corruption indicators within normal range for high-value assets",
  };
}

function stateLinkedRow(input: SectorExposureInput): SectorRow {
  const sector = "State-linked & procurement";
  const pol = input.domains.politicalStability;
  const corr = input.domains.corruption;
  if (input.sanctionsTier === "comprehensive") {
    return {
      sector,
      level: "High",
      rationale: "Comprehensive sanctions capture state entities and procurement",
    };
  }
  if (atLeast(pol, 7) || atLeast(corr, 7)) {
    const driver = atLeast(corr, 7)
      ? `corruption WGI ${corr!.toFixed(1)}/10`
      : `political-stability WGI ${pol!.toFixed(1)}/10`;
    return {
      sector,
      level: "High",
      rationale: `High state-capture risk (${driver})`,
    };
  }
  if (atLeast(pol, 6) || atLeast(corr, 6)) {
    const driver = atLeast(corr, 6)
      ? `corruption WGI ${corr!.toFixed(1)}/10`
      : `political-stability WGI ${pol!.toFixed(1)}/10`;
    return {
      sector,
      level: "Elevated",
      rationale: `State-capture exposure (${driver})`,
    };
  }
  if (pol === null || corr === null) {
    return {
      sector,
      level: "Review",
      rationale: "Governance evidence incomplete; no low-exposure conclusion",
    };
  }
  return {
    sector,
    level: "Low",
    rationale: "Political-stability and corruption governance within normal range",
  };
}

/**
 * Derive the five-sector exposure view for a country from already-sourced inputs.
 * Order is stable (banking, trade, crypto, real estate, state-linked).
 */
export function deriveSectorExposure(input: SectorExposureInput): SectorRow[] {
  return [
    bankingRow(input),
    tradeRow(input),
    cryptoRow(input),
    realEstateRow(input),
    stateLinkedRow(input),
  ];
}

/** Highest exposure level across the sectors (for a compact headline, if wanted). */
export function highestSectorLevel(rows: SectorRow[]): SectorLevel {
  return rows.reduce<SectorLevel>((top, r) => maxLevel(top, r.level), "Review");
}
