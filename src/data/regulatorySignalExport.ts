import {
  authorityAccessLabel,
  countryEvidenceLabel,
  getRegulatorySignalCountry,
  REGULATORY_SIGNAL_GENERATED_AT,
  REGULATORY_SIGNAL_SOURCE_DIRECTORY_URLS,
  roleLabel,
  type RegulatorySignalAuthority,
  type RegulatorySignalCountry,
  type RegulatoryEvidenceState,
} from "./regulatorySignal.js";

export const REGULATORY_SIGNAL_METHODOLOGY_VERSION = "research-only-1.0.0" as const;

export interface RegulatorySignalPublicAuthority {
  name: string;
  website: string | null;
  roles: Array<{ key: string; label: string }>;
  accessState: RegulatorySignalAuthority["accessState"];
  accessLabel: string;
  publicationUrl: string | null;
  directorySources: string[];
  directoryEvidenceUrls: string[];
  researchEffectiveAt: string;
  retrievedAt: string;
  researchPublicationSnapshotCheckedAt: string;
  evidenceLevel: RegulatorySignalAuthority["evidenceLevel"];
  mandate: Array<{ key: string; label: string }>;
  identityProvenance: RegulatorySignalAuthority["identityProvenance"];
  publicationCandidates: RegulatorySignalAuthority["publicationCandidates"];
  activity: RegulatorySignalAuthority["activity"];
  publicationRelevance: string | null;
  publicationRouteType: string | null;
  sourceHostScope: string | null;
  publicationKind: RegulatorySignalAuthority["publicationKind"];
  regulatoryUpdates: RegulatorySignalAuthority["regulatoryUpdates"];
  enforcementCandidates: RegulatorySignalAuthority["enforcementCandidates"];
  externalContextCandidates: RegulatorySignalAuthority["externalContextCandidates"];
}
export interface RegulatorySignalEvidence {
  schemaVersion: "1.0.0";
  methodologyVersion: typeof REGULATORY_SIGNAL_METHODOLOGY_VERSION;
  status: "research-only";
  transparencyIndex: null;
  generatedAt: string;
  country: {
    iso2: string;
    iso3: string;
    name: string;
    region: string;
    subregion: string;
    parentJurisdiction: string | null;
  };
  evidenceDisposition: {
    state: RegulatoryEvidenceState;
    label: string;
    note: string | null;
    externalEvidenceUrl: string | null;
  };
  ecosystem: {
    researchDepth: string;
    authorityCount: number;
    roleFamilies: Array<{ key: string; label: string; authorityCount: number }>;
    authorities: RegulatorySignalPublicAuthority[];
  };
  regActionsCoverage: {
    configuredRegulators: number;
    liveRegulators: number;
    liveRegulatorCodes: string[];
    pipelineRegulatorCodes: string[];
    observedRecords: number;
    latestObservedAction: string | null;
    state: "live-coverage" | "pipeline-coverage" | "ecosystem-mapped-no-validated-feed" | "external-evidence-only";
  };
  activitySignal: {
    label: "observed enforcement" | "no recent observed signal" | "not assessed";
    neutral: true;
    note: string;
  };
  activitySummary: Omit<RegulatorySignalCountry["activitySummary"], "scanContract"> & {
    scanContract: RegulatorySignalCountry["activitySummary"]["scanContract"] | null;
  };
  secondaryReporting: null | {
    status: "optional-context-not-populated";
    sources: string[];
    note: string;
  };
  sources: readonly string[];
  limitations: string[];
}

const ROLE_FAMILY_LABELS: Array<[keyof RegulatorySignalCountry["roleCounts"], string]> = [
  ["centralBanking", "Central banking"],
  ["prudential", "Prudential supervision"],
  ["securities", "Securities"],
  ["insurance", "Insurance"],
  ["pensions", "Pensions"],
  ["financialIntelligence", "Financial intelligence"],
];

function authorityEvidence(authority: RegulatorySignalAuthority): RegulatorySignalPublicAuthority {
  return {
    name: authority.name,
    website: authority.website,
    roles: authority.roles.map((key) => ({ key, label: roleLabel(key) })),
    accessState: authority.accessState,
    accessLabel: authorityAccessLabel(authority.accessState),
    publicationUrl: authority.publicationUrl,
    directorySources: authority.directorySources,
    directoryEvidenceUrls: authority.directoryEvidenceUrls,
    researchEffectiveAt: authority.researchEffectiveAt,
    retrievedAt: authority.retrievedAt,
    researchPublicationSnapshotCheckedAt: authority.sourceCheckedAt,
    evidenceLevel: authority.evidenceLevel,
    mandate: authority.mandate.map((key) => ({ key, label: roleLabel(key) })),
    identityProvenance: authority.identityProvenance,
    publicationCandidates: authority.publicationCandidates,
    activity: authority.activity,
    publicationRelevance: authority.publicationRelevance,
    publicationRouteType: authority.publicationRouteType,
    sourceHostScope: authority.sourceHostScope,
    publicationKind: authority.publicationKind,
    regulatoryUpdates: authority.regulatoryUpdates,
    enforcementCandidates: authority.enforcementCandidates,
    externalContextCandidates: authority.externalContextCandidates,
  };
}

export function buildRegulatorySignalEvidence(iso2: string): RegulatorySignalEvidence | null {
  const country = getRegulatorySignalCountry(iso2);
  if (!country) return null;
  const live = country.liveRegulators > 0;
  const pipeline = country.pipelineRegulatorCodes.length > 0;
  const coverageState = country.authorityEvidenceState === "external-evidence-only" || country.authorityEvidenceState === "unobservable"
    ? "external-evidence-only"
    : live
    ? "live-coverage"
    : pipeline
      ? "pipeline-coverage"
      : "ecosystem-mapped-no-validated-feed";
  const observed = country.liveObservedRecords > 0;
  return {
    schemaVersion: "1.0.0",
    methodologyVersion: REGULATORY_SIGNAL_METHODOLOGY_VERSION,
    status: "research-only",
    transparencyIndex: null,
    generatedAt: REGULATORY_SIGNAL_GENERATED_AT,
    country: {
      iso2: country.iso2,
      iso3: country.iso3,
      name: country.name,
      region: country.region,
      subregion: country.subregion,
      parentJurisdiction: country.parentJurisdiction,
    },
    evidenceDisposition: {
      state: country.authorityEvidenceState,
      label: countryEvidenceLabel(country.authorityEvidenceState),
      note: country.authorityEvidenceNote,
      externalEvidenceUrl: country.externalAuthorityEvidenceUrl,
    },
    ecosystem: {
      researchDepth: country.ecosystemResearchDepth,
      authorityCount: country.officialDirectoryAuthorities,
      roleFamilies: ROLE_FAMILY_LABELS.map(([key, label]) => ({ key, label, authorityCount: country.roleCounts[key] })),
      authorities: country.authorities.map(authorityEvidence),
    },
    regActionsCoverage: {
      configuredRegulators: country.configuredRegulators,
      liveRegulators: country.liveRegulators,
      liveRegulatorCodes: country.liveRegulatorCodes,
      pipelineRegulatorCodes: country.pipelineRegulatorCodes,
      observedRecords: country.liveObservedRecords,
      latestObservedAction: country.latestObservedAction,
      state: coverageState,
    },
    activitySignal: {
      label: observed ? "observed enforcement" : country.liveRegulators > 0 ? "no recent observed signal" : "not assessed",
      neutral: true,
      note: observed
        ? "Observed publication activity describes what was collected; it is not a judgement about regulatory strength or country risk."
        : "No recent RegActions observation is not evidence that no enforcement exists. Publication cadence, access and coverage may explain the absence.",
    },
    activitySummary: country.authorities.length > 0
      ? country.activitySummary
      : { ...country.activitySummary, scanContract: null },
    secondaryReporting: null,
    sources: REGULATORY_SIGNAL_SOURCE_DIRECTORY_URLS,
    limitations: [
      "This release is an evidence map only. The Regulatory Transparency Index is intentionally null pending source qualification and shadow calibration.",
      "Official directory membership identifies mandate evidence; it does not establish supervisory effectiveness.",
      "Reachability and publication candidates are research observations, not a validated regulator-specific cadence score.",
      "RegActions coverage is separate from the country-risk v3 score, FATF status, sanctions and beneficial-ownership context.",
    ],
  };
}

const csvCell = (value: unknown): string => `"${String(value ?? "").replaceAll('"', '""')}"`;

export function regulatorySignalEvidenceCsv(evidence: RegulatorySignalEvidence): string {
  const header = ["iso2", "country", "authority", "mandate", "evidenceLevel", "website", "accessState", "accessLabel", "publicationUrl", "publicationCandidatesWithProvenance", "authorityOwnedQualifiedRegulatoryUpdates", "authorityOwnedQualifiedEnforcementCandidates", "externalOfficialContextCandidates", "publicationKind", "directorySources", "directoryEvidenceUrls", "researchEffectiveAt", "retrievedAt", "researchPublicationSnapshotCheckedAt", "activitySignal", "activitySignalStatus", "scanType", "scanStartMonth", "scanEndMonth", "scanAsOf", "datePrecision", "archiveBoundary", "observedMonthCount", "observedMonths", "latestObservedMonth", "latestObservedPrecision", "publicationRelevance", "publicationRouteType", "sourceHostScope", "regActionsCoverageState", "transparencyIndex", "generatedAt"];
  const rows = evidence.ecosystem.authorities.map((authority) => [
    evidence.country.iso2,
    evidence.country.name,
    authority.name,
    authority.mandate.map((role) => role.label).join("; "),
    authority.evidenceLevel,
    authority.website,
    authority.accessState,
    authority.accessLabel,
    authority.publicationUrl,
    authority.publicationCandidates.map((candidate) => `${candidate.label ?? ""}|${candidate.url}|${candidate.contextLabel}|${candidate.qualificationState ?? "unqualified"}`).join("; "),
    authority.regulatoryUpdates.map((candidate) => `${candidate.label ?? ""}|${candidate.url}`).join("; "),
    authority.enforcementCandidates.map((candidate) => `${candidate.label ?? ""}|${candidate.url}`).join("; "),
    authority.externalContextCandidates.map((candidate) => `${candidate.label ?? ""}|${candidate.url}`).join("; "),
    authority.publicationKind,
    authority.directorySources.join("; "),
    authority.directoryEvidenceUrls.join("; "),
    authority.researchEffectiveAt,
    authority.retrievedAt,
    authority.researchPublicationSnapshotCheckedAt,
    authority.activity.signal,
    authority.activity.status,
    authority.activity.scanContract.scanType,
    authority.activity.scanContract.startMonth,
    authority.activity.scanContract.endMonth,
    authority.activity.scanContract.asOf,
    authority.activity.scanContract.datePrecision,
    authority.activity.scanContract.archiveBoundary,
    authority.activity.observedMonthCount,
    authority.activity.observedMonths.join("; "),
    authority.activity.latestObservedMonth,
    authority.activity.latestObservedPrecision,
    authority.publicationRelevance,
    authority.publicationRouteType,
    authority.sourceHostScope,
    evidence.regActionsCoverage.state,
    "",
    evidence.generatedAt,
  ]);
  if (rows.length === 0) {
    const dispositionOnly: Record<string, string | number | null> = {
      iso2: evidence.country.iso2,
      country: evidence.country.name,
      authority: "No local authority entry",
      evidenceLevel: "not-applicable",
      accessState: evidence.evidenceDisposition.state,
      accessLabel: evidence.evidenceDisposition.label,
      externalOfficialContextCandidates: evidence.evidenceDisposition.externalEvidenceUrl
        ? `External official context|${evidence.evidenceDisposition.externalEvidenceUrl}`
        : "",
      publicationKind: "not-applicable",
      activitySignal: "unknown",
      regActionsCoverageState: evidence.regActionsCoverage.state,
      transparencyIndex: "",
      generatedAt: evidence.generatedAt,
    };
    rows.push(header.map((column) => dispositionOnly[column] ?? ""));
  }
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}
