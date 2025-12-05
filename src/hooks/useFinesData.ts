import { useEffect, useState } from 'react';
import { fetchFines, fetchStats, fetchTrends } from '../api';
import type { FineRecord, StatsResponse, TrendsResponse } from '../types';
import { CURRENT_YEAR } from './useDashboardState';

export type TrendPoint = { month: string; total: number; count: number; period: number; year: number };

// Normalize record amounts to ensure they are numbers
function normalizeRecords(records: FineRecord[]): FineRecord[] {
  return records.map(record => ({
    ...record,
    amount: typeof record.amount === 'string' ? parseFloat(record.amount) || 0 : (record.amount || 0),
    year_issued: typeof record.year_issued === 'string' ? parseInt(record.year_issued, 10) : record.year_issued,
    month_issued: typeof record.month_issued === 'string' ? parseInt(record.month_issued, 10) : record.month_issued,
  }));
}

interface UseFinesDataParams {
  year: number;
  comparisonYear: number | null;
  availableYears: number[];
}

export function useFinesData({ year, comparisonYear, availableYears }: UseFinesDataParams) {
  const [fines, setFines] = useState<FineRecord[]>([]);
  const [recordsByYear, setRecordsByYear] = useState<Record<number, FineRecord[]>>({});
  const [trendsByYear, setTrendsByYear] = useState<Record<number, TrendPoint[]>>({});
  const [stats, setStats] = useState<StatsResponse['data'] | null>(null);
  const [prevStats, setPrevStats] = useState<StatsResponse['data'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const prevYear = year === 0 ? CURRENT_YEAR - 1 : Math.max(2013, year - 1);
        const requests: Promise<any>[] = [fetchFines(year), fetchStats(year), fetchTrends(year)];
        const shouldCompare = prevYear >= 2013;
        if (shouldCompare) {
          requests.push(fetchStats(prevYear));
          requests.push(fetchTrends(prevYear));
        }

        const [finesRes, statsRes, trendsRes, prevStatsRes, prevTrendsRes] = await Promise.all(requests);
        if (!mounted) return;
        const normalizedFines = normalizeRecords(finesRes.data);
        setFines(normalizedFines);
        setStats(statsRes.data);
        setPrevStats(prevStatsRes?.data ?? null);
        setRecordsByYear((prev) => ({ ...prev, [year]: normalizedFines }));
        setTrendsByYear((prev) => {
          const next = { ...prev, [year]: mapTrendRows(trendsRes.data) };
          if (prevTrendsRes) {
            next[prevYear] = mapTrendRows(prevTrendsRes.data);
          }
          return next;
        });
      } catch (err) {
        console.error(err);
        setError('Unable to load FCA data. Please try again.');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [year]);

  useEffect(() => {
    const preferredYears = availableYears.slice(0, 4);
    let cancelled = false;
    async function prefetch() {
      await Promise.all(
        preferredYears.map(async (targetYear) => {
          if (recordsByYear[targetYear] && trendsByYear[targetYear]) return;
          try {
            if (!recordsByYear[targetYear]) {
              const finesRes = await fetchFines(targetYear);
              if (!cancelled) {
                setRecordsByYear((prev) => ({ ...prev, [targetYear]: normalizeRecords(finesRes.data) }));
              }
            }
            if (!trendsByYear[targetYear]) {
              const trendsRes = await fetchTrends(targetYear);
              if (!cancelled) {
                setTrendsByYear((prev) => ({ ...prev, [targetYear]: mapTrendRows(trendsRes.data) }));
              }
            }
          } catch (err) {
            console.error('Prefetch failed', err);
          }
        })
      );
    }
    prefetch();
    return () => {
      cancelled = true;
    };
  }, [availableYears, recordsByYear, trendsByYear]);

  useEffect(() => {
    if (!comparisonYear || comparisonYear === year) return;
    if (recordsByYear[comparisonYear] && trendsByYear[comparisonYear]) return;
    let cancelled = false;
    async function hydrateComparison() {
      try {
        if (!recordsByYear[comparisonYear]) {
          const finesRes = await fetchFines(comparisonYear);
          if (!cancelled) {
            setRecordsByYear((prev) => ({ ...prev, [comparisonYear]: normalizeRecords(finesRes.data) }));
          }
        }
        if (!trendsByYear[comparisonYear]) {
          const trendsRes = await fetchTrends(comparisonYear);
          if (!cancelled) {
            setTrendsByYear((prev) => ({ ...prev, [comparisonYear]: mapTrendRows(trendsRes.data) }));
          }
        }
      } catch (err) {
        console.error('Unable to hydrate comparison year', err);
      }
    }
    hydrateComparison();
    return () => {
      cancelled = true;
    };
  }, [comparisonYear, year, recordsByYear, trendsByYear]);

  useEffect(() => {
    if (year !== 0) return;
    if (recordsByYear[CURRENT_YEAR] && trendsByYear[CURRENT_YEAR]) return;
    let cancelled = false;
    async function hydrateCurrent() {
      try {
        if (!recordsByYear[CURRENT_YEAR]) {
          const finesRes = await fetchFines(CURRENT_YEAR);
          if (!cancelled) {
            setRecordsByYear((prev) => ({ ...prev, [CURRENT_YEAR]: normalizeRecords(finesRes.data) }));
          }
        }
        if (!trendsByYear[CURRENT_YEAR]) {
          const trendsRes = await fetchTrends(CURRENT_YEAR);
          if (!cancelled) {
            setTrendsByYear((prev) => ({ ...prev, [CURRENT_YEAR]: mapTrendRows(trendsRes.data) }));
          }
        }
      } catch (err) {
        console.error('Unable to hydrate current year', err);
      }
    }
    hydrateCurrent();
    return () => {
      cancelled = true;
    };
  }, [year, recordsByYear, trendsByYear]);

  return { fines, stats, prevStats, recordsByYear, trendsByYear, loading, error };
}

function mapTrendRows(rows: TrendsResponse['data']): TrendPoint[] {
  return rows.map((row) => ({
    month: new Date(row.year, row.period_value - 1, 1).toLocaleDateString('en-GB', { month: 'short' }),
    total: typeof row.total_fines === 'string' ? parseFloat(row.total_fines) || 0 : (row.total_fines || 0),
    count: typeof row.fine_count === 'string' ? parseInt(row.fine_count, 10) : (row.fine_count || 0),
    period: row.period_value,
    year: row.year,
  }));
}
