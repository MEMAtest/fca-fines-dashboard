import manifest from "./regulatorySignalManifest.json" with { type: "json" };

export type RegulatorySignalRole =
  | "central_banking"
  | "prudential_supervision"
  | "securities"
  | "insurance"
  | "pensions"
  | "financial_intelligence";

export type RegulatoryAuthorityAccessState =
  | "reachable"
  | "challenge-protected"
  | "access-blocked"
  | "timeout"
  | "network-error"
  | "http-error"
  | "http-404"
  | "no-public-website"
  | "not-observed";

export type RegulatoryEvidenceLevel =
  | "identity-confirmed"
  | "regulatory-activity-visible"
  | "enforcement-visible"
  | "score-eligible";

export type RegulatoryEngagementSignal = "recent" | "periodic" | "low-frequency" | "unknown";
export type RegulatoryPublicationKind = "enforcement" | "regulatory-update" | "unknown";
export type RegulatorySourceHostScope = "authority-owned" | "official-external" | "external-unqualified" | "not-observable" | null;

export interface RegulatoryPublicationCandidate {
  label: string | null;
  url: string;
  publicationKind: RegulatoryPublicationKind;
  publicationRouteType: string | null;
  sourceHostScope: RegulatorySourceHostScope;
  qualificationState: string | null;
  archiveBoundary: string | null;
  publicationRelevance: string | null;
  provisionalSignal: string;
  observedMonths: string[];
  observedMonthCount: number;
  latestObservedMonth: string | null;
  contextLabel: "authority-owned-qualified-route" | "external-official-context" | "unqualified-candidate";
}

export interface RegulatoryActivityObservation {
  signal: RegulatoryEngagementSignal;
  status: "provisional-first-page-scan";
  scanContract: {
    scanType: "automated-first-page-date-scan";
    startMonth: "2024-01";
    endMonth: "2026-08";
    asOf: "2026-08-20";
    datePrecision: "month";
    archiveBoundary: "first-page-only-unvalidated";
  };
  observedMonthCount: number;
  observedMonths: string[];
  latestObservedMonth: string | null;
  latestObservedPrecision: "month" | null;
  source: "authority-owned-qualified-first-page-scan" | "not-qualified-or-not-observable";
  evidenceUrl: string | null;
  note: string;
}

export type RegulatoryEvidenceState =
  | "local-authority-evidence"
  | "parent-context-only"
  | "external-evidence-only"
  | "structural-absence"
  | "unobservable";

export interface RegulatorySignalAuthority {
  name: string;
  website: string | null;
  roles: RegulatorySignalRole[];
  accessState: RegulatoryAuthorityAccessState;
  publicationUrl: string | null;
  directorySources: string[];
  directoryEvidenceUrls: string[];
  researchEffectiveAt: string;
  retrievedAt: string;
  sourceCheckedAt: string;
  evidenceLevel: RegulatoryEvidenceLevel;
  mandate: RegulatorySignalRole[];
  identityProvenance: {
    directorySources: string[];
    evidenceUrls: string[];
  };
  publicationCandidates: RegulatoryPublicationCandidate[];
  activity: RegulatoryActivityObservation;
  publicationRelevance: string | null;
  publicationRouteType: string | null;
  sourceHostScope: string | null;
  publicationKind: RegulatoryPublicationKind;
  regulatoryUpdates: RegulatoryPublicationCandidate[];
  enforcementCandidates: RegulatoryPublicationCandidate[];
  externalContextCandidates: RegulatoryPublicationCandidate[];
}

export interface RegulatorySignalCountry {
  iso2: string;
  iso3: string;
  name: string;
  region: string;
  subregion: string;
  parentJurisdiction: string | null;
  authorityEvidenceState: RegulatoryEvidenceState;
  authorityEvidenceNote: string | null;
  externalAuthorityEvidenceUrl: string | null;
  ecosystemResearchDepth: string;
  officialDirectoryAuthorities: number;
  officialDirectoryRoles: RegulatorySignalRole[];
  roleCounts: {
    centralBanking: number;
    prudential: number;
    securities: number;
    insurance: number;
    pensions: number;
    financialIntelligence: number;
  };
  configuredRegulators: number;
  liveRegulators: number;
  liveObservedRecords: number;
  latestObservedAction: string | null;
  liveRegulatorCodes: string[];
  pipelineRegulatorCodes: string[];
  researchPriority: string;
  authorities: RegulatorySignalAuthority[];
  activitySummary: {
    scanContract: RegulatoryActivityObservation["scanContract"];
    recentAuthorities: number;
    periodicAuthorities: number;
    lowFrequencyAuthorities: number;
    unknownAuthorities: number;
    latestObservedMonth: string | null;
    latestObservedPrecision: "month" | null;
  };
}

type ManifestRow = {
  i: string;
  c: string;
  n: string;
  r: string;
  s: string;
  p: string | null;
  e: string;
  q: string | null;
  u: string | null;
  d: string;
  o: number;
  t: RegulatorySignalRole[];
  x: number[];
  l: number;
  g: number;
  a: number;
  z: string | null;
  v: string[];
  h: string[];
  k: string;
  q2: Array<{
    n: string;
    w: string | null;
    r: RegulatorySignalRole[];
    s: RegulatoryAuthorityAccessState;
    u: string | null;
    d?: string[];
    e?: string[];
    f?: string;
    v?: string;
    c?: string;
    y?: Array<{
      l?: string | null;
      u: string;
      m?: string[];
      n?: number;
      z?: string | null;
      s?: string;
      r?: string | null;
      t?: string | null;
      p?: RegulatorySourceHostScope;
      q?: string | null;
      a?: string | null;
    }>;
    m?: string[];
    n2?: number;
    z2?: string | null;
    s2?: string;
    r2?: string | null;
    t2?: string | null;
    q3?: string | null;
    q4?: string | null;
  }>;
};

const rawRows = manifest.rows as ManifestRow[];

const roleKeys = ["centralBanking", "prudential", "securities", "insurance", "pensions", "financialIntelligence"] as const;

function mapRow(row: ManifestRow): RegulatorySignalCountry {
  const mapAccessState = (value: string): RegulatoryAuthorityAccessState => {
    if (value === "http-404") return value;
    if (value === "reachable" || value === "challenge-protected" || value === "access-blocked" || value === "timeout" || value === "network-error" || value === "http-error" || value === "no-public-website" || value === "not-observed") return value;
    return "not-observed";
  };
  const activitySignal = (value: string, observedCount: number): RegulatoryEngagementSignal => {
    if (observedCount < 1) return "unknown";
    if (value === "frequent-first-page-signal" || value === "active-first-page-signal") return "recent";
    if (value === "periodic-first-page-signal") return "periodic";
    if (value === "low-frequency-first-page-signal") return "low-frequency";
    return "unknown";
  };
  const publicationKindFor = (route: string | null | undefined): RegulatoryPublicationKind => {
    if (["enforcement_archive", "sanctions_or_penalty_list", "decision_register", "disciplinary_notice"].includes(route ?? "")) return "enforcement";
    if (["news_or_notice", "publication_or_report"].includes(route ?? "")) return "regulatory-update";
    return "unknown";
  };
  const scanContract: RegulatoryActivityObservation["scanContract"] = {
    scanType: "automated-first-page-date-scan",
    startMonth: "2024-01",
    endMonth: "2026-08",
    asOf: "2026-08-20",
    datePrecision: "month",
    archiveBoundary: "first-page-only-unvalidated",
  };
  const authorities = row.q2.map((authority) => {
    const publicationCandidates: RegulatoryPublicationCandidate[] = (authority.y ?? []).map((candidate) => {
      const sourceHostScope = candidate.p ?? null;
      const qualificationState = candidate.q ?? null;
      const qualifiedOwned = sourceHostScope === "authority-owned" && qualificationState === "approved-for-human-contract";
      return {
        label: candidate.l ?? null,
        url: candidate.u,
        publicationKind: publicationKindFor(candidate.t),
        publicationRouteType: candidate.t ?? null,
        sourceHostScope,
        qualificationState,
        archiveBoundary: candidate.a ?? null,
        publicationRelevance: candidate.r ?? null,
        provisionalSignal: candidate.s ?? "not-observable",
        observedMonths: candidate.m ?? [],
        observedMonthCount: Number(candidate.n ?? candidate.m?.length ?? 0),
        latestObservedMonth: candidate.z ?? null,
        contextLabel: qualifiedOwned
          ? "authority-owned-qualified-route"
          : sourceHostScope === "official-external"
            ? "external-official-context"
            : "unqualified-candidate",
      };
    });
    const qualifiedOwnedCandidates = publicationCandidates.filter((candidate) => candidate.contextLabel === "authority-owned-qualified-route");
    const activityCandidate = qualifiedOwnedCandidates
      .filter((candidate) => candidate.observedMonthCount > 0 && candidate.provisionalSignal !== "not-observable")
      .sort((a, b) => (b.latestObservedMonth ?? "").localeCompare(a.latestObservedMonth ?? ""))[0] ?? null;
    const observedMonths = activityCandidate?.observedMonths ?? [];
    const observedMonthCount = activityCandidate?.observedMonthCount ?? 0;
    const signal = activitySignal(activityCandidate?.provisionalSignal ?? "not-observable", observedMonthCount);
    const activityVisible = Boolean(activityCandidate);
    const enforcementVisible = qualifiedOwnedCandidates.some((candidate) => candidate.publicationKind === "enforcement" && candidate.observedMonthCount > 0 && candidate.provisionalSignal !== "not-observable");
    const selectedCandidate = publicationCandidates.find((candidate) => candidate.url === authority.u) ?? publicationCandidates[0] ?? null;
    const publicationKind = selectedCandidate?.publicationKind ?? "unknown";
    const evidenceLevel: RegulatoryEvidenceLevel = enforcementVisible
      ? "enforcement-visible"
      : activityVisible
        ? "regulatory-activity-visible"
        : "identity-confirmed";
    return {
      name: authority.n,
      website: authority.w,
      roles: authority.r,
      mandate: authority.r,
      accessState: mapAccessState(authority.s),
      publicationUrl: authority.u,
      publicationCandidates,
      publicationKind,
      regulatoryUpdates: qualifiedOwnedCandidates.filter((candidate) => candidate.publicationKind === "regulatory-update"),
      enforcementCandidates: qualifiedOwnedCandidates.filter((candidate) => candidate.publicationKind === "enforcement"),
      externalContextCandidates: publicationCandidates.filter((candidate) => candidate.contextLabel === "external-official-context"),
      directorySources: authority.d ?? [],
      directoryEvidenceUrls: authority.e ?? [],
      identityProvenance: { directorySources: authority.d ?? [], evidenceUrls: authority.e ?? [] },
      researchEffectiveAt: authority.f ?? String(manifest.generatedAt),
      retrievedAt: authority.v ?? String(manifest.generatedAt),
      sourceCheckedAt: authority.c ?? authority.v ?? String(manifest.generatedAt),
      evidenceLevel,
      activity: {
        signal,
        status: "provisional-first-page-scan" as const,
        scanContract,
        observedMonthCount,
        observedMonths,
        latestObservedMonth: activityCandidate?.latestObservedMonth ?? null,
        latestObservedPrecision: (activityCandidate?.latestObservedMonth ? "month" : null) as RegulatoryActivityObservation["latestObservedPrecision"],
        source: (activityCandidate ? "authority-owned-qualified-first-page-scan" : "not-qualified-or-not-observable") as RegulatoryActivityObservation["source"],
        evidenceUrl: activityCandidate?.url ?? null,
        note: activityCandidate
          ? "Provisional automated first-page date scan on an authority-owned qualified route. It is not a validated publication frequency or effectiveness measure."
          : "No qualified authority-owned dated route supports an activity signal. This is not evidence of inactivity; blocked, external-context, low-frequency and unvalidated sources remain unknown.",
      },
      publicationRelevance: selectedCandidate?.publicationRelevance ?? null,
      publicationRouteType: selectedCandidate?.publicationRouteType ?? null,
      sourceHostScope: selectedCandidate?.sourceHostScope ?? null,
    };
  });
  const allActivities = authorities.map((authority) => authority.activity);
  const observedMonths = allActivities.map((activity) => activity.latestObservedMonth).filter((value): value is string => Boolean(value)).sort();
  const latestObservedMonth = observedMonths.length ? observedMonths[observedMonths.length - 1] : null;
  return {
    iso2: row.i,
    iso3: row.c,
    name: row.n,
    region: row.r,
    subregion: row.s,
    parentJurisdiction: row.p,
    authorityEvidenceState: row.e === "external-risk-evidence-only" ? "external-evidence-only" : row.e as RegulatoryEvidenceState,
    authorityEvidenceNote: row.q,
    externalAuthorityEvidenceUrl: row.u,
    ecosystemResearchDepth: row.d,
    officialDirectoryAuthorities: row.o,
    officialDirectoryRoles: row.t,
    roleCounts: Object.fromEntries(roleKeys.map((key, index) => [key, Number(row.x[index] ?? 0)])) as RegulatorySignalCountry["roleCounts"],
    configuredRegulators: row.g,
    liveRegulators: row.l,
    liveObservedRecords: row.a,
    latestObservedAction: row.z,
    liveRegulatorCodes: row.v,
    pipelineRegulatorCodes: row.h,
    researchPriority: row.k,
    authorities,
    activitySummary: {
      scanContract,
      recentAuthorities: allActivities.filter((activity) => activity.signal === "recent").length,
      periodicAuthorities: allActivities.filter((activity) => activity.signal === "periodic").length,
      lowFrequencyAuthorities: allActivities.filter((activity) => activity.signal === "low-frequency").length,
      unknownAuthorities: allActivities.filter((activity) => activity.signal === "unknown").length,
      latestObservedMonth,
      latestObservedPrecision: latestObservedMonth ? "month" : null,
    },
  };
}

const rows = rawRows.map(mapRow);
const byIso2 = new Map(rows.map((row) => [row.iso2, row]));

export const REGULATORY_SIGNAL_GENERATED_AT = String(manifest.generatedAt);
export const REGULATORY_SIGNAL_COUNTRY_COUNT = rows.length;
export const REGULATORY_SIGNAL_SOURCE_DIRECTORY_URLS = [
  "https://www.bis.org/cbanks.htm",
  "https://www.bis.org/regauth.htm",
  "https://www.iosco.org/v2/about/?subsection=membership&memid=1",
  "https://www.iais.org/about-the-iais/iais-members/",
  "https://www.iopsweb.org/en/membership/iops-members-and-observers.html",
  "https://egmontgroup.org/members-by-region/",
] as const;

export function getRegulatorySignalCountry(iso2: string): RegulatorySignalCountry | null {
  return byIso2.get(iso2.trim().toUpperCase()) ?? null;
}

export function listRegulatorySignalCountries(): RegulatorySignalCountry[] {
  return rows;
}

export function authorityAccessLabel(state: RegulatoryAuthorityAccessState): string {
  return {
    reachable: "Official site reachable",
    "challenge-protected": "Official site challenge-protected",
    "access-blocked": "Official site access blocked",
    timeout: "Official site timed out",
    "network-error": "Official site could not be reached",
    "http-error": "Official site returned an error",
    "http-404": "Official site returned not found",
    "no-public-website": "No public official website identified",
    "not-observed": "Publication state not observed",
  }[state];
}

export function countryEvidenceLabel(state: string): string {
  return {
    "local-authority-evidence": "Local authority evidence",
    "parent-context-only": "Parent jurisdiction context only",
    "external-risk-evidence-only": "External risk evidence only",
    "external-evidence-only": "External risk evidence only",
    "structural-absence": "Legitimate structural absence",
    unobservable: "Domestic authority not publicly observable",
  }[state] ?? "Evidence disposition recorded";
}

export function roleLabel(role: RegulatorySignalRole): string {
  return {
    central_banking: "Central bank",
    prudential_supervision: "Prudential supervision",
    securities: "Securities",
    insurance: "Insurance",
    pensions: "Pensions",
    financial_intelligence: "Financial intelligence",
  }[role];
}
