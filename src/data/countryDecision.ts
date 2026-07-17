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

export interface BusinessImpactRow {
  activity: string;
  level: string;
  implication: string;
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
  /**
   * 4-5 deterministic, profile-derived checklist items for the recommended
   * treatment card. Same country always yields the same list; different risk
   * profiles yield visibly different lists.
   */
  treatmentChecklist: string[];
  riskDrivers: string[];
  mitigatingFactors: string[];
  businessImpact: BusinessImpactRow[];
  eddTriggers: string[];
  recommendedControls: string[];
  whatChanged: WhatChangedItem[];
  disclaimer: string;
}

export interface DecisionInput {
  name: string;
  riskResult: {
    score: number | null;
    band: RiskBand | null;
    status: CountryRiskPublicationStatus;
  };
  /** False when fewer than two v2 pillars are available. */
  scoreAvailable: boolean;
  breakdown: ScoreBreakdown;
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
};
const DOMAIN_NOUN: Record<string, string> = {
  corruption: "corruption",
  ruleOfLaw: "rule of law and institutions",
  politicalStability: "political stability",
  accountability: "voice and accountability",
};

function topDomains(breakdown: ScoreBreakdown) {
  return breakdown.domains
    .filter((d) => d.risk !== null)
    .sort((a, b) => (b.risk as number) - (a.risk as number));
}

export function hasComprehensiveSanctions(sanctions?: CountrySanctions): boolean {
  return !!sanctions?.programs.some((p) => p.tier === "comprehensive");
}

function treatmentFor(input: DecisionInput): string {
  const black = input.fatf?.listing === "call-for-action";
  const comprehensive = input.sanctionsCoverageComplete && hasComprehensiveSanctions(input.sanctions);
  const band = input.riskResult.band;
  if (black || comprehensive)
    return "Enhanced due diligence, with restriction or prohibition of higher-risk activity.";
  if (!input.scoreAvailable)
    return input.fatf
      ? "Enhanced due diligence while the missing country-risk evidence is resolved."
      : "Do not assign a low-risk treatment until an approved alternative country-risk assessment closes the evidence gap.";
  if (band === "very-high" || (input.sanctionsCoverageComplete && input.sanctionsTier) || input.fatf)
    return "Enhanced due diligence.";
  if (band === "high")
    return "Enhanced due diligence for defined risk triggers.";
  if (band === "moderate")
    return "Standard due diligence, with enhanced checks for defined risk triggers.";
  return "Standard due diligence.";
}

function verdict(input: DecisionInput): { headline: string; paragraph: string } {
  if (!input.scoreAvailable || input.riskResult.score === null || input.riskResult.band === null) {
    const fatfPhrase = input.fatf
      ? `It remains subject to the FATF ${input.fatf.listing === "call-for-action" ? "call-for-action" : "increased-monitoring"} flag, which must be handled independently.`
      : "It is not currently FATF grey- or black-listed, but that absence does not establish low risk.";
    return {
      headline: "Insufficient evidence for a headline country-risk score",
      paragraph: `${input.name} has fewer than two available v2 pillars, so RegActions withholds the numerical score and risk band. ${fatfPhrase} No zero or Low-risk conclusion is inferred from missing evidence.`,
    };
  }
  const doms = topDomains(input.breakdown);
  const top = doms[0];
  const qualifier = top && (top.risk as number) >= 4 ? DOMAIN_QUALIFIER[top.key] : "";
  const headline = `${bandLabel(input.riskResult.band)} country risk${qualifier ? `, with ${qualifier}` : ""}`;

  const bandLower = bandLabel(input.riskResult.band).toLowerCase();
  const driverPhrase =
    doms.length > 1 && (doms[1].risk as number) >= 4
      ? `weak ${DOMAIN_NOUN[top.key]}, alongside ${DOMAIN_NOUN[doms[1].key]} risk`
      : top
        ? `weak ${DOMAIN_NOUN[top.key]}`
        : "its governance profile";
  const fatfPhrase = input.fatf
    ? input.fatf.listing === "call-for-action"
      ? "on the FATF black list"
      : "on the FATF grey list"
    : "not currently FATF grey- or black-listed";
  const sancClause = !input.sanctionsCoverageComplete
    ? "The v2 geographic-sanctions evidence is unavailable, so the absence of a programme is not inferred"
    : `${input.name} is ${hasComprehensiveSanctions(input.sanctions)
        ? "subject to comprehensive country-wide sanctions"
        : "not subject to comprehensive country-wide sanctions"}`;
  const scrutiny =
    input.riskResult.band === "low"
      ? ""
      : " Firms should apply additional scrutiny where exposure involves state-linked entities, restricted sectors, sensitive technology, dual-use goods or politically exposed counterparties.";
  const statusClause = input.riskResult.status === "provisional"
    ? " The result is provisional because one pillar is unavailable, and a Low label is not permitted."
    : "";
  const paragraph = `${input.name}'s v2 country risk score is ${input.riskResult.score.toFixed(1)}/10, placing it in the ${bandLower}-risk band.${statusClause} The principal driver is ${driverPhrase}. ${input.name} is ${fatfPhrase}. ${sancClause}.${scrutiny}`;
  return { headline, paragraph };
}

function riskDrivers(input: DecisionInput): string[] {
  const out: string[] = [];
  if (!input.scoreAvailable) out.push("World Bank WGI governance evidence unavailable; headline score withheld");
  if (input.fatf)
    out.push(`FATF ${input.fatf.listing === "call-for-action" ? "black" : "grey"}-list status`);
  if (input.sanctionsCoverageComplete && input.sanctionsTier)
    out.push(
      `${input.sanctionsTier.charAt(0).toUpperCase() + input.sanctionsTier.slice(1)} sanctions exposure`,
    );
  for (const d of topDomains(input.breakdown)) {
    if ((d.risk as number) < 5 || out.length >= 5) break;
    out.push(`${d.label} — ${(d.risk as number).toFixed(1)}/10`);
  }
  return out.length
    ? out
    : [input.sanctionsCoverageComplete
        ? "Governance-driven baseline risk; no listing or sanctions escalators"
        : "Governance-driven baseline risk; sanctions evidence unavailable"];
}

function mitigatingFactors(input: DecisionInput): string[] {
  const out: string[] = [];
  if (!input.fatf) out.push("Not currently on the FATF grey or black list.");
  if (input.sanctionsCoverageComplete && !hasComprehensiveSanctions(input.sanctions))
    out.push("No comprehensive country-wide sanctions programme.");
  const strongest = [...topDomains(input.breakdown)].reverse()[0];
  if (strongest && (strongest.risk as number) < 5)
    out.push(`Comparatively stronger ${DOMAIN_NOUN[strongest.key]} (${(strongest.risk as number).toFixed(1)}/10).`);
  out.push(
    !input.scoreAvailable
      ? "No low-risk conclusion is drawn until the evidence gap is resolved."
      : input.riskResult.band === "low"
      ? "Overall governance and institutional quality are relatively strong."
      : "Risk is concentrated in specific counterparties, sectors and transactions rather than applying uniformly.",
  );
  return out;
}

function businessImpact(input: DecisionInput): BusinessImpactRow[] {
  const level =
    !input.scoreAvailable
      ? "Review"
      : input.riskResult.band === "low"
      ? "Low"
      : input.riskResult.band === "moderate"
        ? "Medium"
        : input.riskResult.band === "high"
          ? "High"
          : "Enhanced";
  return [
    { activity: "Customer onboarding", level, implication: "Additional ownership and control verification may be required." },
    { activity: "Payments and transactions", level, implication: "Review transaction purpose, counterparties and geographic routing." },
    { activity: "Trade and export activity", level, implication: "Screen goods, end users and potential dual-use exposure." },
    { activity: "Corporate clients", level, implication: "Assess state ownership, government links and political exposure." },
    { activity: "Ongoing monitoring", level, implication: "Apply alerts for ownership changes, sanctions and geopolitical developments." },
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
  const black = input.fatf?.listing === "call-for-action";

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
      black
        ? "Track FATF countermeasures and action-plan status each plenary"
        : "Monitor FATF grey-list remediation progress each plenary",
    );
  }

  // 3. Weakest governance domain → matching diligence emphasis.
  const weakest = topDomains(input.breakdown)[0];
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

  return out.slice(0, 5);
}

function whatChanged(input: DecisionInput): WhatChangedItem[] {
  const sancValue = !input.sanctionsCoverageComplete
    ? "Official-source evidence incomplete; absence not inferred"
    : hasComprehensiveSanctions(input.sanctions)
      ? "Comprehensive programme in place"
      : input.sanctionsTier
        ? "Targeted programmes in place"
        : "None identified";
  return [
    { label: "FATF status", value: input.fatf ? (input.fatf.listing === "call-for-action" ? "Black list" : "Grey list") : "Not listed", asOf: fmt(input.lastPlenary) },
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
  return {
    verdictHeadline: v.headline,
    verdictParagraph: v.paragraph,
    treatment: treatmentFor(input),
    treatmentChecklist: treatmentChecklist(input),
    riskDrivers: riskDrivers(input),
    mitigatingFactors: mitigatingFactors(input),
    businessImpact: businessImpact(input),
    eddTriggers: EDD_TRIGGERS,
    recommendedControls: RECOMMENDED_CONTROLS,
    whatChanged: whatChanged(input),
    disclaimer:
      "Generic guidance derived from the country risk profile, not legal advice. Apply your firm's own customer risk assessment and the sanctions regimes applicable to your jurisdiction.",
  };
}
