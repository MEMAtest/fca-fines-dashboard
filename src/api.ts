import type {
  BreachResponse,
  CategoriesResponse,
  FirmResponse,
  FirmsResponse,
  ListResponse,
  NotificationsResponse,
  SectorResponse,
  SectorsResponse,
  StatsResponse,
  TrendsResponse,
  YearsResponse,
} from "./types.js";

const fallbackBase = import.meta.env.DEV ? "http://localhost:4000" : "";
const API_BASE = import.meta.env.VITE_API_BASE ?? fallbackBase;

async function fetchJSON<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    throw new Error(`Failed request ${path}`);
  }
  return response.json() as Promise<T>;
}

export function fetchFines(year: number) {
  const yearParam = year === 0 ? 0 : year;
  return fetchJSON<ListResponse>(
    `/api/fca-fines/list?year=${yearParam}&limit=5000`,
  );
}

export function fetchStats(year: number) {
  return fetchJSON<StatsResponse>(`/api/fca-fines/stats?year=${year}`);
}

export function fetchTrends(year: number) {
  return fetchJSON<TrendsResponse>(
    `/api/fca-fines/trends?period=month&year=${year}`,
  );
}

export function fetchNotifications() {
  return fetchJSON<NotificationsResponse>(`/api/fca-fines/notifications`);
}

export function fetchCategories() {
  return fetchJSON<CategoriesResponse>(`/api/fca-fines/categories`);
}

export function fetchYears() {
  return fetchJSON<YearsResponse>(`/api/fca-fines/years`);
}

export function fetchSectors() {
  return fetchJSON<SectorsResponse>(`/api/fca-fines/sectors`);
}

export function fetchFirms(limit = 100) {
  return fetchJSON<FirmsResponse>(
    `/api/fca-fines/firms?limit=${encodeURIComponent(String(limit))}`,
  );
}

export function fetchFirm(slug: string, limit = 200) {
  return fetchJSON<FirmResponse>(
    `/api/fca-fines/firm?slug=${encodeURIComponent(slug)}&limit=${encodeURIComponent(String(limit))}`,
  );
}

export function fetchBreach(
  slug: string,
  limitPenalties = 10,
  limitFirms = 10,
) {
  return fetchJSON<BreachResponse>(
    `/api/fca-fines/breach?slug=${encodeURIComponent(slug)}&limitPenalties=${encodeURIComponent(
      String(limitPenalties),
    )}&limitFirms=${encodeURIComponent(String(limitFirms))}`,
  );
}

export function fetchSector(
  slug: string,
  limitPenalties = 10,
  limitBreaches = 10,
) {
  return fetchJSON<SectorResponse>(
    `/api/fca-fines/sector?slug=${encodeURIComponent(slug)}&limitPenalties=${encodeURIComponent(
      String(limitPenalties),
    )}&limitBreaches=${encodeURIComponent(String(limitBreaches))}`,
  );
}

// Unified API endpoints for multi-regulator data
export interface UnifiedSearchParams {
  q?: string;
  regulator?: string;
  country?: string;
  year?: number;
  month?: number;
  minAmount?: number;
  maxAmount?: number;
  breachCategory?: string;
  sector?: string;
  currency?: string;
  firmName?: string;
  sortBy?: string;
  order?: string;
  limit?: number;
  offset?: number;
}

export interface UnifiedSearchResponse {
  results: Array<{
    id: string;
    regulator: string;
    regulator_full_name: string;
    country_code: string;
    country_name: string;
    firm_individual: string;
    firm_category: string | null;
    amount_original: number;
    currency: string;
    amount_gbp: number;
    amount_eur: number;
    date_issued: string;
    year_issued: number;
    month_issued: number;
    breach_type: string;
    breach_categories: string[];
    summary: string;
    notice_url: string | null;
    source_url: string | null;
    listing_url?: string | null;
    detail_url?: string | null;
    official_publication_url?: string | null;
    source_link_status?:
      | "verified_detail"
      | "verified_publication"
      | "official_unverified"
      | "listing_only"
      | "missing"
      | null;
    source_link_label?: string | null;
    canonical_case_id?: string | null;
    duplicate_count?: number | string | null;
    amount_quality?: string | null;
    requires_amount_review?: boolean | null;
    amount_verification_url?: string | null;
    amount_override_reason?: string | null;
    source_checked_at?: string | null;
    source_http_status?: number | string | null;
    source_official_domain_match?: boolean | null;
    source_content_hash?: string | null;
    created_at: string;
  }>;
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
    pages: number;
    currentPage: number;
  };
  filters: {
    regulator: string | null;
    country: string | null;
    year: number | null;
    month: number | null;
    minAmount: number | null;
    maxAmount: number | null;
    breachCategory: string | null;
    currency: string;
    firmName: string | null;
  };
}

export interface UnifiedStatsResponse {
  summary: {
    uk: {
      count: number;
      total: number;
      average: number;
      maxFine: number;
      earliestDate: string;
      latestDate: string;
    };
    eu: {
      count: number;
      total: number;
      average: number;
      maxFine: number;
      earliestDate: string;
      latestDate: string;
    };
    strictnessRatio: string;
    currency: string;
  };
  byRegulator: Array<{
    regulator: string;
    regulatorFullName: string;
    countryCode: string;
    countryName: string;
    count: number;
    total: number;
    average: number;
    maxFine: number;
  }>;
  topFines: Array<any>;
  breachDistribution: Array<any>;
  crossBorderFirms: Array<any>;
  monthlyTrends: Array<any>;
  filters: {
    year: number | null;
    currency: string;
  };
}

export function fetchUnifiedSearch(params: UnifiedSearchParams = {}) {
  const queryParams = new URLSearchParams();

  if (params.q?.trim()) queryParams.set("q", params.q.trim());

  if (params.regulator && params.regulator !== "All")
    queryParams.set("regulator", params.regulator);
  if (params.country && params.country !== "All")
    queryParams.set("country", params.country);
  if (params.year && params.year !== 0)
    queryParams.set("year", String(params.year));
  if (params.month && params.month >= 1 && params.month <= 12)
    queryParams.set("month", String(params.month));
  if (params.minAmount !== undefined)
    queryParams.set("minAmount", String(params.minAmount));
  if (params.maxAmount !== undefined)
    queryParams.set("maxAmount", String(params.maxAmount));
  if (params.breachCategory)
    queryParams.set("breachCategory", params.breachCategory);
  if (params.sector) queryParams.set("sector", params.sector);
  if (params.currency) queryParams.set("currency", params.currency);
  if (params.firmName) queryParams.set("firmName", params.firmName);
  if (params.sortBy) queryParams.set("sortBy", params.sortBy);
  if (params.order) queryParams.set("order", params.order);
  if (params.limit) queryParams.set("limit", String(params.limit));
  if (params.offset) queryParams.set("offset", String(params.offset));

  const queryString = queryParams.toString();
  return fetchJSON<UnifiedSearchResponse>(
    `/api/unified/search${queryString ? `?${queryString}` : ""}`,
  );
}

export function fetchUnifiedStats(year?: number, currency = "GBP") {
  const params = new URLSearchParams();
  if (year && year !== 0) params.set("year", String(year));
  params.set("currency", currency);

  return fetchJSON<UnifiedStatsResponse>(
    `/api/unified/stats?${params.toString()}`,
  );
}

export function fetchUnifiedCompare(
  regulators: string[],
  year?: number,
  currency = "GBP",
) {
  const params = new URLSearchParams();
  params.set("regulators", regulators.join(","));
  if (year && year !== 0) params.set("year", String(year));
  params.set("currency", currency);

  return fetchJSON<any>(`/api/unified/compare?${params.toString()}`);
}

export interface UnifiedOverviewParams {
  regulator?: string;
  country?: string;
  year?: number;
  breachCategory?: string;
  sector?: string;
  q?: string;
  currency?: string;
}

export interface UnifiedOverviewResponse {
  metrics: {
    count: number;
    total: number;
    average: number;
    median: number;
    largest: number;
    largestFirm: string;
    affectedFirms: number;
    latestDate: string | null;
    disclosedAmountCount?: number;
    collapsedSourceRows?: number;
    assessedAmountCount?: number;
    amountReviewCount?: number;
    latestIngestionAt?: string | null;
    latestSourceCheckAt?: string | null;
  };
  yearly: Array<{ key: string; label: string; year: number; count: number; amount: number }>;
  monthly: Array<{ key: string; label: string; year: number; month: number; count: number; amount: number }>;
  themes: Array<{ label: string; count: number; amount: number; share: number }>;
  regulators: Array<{ label: string; count: number; amount: number; share: number }>;
  sectors: Array<{ label: string; count: number; amount: number; share: number }>;
  firms: Array<{ label: string; count: number; amount: number; share: number }>;
}

export function fetchUnifiedOverview(params: UnifiedOverviewParams = {}) {
  const query = new URLSearchParams();
  if (params.regulator && params.regulator !== "All") query.set("regulator", params.regulator);
  if (params.country && params.country !== "All") query.set("country", params.country);
  if (params.year) query.set("year", String(params.year));
  if (params.breachCategory && params.breachCategory !== "All") query.set("breachCategory", params.breachCategory);
  if (params.sector && params.sector !== "All") query.set("sector", params.sector);
  if (params.q) query.set("q", params.q);
  query.set("currency", params.currency || "GBP");
  return fetchJSON<UnifiedOverviewResponse>(`/api/unified/overview?${query.toString()}`);
}

export interface UKEnforcementSearchParams {
  q?: string;
  firmName?: string;
  regulator?: string;
  domain?: string;
  year?: number;
  minAmount?: number;
  maxAmount?: number;
  currency?: string;
  sortBy?: string;
  order?: string;
  limit?: number;
  offset?: number;
}

export interface UKEnforcementAction {
  id: string;
  regulator: string;
  regulator_full_name: string;
  source_domain: string;
  country_code: string;
  country_name: string;
  firm_individual: string;
  firm_category: string | null;
  amount_original: number | null;
  currency: string;
  amount_gbp: number | null;
  amount_eur: number | null;
  display_amount: number | null;
  date_issued: string;
  year_issued: number;
  month_issued: number;
  breach_type: string | null;
  breach_categories: string[];
  summary: string | null;
  notice_url: string | null;
  source_url: string | null;
  source_window_note: string | null;
  aliases: string[];
  source_layer: string;
  created_at: string;
  updated_at: string;
}

export interface UKEnforcementSearchResponse {
  success: boolean;
  results: UKEnforcementAction[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
    pages: number;
    currentPage: number;
  };
  filters: {
    q: string | null;
    regulator: string | null;
    domain: string | null;
    year: number | null;
    minAmount: number | null;
    maxAmount: number | null;
    currency: string;
  };
  metadata: {
    aliasExpanded: boolean;
  };
}

export interface UKEnforcementStatsResponse {
  success: boolean;
  summary: {
    count: number;
    total: number;
    maxFine: number;
    earliestDate: string | null;
    latestDate: string | null;
    currency: string;
  };
  byRegulator: Array<{
    regulator: string;
    regulatorFullName: string;
    domain: string;
    domainLabel: string;
    sourceWindowNote: string | null;
    count: number;
    total: number;
    maxFine: number;
  }>;
  byDomain: Array<{
    domain: string;
    label: string;
    count: number;
    total: number;
  }>;
  topActions: Array<{
    id: string;
    regulator: string;
    domain: string;
    firm: string;
    amount: number;
    currency: string;
    date: string;
    breachType: string | null;
    summary: string | null;
    url: string | null;
  }>;
  filters: {
    year: number | null;
    domain: string | null;
    currency: string;
  };
}

export function fetchUKEnforcementSearch(
  params: UKEnforcementSearchParams = {},
) {
  const queryParams = new URLSearchParams();

  if (params.q) queryParams.set("q", params.q);
  if (params.firmName) queryParams.set("firmName", params.firmName);
  if (params.regulator && params.regulator !== "All")
    queryParams.set("regulator", params.regulator);
  if (params.domain && params.domain !== "all")
    queryParams.set("domain", params.domain);
  if (params.year && params.year !== 0)
    queryParams.set("year", String(params.year));
  if (params.minAmount !== undefined)
    queryParams.set("minAmount", String(params.minAmount));
  if (params.maxAmount !== undefined)
    queryParams.set("maxAmount", String(params.maxAmount));
  if (params.currency) queryParams.set("currency", params.currency);
  if (params.sortBy) queryParams.set("sortBy", params.sortBy);
  if (params.order) queryParams.set("order", params.order);
  if (params.limit) queryParams.set("limit", String(params.limit));
  if (params.offset) queryParams.set("offset", String(params.offset));

  const queryString = queryParams.toString();
  return fetchJSON<UKEnforcementSearchResponse>(
    `/api/uk-enforcement/search${queryString ? `?${queryString}` : ""}`,
  );
}

export function fetchUKEnforcementStats(
  year?: number,
  domain?: string,
  currency = "GBP",
) {
  const params = new URLSearchParams();
  if (year && year !== 0) params.set("year", String(year));
  if (domain && domain !== "all") params.set("domain", domain);
  params.set("currency", currency);

  return fetchJSON<UKEnforcementStatsResponse>(
    `/api/uk-enforcement/stats?${params.toString()}`,
  );
}

export interface EnforcementBriefingFilters {
  dateFrom?: string;
  dateTo?: string;
  regulator?: string;
  country?: string;
  breachCategory?: string;
  firmCategory?: string;
  personaId?: string;
  query?: string;
  currency?: "GBP" | "EUR";
  limit?: number;
}

export interface EnforcementBriefingTheme {
  title: string;
  narrative: string;
  evidenceIds: string[];
  implication: string;
  count?: number;
}

export interface EnforcementBriefingResponse {
  success: boolean;
  briefing: {
    executiveSummary: string;
    keyThemes: EnforcementBriefingTheme[];
    notablePrecedents: Array<{
      firm: string;
      regulator: string;
      dateIssued: string;
      reason: string;
      citationId: string | null;
    }>;
    mlroWatchPoints: string[];
    confidence: "high" | "medium" | "low";
    limitations: string[];
    disclaimer: string;
  };
  stats: {
    totalActions: number;
    sampledActions: number;
    monetaryActions: number;
    sampledTotalAmount: number;
    sampledAverageAmount: number;
    sampledMaxAmount: number;
    totalAmount: number;
    averageAmount: number;
    maxAmount: number;
    earliestDate: string | null;
    latestDate: string | null;
    topRegulators: Array<{ regulator: string; name: string; count: number; totalAmount: number }>;
    topFirms: Array<{ firm: string; count: number; totalAmount: number }>;
    topCategories: Array<{ category: string; count: number; totalAmount: number }>;
  };
  datasetSummary: {
    source: "RegActions qualified enforcement dataset";
    taxonomy: {
      name: "RegActions enforcement taxonomy";
      version: string;
      basis: string;
    };
    scopeLabel: string;
    filtersApplied: string[];
    matchedActions: number;
    sampledActions: number;
    evidenceActions: number;
    evidenceLimit: number;
    requestedDateRange: {
      from: string;
      to: string;
    };
    evidenceDateRange: {
      from: string;
      to: string;
    } | null;
    sampledMonetaryValue: number;
    topRegulators: Array<{ label: string; count: number }>;
    topThemes: Array<{ label: string; count: number; sampledAmount: number }>;
    topFirms: Array<{ label: string; count: number; sampledAmount: number }>;
    modelInput: {
      sentToModel: boolean;
      evidenceRowsSent: number;
      note: string;
    };
  };
  themes: EnforcementBriefingTheme[];
  citations: Array<{
    id: string;
    actionId: string;
    firm: string;
    regulator: string;
    dateIssued: string;
    title: string;
    url: string | null;
  }>;
  filters: Required<Pick<EnforcementBriefingFilters, "dateFrom" | "dateTo" | "currency" | "limit">> & {
    regulator: string | null;
    country: string | null;
    breachCategory: string | null;
    firmCategory: string | null;
    personaId: string | null;
    query: string | null;
  };
  generatedAt: string;
  model: string;
  fallbackUsed: boolean;
  cached: boolean;
  evidenceHash: string;
}

export async function fetchEnforcementBriefing(
  filters: EnforcementBriefingFilters,
) {
  const response = await fetch(`${API_BASE}/api/agentic/enforcement-briefing`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(filters),
  });

  const data = await response.json() as EnforcementBriefingResponse | { success: false; error?: string };
  if (!response.ok || !data.success) {
    throw new Error("error" in data && data.error ? data.error : "Briefing request failed");
  }
  return data;
}

export interface AgenticFirmProfileInput {
  profileName?: string;
  personaId?: string;
  firmType?: string;
  sizeBand?: string;
  jurisdictions?: string[];
  regulators?: string[];
  products?: string[];
  customerTypes?: string[];
  permissions?: string[];
  riskFlags?: string[];
  recentIncidents?: string[];
  keywords?: string[];
}

export interface AgenticWorkbenchInput {
  profile?: AgenticFirmProfileInput;
  controlFramework?: string;
  controls?: string[];
  researchQuestion?: string;
  lookbackDays?: number;
  dateFrom?: string;
  dateTo?: string;
  regulator?: string;
  country?: string;
  actionId?: string;
}

export interface AgenticWorkbenchResponse {
  success: true;
  generatedAt: string;
  version: string;
  profile: Required<Pick<AgenticFirmProfileInput, "profileName">> & {
    personaId: string | null;
    firmType: string | null;
    sizeBand: string | null;
    jurisdictions: string[];
    regulators: string[];
    products: string[];
    customerTypes: string[];
    permissions: string[];
    riskFlags: string[];
    recentIncidents: string[];
    keywords: string[];
  };
  comparator: {
    capability: "Comparator agent";
    summary: string;
    riskThemes: Array<{
      label: string;
      domain: string;
      count: number;
      averageScore: number;
      totalAmountGbp: number;
      evidenceIds: string[];
      watchPoint: string;
    }>;
    closestPrecedents: Array<{
      citationId: string;
      score: number;
      matchedSignals: string[];
      explanation: string;
      action: {
        id: string;
        regulator: string;
        firm: string;
        dateIssued: string;
        breachType: string | null;
        summary: string | null;
        amountGbp: number | null;
        regActionsCategory: {
          label: string;
          domain: string;
          confidence: "high" | "medium" | "low";
        };
      };
    }>;
    citations: AgenticCitation[];
    methodology: string[];
  };
  horizonScan: {
    capability: "Horizon scanning agent";
    lookbackDays: number;
    summary: string;
    newRelevantActions: AgenticWorkbenchResponse["comparator"]["closestPrecedents"];
    trendDeltas: Array<{
      label: string;
      recentCount: number;
      previousCount: number;
      change: number;
    }>;
    watchlistMatches: string[];
    citations: AgenticCitation[];
  };
  controlGapAnalysis: {
    capability: "Control gap analyser";
    summary: string;
    assessedControls: Array<{
      theme: string;
      status: "covered" | "partial" | "not evidenced";
      matchedTerms: string[];
      expectedEvidence: string[];
      precedentEvidenceIds: string[];
    }>;
    priorityGaps: Array<{
      theme: string;
      severity: "high" | "medium" | "low";
      reason: string;
      suggestedEvidence: string[];
    }>;
  };
  research: {
    capability: "Multi-step research agent";
    question: string;
    answer: string;
    plan: Array<{ step: string; status: "completed" }>;
    parsedFilters: {
      dateFrom: string;
      dateTo: string;
      regulators: string[];
      countries: string[];
      categories: string[];
      keywords: string[];
    };
    topFindings: AgenticWorkbenchResponse["comparator"]["riskThemes"];
    citations: AgenticCitation[];
  };
  impact: {
    capability: "Regulatory change impact agent";
    sourceAction: AgenticWorkbenchResponse["comparator"]["closestPrecedents"][number]["action"] | null;
    summary: string;
    impactFlags: Array<{
      label: string;
      severity: "high" | "medium" | "low";
      reason: string;
    }>;
    affectedProfiles: Array<{
      personaId: string;
      name: string;
      score: number;
      matchedSignals: string[];
    }>;
    draftMemo: {
      subject: string;
      audience: string;
      body: string[];
    };
    citations: AgenticCitation[];
  };
}

export interface AgenticCitation {
  id: string;
  actionId: string;
  firm: string;
  regulator: string;
  dateIssued: string;
  category: string;
  summary: string;
  url: string | null;
}

export async function fetchAgenticWorkbench(input: AgenticWorkbenchInput) {
  const response = await fetch(`${API_BASE}/api/agentic/workbench`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const data = await response.json() as AgenticWorkbenchResponse | { success: false; error?: string };
  if (!response.ok || !data.success) {
    throw new Error("error" in data && data.error ? data.error : "Agentic workbench request failed");
  }
  return data;
}
