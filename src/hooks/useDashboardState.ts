import { useEffect, useMemo, useState } from 'react';
import type { AdvancedFilterValues } from '../components/AdvancedFilters';

export const CURRENT_YEAR = new Date().getFullYear();
export const INITIAL_ADVANCED_FILTERS: AdvancedFilterValues = {
  years: [],
  amountRange: [0, 500_000_000],
  breachTypes: [],
  firmCategories: [],
  dateRange: { start: '', end: '' },
};

interface QueryState {
  year?: number | null;
  category?: string;
  search?: string;
  searchScope?: string;
  comparisonYear?: number | null;
  comparisonCategories?: string[];
  advancedFilters: AdvancedFilterValues;
}

export function useDashboardState() {
  const initialQuery = useMemo(() => getInitialQueryState(), []);
  const [year, setYear] = useState(initialQuery.year ?? CURRENT_YEAR);
  const [category, setCategory] = useState(initialQuery.category ?? 'All');
  const [search, setSearch] = useState(initialQuery.search ?? '');
  const [searchScope, setSearchScope] = useState(initialQuery.searchScope ?? 'all');
  const [comparisonYear, setComparisonYear] = useState<number | null>(initialQuery.comparisonYear ?? CURRENT_YEAR - 1);
  const [comparisonCategories, setComparisonCategories] = useState<string[]>(initialQuery.comparisonCategories ?? []);
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilterValues>(initialQuery.advancedFilters ?? INITIAL_ADVANCED_FILTERS);

  const shareState = useMemo(
    () => ({
      year,
      category,
      search,
      searchScope,
      comparisonYear,
      comparisonCategories,
      advancedFilters,
    }),
    [year, category, search, searchScope, comparisonYear, comparisonCategories, advancedFilters]
  );
  const shareUrl = useMemo(() => buildShareUrl(shareState), [shareState]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = buildShareParams(shareState);
    const base = `${window.location.origin}${window.location.pathname}`;
    const query = params.toString();
    const next = query ? `${base}?${query}` : base;
    window.history.replaceState({}, '', next);
  }, [shareState]);

  return {
    year,
    setYear,
    category,
    setCategory,
    search,
    setSearch,
    searchScope,
    setSearchScope,
    comparisonYear,
    setComparisonYear,
    comparisonCategories,
    setComparisonCategories,
    advancedFilters,
    setAdvancedFilters,
    shareUrl,
  };
}

function getInitialQueryState(): QueryState {
  if (typeof window === 'undefined') {
    return { advancedFilters: INITIAL_ADVANCED_FILTERS };
  }
  const params = new URLSearchParams(window.location.search);
  const parseNumber = (value: string | null) => {
    if (!value) return undefined;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  };
  const parseNumberList = (value: string | null) => {
    if (!value) return [];
    return value
      .split(',')
      .map((item) => Number(item.trim()))
      .filter((num) => !Number.isNaN(num));
  };
  const parseStringList = (value: string | null) => {
    if (!value) return [];
    return value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  };

  const advancedFilters: AdvancedFilterValues = {
    years: parseNumberList(params.get('filterYears')),
    amountRange: [
      parseNumber(params.get('amountMin')) ?? INITIAL_ADVANCED_FILTERS.amountRange[0],
      parseNumber(params.get('amountMax')) ?? INITIAL_ADVANCED_FILTERS.amountRange[1],
    ],
    breachTypes: parseStringList(params.get('breaches')),
    firmCategories: parseStringList(params.get('firms')),
    dateRange: {
      start: params.get('startDate') || '',
      end: params.get('endDate') || '',
    },
  };

  return {
    year: parseNumber(params.get('year')) ?? undefined,
    category: params.get('category') || undefined,
    search: params.get('search') || undefined,
    searchScope: params.get('scope') || undefined,
    comparisonYear: parseNumber(params.get('compare')) ?? undefined,
    comparisonCategories: parseStringList(params.get('compareCategories')),
    advancedFilters,
  };
}

function buildShareParams(state: {
  year: number;
  category: string;
  search: string;
  searchScope: string;
  comparisonYear: number | null;
  comparisonCategories: string[];
  advancedFilters: AdvancedFilterValues;
}) {
  const params = new URLSearchParams();
  if (state.year !== CURRENT_YEAR) {
    params.set('year', String(state.year));
  }
  if (state.category !== 'All') {
    params.set('category', state.category);
  }
  if (state.search.trim()) {
    params.set('search', state.search.trim());
  }
  if (state.searchScope !== 'all') {
    params.set('scope', state.searchScope);
  }
  if (state.comparisonYear) {
    params.set('compare', String(state.comparisonYear));
  }
  if (state.comparisonCategories.length) {
    params.set('compareCategories', state.comparisonCategories.join(','));
  }
  const { advancedFilters } = state;
  if (advancedFilters.years.length) {
    params.set('filterYears', advancedFilters.years.join(','));
  }
  if (advancedFilters.amountRange[0] !== INITIAL_ADVANCED_FILTERS.amountRange[0]) {
    params.set('amountMin', String(advancedFilters.amountRange[0]));
  }
  if (advancedFilters.amountRange[1] !== INITIAL_ADVANCED_FILTERS.amountRange[1]) {
    params.set('amountMax', String(advancedFilters.amountRange[1]));
  }
  if (advancedFilters.breachTypes.length) {
    params.set('breaches', advancedFilters.breachTypes.join(','));
  }
  if (advancedFilters.firmCategories.length) {
    params.set('firms', advancedFilters.firmCategories.join(','));
  }
  if (advancedFilters.dateRange.start) {
    params.set('startDate', advancedFilters.dateRange.start);
  }
  if (advancedFilters.dateRange.end) {
    params.set('endDate', advancedFilters.dateRange.end);
  }
  return params;
}

function buildShareUrl(state: {
  year: number;
  category: string;
  search: string;
  searchScope: string;
  comparisonYear: number | null;
  comparisonCategories: string[];
  advancedFilters: AdvancedFilterValues;
}) {
  if (typeof window === 'undefined') return '';
  const params = buildShareParams(state);
  const base = `${window.location.origin}${window.location.pathname}`;
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}
