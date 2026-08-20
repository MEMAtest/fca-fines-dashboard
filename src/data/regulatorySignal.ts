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
  | "no-public-website"
  | "not-observed";

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
  }>;
};

const rawRows = manifest.rows as ManifestRow[];

const roleKeys = ["centralBanking", "prudential", "securities", "insurance", "pensions", "financialIntelligence"] as const;

function mapRow(row: ManifestRow): RegulatorySignalCountry {
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
    authorities: row.q2.map((authority) => ({
      name: authority.n,
      website: authority.w,
      roles: authority.r,
      accessState: authority.s,
      publicationUrl: authority.u,
      directorySources: authority.d ?? [],
      directoryEvidenceUrls: authority.e ?? [],
      researchEffectiveAt: authority.f ?? String(manifest.generatedAt),
      retrievedAt: authority.v ?? String(manifest.generatedAt),
      sourceCheckedAt: authority.c ?? authority.v ?? String(manifest.generatedAt),
    })),
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
