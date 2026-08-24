/**
 * Deterministic compliance decision-support for a country report.
 *
 * Turns the country's sourced risk profile (composite band, WGI domains, FATF
 * listing, sanctions tier, enforcement coverage, CPI) into an operational verdict,
 * a recommended treatment, risk drivers, mitigating factors, a business-impact
 * table, EDD triggers and recommended controls — the SAME structure for every
 * country. Templated from data, so it is prerender-safe and never hallucinated.
 * Generic guidance, NOT legal advice.
 */
import { bandLabel, type RiskBand, type ScoreBreakdown } from "./countryRiskScore.js";
import type { CountryRiskPublicationStatus } from "./countryRiskV2.js";
import {
  SANCTIONS_REVIEWED,
  type CountrySanctions,
  type SanctionsTier,
} from "./sanctionsStatus.js";
import { SANCTIONS_CATALOGUE_REVIEWED_AS_OF } from "./sanctionsRegimeCandidates.js";
import { GOVERNANCE_VINTAGE } from "./governanceData.js";
import { boRegisterLabel, boRegisterSignal, getBoRegister } from "./boRegisters.js";
import { CPI_YEAR, type CpiEntry } from "./cpiData.js";
import type { FatfStatus } from "./fatfStatus.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmt(iso: string): string {
  const [y, m, d] = iso.split("-");
  const mon = m ? MONTHS[Number(m) - 1] : undefined;
  if (d && mon) return `${Number(d)} ${mon} ${y}`;
  if (mon) return `${mon} ${y}`;
  return y;
}

/**
 * How far a firm has to go on a given activity.
 *
 * "Restricted" is not a severity step above "Enhanced" — it is a different
 * statement. It means a legal instrument reaches the activity directly, so the
 * question is permission rather than diligence, and it is only ever set from a
 * sanctions programme we hold, never from a modelled score.
 */
export type ImpactLevel = "Restricted" | "Enhanced" | "Elevated" | "Standard" | "Review";

export interface BusinessImpactRow {
  activity: string;
  level: ImpactLevel;
  implication: string;
  /** The specific evidence that put this activity at this level. */
  driver: string;
}

/** One row of "what firms should consider": the factor, why it matters, what to do. */
export interface ConsiderationRow {
  key: string;
  factor: string;
  why: string;
  mitigants: string[];
}
export interface WhatChangedItem {
  label: string;
  value: string;
  asOf: string;
}
export interface CountryDecision {
  verdictHeadline: string;
  verdictParagraph: string;
  treatment: string;
  /** Short label for the treatment card. Same rules as `treatment`. */
  treatmentHeadline: string;
  /**
   * 4-5 deterministic, profile-derived checklist items for the recommended
   * treatment card. Same country always yields the same list; different risk
   * profiles yield visibly different lists.
   */
  treatmentChecklist: string[];
  /** Numeric v3 pillars, ordered by their actual contribution to the score. */
  scoreDrivers: string[];
  /** FATF and sanctions treatment signals; explicitly excluded from the score. */
  treatmentOverlays: string[];
  /** @deprecated Historical alias. Contains score drivers only, never overlays. */
  riskDrivers: string[];
  mitigatingFactors: string[];
  /** The report's "what firms should consider" table. */
  considerations: ConsiderationRow[];
  businessImpact: BusinessImpactRow[];
  eddTriggers: string[];
  recommendedControls: string[];
  whatChanged: WhatChangedItem[];
  disclaimer: string;
}

export interface DecisionInput {
  name: string;
  iso2: string;
  riskResult: {
    score: number | null;
    band: RiskBand | null;
    status: CountryRiskPublicationStatus;
  };
  /** False when no current v3 evidence is available at all. */
  scoreAvailable: boolean;
  /**
   * True when the country has no mutual evaluation and FATF's public
   * determination is standing in for the assessment ratings. In that case the
   * listing IS a score input, so it must not also be described as an overlay
   * that never affects the score.
   */
  fatfDeterminationScored?: boolean;
  breakdown: ScoreBreakdown;
  /** Current methodology pillars used for narrative drivers; v2 breakdown is historical compatibility only. */
  currentPillars?: Array<{
    key: "effectiveness" | "safeguards" | "governance";
    label: string;
    risk: number | null;
    appliedWeight: number;
    contribution: number | null;
  }>;
  /** Current WGI governance dimensions, used only to explain the governance pillar. */
  currentGovernanceDomains?: Array<{ key: string; label: string; risk: number | null }>;
  sanctions?: CountrySanctions;
  sanctionsTier?: SanctionsTier;
  sanctionsCoverageComplete: boolean;
  enforcementAssessed: boolean;
  /** Codes of the regulators RegActions tracks here (names the enforcement checklist item). */
  regulatorCodes?: string[];
  cpi?: CpiEntry;
  fatf?: FatfStatus;
  lastPlenary: string;
}

/** key → a short qualifier phrase for the verdict headline/paragraph. */
const DOMAIN_QUALIFIER: Record<string, string> = {
  corruption: "elevated corruption risk",
  ruleOfLaw: "rule-of-law and institutional weakness",
  politicalStability: "political-instability risk",
  accountability: "governance and transparency concerns",
  effectiveness: "financial-crime effectiveness gaps",
  safeguards: "technical safeguards gaps",
  governance: "governance and institutional weakness",
};
const DOMAIN_NOUN: Record<string, string> = {
  corruption: "corruption",
  ruleOfLaw: "rule of law and institutions",
  politicalStability: "political stability",
  accountability: "voice and accountability",
  effectiveness: "financial-crime effectiveness",
  safeguards: "technical safeguards",
  governance: "governance and institutions",
};

function topDomains(
  breakdown: ScoreBreakdown,
  currentPillars?: DecisionInput["currentPillars"],
  currentGovernanceDomains?: DecisionInput["currentGovernanceDomains"],
) {
  return (currentGovernanceDomains?.length
    ? currentGovernanceDomains
    : currentPillars?.map((domain, index) => ({
      key: ["effectiveness", "safeguards", "governance"][index] ?? `current-${index}`,
      label: domain.label,
      risk: domain.risk,
    })) ?? breakdown.domains)
    .filter((d) => d.risk !== null)
    .sort((a, b) => (b.risk as number) - (a.risk as number));
}

function scoredPillars(input: DecisionInput) {
  return (input.currentPillars ?? [])
    .filter((pillar) => pillar.risk !== null && pillar.contribution !== null)
    .sort((a, b) => (b.contribution as number) - (a.contribution as number));
}

export function hasComprehensiveSanctions(sanctions?: CountrySanctions): boolean {
  return !!sanctions?.programs.some((p) => p.tier === "comprehensive");
}

/**
 * The short label above the treatment sentence.
 *
 * This used to be derived from the risk band alone, which put "Standard +
 * Enhanced Checks" above a card stating that every activity is restricted:
 * Cuba sits in the moderate band and is under a comprehensive embargo. A legal
 * instrument outranks the band here exactly as it does in `treatmentFor`.
 */
export function treatmentHeadline(input: DecisionInput): string {
  const comprehensive = input.sanctionsCoverageComplete && hasComprehensiveSanctions(input.sanctions);
  if (input.fatf?.requiredAction === "countermeasures" || comprehensive) return "Enhanced DD + Restrictions";
  if (input.fatf?.requiredAction === "enhanced-due-diligence") return "Enhanced Due Diligence";
  if (!input.scoreAvailable) return "More Information Needed";
  const band = input.riskResult.band;
  if (band === "very-high" || band === "high") return "Enhanced Due Diligence";
  if (band === "moderate") return "Standard + Enhanced Checks";
  return "Standard Due Diligence";
}

function treatmentFor(input: DecisionInput): string {
  const countermeasures = input.fatf?.requiredAction === "countermeasures";
  const enhancedDueDiligence = input.fatf?.requiredAction === "enhanced-due-diligence";
  const comprehensive = input.sanctionsCoverageComplete && hasComprehensiveSanctions(input.sanctions);
  const band = input.riskResult.band;
  if (countermeasures || comprehensive)
    return "Enhanced due diligence, with restriction or prohibition of higher-risk activity.";
  if (enhancedDueDiligence)
    return "Enhanced due diligence proportionate to the risks; FATF does not call for countermeasures.";
  if (!input.scoreAvailable)
    return input.fatf
      ? "Enhanced due diligence while the missing country-risk evidence is resolved."
      : "Do not assign a low-risk treatment until an approved alternative country-risk assessment closes the evidence gap.";
  // These used to be bare restatements of the heading above them ("Standard
  // due diligence." under "Standard Due Diligence"), which spent a line saying
  // nothing. Each now says what the treatment covers and where it stops.
  if (band === "very-high" || (input.sanctionsCoverageComplete && input.sanctionsTier) || input.fatf)
    return "Enhanced due diligence on every relationship, with senior approval and enhanced ongoing monitoring.";
  if (band === "high")
    return "Enhanced due diligence where defined risk triggers are present, and documented justification for accepting the relationship.";
  if (band === "moderate")
    return "Standard due diligence for most relationships, with enhanced checks where defined risk triggers are present.";
  return "Standard due diligence is appropriate for most relationships, with enhanced review where ownership, sector exposure or transaction patterns raise the risk.";
}

function verdict(input: DecisionInput): { headline: string; paragraph: string } {
  if (!input.scoreAvailable || input.riskResult.score === null || input.riskResult.band === null) {
    const fatfPhrase = input.fatf
      ? `It remains subject to the FATF ${input.fatf.listing === "call-for-action" ? "call-for-action" : "increased-monitoring"} flag, which must be handled independently.`
      : "It is not currently FATF grey- or black-listed, but that absence does not establish low risk.";
    // The one-line verdict is the headline of the whole report. "Not enough
    // information for a country risk score" is true, but for Iran and North
    // Korea it buried the fact that both are subject to a FATF call for action
    // requiring countermeasures -- which the very next paragraph then stated.
    // Lead with the legal status where there is one; it is a fact, not a
    // modelled estimate, so it is safe to state exactly where a score is not.
    const legalHeadline =
      input.fatf?.listing === "call-for-action"
        ? input.fatf.requiredAction === "countermeasures"
          ? "FATF call for action requiring countermeasures; no score published"
          : "FATF call for action requiring enhanced due diligence; no score published"
        : input.sanctionsCoverageComplete && hasComprehensiveSanctions(input.sanctions)
          ? "Comprehensive sanctions programme; no score published"
          : input.fatf?.listing === "increased-monitoring"
            ? "FATF increased monitoring; no score published"
            : null;
    return {
      headline: legalHeadline ?? "Not enough information for a country risk score",
      paragraph: `${input.name} has information for fewer than two of the three parts of the score, so RegActions does not publish a number or risk band. ${fatfPhrase} Missing information is not treated as zero or Low risk.`,
    };
  }
  const drivers = scoredPillars(input);
  const top = drivers[0];
  const qualifier = top && (top.risk as number) >= 4
    ? DOMAIN_QUALIFIER[top.key] ?? `elevated ${top.label.toLowerCase()} risk`
    : "";
  const headline = `${bandLabel(input.riskResult.band)} country risk${qualifier ? `, with ${qualifier}` : ""}`;

  const bandLower = bandLabel(input.riskResult.band).toLowerCase();
  const driverPhrase = top
    ? `${top.label.toLowerCase()}, contributing ${(top.contribution as number).toFixed(1)} of ${input.riskResult.score.toFixed(1)} points`
    : "the available scored pillars";
  const fatfPhrase = input.fatf
    ? input.fatf.listing === "call-for-action"
      ? input.fatf.requiredAction === "countermeasures"
        ? "subject to a FATF call for action requiring countermeasures"
        : "subject to a FATF call for action requiring enhanced due diligence, not countermeasures"
      : "subject to FATF increased monitoring"
    : "not currently FATF grey- or black-listed";
  const sancClause = !input.sanctionsCoverageComplete
    ? "International sanctions information is unavailable, so the absence of a programme is not assumed"
    : hasComprehensiveSanctions(input.sanctions)
      ? `${input.name} is subject to comprehensive country-wide sanctions`
      : input.sanctionsTier
        ? `${input.name} has a ${input.sanctionsTier} sanctions programme`
        : `${input.name} is not subject to comprehensive country-wide sanctions and has no direct country-level programme identified`;
  const scrutiny =
    input.riskResult.band === "low"
      ? ""
      : " Firms should apply additional scrutiny where exposure involves state-linked entities, restricted sectors, sensitive technology, dual-use goods or politically exposed counterparties.";
  const statusClause = input.riskResult.status === "provisional"
    ? " Some information is unavailable, so the available parts are rebalanced and the country will not be labelled Low risk while information is missing."
    : "";
  const paragraph = `${input.name}'s country risk score is ${input.riskResult.score.toFixed(1)}/10, placing it in the ${bandLower}-risk band.${statusClause} The principal score driver is ${driverPhrase}. Separately, the treatment overlays show that ${input.name} is ${fatfPhrase}, and that ${sancClause}.${scrutiny}`;
  return { headline, paragraph };
}

function scoreDrivers(input: DecisionInput): string[] {
  if (!input.scoreAvailable) {
    return ["Headline score withheld; available evidence is not weighted until at least two pillars are available"];
  }
  const out = scoredPillars(input).map((pillar) =>
    `${pillar.label}: ${(pillar.risk as number).toFixed(1)}/10 × ${Math.round(pillar.appliedWeight * 100)}% = ${(pillar.contribution as number).toFixed(1)} points`,
  );
  return out.length ? out : ["No scored pillar contribution is available"];
}

function treatmentOverlays(input: DecisionInput): string[] {
  const out: string[] = [];
  if (input.fatf) {
    const action = input.fatf.listing === "increased-monitoring"
      ? "increased-monitoring status"
      : input.fatf.requiredAction === "countermeasures"
        ? "call for action requiring countermeasures"
        : "call for action requiring enhanced due diligence";
    out.push(
      input.fatfDeterminationScored
        ? `FATF ${action} — scored in place of mutual-evaluation ratings, which do not exist for this jurisdiction`
        : `FATF treatment overlay: ${action} (not a score input)`,
    );
  }
  if (input.sanctionsCoverageComplete && input.sanctionsTier)
    out.push(
      `Sanctions treatment overlay: ${input.sanctionsTier} programme (not a score input)`,
    );
  if (!input.sanctionsCoverageComplete) {
    out.push("Sanctions treatment overlay: evidence incomplete; absence is not inferred");
  }
  return out.length ? out : ["No FATF or direct country-level sanctions treatment overlay identified"];
}

function mitigatingFactors(input: DecisionInput): string[] {
  const out: string[] = [];
  if (!input.fatf) out.push("Not currently on the FATF grey or black list.");
  if (input.sanctionsCoverageComplete && !hasComprehensiveSanctions(input.sanctions))
    out.push("No comprehensive country-wide sanctions programme.");
  const strongest = [...topDomains(input.breakdown, input.currentPillars, input.currentGovernanceDomains)].reverse()[0];
  if (strongest && (strongest.risk as number) < 5)
    out.push(`Comparatively stronger ${DOMAIN_NOUN[strongest.key] ?? strongest.label.toLowerCase()} (${(strongest.risk as number).toFixed(1)}/10).`);
  out.push(
    !input.scoreAvailable
      ? "No low-risk conclusion is drawn until the evidence gap is resolved."
      : input.riskResult.band === "low"
      ? "Overall governance and institutional quality are relatively strong."
      : "Risk is concentrated in specific counterparties, sectors and transactions rather than applying uniformly.",
  );
  return out;
}

/** The band's own level, used where nothing more specific bears on an activity. */
function baselineLevel(input: DecisionInput): ImpactLevel {
  if (!input.scoreAvailable) return "Review";
  const band = input.riskResult.band;
  if (band === "very-high" || band === "high") return "Enhanced";
  if (band === "moderate") return "Elevated";
  return "Standard";
}

/**
 * Why an activity sits where it does when no instrument reaches it directly.
 *
 * Without this the row read "Enhanced — no sectoral or comprehensive trade
 * measures identified", which states a level and then gives a reason that
 * argues against it. Where the level comes from the band, the band is the
 * reason and the row has to say so.
 */
function bandClause(input: DecisionInput): string {
  if (!input.scoreAvailable || input.riskResult.band === null) {
    return "no country-risk score is published, so the activity stays under review";
  }
  return `the ${bandLabel(input.riskResult.band).toLowerCase()} country-risk band applies`;
}

/** One step down, floored at Standard. A mitigant can relax an activity, not clear it. */
function softer(level: ImpactLevel): ImpactLevel {
  if (level === "Enhanced") return "Elevated";
  if (level === "Elevated") return "Standard";
  return level;
}

function governanceRiskFor(input: DecisionInput, key: string): number | null {
  const domain = input.currentGovernanceDomains?.find((item) => item.key === key);
  return domain?.risk ?? null;
}

function sanctionsImposers(input: DecisionInput): string {
  const imposers = [...new Set((input.sanctions?.programs ?? []).map((programme) => programme.imposer))];
  return imposers.length ? imposers.join(", ") : "";
}

/**
 * What the country's profile means for each line of business.
 *
 * Every row used to carry the same level, because the level was derived from
 * the band and nothing else — five identical "ENHANCED" badges down a column,
 * which is a column that cannot tell you anything. Each activity is now read
 * against the evidence that actually bears on it, and the row states which
 * evidence that was, so a level can be checked rather than taken on trust.
 *
 * A sanctions programme is the only thing that can produce "Restricted": that
 * is a legal fact about the activity, not an inference from a score. Where the
 * sanctions evidence is incomplete we say so rather than reading silence as
 * permission.
 */
function businessImpact(input: DecisionInput): BusinessImpactRow[] {
  const base = baselineLevel(input);
  const comprehensive = input.sanctionsCoverageComplete && hasComprehensiveSanctions(input.sanctions);
  const tier = input.sanctionsCoverageComplete ? input.sanctionsTier : undefined;
  const imposers = sanctionsImposers(input);
  const countermeasures = input.fatf?.requiredAction === "countermeasures";
  const fatfListed = Boolean(input.fatf);
  const corruption = governanceRiskFor(input, "corruption");
  const stability = governanceRiskFor(input, "politicalStability");
  const boRegister = getBoRegister(input.iso2);

  const sanctionsGap = !input.sanctionsCoverageComplete;
  const sanctionsGapDriver = "Sanctions evidence is incomplete for this jurisdiction; absence of a programme is not assumed.";

  // A public register is a genuine mitigant, so it can pull onboarding back a
  // step; no register at all pushes it up. Neither ever crosses "Restricted",
  // which only a legal instrument can set.
  const publicRegister = boRegister?.status === "live-public";
  const onboarding: BusinessImpactRow = comprehensive
    ? {
        activity: "Customer onboarding",
        level: "Restricted",
        implication: "Most new relationships cannot be established without a licence or exemption.",
        driver: `Comprehensive ${imposers || "country-wide"} sanctions programme.`,
      }
    : {
        activity: "Customer onboarding",
        level: !boRegister
          ? "Enhanced"
          : corruption !== null && corruption >= 6
            ? "Enhanced"
            : publicRegister
              ? softer(base)
              : base,
        implication: "Verify ultimate beneficial ownership and control from more than one source.",
        driver: !boRegister
          ? "No beneficial-ownership register is recorded, so ownership cannot be corroborated against an official register."
          : corruption !== null && corruption >= 6
            ? `Corruption and integrity risk ${corruption.toFixed(1)}/10, so the ${boRegisterLabel(boRegister.status).toLowerCase()} register needs independent corroboration.`
            : publicRegister
              ? `A public beneficial-ownership register${boRegister.since ? `, live since ${boRegister.since},` : ""} allows ownership to be checked directly.`
              : `Beneficial-ownership register: ${boRegisterSignal(input.iso2).toLowerCase()}.`,
      };

  const payments: BusinessImpactRow = comprehensive
    ? {
        activity: "Payments and transactions",
        level: "Restricted",
        implication: "Payments are prohibited except under a licence or a recognised exemption.",
        driver: `Comprehensive ${imposers || "country-wide"} sanctions programme.`,
      }
    : {
        activity: "Payments and transactions",
        level: sanctionsGap ? "Review" : tier || fatfListed ? "Enhanced" : base,
        implication: "Review transaction purpose, counterparties and the full payment routing.",
        driver: sanctionsGap
          ? sanctionsGapDriver
          : tier
            ? `${tier.charAt(0).toUpperCase()}${tier.slice(1)} ${imposers} measures reach named parties in the payment chain.`
            : fatfListed
              ? `FATF ${input.fatf!.listing === "call-for-action" ? "call for action" : "increased monitoring"} applies to this jurisdiction.`
              : `No direct country-level programme is identified, so ${bandClause(input)}; counterparties can still be designated individually.`,
      };

  const trade: BusinessImpactRow = comprehensive
    ? {
        activity: "Trade and export activity",
        level: "Restricted",
        implication: "Goods, services and end users need licence checks before any commitment.",
        driver: `Comprehensive ${imposers || "country-wide"} sanctions programme reaches most goods and end users.`,
      }
    : {
        activity: "Trade and export activity",
        level: sanctionsGap
          ? "Review"
          : tier === "sectoral" || countermeasures
            ? "Enhanced"
            : tier
              ? "Elevated"
              : base,
        implication: "Screen goods, end users and potential dual-use exposure.",
        driver: sanctionsGap
          ? sanctionsGapDriver
          : tier === "sectoral"
            ? `Sectoral ${imposers} measures restrict defined goods and sectors.`
            : countermeasures
              ? "FATF countermeasures apply, which reach trade finance and correspondent routing."
              : tier
                ? `Targeted ${imposers} measures apply to named parties rather than to sectors.`
                : `No sectoral or comprehensive trade measures are identified, so ${bandClause(input)}.`,
      };

  const corporate: BusinessImpactRow = {
    activity: "Corporate clients",
    level: comprehensive
      ? "Restricted"
      : corruption === null
        ? "Review"
        : corruption >= 6.5
          ? "Enhanced"
          : corruption <= 3
            ? softer(base)
            : base,
    implication: "Assess state ownership, government links and political exposure.",
    driver: comprehensive
      ? "State-linked entities are within the scope of the comprehensive programme."
      : corruption === null
        ? "Governance evidence is unavailable for this jurisdiction, so state linkage cannot be discounted."
        : corruption >= 6.5
          ? `Corruption and integrity risk ${corruption.toFixed(1)}/10 raises the chance of undisclosed state or political interest.`
          : corruption <= 3
            ? `Corruption and integrity risk ${corruption.toFixed(1)}/10; declared ownership and control are more likely to be complete.`
            : `Corruption and integrity risk ${corruption.toFixed(1)}/10, and ${bandClause(input)}.`,
  };

  const monitoring: BusinessImpactRow = {
    activity: "Ongoing monitoring",
    level: countermeasures || comprehensive ? "Enhanced" : fatfListed ? "Enhanced" : base,
    implication: "Alert on ownership changes, new designations and status changes.",
    driver: countermeasures
      ? "FATF countermeasures are in force and are reviewed at each plenary."
      : fatfListed
        ? `FATF status was last reviewed ${fmt(input.lastPlenary)} and can change at any plenary.`
        : stability !== null && stability >= 6
          ? `Political stability risk ${stability.toFixed(1)}/10 makes the picture liable to change.`
          : `No listing or instability signal applies, so ${bandClause(input)}; status changes still follow designations and FATF plenary outcomes.`,
  };

  return [onboarding, payments, trade, corporate, monitoring];
}

/**
 * The four factors a firm has to form a view on, with the evidence for each.
 *
 * The report previously split this across a "score drivers" list, a
 * "mitigating factors" list and a treatment-overlay list, none of which
 * referred to one another — so the reader had to assemble the connection
 * between a weakness and what to do about it themselves. The same four factors
 * appear for every country; only the evidence and the response change, which is
 * what makes two countries comparable.
 */
function considerations(input: DecisionInput): ConsiderationRow[] {
  const comprehensive = input.sanctionsCoverageComplete && hasComprehensiveSanctions(input.sanctions);
  const tier = input.sanctionsCoverageComplete ? input.sanctionsTier : undefined;
  const imposers = sanctionsImposers(input);
  const programmes = [...new Set((input.sanctions?.programs ?? []).map((programme) => programme.program))];
  const boRegister = getBoRegister(input.iso2);
  const effectiveness = input.currentPillars?.find((pillar) => pillar.key === "effectiveness");
  const safeguards = input.currentPillars?.find((pillar) => pillar.key === "safeguards");
  const worstGovernance = topDomains(input.breakdown, input.currentPillars, input.currentGovernanceDomains)[0];

  const sanctionsWhy = !input.sanctionsCoverageComplete
    ? "Sanctions evidence is incomplete for this jurisdiction, so the absence of a programme cannot be relied on."
    : comprehensive
      ? `A comprehensive ${imposers} programme applies${programmes.length ? ` (${programmes.slice(0, 2).join("; ")})` : ""}, reaching most dealings rather than named parties alone.`
      : tier
        ? `${tier.charAt(0).toUpperCase()}${tier.slice(1)} ${imposers} measures are in force, so exposure depends on the specific parties and sectors involved.`
        : "No direct country-level programme is identified, but counterparties and their ownership chains can still be designated.";

  const fatfWhy = input.fatf
    ? input.fatf.listing === "call-for-action"
      ? `FATF applies a call for action requiring ${input.fatf.requiredAction === "countermeasures" ? "countermeasures" : "enhanced due diligence"}, last reviewed ${fmt(input.lastPlenary)}.`
      : `FATF applies increased monitoring, last reviewed ${fmt(input.lastPlenary)}.`
    : effectiveness?.risk != null
      ? `Not FATF grey- or black-listed. Mutual-evaluation effectiveness sits at ${effectiveness.risk.toFixed(1)}/10 risk${safeguards?.risk != null ? ` and technical safeguards at ${safeguards.risk.toFixed(1)}/10` : ""}.`
      : "Not FATF grey- or black-listed, and no current mutual-evaluation ratings are available for this jurisdiction.";

  const governanceWhy = worstGovernance && worstGovernance.risk !== null
    ? (worstGovernance.risk as number) >= 5
      ? `${worstGovernance.label} is the weakest measure at ${(worstGovernance.risk as number).toFixed(1)}/10 risk, which raises the chance of undisclosed control and unreliable public records.`
      : `${worstGovernance.label} is the weakest measure at ${(worstGovernance.risk as number).toFixed(1)}/10 risk, which is comparatively strong; public records are more likely to be reliable.`
    : "World Bank governance evidence is unavailable for this jurisdiction, so institutional quality cannot be assessed.";

  const boWhy = boRegister
    ? `A beneficial-ownership register exists and is ${boRegisterLabel(boRegister.status).toLowerCase()}${boRegister.since ? `, live since ${boRegister.since}` : ""}.`
    : "No beneficial-ownership register is recorded for this jurisdiction, so ownership cannot be checked against an official source.";

  return [
    {
      key: "sanctions",
      factor: "Sanctions and regulatory exposure",
      why: sanctionsWhy,
      mitigants: !input.sanctionsCoverageComplete
        ? ["Treat the gap as unresolved and screen against all applicable lists.", "Obtain legal advice before committing to exposure."]
        : comprehensive
          ? ["Screen every party and check for an applicable licence or exemption.", "Take legal advice before any commitment."]
          : ["Screen customers, counterparties and transactions against current lists.", "Re-screen when designations change."],
    },
    {
      key: "fatf",
      factor: "AML/CFT effectiveness",
      why: fatfWhy,
      mitigants: input.fatf
        ? ["Apply enhanced due diligence proportionate to the listing.", "Monitor plenary outcomes for status changes."]
        : ["Maintain risk-based AML/CFT controls and independent testing.", "Apply enhanced review where transaction patterns warrant it."],
    },
    {
      key: "governance",
      factor: "Governance and institutions",
      why: governanceWhy,
      mitigants: worstGovernance && (worstGovernance.risk as number) >= 5
        ? ["Corroborate ownership and source of wealth independently of local records.", "Verify politically exposed connections before onboarding."]
        : ["Use official registries as the primary corroboration.", "Apply standard politically-exposed-person screening."],
    },
    {
      key: "beneficial-ownership",
      factor: "Beneficial ownership transparency",
      why: boWhy,
      mitigants: boRegister
        ? ["Check the register and reconcile it against what the customer declares.", "Escalate any unexplained difference."]
        : ["Verify ownership from at least two independent sources.", "Escalate unresolved opacity to Compliance."],
    },
  ];
}

const EDD_TRIGGERS = [
  "State ownership / control",
  "PEP involvement",
  "Sensitive / restricted sectors",
  "Opaque ownership",
  "Adverse media",
  "Dual-use goods & technology",
  "High-risk intermediary routing",
];

const RECOMMENDED_CONTROLS = [
  "Verify ultimate beneficial ownership using more than one reliable source.",
  "Identify state ownership, government influence and politically exposed persons.",
  "Screen entities, directors and beneficial owners against applicable sanctions lists.",
  "Apply enhanced review to technology, defence, telecommunications, financial services and dual-use activity.",
  "Document transaction purpose and source of funds where cross-border structures are complex.",
  "Escalate unresolved ownership opacity or adverse information to Compliance.",
];

/** Weakest governance domain → the diligence emphasis it calls for. */
const DOMAIN_DILIGENCE: Record<string, string> = {
  corruption:
    "Deepen UBO and PEP verification given elevated corruption risk",
  ruleOfLaw:
    "Corroborate ownership and contractual claims where rule-of-law is weak",
  politicalStability:
    "Monitor political-instability exposure for state-linked counterparties",
  accountability:
    "Apply adverse-media and governance-transparency checks",
};

/**
 * Derive a 4-5 item treatment checklist from the country's actual profile.
 * Deterministic (same country, same list) and profile-sensitive (comprehensive
 * sanctions, FATF listing, weakest WGI domain and enforcement coverage each add a
 * distinct item). Low-risk countries get proportionate standard-DD items instead.
 */
export function treatmentChecklist(input: DecisionInput): string[] {
  const out: string[] = [];
  const comprehensive = input.sanctionsCoverageComplete && hasComprehensiveSanctions(input.sanctions);
  const countermeasures = input.fatf?.requiredAction === "countermeasures";
  const enhancedDueDiligence = input.fatf?.requiredAction === "enhanced-due-diligence";

  if (!input.scoreAvailable) {
    out.push("Obtain or document an approved alternative country-risk assessment");
    out.push("Do not classify the jurisdiction as low risk from missing evidence");
  }

  // 1. Sanctions posture.
  if (comprehensive) {
    out.push(
      "Confirm prohibition or licensing position before any dealing (comprehensive programme)",
    );
  } else if (input.sanctionsCoverageComplete && input.sanctionsTier) {
    out.push(
      "Screen parties, owners and cargo against applicable OFAC, UK, EU and UN lists",
    );
  }

  // 2. FATF listing → remediation-progress monitoring.
  if (input.fatf) {
    out.push(
      countermeasures
        ? "Track FATF countermeasures and action-plan status each plenary"
        : enhancedDueDiligence
          ? "Apply proportionate FATF enhanced due diligence; do not treat it as a call for countermeasures"
          : "Monitor FATF increased-monitoring remediation progress each plenary",
    );
    if (enhancedDueDiligence) {
      out.push("Protect legitimate humanitarian, NPO and remittance flows from indiscriminate de-risking");
    }
  }

  // 3. Weakest governance domain → matching diligence emphasis.
  const weakest = topDomains(input.breakdown, input.currentPillars, input.currentGovernanceDomains)[0];
  if (weakest && (weakest.risk as number) >= 4) {
    const item = DOMAIN_DILIGENCE[weakest.key];
    if (item) out.push(item);
  }

  // 4. Enforcement coverage → monitor named-regulator actions.
  if (input.enforcementAssessed) {
    const codes = (input.regulatorCodes ?? []).slice(0, 3);
    out.push(
      codes.length > 0
        ? `Monitor ${codes.join(" / ")} enforcement actions for this jurisdiction`
        : "Monitor tracked regulator enforcement actions for this jurisdiction",
    );
  }

  // 5. Proportionate standard-DD items for lower-risk / thin profiles.
  const isLow = input.scoreAvailable && input.riskResult.band === "low";
  const standardItems = isLow
    ? [
        "Apply proportionate standard due diligence to new counterparties",
        "Verify beneficial ownership from a reliable independent source",
        "Refresh screening at onboarding and on periodic review",
      ]
    : [
        "Verify beneficial ownership and control structure",
        "Document transaction purpose and source of funds",
        "Refresh screening on ownership or profile changes",
      ];
  for (const item of standardItems) {
    if (out.length >= 5) break;
    out.push(item);
  }

  // A sparse profile can otherwise produce only three generic controls. Keep
  // the card operationally useful without inventing a risk signal.
  if (out.length < 4) out.push("Document the rationale for the selected country-risk treatment");

  return out.slice(0, 5);
}

function whatChanged(input: DecisionInput): WhatChangedItem[] {
  const sancValue = !input.sanctionsCoverageComplete
    ? "Official-source evidence incomplete; absence not inferred"
    : hasComprehensiveSanctions(input.sanctions)
      ? "Comprehensive programme in place"
      : input.sanctionsTier
        ? `${input.sanctionsTier.charAt(0).toUpperCase() + input.sanctionsTier.slice(1)} programme in place`
        : "None identified";
  return [
    {
      label: "FATF status",
      value: input.fatf
        ? input.fatf.listing === "increased-monitoring"
          ? "Increased monitoring"
          : input.fatf.requiredAction === "countermeasures"
            ? "Call for action: countermeasures"
            : "Call for action: enhanced due diligence"
        : "Not listed",
      asOf: fmt(input.lastPlenary),
    },
    { label: "Sanctions exposure", value: sancValue, asOf: fmt(input.sanctionsCoverageComplete ? SANCTIONS_REVIEWED : SANCTIONS_CATALOGUE_REVIEWED_AS_OF) },
    {
      label: "Governance (WGI)",
      value: input.scoreAvailable
        ? "Latest dataset incorporated"
        : "Unavailable for this jurisdiction; headline score withheld",
      asOf: GOVERNANCE_VINTAGE,
    },
    { label: "Corruption (CPI)", value: input.cpi ? `${input.cpi.score}/100` : "Not available", asOf: CPI_YEAR },
    { label: "RegActions assessment", value: "Reviewed", asOf: fmt(input.lastPlenary) },
  ];
}

export function buildDecision(input: DecisionInput): CountryDecision {
  const v = verdict(input);
  const drivers = scoreDrivers(input);
  return {
    verdictHeadline: v.headline,
    verdictParagraph: v.paragraph,
    treatment: treatmentFor(input),
    treatmentHeadline: treatmentHeadline(input),
    treatmentChecklist: treatmentChecklist(input),
    scoreDrivers: drivers,
    treatmentOverlays: treatmentOverlays(input),
    riskDrivers: drivers,
    mitigatingFactors: mitigatingFactors(input),
    considerations: considerations(input),
    businessImpact: businessImpact(input),
    eddTriggers: EDD_TRIGGERS,
    recommendedControls: RECOMMENDED_CONTROLS,
    whatChanged: whatChanged(input),
    disclaimer:
      "Generic guidance derived from the country risk profile, not legal advice. Apply your firm's own customer risk assessment and the sanctions regimes applicable to your jurisdiction.",
  };
}
