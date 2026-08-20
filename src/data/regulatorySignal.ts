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

export interface RegulatoryPublicationCandidate {
  label: string | null;
  url: string;
}

export interface RegulatoryActivityObservation {
  signal: RegulatoryEngagementSignal;
  observedWindowStart: string;
  observedWindowEnd: string;
  observedCount: number;
  observedMonths: string[];
  latestObservedDate: string | null;
  latestObservedMonth: string | null;
  source: "official-first-page-observation" | "not-observable";
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
    observedWindowStart: string;
    observedWindowEnd: string;
    recentAuthorities: number;
    periodicAuthorities: number;
    lowFrequencyAuthorities: number;
    unknownAuthorities: number;
    latestObservedDate: string | null;
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
    y?: Array<{ l?: string | null; u: string }>;
    m?: string[];
    n2?: number;
    z2?: string | null;
    s2?: string;
    r2?: string | null;
    t2?: string | null;
    q3?: string | null;
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
  const authorities = row.q2.map((authority) => {
    const observedMonths = authority.m ?? [];
    const observedCount = Number(authority.n2 ?? observedMonths.length ?? 0);
    const signal = activitySignal(authority.s2 ?? "not-observable", observedCount);
    const route = authority.t2 ?? "";
    const officialRoute = authority.q3 === "authority-owned" || authority.q3 === "official-external";
    const activityVisible = officialRoute && authority.s2 !== "not-observable" && observedCount > 0;
    const enforcementRoute = ["enforcement_archive", "sanctions_or_penalty_list", "decision_register", "disciplinary_notice"].includes(route);
    const enforcementVisible = activityVisible && enforcementRoute && ["strong-official-publication-candidate", "plausible-official-publication-candidate"].includes(authority.r2 ?? "");
    const publicationKind: RegulatoryPublicationKind = enforcementRoute
      ? "enforcement"
      : ["news_or_notice", "publication_or_report"].includes(route)
        ? "regulatory-update"
        : "unknown";
    const publicationCandidates = (authority.y ?? []).map((candidate) => ({ label: candidate.l ?? null, url: candidate.u }));
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
      regulatoryUpdates: publicationKind === "regulatory-update" ? publicationCandidates : [],
      enforcementCandidates: publicationKind === "enforcement" ? publicationCandidates : [],
      directorySources: authority.d ?? [],
      directoryEvidenceUrls: authority.e ?? [],
      identityProvenance: { directorySources: authority.d ?? [], evidenceUrls: authority.e ?? [] },
      researchEffectiveAt: authority.f ?? String(manifest.generatedAt),
      retrievedAt: authority.v ?? String(manifest.generatedAt),
      sourceCheckedAt: authority.c ?? authority.v ?? String(manifest.generatedAt),
      evidenceLevel,
      activity: {
        signal,
        observedWindowStart: "2024-01",
        observedWindowEnd: "2026-08",
        observedCount,
        observedMonths,
        latestObservedDate: authority.z2 ? `${authority.z2}-01` : null,
        latestObservedMonth: authority.z2 ?? null,
        source: (authority.s2 === "not-observable" || !authority.s2 ? "not-observable" : "official-first-page-observation") as RegulatoryActivityObservation["source"],
        evidenceUrl: authority.u,
        note: observedCount > 0
          ? "Observed official first-page publication months only; this is a visibility signal, not a validated frequency or effectiveness measure."
          : "No dated official publication was observed in this snapshot. This is not evidence of inactivity; blocked, low-frequency and unvalidated sources remain unknown.",
      },
      publicationRelevance: authority.r2 ?? null,
      publicationRouteType: authority.t2 ?? null,
      sourceHostScope: authority.q3 ?? null,
    };
  });
  const allActivities = authorities.map((authority) => authority.activity);
  const observedDates = allActivities.map((activity) => activity.latestObservedDate).filter((value): value is string => Boolean(value)).sort();
  const latestObservedDate = observedDates.length ? observedDates[observedDates.length - 1] : null;
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
      observedWindowStart: "2024-01",
      observedWindowEnd: "2026-08",
      recentAuthorities: allActivities.filter((activity) => activity.signal === "recent").length,
      periodicAuthorities: allActivities.filter((activity) => activity.signal === "periodic").length,
      lowFrequencyAuthorities: allActivities.filter((activity) => activity.signal === "low-frequency").length,
      unknownAuthorities: allActivities.filter((activity) => activity.signal === "unknown").length,
      latestObservedDate,
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
