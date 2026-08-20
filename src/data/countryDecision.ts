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
  /** Numeric v3 pillars, ordered by their actual contribution to the score. */
  scoreDrivers: string[];
  /** FATF and sanctions treatment signals; explicitly excluded from the score. */
  treatmentOverlays: string[];
  /** @deprecated Historical alias. Contains score drivers only, never overlays. */
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
  /** False when fewer than two current v3 pillars are available. */
  scoreAvailable: boolean;
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
      headline: "Not enough information for a country risk score",
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
    out.push(`FATF treatment overlay: ${action} (not a score input)`);
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
    treatmentChecklist: treatmentChecklist(input),
    scoreDrivers: drivers,
    treatmentOverlays: treatmentOverlays(input),
    riskDrivers: drivers,
    mitigatingFactors: mitigatingFactors(input),
    businessImpact: businessImpact(input),
    eddTriggers: EDD_TRIGGERS,
    recommendedControls: RECOMMENDED_CONTROLS,
    whatChanged: whatChanged(input),
    disclaimer:
      "Generic guidance derived from the country risk profile, not legal advice. Apply your firm's own customer risk assessment and the sanctions regimes applicable to your jurisdiction.",
  };
}
