/**
 * Country-risk contextual evidence (research foundation, never a score input).
 *
 * This module deliberately separates a useful evidence catalogue from the
 * country-risk composite.  A factor is either backed by a checked-in,
 * provenance-bearing source or is returned as unavailable.  Unavailable is
 * not a risk value and must not be rendered as zero, low risk, or a failure.
 *
 * The first release includes evidence already licensed and maintained by the
 * repository (World Bank WGI, Council of the EU tax list and Open Ownership).
 * Other requested threat families have an explicit source contract but remain
 * unassessed until a reviewed dataset is ingested.  That is intentional:
 * this layer must not turn a missing threat dataset into invented precision.
 */

import { COUNTRIES, getCountryByIso2, type Country } from "./countries.js";
import {
  beneficialOwnershipRegisterRisk,
  type BoRegisterEvidence,
} from "./beneficialOwnershipRegisters.js";
import {
  BO_REGISTER_LICENCE,
  BO_REGISTER_RETRIEVED_AT,
  BO_REGISTER_SOURCE,
} from "./beneficialOwnershipRegisterData.js";
import {
  EU_TAX_LIST_REVIEWED,
  EU_TAX_LIST_SOURCE_URL,
  isEuTaxListed,
} from "./euTaxList.js";
import {
  GOVERNANCE_DIMENSIONS,
  GOVERNANCE_LICENCE,
  GOVERNANCE_RETRIEVED_AT,
  GOVERNANCE_SOURCE,
  GOVERNANCE_VINTAGE,
  type WgiDimensions,
} from "./governanceData.js";

export const COUNTRY_RISK_CONTEXT_SCHEMA_VERSION = "1.0.0" as const;
export const COUNTRY_RISK_CONTEXT_AS_OF = "2026-08-23" as const;

export type CountryRiskContextFactor =
  | "organised-crime"
  | "fraud-cybercrime"
  | "terrorism-proliferation"
  | "trafficking"
  | "financial-secrecy-offshore"
  | "tax-cooperation"
  | "political-stability-conflict"
  | "beneficial-ownership";

export type CountryRiskContextAvailability = "available" | "unavailable";
export type CountryRiskContextValueKind = "categorical" | "percentile" | "register";

export interface CountryRiskContextSource {
  provider: string;
  url: string;
  licence: string | null;
  effectiveAt: string;
  retrievedAt: string | null;
}

export interface CountryRiskContextSourceCandidate {
  provider: string;
  url: string;
  licence: string | null;
  purpose: string;
  reviewStatus: "candidate-not-ingested" | "checked-in-snapshot";
}

export interface CountryRiskContextEvidence {
  factor: CountryRiskContextFactor;
  label: string;
  availability: CountryRiskContextAvailability;
  /** A context value is never a headline country-risk score. */
  scored: false;
  value: {
    kind: CountryRiskContextValueKind;
    label: string;
    raw: number | string | null;
    direction?: "higher-is-better" | "descriptive";
  } | null;
  source: CountryRiskContextSource | null;
  /** Candidate sources are a research contract, never evidence by themselves. */
  sourceCandidates: CountryRiskContextSourceCandidate[];
  interpretation: string;
  limitation: string;
}

export interface CountryRiskContextCountry {
  schemaVersion: typeof COUNTRY_RISK_CONTEXT_SCHEMA_VERSION;
  asOf: typeof COUNTRY_RISK_CONTEXT_AS_OF;
  country: Pick<Country, "iso2" | "iso3" | "name" | "region" | "subregion">;
  factors: CountryRiskContextEvidence[];
}

const FACTOR_META: Record<CountryRiskContextFactor, { label: string; interpretation: string; limitation: string }> = {
  "organised-crime": {
    label: "Organised crime",
    interpretation: "Threat-context evidence is reserved for a reviewed, country-comparable official dataset.",
    limitation: "No reviewed country-level organised-crime dataset is currently checked in; no risk value is inferred.",
  },
  "fraud-cybercrime": {
    label: "Fraud and cybercrime",
    interpretation: "Threat-context evidence is reserved for a reviewed, country-comparable official dataset.",
    limitation: "No reviewed country-level fraud or cybercrime dataset is currently checked in; no risk value is inferred.",
  },
  "terrorism-proliferation": {
    label: "Terrorism and proliferation financing",
    interpretation: "FATF treatment status is shown separately; it is not silently repurposed as a terrorism or proliferation score.",
    limitation: "No reviewed country-comparable terrorism/proliferation threat dataset is currently checked in; FATF listing status remains a separate overlay.",
  },
  trafficking: {
    label: "Trafficking",
    interpretation: "Threat-context evidence is reserved for a reviewed, country-comparable official dataset.",
    limitation: "No reviewed country-level trafficking dataset is currently checked in; no risk value is inferred.",
  },
  "financial-secrecy-offshore": {
    label: "Financial secrecy and offshore exposure",
    interpretation: "Offshore classification is not treated as a finding of secrecy or misconduct.",
    limitation: "No reviewed, licence-clean financial-secrecy index is currently checked in; jurisdiction type alone is not used as a proxy.",
  },
  "tax-cooperation": {
    label: "Tax cooperation",
    interpretation: "The Council of the EU Annex I status is a tax-cooperation context signal only.",
    limitation: "Annex I is a political/legal tax-cooperation list, not a general AML, corruption, or country-risk score.",
  },
  "political-stability-conflict": {
    label: "Political stability and conflict",
    interpretation: "World Bank Political Stability and Absence of Violence percentile is descriptive context; higher percentile means more stability.",
    limitation: "WGI is an institutional perception indicator, not a conflict event feed or a prediction of future violence.",
  },
  "beneficial-ownership": {
    label: "Beneficial ownership",
    interpretation: "Open Ownership register availability and access describe operational transparency for due diligence.",
    limitation: "The Open Ownership map is a live-register snapshot and absence means no register was identified in that snapshot, not that no register exists.",
  },
};

const SOURCE_CANDIDATES: Record<CountryRiskContextFactor, CountryRiskContextSourceCandidate[]> = {
  "organised-crime": [{ provider: "United Nations Office on Drugs and Crime", url: "https://dataunodc.un.org/", licence: null, purpose: "Official administrative data on crime and illicit flows; prevalence must not be inferred from detection counts.", reviewStatus: "candidate-not-ingested" }],
  "fraud-cybercrime": [{ provider: "International Telecommunication Union", url: "https://www.itu.int/en/ITU-D/Cybersecurity/Pages/global-cybersecurity-index.aspx", licence: null, purpose: "Official cyber-capacity context; tiers are not a fraud-loss or country-risk score.", reviewStatus: "candidate-not-ingested" }],
  "terrorism-proliferation": [{ provider: "Financial Action Task Force", url: "https://www.fatf-gafi.org/en/publications/mutualevaluations.html", licence: null, purpose: "Official mutual-evaluation methodology and ML/TF/PF assessment context; listing status remains a separate overlay.", reviewStatus: "candidate-not-ingested" }],
  trafficking: [{ provider: "United Nations Office on Drugs and Crime", url: "https://dataunodc.un.org/", licence: null, purpose: "Official detected/reported trafficking records; detection capacity means absence is not prevalence.", reviewStatus: "candidate-not-ingested" }],
  "financial-secrecy-offshore": [{ provider: "OECD Global Forum on Transparency and Exchange of Information for Tax Purposes", url: "https://www.oecd.org/tax/transparency/", licence: null, purpose: "Official tax-transparency peer-review context; not a universal financial-secrecy score.", reviewStatus: "candidate-not-ingested" }],
  "tax-cooperation": [{ provider: "Council of the European Union", url: EU_TAX_LIST_SOURCE_URL, licence: null, purpose: "Official Annex I tax-cooperation status.", reviewStatus: "checked-in-snapshot" }, { provider: "OECD Global Forum on Transparency and Exchange of Information for Tax Purposes", url: "https://www.oecd.org/tax/transparency/", licence: null, purpose: "Official peer-review context for tax transparency.", reviewStatus: "candidate-not-ingested" }],
  "political-stability-conflict": [{ provider: "World Bank Worldwide Governance Indicators", url: GOVERNANCE_SOURCE, licence: GOVERNANCE_LICENCE, purpose: "Official political-stability percentile context.", reviewStatus: "checked-in-snapshot" }],
  "beneficial-ownership": [{ provider: "Open Ownership", url: BO_REGISTER_SOURCE, licence: BO_REGISTER_LICENCE, purpose: "Open Ownership register/access map.", reviewStatus: "checked-in-snapshot" }],
};

const FACTORS = Object.keys(FACTOR_META) as CountryRiskContextFactor[];

function unavailable(factor: CountryRiskContextFactor): CountryRiskContextEvidence {
  const meta = FACTOR_META[factor];
  return {
    factor,
    label: meta.label,
    availability: "unavailable",
    scored: false,
    value: null,
    source: null,
    sourceCandidates: SOURCE_CANDIDATES[factor],
    interpretation: meta.interpretation,
    limitation: meta.limitation,
  };
}

function wgiSource(): CountryRiskContextSource {
  return {
    provider: "World Bank Worldwide Governance Indicators",
    url: GOVERNANCE_SOURCE,
    licence: GOVERNANCE_LICENCE,
    effectiveAt: GOVERNANCE_VINTAGE,
    retrievedAt: GOVERNANCE_RETRIEVED_AT,
  };
}

function contextForFactor(iso2: string, factor: CountryRiskContextFactor): CountryRiskContextEvidence {
  const meta = FACTOR_META[factor];
  if (factor === "tax-cooperation") {
    const listed = isEuTaxListed(iso2);
    return {
      factor,
      label: meta.label,
      availability: "available",
      scored: false,
      value: { kind: "categorical", label: listed ? "EU Annex I listed" : "Not listed in EU Annex I", raw: listed ? "listed" : "not-listed", direction: "descriptive" },
      source: { provider: "Council of the European Union", url: EU_TAX_LIST_SOURCE_URL, licence: null, effectiveAt: EU_TAX_LIST_REVIEWED, retrievedAt: EU_TAX_LIST_REVIEWED },
      sourceCandidates: SOURCE_CANDIDATES[factor],
      interpretation: meta.interpretation,
      limitation: meta.limitation,
    };
  }
  if (factor === "political-stability-conflict") {
    const dimensions: Partial<WgiDimensions> | undefined = GOVERNANCE_DIMENSIONS[iso2];
    if (dimensions?.pv === undefined) return unavailable(factor);
    return {
      factor,
      label: meta.label,
      availability: "available",
      scored: false,
      value: { kind: "percentile", label: `${dimensions.pv}/100 WGI percentile`, raw: dimensions.pv, direction: "higher-is-better" },
      source: wgiSource(),
      sourceCandidates: SOURCE_CANDIDATES[factor],
      interpretation: meta.interpretation,
      limitation: meta.limitation,
    };
  }
  if (factor === "beneficial-ownership") {
    const register: BoRegisterEvidence = beneficialOwnershipRegisterRisk(iso2);
    // `unrecorded` is still evidence of an identified register with unknown
    // access. It is available as evidence but intentionally has no numeric
    // value in this context contract.
    const available = register.tier !== "none-identified" || register.registers.length > 0;
    return {
      factor,
      label: meta.label,
      availability: available ? "available" : "unavailable",
      scored: false,
      value: available ? { kind: "register", label: register.label, raw: register.tier, direction: "descriptive" } : null,
      source: available ? { provider: "Open Ownership", url: BO_REGISTER_SOURCE, licence: BO_REGISTER_LICENCE, effectiveAt: BO_REGISTER_RETRIEVED_AT, retrievedAt: BO_REGISTER_RETRIEVED_AT } : null,
      sourceCandidates: SOURCE_CANDIDATES[factor],
      interpretation: meta.interpretation,
      limitation: meta.limitation,
    };
  }
  return unavailable(factor);
}

export function listCountryRiskContextFactors(): readonly CountryRiskContextFactor[] {
  return FACTORS;
}

export function buildCountryRiskContext(iso2: string): CountryRiskContextCountry | null {
  const country = getCountryByIso2(iso2);
  if (!country) return null;
  const code = country.iso2.toUpperCase();
  return {
    schemaVersion: COUNTRY_RISK_CONTEXT_SCHEMA_VERSION,
    asOf: COUNTRY_RISK_CONTEXT_AS_OF,
    country: { iso2: country.iso2, iso3: country.iso3, name: country.name, region: country.region, subregion: country.subregion },
    factors: FACTORS.map((factor) => contextForFactor(code, factor)),
  };
}

export function listCountryRiskContexts(): CountryRiskContextCountry[] {
  return COUNTRIES.map((country) => buildCountryRiskContext(country.iso2)).filter((value): value is CountryRiskContextCountry => value !== null);
}
