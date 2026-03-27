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
  regulator?: string;
  country?: string;
  year?: number;
  minAmount?: number;
  maxAmount?: number;
  breachCategory?: string;
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
      | "listing_only"
      | "missing"
      | null;
    source_link_label?: string | null;
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

  if (params.regulator && params.regulator !== "All")
    queryParams.set("regulator", params.regulator);
  if (params.country && params.country !== "All")
    queryParams.set("country", params.country);
  if (params.year && params.year !== 0)
    queryParams.set("year", String(params.year));
  if (params.minAmount !== undefined)
    queryParams.set("minAmount", String(params.minAmount));
  if (params.maxAmount !== undefined)
    queryParams.set("maxAmount", String(params.maxAmount));
  if (params.breachCategory)
    queryParams.set("breachCategory", params.breachCategory);
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
