/**
 * useUnifiedData Hook
 *
 * Fetches data from the unified API endpoints to support multi-regulator filtering
 * This replaces useFinesData for the multi-regulator dashboard
 */

import { useEffect, useState, useMemo } from "react";
import { fetchUnifiedSearch, type UnifiedSearchResponse } from "../api.js";
import type { FineRecord, StatsResponse } from "../types.js";
import { getRecordSourceStatus } from "../utils/sourceLinks.js";

interface UseUnifiedDataParams {
  regulator: string;
  country: string;
  year: number;
  currency: string;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, ""));
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
    return value.filter(
      (entry): entry is string => typeof entry === "string" && entry.length > 0,
    );
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (entry): entry is string =>
            typeof entry === "string" && entry.length > 0,
        );
      }
    } catch {
      return value ? [value] : [];
    }
  }

  return [];
}

// Transform unified API response to match FineRecord interface
export function transformUnifiedRecord(
  record: UnifiedSearchResponse["results"][0],
  currency: string,
): FineRecord {
  const amountGbp = toNumber(record.amount_gbp);
  const amountEur = toNumber(record.amount_eur);
  const amountRequiresReview = Boolean(record.requires_amount_review);
  const safeAmountGbp = amountRequiresReview ? 0 : amountGbp;
  const safeAmountEur = amountRequiresReview ? 0 : amountEur;

  return {
    id: record.id,
    canonical_case_id: record.canonical_case_id || record.id,
    fine_reference: record.canonical_case_id || record.id,
    firm_individual: record.firm_individual,
    firm_category: record.firm_category || "",
    amount: currency === "EUR" ? safeAmountEur : safeAmountGbp,
    date_issued: record.date_issued,
    year_issued: toInteger(record.year_issued),
    month_issued: toInteger(record.month_issued),
    breach_type: record.breach_type,
    breach_categories: parseBreachCategories(record.breach_categories),
    summary: record.summary,
    final_notice_url: record.notice_url,
    source_url: record.source_url,
    listing_url: record.listing_url || record.source_url,
    detail_url: record.detail_url || record.notice_url,
    official_publication_url: record.official_publication_url || null,
    source_link_status:
      record.source_link_status ||
      getRecordSourceStatus({
        regulator: record.regulator,
        final_notice_url: record.notice_url,
        source_url: record.source_url,
        listing_url: record.listing_url || record.source_url,
        detail_url: record.detail_url || record.notice_url,
        official_publication_url: record.official_publication_url || null,
        source_link_status: null,
        source_link_label: record.source_link_label || null,
      }),
    source_link_label: record.source_link_label || null,
    duplicate_count: toInteger(record.duplicate_count),
    amount_quality: record.amount_quality || "reported",
    requires_amount_review: amountRequiresReview,
    amount_verification_url: record.amount_verification_url || null,
    amount_override_reason: record.amount_override_reason || null,
    source_checked_at: record.source_checked_at || null,
    source_http_status:
      record.source_http_status == null ? null : toInteger(record.source_http_status),
    source_official_domain_match: record.source_official_domain_match ?? null,
    source_content_hash: record.source_content_hash || null,
    created_at: record.created_at,
    updated_at: record.created_at,
    // Add unified-specific fields
    regulator: record.regulator,
    regulator_full_name: record.regulator_full_name,
    country_code: record.country_code,
    country_name: record.country_name,
    amount_eur: safeAmountEur,
    amount_gbp: safeAmountGbp,
  };
}

function buildStats(records: FineRecord[]): StatsResponse["data"] {
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

    const labels = record.breach_categories?.length
      ? record.breach_categories
      : record.breach_type
        ? [record.breach_type]
        : [];
    labels.forEach((label: string) => {
      breachCounts.set(label, (breachCounts.get(label) ?? 0) + 1);
    });
  });

  const dominantBreach =
    Array.from(breachCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ??
    null;

  return {
    totalFines: records.length,
    totalAmount,
    avgAmount: totalAmount / records.length,
    maxFine,
    maxFirmName,
    dominantBreach,
  };
}

export function useUnifiedData({
  regulator,
  country,
  year,
  currency,
}: UseUnifiedDataParams) {
  const [fines, setFines] = useState<FineRecord[]>([]);
  const [stats, setStats] = useState<StatsResponse["data"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Memoize search params to avoid unnecessary refetches
  const searchParams = useMemo(
    () => ({
      regulator: regulator !== "All" ? regulator : undefined,
      country: country !== "All" ? country : undefined,
      year: year !== 0 ? year : undefined,
      currency,
      limit: 500,
      sortBy: "date_issued",
      order: "desc" as const,
    }),
    [regulator, country, year, currency],
  );

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const pageLimit = 500;
        const maximumRecords = 5000;
        let offset = 0;
        const unifiedRecords: UnifiedSearchResponse["results"] = [];
        let hasMore = true;

        // The production search API caps a response at 500 records. Page through
        // the public working set so charts do not accidentally describe only the
        // newest page as an all-time total.
        while (hasMore && offset < maximumRecords) {
          const searchRes = await fetchUnifiedSearch({
            ...searchParams,
            limit: pageLimit,
            offset,
          });
          unifiedRecords.push(...searchRes.results);
          offset += searchRes.results.length;
          hasMore = searchRes.pagination.hasMore && searchRes.results.length > 0;
        }

        if (!mounted) return;

        const transformedFines = unifiedRecords.map(
          (record: UnifiedSearchResponse["results"][number]) =>
            transformUnifiedRecord(record, currency),
        );

        setFines(transformedFines);
        setStats(buildStats(transformedFines));
      } catch (err) {
        console.error("Unified data fetch error:", err);
        if (mounted) {
          setError("Unable to load regulatory data. Please try again.");
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
