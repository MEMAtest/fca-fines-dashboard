import {
  BO_REGISTER_RECORDS,
  BO_REGISTER_SOURCE,
  BO_REGISTER_LICENCE,
  type BeneficialOwnershipRegisterEntry,
  type BeneficialOwnershipRegisterRecord,
} from "./beneficialOwnershipRegisterData.js";

export type BoRegisterAccessTier =
  | "cdd-accessible"
  | "civil-society"
  | "authorities-only"
  | "registrar-only"
  | "none-identified"
  | "unrecorded";

export interface BoRegisterEvidence {
  /** 0-10, higher means less usable beneficial-ownership transparency. Null when unknown. */
  risk: number | null;
  tier: BoRegisterAccessTier;
  /** Every live register Open Ownership records for the jurisdiction. */
  registers: BeneficialOwnershipRegisterEntry[];
  /** True when at least one register covers the whole economy rather than one sector. */
  fullEconomy: boolean;
  label: string;
  explanation: string;
  sourceUrl: string;
  licence: string;
}

/**
 * Access classes that let the firm doing the customer due diligence actually
 * read the register.
 *
 * This is the judgement the whole mapping turns on, and it is deliberately NOT
 * "is the register public".
 *
 * In November 2022 the Court of Justice of the European Union struck down
 * mandatory public access to member-state beneficial-ownership registers
 * (joined cases C-37/20 and C-601/20). Member states responded by restricting
 * access to competent authorities and obliged entities. Scoring "not public" as
 * opaque would therefore mark down a large part of the EU for complying with
 * its own supreme court, which is not a defensible position on a compliance
 * product.
 *
 * What matters for AML work is whether a regulated firm can verify beneficial
 * ownership when onboarding a counterparty. A register open to obliged entities
 * answers that question exactly as well as a public one does.
 */
const CDD_ACCESS = new Set(["General public", "Obliged entities"]);

function isFullEconomy(entry: BeneficialOwnershipRegisterEntry): boolean {
  return (entry.scope ?? "").toLowerCase().includes("full-economy");
}

function tierFor(entries: BeneficialOwnershipRegisterEntry[]): BoRegisterAccessTier {
  if (entries.length === 0) return "none-identified";
  const access = new Set(entries.flatMap((entry) => entry.access));
  if (access.size === 0) return "unrecorded";
  if ([...CDD_ACCESS].some((token) => access.has(token))) return "cdd-accessible";
  if (access.has("Civil society")) return "civil-society";
  if (access.has("Competent authorities")) return "authorities-only";
  return "registrar-only";
}

/**
 * The ladder, in the order that matters to a reviewer:
 *
 *   2.0  a whole-economy register a regulated firm can read
 *   4.5  open to civil society but not to obliged entities, so it is subject to
 *        scrutiny but cannot be relied on for onboarding
 *   6.0  exists, but only supervisors and law enforcement can see it
 *   7.5  held by the registrar alone
 *   9.0  no live register identified
 *
 * A register covering only one sector — extractives, procurement, land — leaves
 * most of the economy untouched, so it carries a penalty and cannot reach the
 * top of the ladder however open it is.
 */
const TIER_RISK: Record<Exclude<BoRegisterAccessTier, "unrecorded">, number> = {
  "cdd-accessible": 2,
  "civil-society": 4.5,
  "authorities-only": 6,
  "registrar-only": 7.5,
  "none-identified": 9,
};

const SECTORAL_PENALTY = 2;
const SECTORAL_CEILING = 8.5;

const TIER_LABEL: Record<BoRegisterAccessTier, string> = {
  "cdd-accessible": "Register accessible for due diligence",
  "civil-society": "Register open to civil society only",
  "authorities-only": "Register restricted to authorities",
  "registrar-only": "Register held by the registrar only",
  "none-identified": "No live register identified",
  unrecorded: "Register access not recorded",
};

export function getBoRegisters(iso2: string | null | undefined): BeneficialOwnershipRegisterRecord | undefined {
  if (!iso2) return undefined;
  return BO_REGISTER_RECORDS[iso2.toUpperCase()];
}

export function beneficialOwnershipRegisterRisk(iso2: string | null | undefined): BoRegisterEvidence {
  const record = getBoRegisters(iso2);
  const registers = record?.registers ?? [];
  const fullEconomy = registers.some(isFullEconomy);
  // Rank on the whole-economy registers where any exist. A country is not
  // marked down because its trusts register is narrower than its companies
  // register; it is marked down when nothing covers the whole economy.
  const ranked = fullEconomy ? registers.filter(isFullEconomy) : registers;
  const tier = tierFor(ranked);

  let risk: number | null;
  let explanation: string;
  if (tier === "unrecorded") {
    risk = null;
    explanation =
      "Open Ownership records a live register for this jurisdiction but does not record who may access it, so no access risk is scored.";
  } else if (tier === "none-identified") {
    risk = TIER_RISK["none-identified"];
    explanation =
      "No live beneficial-ownership register is identified in the Open Ownership snapshot. The snapshot covers live registers only and is not exhaustive, so this records an absence of evidence rather than a finding that no register exists.";
  } else {
    const raw = TIER_RISK[tier];
    risk = fullEconomy ? raw : Math.min(SECTORAL_CEILING, raw + SECTORAL_PENALTY);
    explanation = fullEconomy
      ? `${TIER_LABEL[tier]}.`
      : `${TIER_LABEL[tier]}. Coverage is sectoral rather than whole-economy, so most legal entities sit outside it.`;
  }

  return {
    risk,
    tier,
    registers,
    fullEconomy,
    label: TIER_LABEL[tier],
    explanation,
    sourceUrl: BO_REGISTER_SOURCE,
    licence: BO_REGISTER_LICENCE,
  };
}
