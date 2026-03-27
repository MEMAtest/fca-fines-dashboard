import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { ArrowLeft, Calendar, Globe2, Layers3, Share2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { AdvancedFilterValues } from "../components/AdvancedFilters.js";
import { BreachByTypeChart } from "../components/BreachByTypeChart.js";
import { CategoryTreemap } from "../components/CategoryTreemap.js";
import { DataCoverageNotice } from "../components/DataCoverageNotice.js";
import { FiltersBar } from "../components/FiltersBar.js";
import { FineDistributionChart } from "../components/FineDistributionChart.js";
import { LatestNotices } from "../components/LatestNotices.js";
import { LazyVisible } from "../components/LazyVisible.js";
import { DashboardSkeleton } from "../components/LoadingSkeletons.js";
import { Modal } from "../components/Modal.js";
import { TimelineChart } from "../components/TimelineChart.js";
import { Toast } from "../components/Toast.js";
import { TopFirms } from "../components/TopFirms.js";
import {
  getRegulatorCoverage,
  isValidRegulatorCode,
  type RegulatorCoverage,
} from "../data/regulatorCoverage.js";
import { INITIAL_ADVANCED_FILTERS } from "../hooks/useDashboardState.js";
import { useSEO } from "../hooks/useSEO.js";
import { useUnifiedData } from "../hooks/useUnifiedData.js";
import type { FineRecord } from "../types.js";
import { exportData } from "../utils/export.js";
import "../styles/regulator-dashboard.css";

const LazyFineTotalsModal = lazy(() =>
  import("../components/FineTotalsModal.js").then((module) => ({
    default: module.FineTotalsModal,
  })),
);
const LazyAdvancedFilters = lazy(() =>
  import("../components/AdvancedFilters.js").then((module) => ({
    default: module.AdvancedFilters,
  })),
);

interface RegulatorDashboardQueryState {
  year?: number;
  category?: string;
  search?: string;
  searchScope?: string;
  currency?: string;
  advancedFilters: AdvancedFilterValues;
}

function safeNum(value: number | string | undefined | null): number {
  if (value === undefined || value === null) {
    return 0;
  }
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(num) || !Number.isFinite(num)) {
    return 0;
  }
  return num;
}

function buildCategoryAgg(records: FineRecord[]) {
  const map = new Map<string, { size: number; count: number }>();
  records.forEach((fine) => {
    const labels = fine.breach_categories?.length
      ? fine.breach_categories
      : ["Unclassified"];
    labels.forEach((label) => {
      const current = map.get(label) || { size: 0, count: 0 };
      map.set(label, {
        size: current.size + safeNum(fine.amount),
        count: current.count + 1,
      });
    });
  });
  return Array.from(map.entries())
    .map(([name, value]) => ({
      name,
      size: safeNum(value.size),
      count: safeNum(value.count),
    }))
    .sort((a, b) => b.size - a.size)
    .slice(0, 10);
}

function buildTimelineSeries(records: FineRecord[]) {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const map = new Map<
    string,
    {
      month: string;
      period: number;
      year: number;
      total: number;
      count: number;
    }
  >();
  records.forEach((record) => {
    const date = new Date(record.date_issued);
    const year = record.year_issued;
    const period = date.getMonth() + 1;
    const key = `${year}-${period}`;
    if (!map.has(key)) {
      map.set(key, {
        month: `${months[period - 1]} ${year}`,
        period,
        year,
        total: 0,
        count: 0,
      });
    }
    const entry = map.get(key)!;
    entry.total += safeNum(record.amount);
    entry.count += 1;
  });
  return Array.from(map.values()).sort((a, b) => {
    if (a.year === b.year) return a.period - b.period;
    return a.year - b.year;
  });
}

function formatCurrency(value: number, currency: "GBP" | "EUR"): string {
  const symbol = currency === "EUR" ? "EUR" : "GBP";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: symbol,
    maximumFractionDigits: 0,
  }).format(value);
}

function getAvailableYears(earliestYear: number, latestYear: number) {
  const years: number[] = [];
  for (let year = latestYear; year >= earliestYear; year -= 1) {
    years.push(year);
  }
  return years;
}

function getMaturityLabel(maturity: "anchor" | "emerging" | "limited") {
  if (maturity === "anchor") return "Anchor archive";
  if (maturity === "emerging") return "Emerging coverage";
  return "Limited coverage";
}

function getOperationalConfidenceLabel(
  confidence: RegulatorCoverage["operationalConfidence"],
) {
  return confidence === "lower"
    ? "Lower-confidence live feed"
    : "Standard live feed";
}

function getInitialQueryState(
  defaultCurrency: "GBP" | "EUR",
): RegulatorDashboardQueryState {
  if (typeof window === "undefined") {
    return {
      advancedFilters: INITIAL_ADVANCED_FILTERS,
      currency: defaultCurrency,
    };
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
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((num) => !Number.isNaN(num));
  };
  const parseStringList = (value: string | null) => {
    if (!value) return [];
    return value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  };

  return {
    year: parseNumber(params.get("year")),
    category: params.get("category") || undefined,
    search: params.get("search") || undefined,
    searchScope: params.get("scope") || undefined,
    currency:
      (params.get("currency") as "GBP" | "EUR" | null) || defaultCurrency,
    advancedFilters: {
      years: parseNumberList(params.get("filterYears")),
      amountRange: [
        parseNumber(params.get("amountMin")) ??
          INITIAL_ADVANCED_FILTERS.amountRange[0],
        parseNumber(params.get("amountMax")) ??
          INITIAL_ADVANCED_FILTERS.amountRange[1],
      ],
      breachTypes: parseStringList(params.get("breaches")),
      firmCategories: parseStringList(params.get("firms")),
      dateRange: {
        start: params.get("startDate") || "",
        end: params.get("endDate") || "",
      },
    },
  };
}

function buildShareParams(state: {
  year: number;
  category: string;
  search: string;
  searchScope: string;
  currency: string;
  advancedFilters: AdvancedFilterValues;
}) {
  const params = new URLSearchParams();

  if (state.year !== 0) {
    params.set("year", String(state.year));
  }
  if (state.category !== "All") {
    params.set("category", state.category);
  }
  if (state.search.trim()) {
    params.set("search", state.search.trim());
  }
  if (state.searchScope !== "all") {
    params.set("scope", state.searchScope);
  }
  if (state.currency !== "GBP") {
    params.set("currency", state.currency);
  }
  if (state.advancedFilters.years.length) {
    params.set("filterYears", state.advancedFilters.years.join(","));
  }
  if (
    state.advancedFilters.amountRange[0] !==
    INITIAL_ADVANCED_FILTERS.amountRange[0]
  ) {
    params.set("amountMin", String(state.advancedFilters.amountRange[0]));
  }
  if (
    state.advancedFilters.amountRange[1] !==
    INITIAL_ADVANCED_FILTERS.amountRange[1]
  ) {
    params.set("amountMax", String(state.advancedFilters.amountRange[1]));
  }
  if (state.advancedFilters.breachTypes.length) {
    params.set("breaches", state.advancedFilters.breachTypes.join(","));
  }
  if (state.advancedFilters.firmCategories.length) {
    params.set("firms", state.advancedFilters.firmCategories.join(","));
  }
  if (state.advancedFilters.dateRange.start) {
    params.set("startDate", state.advancedFilters.dateRange.start);
  }
  if (state.advancedFilters.dateRange.end) {
    params.set("endDate", state.advancedFilters.dateRange.end);
  }

  return params;
}

export function RegulatorDashboard() {
  const { regulatorCode } = useParams<{ regulatorCode: string }>();
  const navigate = useNavigate();
  const normalizedCode = regulatorCode?.toUpperCase();
  const isValid = normalizedCode && isValidRegulatorCode(normalizedCode);
  const coverage = normalizedCode ? getRegulatorCoverage(normalizedCode) : null;
  const coverageCode = coverage?.code ?? normalizedCode ?? "FCA";
  const coverageFullName = coverage?.fullName ?? "Regulator";
  const coverageLatestYear = coverage?.latestYear ?? new Date().getFullYear();
  const coverageDefaultCurrency = coverage?.defaultCurrency ?? "GBP";
  const initialQuery = useMemo(
    () => getInitialQueryState(coverage?.defaultCurrency ?? "GBP"),
    [coverage?.code, coverage?.defaultCurrency],
  );

  const [year, setYear] = useState(initialQuery.year ?? 0);
  const [category, setCategory] = useState(initialQuery.category ?? "All");
  const [search, setSearch] = useState(initialQuery.search ?? "");
  const [searchScope, setSearchScope] = useState(
    initialQuery.searchScope ?? "all",
  );
  const [currency, setCurrency] = useState<"GBP" | "EUR">(
    (initialQuery.currency as "GBP" | "EUR") ?? "GBP",
  );
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilterValues>(
    initialQuery.advancedFilters ?? INITIAL_ADVANCED_FILTERS,
  );
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type?: "success" | "error";
  } | null>(null);
  const [modalContext, setModalContext] = useState<{
    title?: string;
    subtitle?: string;
    records: FineRecord[];
  } | null>(null);

  useEffect(() => {
    if (!isValid) {
      navigate("/404", { replace: true });
    }
  }, [isValid, navigate]);

  useEffect(() => {
    if (!coverage) return;
    const next = getInitialQueryState(coverage.defaultCurrency);
    setYear(next.year ?? 0);
    setCategory(next.category ?? "All");
    setSearch(next.search ?? "");
    setSearchScope(next.searchScope ?? "all");
    setCurrency((next.currency as "GBP" | "EUR") ?? coverage.defaultCurrency);
    setAdvancedFilters(next.advancedFilters ?? INITIAL_ADVANCED_FILTERS);
  }, [coverage?.code]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (!isValid || !coverage || !coverage.dashboardEnabled) {
    return null;
  }

  useSEO({
    title: `${coverage.fullName} Enforcement Dashboard | ${coverage.code} Analytics`,
    description: `Single-regulator analytics for ${coverage.fullName}. Explore ${coverage.count} tracked enforcement actions across ${coverage.years}, with timeline, breach, and top-firm views.`,
    keywords: `${coverage.code} dashboard, ${coverage.fullName}, ${coverage.country} enforcement, regulator analytics, enforcement notices`,
    canonicalPath: `/regulators/${coverage.code.toLowerCase()}/dashboard`,
    ogType: "website",
  });

  const shareState = useMemo(
    () => ({
      year,
      category,
      search,
      searchScope,
      currency,
      advancedFilters,
    }),
    [year, category, search, searchScope, currency, advancedFilters],
  );

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const params = buildShareParams(shareState);
    const base = `${window.location.origin}${window.location.pathname}`;
    const query = params.toString();
    return query ? `${base}?${query}` : base;
  }, [shareState]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = buildShareParams(shareState);
    const base = `${window.location.origin}${window.location.pathname}`;
    const query = params.toString();
    window.history.replaceState({}, "", query ? `${base}?${query}` : base);
  }, [shareState]);

  const availableYears = useMemo(
    () => getAvailableYears(coverage.earliestYear, coverage.latestYear),
    [coverage.earliestYear, coverage.latestYear],
  );

  const { fines, loading, error } = useUnifiedData({
    regulator: coverage.code,
    country: "All",
    year,
    currency,
  });

  const filteredFines = useMemo(() => {
    let scoped = fines;
    if (year === 0 && advancedFilters.years.length) {
      scoped = scoped.filter((fine) =>
        advancedFilters.years.includes(fine.year_issued),
      );
    }
    scoped = scoped.filter(
      (fine) =>
        fine.amount >= advancedFilters.amountRange[0] &&
        fine.amount <= advancedFilters.amountRange[1],
    );
    if (advancedFilters.breachTypes.length) {
      scoped = scoped.filter((fine) =>
        fine.breach_categories?.some((entry: string | null) =>
          advancedFilters.breachTypes.includes(entry || ""),
        ),
      );
    }
    if (advancedFilters.firmCategories.length) {
      scoped = scoped.filter(
        (fine) =>
          fine.firm_category &&
          advancedFilters.firmCategories.includes(fine.firm_category),
      );
    }
    if (advancedFilters.dateRange.start) {
      scoped = scoped.filter(
        (fine) =>
          new Date(fine.date_issued) >=
          new Date(advancedFilters.dateRange.start),
      );
    }
    if (advancedFilters.dateRange.end) {
      scoped = scoped.filter(
        (fine) =>
          new Date(fine.date_issued) <= new Date(advancedFilters.dateRange.end),
      );
    }
    if (category !== "All") {
      scoped = scoped.filter((fine) =>
        fine.breach_categories?.includes(category),
      );
    }
    if (search.trim()) {
      const term = search.toLowerCase();
      scoped = scoped.filter((fine) => {
        if (searchScope === "firm") {
          return fine.firm_individual.toLowerCase().includes(term);
        }
        if (searchScope === "summary") {
          return fine.summary.toLowerCase().includes(term);
        }
        if (searchScope === "category") {
          return (
            (fine.breach_type || "").toLowerCase().includes(term) ||
            fine.breach_categories?.some((entry: string | null) =>
              (entry || "").toLowerCase().includes(term),
            )
          );
        }
        return (
          fine.firm_individual.toLowerCase().includes(term) ||
          fine.summary.toLowerCase().includes(term) ||
          (fine.breach_type || "").toLowerCase().includes(term)
        );
      });
    }
    return scoped;
  }, [fines, year, advancedFilters, category, search, searchScope]);

  const totalAmount = useMemo(
    () => filteredFines.reduce((sum, fine) => sum + safeNum(fine.amount), 0),
    [filteredFines],
  );
  const largestFineRecord = useMemo(
    () =>
      [...filteredFines].sort(
        (a, b) => safeNum(b.amount) - safeNum(a.amount),
      )[0],
    [filteredFines],
  );
  const averageFine = filteredFines.length
    ? totalAmount / filteredFines.length
    : 0;
  const latestRecord = useMemo(
    () =>
      [...filteredFines].sort(
        (a, b) =>
          new Date(b.date_issued).getTime() - new Date(a.date_issued).getTime(),
      )[0],
    [filteredFines],
  );
  const latestDateIssued = latestRecord?.date_issued ?? null;
  const timelineSeries = useMemo(
    () => buildTimelineSeries(filteredFines),
    [filteredFines],
  );
  const categoryAggAll = useMemo(() => buildCategoryAgg(fines), [fines]);
  const categoryAggView = useMemo(
    () => buildCategoryAgg(filteredFines),
    [filteredFines],
  );
  const categoryOptions = useMemo(
    () => ["All", ...categoryAggAll.map((item) => item.name)],
    [categoryAggAll],
  );
  const breachOptions = useMemo(() => {
    const set = new Set<string>();
    fines.forEach((fine) =>
      fine.breach_categories?.forEach(
        (entry: string | null) => entry && set.add(entry),
      ),
    );
    return Array.from(set).sort();
  }, [fines]);
  const firmOptions = useMemo(() => {
    const set = new Set<string>();
    fines.forEach((fine) => fine.firm_category && set.add(fine.firm_category));
    return Array.from(set).sort();
  }, [fines]);
  const searchData = useMemo(
    () =>
      fines.map((fine) => ({
        firm: fine.firm_individual,
        summary: fine.summary,
        category: fine.breach_type || "",
      })),
    [fines],
  );

  const activeChips = useMemo(() => {
    const chips: Array<{ label: string; onRemove?: () => void }> = [];
    if (search.trim()) {
      chips.push({ label: `Search: ${search}`, onRemove: () => setSearch("") });
    }
    if (category !== "All") {
      chips.push({
        label: `Category: ${category}`,
        onRemove: () => setCategory("All"),
      });
    }
    if (currency !== coverageDefaultCurrency) {
      chips.push({
        label: `Currency: ${currency}`,
        onRemove: () => setCurrency(coverageDefaultCurrency),
      });
    }
    if (year === 0 && advancedFilters.years.length) {
      chips.push({
        label: `Years: ${advancedFilters.years.join(", ")}`,
        onRemove: () => setAdvancedFilters((prev) => ({ ...prev, years: [] })),
      });
    }
    if (
      advancedFilters.amountRange[0] !==
        INITIAL_ADVANCED_FILTERS.amountRange[0] ||
      advancedFilters.amountRange[1] !== INITIAL_ADVANCED_FILTERS.amountRange[1]
    ) {
      chips.push({
        label: `Amount: ${Math.round(advancedFilters.amountRange[0] / 1_000_000)}m-${Math.round(
          advancedFilters.amountRange[1] / 1_000_000,
        )}m`,
        onRemove: () =>
          setAdvancedFilters((prev) => ({
            ...prev,
            amountRange: INITIAL_ADVANCED_FILTERS.amountRange,
          })),
      });
    }
    if (advancedFilters.breachTypes.length) {
      chips.push({
        label: `Breaches: ${advancedFilters.breachTypes.join(", ")}`,
        onRemove: () =>
          setAdvancedFilters((prev) => ({ ...prev, breachTypes: [] })),
      });
    }
    if (advancedFilters.firmCategories.length) {
      chips.push({
        label: `Firm types: ${advancedFilters.firmCategories.join(", ")}`,
        onRemove: () =>
          setAdvancedFilters((prev) => ({ ...prev, firmCategories: [] })),
      });
    }
    if (advancedFilters.dateRange.start || advancedFilters.dateRange.end) {
      chips.push({
        label: `Dates: ${advancedFilters.dateRange.start || "Any"} -> ${advancedFilters.dateRange.end || "Now"}`,
        onRemove: () =>
          setAdvancedFilters((prev) => ({
            ...prev,
            dateRange: { start: "", end: "" },
          })),
      });
    }
    return chips;
  }, [
    search,
    category,
    currency,
    coverageDefaultCurrency,
    year,
    advancedFilters,
  ]);

  function openRecordsModal(
    title: string,
    subtitle: string,
    records: FineRecord[],
  ) {
    setModalContext({ title, subtitle, records });
  }

  function handleCategorySelect(categoryName: string) {
    setCategory(categoryName);
  }

  function handleCategoryDrilldown(categoryName: string) {
    setCategory(categoryName);
    const scoped = filteredFines.filter((fine) =>
      fine.breach_categories?.includes(categoryName),
    );
    openRecordsModal(
      `Category focus: ${categoryName}`,
      `${scoped.length} notices`,
      scoped,
    );
  }

  function handleFirmDrilldown(firmName: string) {
    const scoped = filteredFines.filter(
      (fine) => fine.firm_individual === firmName,
    );
    openRecordsModal(
      `Firm focus: ${firmName}`,
      `${scoped.length} notices`,
      scoped,
    );
  }

  function handleModalFirmFilter(firmName: string) {
    setModalContext(null);
    setSearch(firmName);
    setSearchScope("firm");
  }

  function handleAmountRangeSelect(min: number, max: number, label?: string) {
    const scoped = filteredFines.filter(
      (fine) => fine.amount >= min && fine.amount < max,
    );
    openRecordsModal(
      `Penalty band: ${label ?? "Selected range"}`,
      `${scoped.length} notices`,
      scoped,
    );
    setAdvancedFilters((prev) => ({
      ...prev,
      amountRange: [min, Number.isFinite(max) ? max : 500_000_000],
    }));
  }

  function handleSelectMonth(period?: number, targetYearParam?: number) {
    if (!period) return;
    const targetYearValue = targetYearParam || coverageLatestYear;
    const monthRecords = filteredFines.filter(
      (fine) =>
        fine.year_issued === targetYearValue && fine.month_issued === period,
    );
    const monthLabel = format(
      new Date(targetYearValue, period - 1, 1),
      "LLLL yyyy",
    );
    openRecordsModal(
      `Monthly cadence: ${monthLabel}`,
      `${monthRecords.length} notices`,
      monthRecords,
    );
    const start = startOfMonth(new Date(targetYearValue, period - 1, 1));
    const end = endOfMonth(start);
    setAdvancedFilters((prev) => ({
      ...prev,
      dateRange: {
        start: format(start, "yyyy-MM-dd"),
        end: format(end, "yyyy-MM-dd"),
      },
    }));
  }

  function handleTimelineRange(
    start?: { period?: number; year?: number },
    end?: { period?: number; year?: number },
  ) {
    if (!start || !end) return;
    const startDate = startOfMonth(
      new Date(start.year ?? coverageLatestYear, (start.period ?? 1) - 1, 1),
    );
    const endDate = endOfMonth(
      new Date(end.year ?? coverageLatestYear, (end.period ?? 1) - 1, 1),
    );
    const scoped = filteredFines.filter((fine) => {
      const issued = new Date(fine.date_issued);
      return issued >= startDate && issued <= endDate;
    });
    setAdvancedFilters((prev) => ({
      ...prev,
      dateRange: {
        start: format(startDate, "yyyy-MM-dd"),
        end: format(endDate, "yyyy-MM-dd"),
      },
    }));
    openRecordsModal(
      `Range focus: ${format(startDate, "MMM yyyy")} - ${format(endDate, "MMM yyyy")}`,
      `${scoped.length} notices`,
      scoped,
    );
  }

  async function handleQuickExport() {
    try {
      if (!filteredFines.length) return;
      await exportData({
        filename: `${coverageCode.toLowerCase()}-dashboard-${year || "all"}`,
        format: "csv",
        records: filteredFines,
      });
      setToast({ message: "CSV exported", type: "success" });
    } catch (err) {
      console.error("Quick export failed", err);
      setToast({ message: "Export failed", type: "error" });
    }
  }

  const copyShareUrl = async (): Promise<boolean> => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        return true;
      }
    } catch (error) {
      console.error("Clipboard API copy failed", error);
    }

    try {
      const textarea = document.createElement("textarea");
      textarea.value = shareUrl;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      document.body.removeChild(textarea);
      return copied;
    } catch (error) {
      console.error("execCommand copy failed", error);
      return false;
    }
  };

  async function handleShareLink() {
    try {
      if (navigator?.share) {
        try {
          await navigator.share({
            title: `${coverageFullName} Dashboard`,
            url: shareUrl,
          });
          setToast({ message: "Share sheet opened", type: "success" });
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
          console.error("Native share failed, falling back to copy", error);
        }
      }

      const copied = await copyShareUrl();
      if (copied) {
        setToast({ message: "Link copied to clipboard", type: "success" });
        return;
      }

      setShareModalOpen(true);
    } catch (err) {
      console.error("Share failed", err);
      setShareModalOpen(true);
    }
  }

  return (
    <div className="app-shell regulator-dashboard">
      <section id="hero-section" className="regulator-dashboard__hero">
        <Link
          to={`/regulators/${coverage.code.toLowerCase()}`}
          className="regulator-dashboard__back"
        >
          <ArrowLeft size={16} />
          Back to {coverage.code} overview
        </Link>

        <div className="regulator-dashboard__hero-row">
          <div>
            <p className="regulator-dashboard__eyebrow">
              {coverage.flag} {coverage.country} • {coverage.code}
            </p>
            <h1 className="regulator-dashboard__title">
              {coverage.fullName} Dashboard
            </h1>
            <p className="regulator-dashboard__description">
              Dedicated single-regulator analytics for {coverage.fullName}. This
              view stays isolated to {coverage.code}
              so the timeline, breach mix, and top firms reflect this regulator
              only.
            </p>
            <div className="regulator-dashboard__pill-row">
              <span className="regulator-dashboard__pill">
                <Layers3 size={16} />
                {getMaturityLabel(coverage.maturity)}
              </span>
              {coverage.operationalConfidence === "lower" && (
                <span className="regulator-dashboard__pill">
                  <Globe2 size={16} />
                  {getOperationalConfidenceLabel(
                    coverage.operationalConfidence,
                  )}
                </span>
              )}
              <span className="regulator-dashboard__pill">
                <Calendar size={16} />
                {coverage.years}
              </span>
              <span className="regulator-dashboard__pill">
                <Globe2 size={16} />
                {coverage.count} tracked actions
              </span>
            </div>
          </div>

          <div className="regulator-dashboard__actions">
            <Link
              to={`/regulators/${coverage.code.toLowerCase()}`}
              className="btn btn-ghost"
            >
              Regulator overview
            </Link>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleShareLink}
            >
              <Share2 size={16} />
              Share view
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleQuickExport}
            >
              Export CSV
            </button>
          </div>
        </div>

        <div className="regulator-dashboard__stats">
          <article className="regulator-dashboard__stat-card">
            <p className="regulator-dashboard__stat-label">Total amount</p>
            <p className="regulator-dashboard__stat-value">
              {formatCurrency(totalAmount, currency)}
            </p>
            <p className="regulator-dashboard__stat-meta">
              {filteredFines.length} actions in view
            </p>
          </article>
          <article className="regulator-dashboard__stat-card">
            <p className="regulator-dashboard__stat-label">Largest fine</p>
            <p className="regulator-dashboard__stat-value">
              {largestFineRecord
                ? formatCurrency(safeNum(largestFineRecord.amount), currency)
                : "—"}
            </p>
            <p className="regulator-dashboard__stat-meta">
              {largestFineRecord?.firm_individual || "No firm available"}
            </p>
          </article>
          <article className="regulator-dashboard__stat-card">
            <p className="regulator-dashboard__stat-label">Average fine</p>
            <p className="regulator-dashboard__stat-value">
              {filteredFines.length
                ? formatCurrency(averageFine, currency)
                : "—"}
            </p>
            <p className="regulator-dashboard__stat-meta">
              Filtered dashboard average
            </p>
          </article>
          <article className="regulator-dashboard__stat-card">
            <p className="regulator-dashboard__stat-label">Latest notice</p>
            <p className="regulator-dashboard__stat-value">
              {latestRecord
                ? format(new Date(latestRecord.date_issued), "dd MMM yyyy")
                : "—"}
            </p>
            <p className="regulator-dashboard__stat-meta">
              {latestRecord?.firm_individual || "No notice available"}
            </p>
          </article>
        </div>

        {latestDateIssued && (
          <p className="regulator-dashboard__freshness">
            Data current as of{" "}
            <time dateTime={latestDateIssued}>
              {new Date(latestDateIssued).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </time>
          </p>
        )}
      </section>

      <div className="regulator-dashboard__grid">
        <DataCoverageNotice coverage={coverage} />
      </div>

      <FiltersBar
        year={year}
        availableYears={availableYears}
        category={category}
        categories={categoryOptions.slice(1)}
        regulator={coverage.code}
        country={coverage.country}
        currency={currency}
        resultsCount={filteredFines.length}
        search={search}
        searchScope={searchScope}
        searchData={searchData}
        chips={activeChips}
        onYearChange={setYear}
        onCategoryChange={setCategory}
        onRegulatorChange={() => {}}
        onCountryChange={() => {}}
        onCurrencyChange={(value) => setCurrency(value as "GBP" | "EUR")}
        onSearchChange={setSearch}
        onSearchScopeChange={setSearchScope}
        onAdvancedOpen={() => setAdvancedOpen(true)}
        showRegulatorFilter={false}
        showCountryFilter={false}
      />

      {loading && <DashboardSkeleton />}
      {error && <p className="status status--error">{error}</p>}
      {!loading && !error && (
        <>
          <div className="grid grid--two-col">
            <LatestNotices
              records={filteredFines}
              year={year}
              exportId={`${coverage.code.toLowerCase()}-latest-notices`}
              helpText={`Most recent enforcement notices issued by ${coverage.fullName}. Click 'View notice' to open the source document when available.`}
            />
            <TopFirms
              records={filteredFines}
              onSelectFirm={handleFirmDrilldown}
              exportId={`${coverage.code.toLowerCase()}-top-firms`}
            />
          </div>

          <div className="grid grid--two-col">
            <TimelineChart
              data={timelineSeries}
              year={year}
              onSelectMonth={handleSelectMonth}
              onRangeSelect={handleTimelineRange}
              recordsForExport={filteredFines}
              exportId={`${coverage.code.toLowerCase()}-timeline`}
            />
            <FineDistributionChart
              records={filteredFines}
              onSelectRange={handleAmountRangeSelect}
              exportId={`${coverage.code.toLowerCase()}-distribution`}
            />
          </div>

          <LazyVisible fallback={<div style={{ minHeight: 400 }} />}>
            <div className="grid">
              <CategoryTreemap
                data={categoryAggView}
                year={year}
                onSelectCategory={handleCategorySelect}
                onDrilldown={handleCategoryDrilldown}
                exportRecords={filteredFines}
                exportId={`${coverage.code.toLowerCase()}-categories`}
              />
            </div>
          </LazyVisible>

          <LazyVisible fallback={<div style={{ minHeight: 300 }} />}>
            <div className="grid grid--two-col">
              <BreachByTypeChart
                records={filteredFines}
                onSelect={handleCategorySelect}
                exportId={`${coverage.code.toLowerCase()}-breaches`}
              />
              <div className="panel">
                <div className="panel__header">
                  <div>
                    <p className="panel__eyebrow">Coverage context</p>
                    <h3>{coverage.code} dataset status</h3>
                  </div>
                </div>
                <div style={{ display: "grid", gap: "1rem" }}>
                  <p className="status" style={{ margin: 0 }}>
                    This dashboard intentionally stays scoped to{" "}
                    {coverage.fullName}. It does not blend data from other
                    regulators into the charts, rankings, or filters.
                  </p>
                  <div className="filters__metrics" style={{ marginTop: 0 }}>
                    <div className="filters__metric">
                      <strong>{coverage.years}</strong>
                      coverage window
                    </div>
                    <div className="filters__metric">
                      <strong>{coverage.count}</strong>
                      tracked actions
                    </div>
                    <div className="filters__metric">
                      <strong>{getMaturityLabel(coverage.maturity)}</strong>
                      dataset maturity
                    </div>
                    <div className="filters__metric">
                      <strong>{currency}</strong>
                      display currency
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </LazyVisible>
        </>
      )}

      {modalContext && (
        <Suspense fallback={null}>
          <LazyFineTotalsModal
            open
            records={modalContext.records}
            year={year}
            title={modalContext.title}
            subtitle={modalContext.subtitle}
            onClose={() => setModalContext(null)}
            onNotify={(message, type) => setToast({ message, type })}
            onFirmFilter={handleModalFirmFilter}
          />
        </Suspense>
      )}

      {advancedOpen && (
        <Suspense fallback={null}>
          <LazyAdvancedFilters
            open
            availableYears={availableYears}
            breachOptions={breachOptions}
            firmOptions={firmOptions}
            values={advancedFilters}
            currentYear={year === 0 ? coverage.latestYear : year}
            onApply={(values) => setAdvancedFilters(values)}
            onClose={() => setAdvancedOpen(false)}
            onClear={() => setAdvancedFilters(INITIAL_ADVANCED_FILTERS)}
          />
        </Suspense>
      )}

      {shareModalOpen && (
        <Modal
          isOpen={shareModalOpen}
          title="Share This View"
          subtitle="Copy the link below"
          onClose={() => setShareModalOpen(false)}
        >
          <div style={{ display: "grid", gap: "0.75rem" }}>
            <p style={{ margin: 0, color: "var(--text-secondary)" }}>
              Some browsers block the share sheet or clipboard. You can copy the
              link manually.
            </p>
            <div
              style={{
                display: "flex",
                gap: "0.75rem",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <input
                value={shareUrl}
                readOnly
                aria-label="Share link"
                onFocus={(e) => e.currentTarget.select()}
                style={{
                  flex: "1 1 320px",
                  padding: "0.75rem 0.85rem",
                  borderRadius: "12px",
                  border: "1px solid rgba(148, 163, 184, 0.35)",
                  background: "rgba(255, 255, 255, 0.95)",
                }}
              />
              <button
                type="button"
                className="btn btn-primary"
                onClick={async () => {
                  const ok = await copyShareUrl();
                  setToast({
                    message: ok
                      ? "Link copied to clipboard"
                      : "Select and copy the link",
                    type: ok ? "success" : "error",
                  });
                  if (ok) setShareModalOpen(false);
                }}
              >
                Copy link
              </button>
            </div>
          </div>
        </Modal>
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}
