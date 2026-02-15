import type {
  CategoriesResponse,
  FirmResponse,
  FirmsResponse,
  ListResponse,
  NotificationsResponse,
  SectorsResponse,
  StatsResponse,
  TrendsResponse,
  YearsResponse,
} from './types';

const fallbackBase = import.meta.env.DEV ? 'http://localhost:4000' : '';
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
  return fetchJSON<ListResponse>(`/api/fca-fines/list?year=${yearParam}&limit=5000`);
}

export function fetchStats(year: number) {
  return fetchJSON<StatsResponse>(`/api/fca-fines/stats?year=${year}`);
}

export function fetchTrends(year: number) {
  return fetchJSON<TrendsResponse>(`/api/fca-fines/trends?period=month&year=${year}`);
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
  return fetchJSON<FirmsResponse>(`/api/fca-fines/firms?limit=${encodeURIComponent(String(limit))}`);
}

export function fetchFirm(slug: string, limit = 200) {
  return fetchJSON<FirmResponse>(
    `/api/fca-fines/firm?slug=${encodeURIComponent(slug)}&limit=${encodeURIComponent(String(limit))}`
  );
}
