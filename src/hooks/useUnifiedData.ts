/**
 * useUnifiedData Hook
 *
 * Fetches data from the unified API endpoints to support multi-regulator filtering
 * This replaces useFinesData for the multi-regulator dashboard
 */

import { useEffect, useState, useMemo } from 'react';
import { fetchUnifiedSearch, type UnifiedSearchResponse } from '../api';
import type { FineRecord, StatsResponse } from '../types';

interface UseUnifiedDataParams {
  regulator: string;
  country: string;
  year: number;
  currency: string;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toInteger(value: unknown): number {
  return Math.trunc(toNumber(value));
}

function parseBreachCategories(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
      }
    } catch {
      return value ? [value] : [];
    }
  }

  return [];
}

// Transform unified API response to match FineRecord interface
function transformUnifiedRecord(record: UnifiedSearchResponse['results'][0], currency: string): FineRecord {
  const amountGbp = toNumber(record.amount_gbp);
  const amountEur = toNumber(record.amount_eur);

  return {
    id: record.id,
    fine_reference: record.id, // Use id as reference since unified doesn't have fine_reference
    firm_individual: record.firm_individual,
    firm_category: record.firm_category || '',
    amount: currency === 'EUR' ? amountEur : amountGbp,
    date_issued: record.date_issued,
    year_issued: toInteger(record.year_issued),
    month_issued: toInteger(record.month_issued),
    breach_type: record.breach_type,
    breach_categories: parseBreachCategories(record.breach_categories),
    summary: record.summary,
    final_notice_url: record.notice_url,
    created_at: record.created_at,
    updated_at: record.created_at,
    // Add unified-specific fields
    regulator: record.regulator,
    regulator_full_name: record.regulator_full_name,
    country_code: record.country_code,
    country_name: record.country_name,
    amount_eur: amountEur,
    amount_gbp: amountGbp,
  };
}

function buildStats(records: FineRecord[]): StatsResponse['data'] {
  if (!records.length) {
    return {
      totalFines: 0,
      totalAmount: 0,
      avgAmount: 0,
      maxFine: 0,
      maxFirmName: null,
      dominantBreach: null,
    };
  }

  let totalAmount = 0;
  let maxFine = 0;
  let maxFirmName: string | null = null;
  const breachCounts = new Map<string, number>();

  records.forEach((record) => {
    totalAmount += record.amount;

    if (record.amount > maxFine) {
      maxFine = record.amount;
      maxFirmName = record.firm_individual;
    }

    const labels = record.breach_categories?.length ? record.breach_categories : record.breach_type ? [record.breach_type] : [];
    labels.forEach((label) => {
      breachCounts.set(label, (breachCounts.get(label) ?? 0) + 1);
    });
  });

  const dominantBreach =
    Array.from(breachCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    totalFines: records.length,
    totalAmount,
    avgAmount: totalAmount / records.length,
    maxFine,
    maxFirmName,
    dominantBreach,
  };
}

export function useUnifiedData({ regulator, country, year, currency }: UseUnifiedDataParams) {
  const [fines, setFines] = useState<FineRecord[]>([]);
  const [stats, setStats] = useState<StatsResponse['data'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Memoize search params to avoid unnecessary refetches
  const searchParams = useMemo(() => ({
    regulator: regulator !== 'All' ? regulator : undefined,
    country: country !== 'All' ? country : undefined,
    year: year !== 0 ? year : undefined,
    currency,
    limit: 5000, // Fetch all records (same as FCA endpoint)
    sortBy: 'date_issued',
    order: 'desc' as const,
  }), [regulator, country, year, currency]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const searchRes = await fetchUnifiedSearch(searchParams);

        if (!mounted) return;

        const transformedFines = searchRes.results.map((record) => transformUnifiedRecord(record, currency));

        setFines(transformedFines);
        setStats(buildStats(transformedFines));

      } catch (err) {
        console.error('Unified data fetch error:', err);
        if (mounted) {
          setError('Unable to load regulatory data. Please try again.');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, [searchParams, currency]);

  return { fines, stats, loading, error };
}
