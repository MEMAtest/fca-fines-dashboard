import crypto from "node:crypto";

export const METHODOLOGY_VERSION = "1.0.0";
export const SHADOW_AS_OF = "2026-08-20T12:11:07.553Z";
export const COMPONENT_WEIGHTS = {
  accessibility: 20,
  caseLevelSpecificity: 25,
  sourceTraceability: 20,
  archiveDepth: 20,
  timeliness: 15,
} as const;

export const INDEX_ROLES = [
  "prudential_supervision",
  "securities",
  "insurance",
  "pensions",
  "financial_intelligence",
] as const;
export type IndexRole = (typeof INDEX_ROLES)[number];
export type ComponentName = keyof typeof COMPONENT_WEIGHTS;
export type ScoreStatus = "complete" | "provisional" | "not-assessed";

export function transparencyBand(score: number | null): string | null {
  if (score === null || !Number.isFinite(score)) return null;
  if (score >= 80) return "highly-transparent";
  if (score >= 60) return "transparent";
  if (score >= 40) return "partially-transparent";
  if (score >= 20) return "limited-transparency";
  return "very-limited-transparency";
}

export interface LiveObservation {
  regulator: string;
  ok: boolean;
  count: number | null;
  latestDate: string | null;
  latestIngestionAt: string | null;
  latestSourceCheckAt: string | null;
  activeYears: number | null;
  activitySignal: string;
}

export interface LiveRegulator {
  regulator_code: string;
  regulator: string;
  country_code: string;
  country: string;
  source_type: string;
  scrape_mode: string;
  automation_level: string;
  operational_confidence: string;
  contract_cadence: string;
  stale_after_days: number | null;
  latest_action: string | null;
  latest_action_age_days: number | null;
  freshness_state: string;
  observed_records: number | null;
  active_years: number | null;
}

export interface Authority {
  iso2: string;
  country: string;
  authority: string;
  website: string;
  roles: string[];
  directory_sources?: string[];
  evidence_urls?: string[];
}

export interface QualifiedRoute {
  authority_id: string;
  publication_route_id: string;
  iso2: string;
  authority: string;
  authority_website: string;
  evidence_url: string | null;
  access_state: string;
  archive_access_state: string;
  publication_relevance: string;
  qualification_state: string;
  source_route_state: string;
  source_checked_at: string | null;
  archive_boundary: string | null;
  language_evidence_state?: string;
}

export interface CaseSample {
  id?: string | null;
  canonical_case_id?: string | null;
  regulator?: string | null;
  country_code?: string | null;
  firm_individual?: string | null;
  date_issued?: string | null;
  breach_type?: string | null;
  breach_categories?: string | string[] | null;
  summary?: string | null;
  notice_url?: string | null;
  source_url?: string | null;
  official_publication_url?: string | null;
  source_link_status?: string | null;
  source_checked_at?: string | null;
  source_official_domain_match?: boolean | null;
}

export interface SampleSnapshot {
  capturedAt: string;
  endpoint: string;
  limit: number;
  rows: Record<string, CaseSample[]>;
  responseTotals: Record<string, number | null>;
}

export interface AuthorityMapping {
  regulatorCode: string;
  stableRegulatorId: string;
  authorityId: string | null;
  authority: string | null;
  authorityWebsite: string | null;
  iso2: string;
  roles: IndexRole[];
  mappingStatus: "official-directory-match" | "registry-only" | "eu-level-excluded";
  mappingBasis: string;
}

export interface ComponentEvidence {
  value: number | null;
  available: boolean;
  evidence: string[];
  blocker: string | null;
}

export interface RegulatorShadowResult {
  regulatorCode: string;
  stableRegulatorId: string;
  authorityId: string | null;
  countryCode: string;
  country: string;
  authority: string | null;
  roles: IndexRole[];
  components: Record<ComponentName, ComponentEvidence>;
  componentCoverageWeight: number;
  score: number | null;
  band: string | null;
  status: ScoreStatus;
  sampleSize: number;
  observedRecords: number | null;
  activitySignal: string;
  provenance: string[];
}

export interface CountryShadowResult {
  iso2: string;
  country: string;
  region: string;
  applicableRoles: IndexRole[];
  assessedRoles: IndexRole[];
  roleScores: Record<string, number | null>;
  roleAuthorityCounts: Record<string, number>;
  roleCoveragePct: number;
  score: number | null;
  band: string | null;
  status: ScoreStatus;
  blocker: string | null;
  provenance: string[];
}

export function stableAuthorityId(iso2: string, authority: string): string {
  return `ra-auth-${iso2.toLowerCase()}-${crypto.createHash("sha256").update(`${iso2}|${authority}`).digest("hex").slice(0, 16)}`;
}

export function stableRegulatorId(code: string): string {
  return `ra-reg-${code.toLowerCase()}`;
}

export function hostOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function normalise(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isExplicitFiuAuthority(authority: string): boolean {
  return /\b(?:financial intelligence|financial investigation|intelligence unit|fiu|finanz intelligence|suspicious transaction reporting)\b/i.test(authority);
}

const AUTHORITY_ALIASES: Record<string, string> = {
  FCA: "The Financial Conduct Authority",
  BaFin: "Federal Financial Supervisory Authority",
  AMF: "Autorite des marches financiers*",
  CNMV: "Comision Nacional del Mercado de Valores*",
  CBI: "Central Bank of Ireland",
  SFC: "Securities and Futures Commission*",
  AFM: "The Dutch Authority for the Financial Markets*",
  DNB: "De Nederlandsche Bank",
  DFSA: "Dubai Financial Services Authority",
  FSRA: "Financial Services Regulatory Authority",
  CBUAE: "Central Bank of the United Arab Emirates",
  JFSC: "Jersey Financial Services Commission",
  GFSC: "Guernsey Financial Services Commission",
  SEC: "Securities and Exchange Commission*",
  SEBI: "Securities and Exchange Board of India*",
  TWFSC: "Financial Supervisory Commission",
  CVM: "Comissao de Valores Mobiliarios*",
  HKMA: "Hong Kong Monetary Authority",
  ASIC: "Australian Securities and Investments Commission*",
  AUSTRAC: "The Australian Transaction Reports and Analysis Centre (AUSTRAC)",
  MAS: "Monetary Authority of Singapore",
  OCC: "Office of the Comptroller of the Currency",
  FINCEN: "Financial Crimes Enforcement Network (FinCEN)",
  FINMA: "Swiss Financial Market Supervisory Authority (FINMA)",
  FMANZ: "Financial Markets Authority",
  FDIC: "Federal Deposit Insurance Corporation DC",
  FRB: "Board of Governors of the Federal Reserve System",
  SPK: "Sermaye Piyasasi Kurulu",
  GHSEC: "Securities and Exchange Commission",
  IOMFSA: "Isle of Man Financial Services Authority",
  AMMC: "Autorite Marocaine du Marche des Capitaux*",
  CNV: "Comision Nacional de Valores*",
  FSS: "Financial Supervisory Service",
  OSC: "Ontario Securities Commission*",
  BDI: "Banca d'Italia",
  ACPR: "Autorite de Controle Prudentiel et de Resolution",
  CSSF: "Commission de Surveillance du Secteur Financier",
  FSMA: "Financial Services and Markets Authority*",
  FMAAT: "Financial Market Authority Austria",
  CNBCZ: "Czech National Bank",
  CMVM: "Comissao do Mercado de Valores Mobiliarios",
  CYSEC: "Cyprus Securities and Exchange Commission",
  FISE: "Finansinspektionen",
  FTDK: "Danish Financial Supervisory Authority",
  FINFSA: "Financial Supervisory Authority",
  FTNO: "Finanstilsynet (The Financial Supervisory Authority of Norway)",
  MFSA: "Malta Financial Services Authority",
  IVASS: "Istituto per la Vigilanza sulle Assicurazioni (IVASS)",
  SC: "Securities Commission*",
  CIMA: "Cayman Islands Monetary Authority",
};

export function mapLiveRegulator(regulator: LiveRegulator, authorities: Authority[]): AuthorityMapping {
  if (regulator.country_code === "EU") {
    return { regulatorCode: regulator.regulator_code, stableRegulatorId: stableRegulatorId(regulator.regulator_code), authorityId: null, authority: null, authorityWebsite: null, iso2: regulator.country_code, roles: [], mappingStatus: "eu-level-excluded", mappingBasis: "EU-level authority is intentionally excluded from country aggregation." };
  }
  const candidates = authorities.filter((row) => row.iso2 === regulator.country_code);
  const target = normalise(AUTHORITY_ALIASES[regulator.regulator_code] ?? regulator.regulator);
  const exact = candidates.find((row) => normalise(row.authority) === target);
  const scored = candidates.map((row) => {
    const words = new Set(normalise(row.authority).replace(/\b(the|of|and|for|authority|commission|financial|services)\b/g, " ").split(/\s+/).filter(Boolean));
    const targetWords = new Set(target.replace(/\b(the|of|and|for|authority|commission|financial|services)\b/g, " ").split(/\s+/).filter(Boolean));
    const overlap = [...targetWords].filter((word) => words.has(word)).length;
    return { row, score: overlap / Math.max(1, targetWords.size) };
  }).sort((a, b) => b.score - a.score);
  const chosen = exact ?? (scored[0]?.score >= 0.5 ? scored[0].row : null);
  if (!chosen) {
    return { regulatorCode: regulator.regulator_code, stableRegulatorId: stableRegulatorId(regulator.regulator_code), authorityId: null, authority: null, authorityWebsite: null, iso2: regulator.country_code, roles: [], mappingStatus: "registry-only", mappingBasis: "No sufficiently specific official-directory name match; excluded from country role aggregation pending manual authority mapping." };
  }
  // Some global directories split one authority into multiple rows by website
  // or mandate. Union only rows that identify the same authority, rather than
  // taking the first row and silently dropping valid mandates (e.g. CIMA,
  // MFSA, IOMFSA and FSS). Financial-intelligence is stricter: it is accepted
  // only where the authority name explicitly identifies an FIU function.
  const duplicateRows = candidates.filter((row) => normalise(row.authority) === normalise(chosen.authority));
  const roleSet = new Set<string>();
  for (const row of duplicateRows) {
    for (const role of row.roles) {
      if (role === "financial_intelligence" && !isExplicitFiuAuthority(row.authority)) continue;
      roleSet.add(role);
    }
  }
  const roles = [...roleSet].filter((role): role is IndexRole => (INDEX_ROLES as readonly string[]).includes(role)).sort();
  return { regulatorCode: regulator.regulator_code, stableRegulatorId: stableRegulatorId(regulator.regulator_code), authorityId: stableAuthorityId(chosen.iso2, chosen.authority), authority: chosen.authority, authorityWebsite: chosen.website, iso2: chosen.iso2, roles, mappingStatus: "official-directory-match", mappingBasis: exact ? "Explicit live-code authority alias matched official directory." : "Deterministic normalized-name match to official directory." };
}

function evidence(value: number | null, evidenceItems: string[], blocker: string | null = null): ComponentEvidence {
  return { value, available: value !== null, evidence: evidenceItems, blocker: value === null ? blocker : null };
}

function nonEmpty(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function caseValue(row: CaseSample, key: keyof CaseSample): boolean {
  return nonEmpty(row[key]);
}

function caseSpecificity(sample: CaseSample[]): ComponentEvidence {
  if (sample.length < 5) return evidence(null, [`sample_size=${sample.length}`], "Fewer than five live cases in the deterministic sample; specificity is not assessed.");
  const complete = sample.filter((row) => caseValue(row, "firm_individual") && caseValue(row, "date_issued") && (caseValue(row, "breach_type") || caseValue(row, "breach_categories")) && (caseValue(row, "canonical_case_id") || caseValue(row, "id"))).length;
  return evidence(Number((complete / sample.length * 100).toFixed(4)), [`sample_size=${sample.length}`, `complete_case_fields=${complete}`, "Fields read directly from /api/unified/search sample; monetary amount is not required." ]);
}

function sourceTraceability(sample: CaseSample[]): ComponentEvidence {
  if (sample.length < 5) return evidence(null, [`sample_size=${sample.length}`], "Fewer than five live cases in the deterministic sample; traceability is not assessed.");
  const traceable = sample.filter((row) => (caseValue(row, "notice_url") || caseValue(row, "source_url") || caseValue(row, "official_publication_url")) && (caseValue(row, "canonical_case_id") || caseValue(row, "id")) && caseValue(row, "source_link_status")).length;
  const verified = sample.filter((row) => /^verified_/.test(String(row.source_link_status ?? ""))).length;
  return evidence(Number((traceable / sample.length * 100).toFixed(4)), [`sample_size=${sample.length}`, `traceable_cases=${traceable}`, `verified_source_status_cases=${verified}`, "Traceability requires a stable case ID, official-source URL field and explicit source-link status; verified status is reported but not substituted for missing evidence." ]);
}

function archiveDepth(observation: LiveObservation | undefined, mapping: AuthorityMapping, qualified: QualifiedRoute | undefined): ComponentEvidence {
  if (!observation || observation.activeYears === null || observation.activeYears === undefined) return evidence(null, [], "Live observation has no active-year span.");
  if (!qualified || qualified.qualification_state !== "approved-for-human-contract") return evidence(null, [`active_years=${observation.activeYears}`], "Archive span is present in the live observation, but the mapped official publication route is not approved-for-human-contract.");
  const value = Math.min(100, Math.max(0, Number(((observation.activeYears - 1) / 9 * 100).toFixed(4))));
  return evidence(value, [`active_years=${observation.activeYears}`, `authority_id=${mapping.authorityId}`, `archive_access_state=${qualified.archive_access_state}`, "Observed active years are an archive-depth observation, not a completeness claim; ten or more observed years reaches the component ceiling." ]);
}

function accessibility(qualified: QualifiedRoute | undefined): ComponentEvidence {
  if (!qualified) return evidence(null, [], "No qualified official publication route matched the live regulator.");
  if (qualified.qualification_state !== "approved-for-human-contract") return evidence(null, [`qualification_state=${qualified.qualification_state}`], "Official route remains under review and cannot support an accessibility component.");
  if (qualified.access_state !== "reachable") return evidence(null, [`access_state=${qualified.access_state}`], "Challenge, transport or other access constraint is not converted to a zero.");
  return evidence(100, [`access_state=${qualified.access_state}`, `source_route_state=${qualified.source_route_state}`, `source_checked_at=${qualified.source_checked_at ?? "unknown"}`], "");
}

function timeliness(regulator: LiveRegulator, observation: LiveObservation | undefined): ComponentEvidence {
  if (!observation?.ok || !observation.latestDate || !regulator.stale_after_days) return evidence(null, [], "No successful dated observation and regulator-specific stale threshold.");
  const ageDays = Math.max(0, Math.floor((Date.parse(SHADOW_AS_OF) - Date.parse(observation.latestDate)) / 86_400_000));
  if (regulator.automation_level === "low_frequency" || regulator.automation_level === "sparse_source") return evidence(null, [`age_days=${ageDays}`, `automation_level=${regulator.automation_level}`], "Low-frequency or sparse source is kept as a watch; observation age is not treated as a failed transparency score.");
  const value = Math.max(0, Math.min(100, Number((100 * (1 - ageDays / regulator.stale_after_days)).toFixed(4))));
  return evidence(value, [`age_days=${ageDays}`, `stale_after_days=${regulator.stale_after_days}`, `cadence=${regulator.contract_cadence}`, "This is timeliness against the regulator-specific RegActions observation contract, not an inferred publication-delay measure." ]);
}

function qualifiedRouteFor(mapping: AuthorityMapping, routes: QualifiedRoute[]): QualifiedRoute | undefined {
  if (!mapping.authorityId) return undefined;
  return routes.find((route) => route.authority_id === mapping.authorityId && route.qualification_state === "approved-for-human-contract")
    ?? routes.find((route) => route.iso2 === mapping.iso2 && mapping.authority && normalise(route.authority) === normalise(mapping.authority));
}

export function calculateRegulatorShadow(input: {
  regulator: LiveRegulator;
  observation?: LiveObservation;
  mapping: AuthorityMapping;
  routes: QualifiedRoute[];
  sample: CaseSample[];
}): RegulatorShadowResult {
  const route = qualifiedRouteFor(input.mapping, input.routes);
  const components: Record<ComponentName, ComponentEvidence> = {
    accessibility: accessibility(route),
    caseLevelSpecificity: caseSpecificity(input.sample),
    sourceTraceability: sourceTraceability(input.sample),
    archiveDepth: archiveDepth(input.observation, input.mapping, route),
    timeliness: timeliness(input.regulator, input.observation),
  };
  const componentCoverageWeight = Object.entries(COMPONENT_WEIGHTS).reduce((sum, [name, weight]) => sum + (components[name as ComponentName].available ? weight : 0), 0);
  const weighted = Object.entries(COMPONENT_WEIGHTS).reduce((sum, [name, weight]) => sum + (components[name as ComponentName].value === null ? 0 : (components[name as ComponentName].value! * weight)), 0);
  const score = componentCoverageWeight >= 80 ? Number((weighted / componentCoverageWeight).toFixed(4)) : null;
  const status: ScoreStatus = score === null ? "not-assessed" : componentCoverageWeight === 100 ? "complete" : "provisional";
  return {
    regulatorCode: input.regulator.regulator_code,
    stableRegulatorId: input.mapping.stableRegulatorId,
    authorityId: input.mapping.authorityId,
    countryCode: input.regulator.country_code,
    country: input.regulator.country,
    authority: input.mapping.authority,
    roles: input.mapping.roles,
    components,
    componentCoverageWeight,
    score,
    band: transparencyBand(score),
    status,
    sampleSize: input.sample.length,
    observedRecords: input.observation?.count ?? null,
    activitySignal: input.observation?.activitySignal ?? "insufficient-data",
    provenance: ["docs/research/regulatory-signal/regulator-shadow-measures.csv", "docs/research/regulatory-signal/live-regulator-observations.json", "docs/research/regulatory-signal/official-authority-directory.json", "docs/research/regulatory-signal/publication-qualification-ledger.json", "docs/research/regulatory-signal/live-regulator-sample-snapshot.json"],
  };
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(4));
}

export function calculateCountryShadow(input: {
  iso2: string;
  country: string;
  region: string;
  applicableRoles: IndexRole[];
  regulators: RegulatorShadowResult[];
}): CountryShadowResult {
  const roleScores: Record<string, number | null> = {};
  const roleAuthorityCounts: Record<string, number> = {};
  for (const role of input.applicableRoles) {
    const candidates = input.regulators.filter((result) => result.roles.includes(role));
    const assessed = candidates.filter((result) => result.score !== null);
    roleAuthorityCounts[role] = candidates.length;
    roleScores[role] = median(assessed.map((result) => result.score!));
  }
  const assessedRoles = input.applicableRoles.filter((role) => roleScores[role] !== null);
  const roleCoveragePct = input.applicableRoles.length ? Number((assessedRoles.length / input.applicableRoles.length * 100).toFixed(4)) : 0;
  const score = input.applicableRoles.length && assessedRoles.length >= 2 && roleCoveragePct >= 50
    ? Number((assessedRoles.reduce((sum, role) => sum + roleScores[role]!, 0) / assessedRoles.length).toFixed(4))
    : null;
  const status: ScoreStatus = score === null ? "not-assessed" : roleCoveragePct >= 80 ? "complete" : "provisional";
  let blocker: string | null = null;
  if (!input.applicableRoles.length) blocker = "No applicable non-central mandate roles are mapped for this country.";
  else if (assessedRoles.length < 2) blocker = `Fewer than two assessed mandate roles (${assessedRoles.length}/${input.applicableRoles.length}).`;
  else if (roleCoveragePct < 50) blocker = `Assessed role coverage is ${roleCoveragePct}%, below the 50% provisional threshold.`;
  else if (roleCoveragePct < 80) blocker = `Assessed role coverage is ${roleCoveragePct}%; country result is provisional.`;
  return { iso2: input.iso2, country: input.country, region: input.region, applicableRoles: input.applicableRoles, assessedRoles, roleScores, roleAuthorityCounts, roleCoveragePct, score, band: transparencyBand(score), status, blocker, provenance: ["docs/research/regulatory-signal/country-regulatory-ecosystem-baseline.json", "regulator-shadow-results.json"] };
}
