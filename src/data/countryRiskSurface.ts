import {
  FATF_ASSESSMENT_EFFECTIVE_AT,
  FATF_ASSESSMENT_RETRIEVED_AT,
  FATF_ASSESSMENT_SOURCE,
  getFatfAssessment,
} from "./fatfAssessmentData.js";
import {
  FATF_LAST_PLENARY,
  FATF_SOURCE_URL,
  FATF_VERIFIED_AT,
  getFatfStatus,
} from "./fatfStatus.js";
import {
  GOVERNANCE_RETRIEVED_AT,
  GOVERNANCE_SOURCE,
  GOVERNANCE_VINTAGE,
} from "./governanceData.js";
import {
  SANCTIONS_APPROVED_SNAPSHOT,
} from "./sanctionsApprovedData.js";
import {
  countryRiskSourcesAsOf,
  type CountryRiskSourceState,
} from "./countryRiskSources.js";
import {
  EU_TAX_LIST_REVIEWED,
  EU_TAX_LIST_SOURCE_URL,
  isEuTaxListed,
} from "./euTaxList.js";
import {
  EGMONT_REVIEWED,
  EGMONT_SOURCE_URL,
  getEgmontMember,
} from "./egmontMembership.js";
import {
  BO_REGISTERS_LICENCE,
  BO_REGISTERS_REVIEWED,
  BO_REGISTERS_SOURCE_URL,
  boRegisterSignal,
  getBoRegister,
} from "./boRegisters.js";
import { CPI_LICENCE, CPI_SOURCE, CPI_YEAR, getCpi } from "./cpiData.js";
import { FATF_BODY, FSRB_REVIEWED, getFatfNetwork } from "./fsrbMembership.js";
import { recentChangesForCountry, type ChangeEvent } from "./countryChanges.js";

export type CountryRiskFatfAction =
  | "countermeasures"
  | "enhanced-due-diligence"
  | "increased-monitoring"
  | "none";

export interface CountryRiskFatfActionRecord {
  action: CountryRiskFatfAction;
  listing: "call-for-action" | "increased-monitoring" | null;
  since: string | null;
  lastReviewed: string;
  sourceUrl: string;
  scored: true;
  explanation: string;
}

export type CountryRiskContextSignalState =
  | "present"
  | "absent"
  | "unavailable"
  | "suspended";

export interface CountryRiskContextSignal {
  id:
    | "fatf-membership"
    | "eu-tax-list"
    | "egmont-fiu"
    | "beneficial-ownership-register"
    | "transparency-cpi";
  label: string;
  state: CountryRiskContextSignalState;
  value: string;
  scored: false;
  effectiveAt: string | null;
  retrievedAt: string | null;
  sourceUrl: string;
  licence: string | null;
  whyContextOnly: string;
}

export interface CountryRiskFreshnessItem {
  id: "fatf-list" | "fatf-assessment" | "governance" | "sanctions";
  label: string;
  underlyingDataEffectiveAt: string | null;
  assessmentDate: string | null;
  ratingsDate: string | null;
  retrievedAt: string | null;
  verifiedAt: string | null;
  sourceState: CountryRiskSourceState;
  sourceUrl: string;
}

export interface CountryRiskPublicSurface {
  asOf: string;
  fatfAction: CountryRiskFatfActionRecord;
  contextualSignals: CountryRiskContextSignal[];
  freshness: CountryRiskFreshnessItem[];
  changeHistory: ChangeEvent[];
  note: string;
}

function fatfActionFor(iso2: string): CountryRiskFatfActionRecord {
  const fatf = getFatfStatus(iso2);
  if (!fatf) {
    return {
      action: "none",
      listing: null,
      since: null,
      lastReviewed: FATF_LAST_PLENARY,
      sourceUrl: FATF_SOURCE_URL,
      scored: true,
      explanation: "No FATF call-for-action or increased-monitoring status was identified at the latest plenary. This does not establish low risk.",
    };
  }
  if (fatf.listing === "increased-monitoring") {
    return {
      action: "increased-monitoring",
      listing: fatf.listing,
      since: fatf.since ?? null,
      lastReviewed: fatf.lastReviewed,
      sourceUrl: FATF_SOURCE_URL,
      scored: true,
      explanation: "FATF identifies the jurisdiction as under increased monitoring; apply the firm's risk-based controls and monitor remediation progress.",
    };
  }
  const action = fatf.requiredAction ?? "enhanced-due-diligence";
  return {
    action,
    listing: fatf.listing,
    since: fatf.since ?? null,
    lastReviewed: fatf.lastReviewed,
    sourceUrl: FATF_SOURCE_URL,
    scored: true,
    explanation: action === "countermeasures"
      ? "FATF calls for countermeasures proportionate to the jurisdiction's risks."
      : "FATF calls for enhanced due diligence, not countermeasures, proportionate to the jurisdiction's risks.",
  };
}

function contextualSignalsFor(iso2: string): CountryRiskContextSignal[] {
  const network = getFatfNetwork(iso2);
  const egmont = getEgmontMember(iso2);
  const boRegister = getBoRegister(iso2);
  const cpi = getCpi(iso2);
  const euTaxListed = isEuTaxListed(iso2);
  const fatfMembershipValue = network.fatfMember
    ? network.suspended
      ? "Direct FATF membership suspended"
      : "Direct FATF member"
    : network.fsrbs.length
      ? `FATF regional network: ${network.fsrbs.map((body) => body.code).join(", ")}`
      : "No FATF or regional-body membership identified";

  return [
    {
      id: "fatf-membership",
      label: "FATF network membership",
      state: network.suspended ? "suspended" : network.fatfMember || network.fsrbs.length ? "present" : "absent",
      value: fatfMembershipValue,
      scored: false,
      effectiveAt: FSRB_REVIEWED,
      retrievedAt: FSRB_REVIEWED,
      sourceUrl: FATF_BODY.url,
      licence: null,
      whyContextOnly: "Membership and suspension are operational context; they do not replace FATF assessment evidence or the published v2 weights.",
    },
    {
      id: "eu-tax-list",
      label: "EU non-cooperative tax jurisdictions",
      state: euTaxListed ? "present" : "absent",
      value: euTaxListed ? "Listed in Annex I" : "Not listed in Annex I",
      scored: false,
      effectiveAt: EU_TAX_LIST_REVIEWED,
      retrievedAt: EU_TAX_LIST_REVIEWED,
      sourceUrl: EU_TAX_LIST_SOURCE_URL,
      licence: null,
      whyContextOnly: "Tax-cooperation status is shown as a separate exposure signal and is not silently added to the public v2 score.",
    },
    {
      id: "egmont-fiu",
      label: "Egmont Group FIU",
      state: egmont?.suspended ? "suspended" : egmont ? "present" : "absent",
      value: egmont
        ? `${egmont.fiu ?? "FIU membership"}${egmont.suspended ? " (membership suspended)" : ""}`
        : "No Egmont member FIU identified",
      scored: false,
      effectiveAt: EGMONT_REVIEWED,
      retrievedAt: EGMONT_REVIEWED,
      sourceUrl: EGMONT_SOURCE_URL,
      licence: null,
      whyContextOnly: "FIU network participation is a framework signal, not a direct measure of AML/CFT effectiveness.",
    },
    {
      id: "beneficial-ownership-register",
      label: "Beneficial-ownership register",
      state: boRegister ? "present" : "unavailable",
      value: boRegister ? boRegisterSignal(iso2) : "No live register identified in the source",
      scored: false,
      effectiveAt: BO_REGISTERS_REVIEWED,
      retrievedAt: BO_REGISTERS_REVIEWED,
      sourceUrl: BO_REGISTERS_SOURCE_URL,
      licence: BO_REGISTERS_LICENCE,
      whyContextOnly: "Register availability and access are transparency context; an unlisted jurisdiction is not assumed to have no register.",
    },
    {
      id: "transparency-cpi",
      label: "Transparency International CPI",
      state: cpi ? "present" : "unavailable",
      value: cpi ? `${cpi.score}/100, rank ${cpi.rank}` : "No CPI result available",
      scored: false,
      effectiveAt: CPI_YEAR,
      retrievedAt: null,
      sourceUrl: CPI_SOURCE,
      licence: CPI_LICENCE,
      whyContextOnly: "CPI is displayed unchanged under its licence; scored corruption risk remains the World Bank WGI control-of-corruption dimension.",
    },
  ];
}

function freshnessFor(iso2: string, asOf: Date): CountryRiskFreshnessItem[] {
  const sources = countryRiskSourcesAsOf(asOf);
  const source = (id: "fatf-lists" | "fatf-assessments" | "world-bank-wgi" | "sanctions-regimes") =>
    sources.find((item) => item.id === id)!;
  const assessment = getFatfAssessment(iso2);
  const fatfLists = source("fatf-lists");
  const fatfAssessments = source("fatf-assessments");
  const governance = source("world-bank-wgi");
  const sanctions = source("sanctions-regimes");
  return [
    {
      id: "fatf-list",
      label: "FATF monitored-jurisdiction status",
      underlyingDataEffectiveAt: FATF_LAST_PLENARY,
      assessmentDate: null,
      ratingsDate: null,
      retrievedAt: fatfLists.retrievedAt,
      verifiedAt: FATF_VERIFIED_AT,
      sourceState: fatfLists.state,
      sourceUrl: FATF_SOURCE_URL,
    },
    {
      id: "fatf-assessment",
      label: "FATF mutual evaluation and follow-up ratings",
      underlyingDataEffectiveAt: FATF_ASSESSMENT_EFFECTIVE_AT,
      assessmentDate: assessment?.assessmentDate ?? null,
      ratingsDate: assessment?.ratingsDate ?? null,
      retrievedAt: FATF_ASSESSMENT_RETRIEVED_AT,
      verifiedAt: fatfAssessments.retrievedAt,
      sourceState: fatfAssessments.state,
      sourceUrl: FATF_ASSESSMENT_SOURCE,
    },
    {
      id: "governance",
      label: "World Bank governance indicators",
      underlyingDataEffectiveAt: GOVERNANCE_VINTAGE,
      assessmentDate: null,
      ratingsDate: null,
      retrievedAt: GOVERNANCE_RETRIEVED_AT,
      verifiedAt: governance.retrievedAt,
      sourceState: governance.state,
      sourceUrl: GOVERNANCE_SOURCE,
    },
    {
      id: "sanctions",
      label: "UN, UK, EU and US sanctions regimes",
      underlyingDataEffectiveAt: SANCTIONS_APPROVED_SNAPSHOT.effectiveAt,
      assessmentDate: null,
      ratingsDate: null,
      retrievedAt: SANCTIONS_APPROVED_SNAPSHOT.generatedAt,
      verifiedAt: sanctions.retrievedAt,
      sourceState: sanctions.state,
      sourceUrl: sanctions.sourceUrl,
    },
  ];
}

export function buildCountryRiskPublicSurface(
  iso2: string,
  asOf = new Date(),
): CountryRiskPublicSurface {
  const code = iso2.toUpperCase();
  return {
    asOf: asOf.toISOString(),
    fatfAction: fatfActionFor(code),
    contextualSignals: contextualSignalsFor(code),
    freshness: freshnessFor(code, asOf),
    changeHistory: recentChangesForCountry(code, 12),
    note: "Contextual signals are public evidence only and do not change the immutable v2 score.",
  };
}
