/**
 * useUnifiedData Hook
 *
 * Fetches data from the unified API endpoints to support multi-regulator filtering
 * This replaces useFinesData for the multi-regulator dashboard
 */

import { useEffect, useState, useMemo } from 'react';
import { fetchUnifiedSearch, fetchUnifiedStats, type UnifiedSearchResponse } from '../api';
import type { FineRecord } from '../types';

interface UseUnifiedDataParams {
  regulator: string;
  country: string;
  year: number;
  currency: string;
}

// Transform unified API response to match FineRecord interface
function transformUnifiedRecord(record: UnifiedSearchResponse['results'][0]): FineRecord {
  // Choose amount based on currency preference
  const amount = record.currency === 'EUR' ? record.amount_eur : record.amount_gbp;

  return {
    id: record.id,
    fine_reference: record.id, // Use id as reference since unified doesn't have fine_reference
    firm_individual: record.firm_individual,
    firm_category: record.firm_category || '',
    amount: amount,
    date_issued: record.date_issued,
    year_issued: record.year_issued,
    month_issued: record.month_issued,
    breach_type: record.breach_type,
    breach_categories: record.breach_categories || [],
    summary: record.summary,
    final_notice_url: record.notice_url,
    created_at: record.created_at,
    updated_at: record.created_at,
    // Add unified-specific fields
    regulator: record.regulator,
    regulator_full_name: record.regulator_full_name,
    country_code: record.country_code,
    country_name: record.country_name,
    amount_eur: record.amount_eur,
    amount_gbp: record.amount_gbp,
  };
}

export function useUnifiedData({ regulator, country, year, currency }: UseUnifiedDataParams) {
  const [fines, setFines] = useState<FineRecord[]>([]);
  const [stats, setStats] = useState<any | null>(null);
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
        // Fetch both search results and stats in parallel
        const [searchRes, statsRes] = await Promise.all([
          fetchUnifiedSearch(searchParams),
          fetchUnifiedStats(year !== 0 ? year : undefined, currency),
        ]);

        if (!mounted) return;

        // Transform unified records to match FineRecord interface
        const transformedFines = searchRes.results.map(transformUnifiedRecord);

        setFines(transformedFines);
        setStats(statsRes);

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
  }, [searchParams, year, currency]);

  return { fines, stats, loading, error };
}
