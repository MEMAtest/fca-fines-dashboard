import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clipboard,
  Download,
  ExternalLink,
  Info,
  Search,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { ActionDrawer } from "../components/ActionDrawer.js";
import { ProductWorkspaceShell } from "../components/ProductWorkspaceShell.js";
import { LIVE_REGULATOR_NAV_ITEMS } from "../data/regulatorCoverage.js";
import { useSEO } from "../hooks/useSEO.js";
import { useUnifiedData } from "../hooks/useUnifiedData.js";
import { useWorkspaceOverview } from "../hooks/useWorkspaceOverview.js";
import type { FineRecord } from "../types.js";
import {
  buildBreakdown,
  buildContiguousMonthlyWindow,
  buildMonthlyTrend,
  buildYearlyTrend,
  formatWorkspaceActionCount,
  formatWorkspaceAmount,
  getRecordThemes,
  getWorkspaceMetrics,
  recordsForSelection,
} from "../utils/workspaceAnalytics.js";
import { fetchWorkspaceRecords } from "../utils/fetchWorkspaceRecords.js";
import { formatBreachCategory, splitBreachCategories, isActionTypeCategory } from "../utils/labelConversion.js";
import { EnforcementTrendChart, type TrendPoint } from "../components/EnforcementTrendChart.js";
import { exportData } from "../utils/export.js";
import { getFcaFineCasePath } from "../utils/fcaFineCasePath.js";
import { displayFirmName } from "../utils/firmName.js";
import {
  fetchUnifiedOverview,
  type UnifiedOverviewParams,
} from "../api.js";

export type FinesWorkspaceView = "overview" | "actions" | "analytics" | "compare";

interface FinesWorkspaceProps {
  view: FinesWorkspaceView;
}

interface DrawerState {
  title: string;
  description?: string;
  records: FineRecord[];
  apply?: () => void;
}

interface ComparisonSummary {
  key: string;
  dimension: string;
  label: string;
  selection: {
    year?: number;
    regulator?: string;
    theme?: string;
  };
  records: FineRecord[];
  metrics: {
    count: number;
    total: number;
  };
}

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: Math.max(1, CURRENT_YEAR - 2012) }, (_, index) => CURRENT_YEAR - index);

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function ZoneHeader({ index, title }: { index: string; title: string }) {
  return (
    <div className="workspace-zone-header">
      <span className="workspace-zone-header__index">{index}</span>
      <h2 className="workspace-zone-header__title">{title}</h2>
      <div className="workspace-zone-header__rule" />
    </div>
  );
}

/**
 * The enforcement table, with rows that open in place.
 *
 * The plain five-column table was the weakest part of the most important page:
 * it showed what happened but never why it mattered, and the only way to see
 * more was a side drawer that covered the list you were reading. Expanding
 * inline keeps the row in context, which is what you want when you are working
 * down a list looking for the one that matters.
 *
 * Action and Theme come from splitBreachCategories, not from breach_type —
 * that field holds the raw notice headline and parsing it would be guesswork.
 * Either column shows an em dash when the record carries no value of that kind.
 */
function EnforcementRow({
  record,
  peerCount,
  expanded,
  onToggle,
  onCompare,
}: {
  record: FineRecord;
  peerCount: number;
  expanded: boolean;
  onToggle: () => void;
  onCompare: (theme: string) => void;
}) {
  const { action, theme } = splitBreachCategories(record.breach_categories);
  const casePath = getFcaFineCasePath(record);
  const sourceUrl = record.official_publication_url || record.final_notice_url || record.source_url || null;
  const outcome = record.requires_amount_review
    ? "Under review"
    : record.amount_disclosed === false
      ? "Not disclosed"
      : formatWorkspaceAmount(record.amount);

  return (
    <>
      <tr
        className={`workspace-table__row${expanded ? " workspace-table__row--open" : ""}`}
        onClick={onToggle}
        tabIndex={0}
        aria-expanded={expanded}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onToggle();
          }
        }}
      >
        <td>
          <ChevronRight size={13} className={`workspace-table__chevron${expanded ? " workspace-table__chevron--open" : ""}`} aria-hidden="true" />
          <strong>{displayFirmName(record.firm_individual)}</strong>
        </td>
        <td>{action ? formatBreachCategory(action) : "—"}</td>
        <td><span className="workspace-tag">{record.regulator}</span></td>
        <td>{theme ? formatBreachCategory(theme) : "—"}</td>
        <td><strong>{outcome}</strong></td>
        <td className="workspace-table__date">{formatDate(record.date_issued)}</td>
      </tr>
      {expanded && (
        <tr className="workspace-table__detail-row">
          <td colSpan={6}>
            <div className="workspace-detail">
              <p className="workspace-detail__summary">
                {record.summary?.trim() || "No case summary is recorded for this action. Open the official source below for the regulator's own account."}
              </p>
              <div className="workspace-detail__chips">
                {getRecordThemes(record).slice(0, 4).map((value) => (
                  <span className="workspace-tag" key={value}>{formatBreachCategory(value)}</span>
                ))}
              </div>
              {theme && peerCount > 0 && (
                <p className="workspace-detail__peers">
                  {peerCount.toLocaleString("en-GB")} other {peerCount === 1 ? "action" : "actions"} in this view {peerCount === 1 ? "shares" : "share"} the {formatBreachCategory(theme)} theme.
                </p>
              )}
              <div className="workspace-detail__actions">
                {casePath && <Link to={casePath} onClick={(event) => event.stopPropagation()}>View action</Link>}
                {sourceUrl && (
                  <a href={sourceUrl} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>
                    Official source <ExternalLink size={11} />
                  </a>
                )}
                {theme && (
                  <button type="button" onClick={(event) => { event.stopPropagation(); onCompare(theme); }}>
                    Compare similar cases
                  </button>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function EnforcementTable({
  records,
  limit = 100,
  themeCounts,
  onCompare,
}: {
  records: FineRecord[];
  limit?: number;
  themeCounts: Map<string, number>;
  onCompare: (theme: string) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <table className="workspace-table workspace-table--enforcement">
      <thead>
        <tr><th>Entity</th><th>Action</th><th>Regulator</th><th>Theme</th><th>Outcome</th><th>Date</th></tr>
      </thead>
      <tbody>
        {records.slice(0, limit).map((record) => {
          const rowId = `${record.id ?? record.fine_reference}-${record.date_issued}`;
          const { theme } = splitBreachCategories(record.breach_categories);
          // Peers exclude the record itself, and are only ever counted across
          // what this view has loaded — never presented as a global figure.
          const peerCount = theme ? Math.max(0, (themeCounts.get(theme) ?? 0) - 1) : 0;
          return (
            <EnforcementRow
              key={rowId}
              record={record}
              peerCount={peerCount}
              expanded={openId === rowId}
              onToggle={() => setOpenId(openId === rowId ? null : rowId)}
              onCompare={onCompare}
            />
          );
        })}
      </tbody>
    </table>
  );
}

function RecordTable({ records, onOpen, limit = 8 }: { records: FineRecord[]; onOpen: (record: FineRecord) => void; limit?: number }) {
  return (
    <table className="workspace-table">
      <thead><tr><th>Date</th><th>Firm / individual</th><th>Regulator</th><th>Theme</th><th>Amount</th></tr></thead>
      <tbody>
        {records.slice(0, limit).map((record) => (
          <tr key={`${record.id ?? record.fine_reference}-${record.date_issued}`} onClick={() => onOpen(record)} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") onOpen(record); }}>
            <td>{formatDate(record.date_issued)}</td>
            <td><strong>{displayFirmName(record.firm_individual)}</strong>{getFcaFineCasePath(record) ? <> <Link to={getFcaFineCasePath(record)!} onClick={(event) => event.stopPropagation()} aria-label={`Open ${record.firm_individual} FCA fine case`}>Case page</Link></> : null}</td>
            <td><span className="workspace-tag">{record.regulator}</span></td>
            <td>{formatBreachCategory(getRecordThemes(record)[0] ?? "")}</td>
            <td><strong>{record.requires_amount_review ? "Amount under review" : record.amount_disclosed === false ? "Not disclosed" : formatWorkspaceAmount(record.amount)}</strong></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function FinesWorkspace({ view }: FinesWorkspaceProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [compareMode, setCompareMode] = useState(view === "compare");
  const [moreFilters, setMoreFilters] = useState(false);
  const [selectedYears, setSelectedYears] = useState<number[]>(() =>
    searchParams.get("years")?.split(",").map(Number).filter(Boolean).slice(0, 3) ?? [],
  );
  const [selectedRegulators, setSelectedRegulators] = useState<string[]>(() =>
    searchParams.get("regulators")?.split(",").filter(Boolean).slice(0, 5) ?? [],
  );
  const [selectedThemes, setSelectedThemes] = useState<string[]>(() =>
    searchParams.get("themes")?.split(",").filter(Boolean).slice(0, 5) ?? [],
  );
  const [year, setYear] = useState(Number(searchParams.get("year") ?? 0));
  const [regulator, setRegulator] = useState(searchParams.get("regulator") ?? "All");
  const [country, setCountry] = useState(searchParams.get("country") ?? "All");
  const [theme, setTheme] = useState(searchParams.get("theme") ?? "All");
  const [sector, setSector] = useState(searchParams.get("sector") ?? "All");
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [comparisonRecords, setComparisonRecords] = useState<FineRecord[]>([]);
  const [comparisonTotal, setComparisonTotal] = useState(0);
  const [comparisonTruncated, setComparisonTruncated] = useState(false);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonSummaries, setComparisonSummaries] = useState<ComparisonSummary[]>([]);

  useSEO({
    title: `${view === "overview" ? "Fines Command Centre" : view[0].toUpperCase() + view.slice(1)} | RegActions`,
    description: "Explore regulatory fines, enforcement actions, themes and comparisons across the RegActions public evidence base.",
  });

  const { fines, loading, error } = useUnifiedData({ regulator, country, year, currency: "GBP" });
  const overview = useWorkspaceOverview({
    regulator,
    country,
    year: year || undefined,
    breachCategory: theme,
    sector,
    q: query,
    currency: "GBP",
  });

  const countries = useMemo(() => Array.from(new Set(LIVE_REGULATOR_NAV_ITEMS.map((item) => item.countryCode))).sort(), []);
  const filtered = useMemo(() => fines.filter((record) => {
    if (theme !== "All" && !getRecordThemes(record).includes(theme)) return false;
    if (sector !== "All" && record.firm_category !== sector) return false;
    if (query.trim()) {
      const haystack = [record.firm_individual, record.summary, record.breach_type, record.regulator].filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(query.trim().toLowerCase())) return false;
    }
    return true;
  }), [fines, query, sector, theme]);

  const sampleMetrics = useMemo(() => getWorkspaceMetrics(filtered), [filtered]);
  const yearly = useMemo(() => overview.data?.yearly ?? buildYearlyTrend(filtered), [filtered, overview.data?.yearly]);
  const monthly = useMemo(() => (overview.data?.monthly ?? buildMonthlyTrend(filtered)).slice(-36), [filtered, overview.data?.monthly]);
  const actionMonths = useMemo(
    () => buildContiguousMonthlyWindow(monthly, year || undefined),
    [monthly, year],
  );
  // The newest month in the window, and how it moved against the one before.
  // Note this reads the END of the series: the monthly data opens with a
  // 1900-01 bucket for records whose date failed to parse.
  const latestMonth = useMemo(() => actionMonths[actionMonths.length - 1] ?? null, [actionMonths]);
  const monthOverMonth = useMemo(() => {
    const prior = actionMonths[actionMonths.length - 2];
    if (!latestMonth || !prior) {
      return { penalties: null as number | null, actions: null as number | null, priorLabel: "" };
    }
    const pct = (now: number, before: number) => (before > 0 ? ((now - before) / before) * 100 : null);
    return {
      penalties: pct(latestMonth.amount, prior.amount),
      actions: pct(latestMonth.count, prior.count),
      priorLabel: prior.label,
    };
  }, [actionMonths, latestMonth]);

  // How many loaded records share each theme, for the "N other actions in this
  // view" line on an expanded row. Scoped to what is loaded, never global.
  const activeFilters = useMemo(() => {
    const chips: Array<{ key: string; label: string; clear: () => void }> = [];
    if (year) chips.push({ key: "year", label: String(year), clear: () => setYear(0) });
    if (country !== "All") chips.push({ key: "country", label: country, clear: () => setCountry("All") });
    if (regulator !== "All") chips.push({ key: "regulator", label: regulator, clear: () => setRegulator("All") });
    if (theme !== "All") chips.push({ key: "theme", label: formatBreachCategory(theme), clear: () => setTheme("All") });
    if (sector !== "All") chips.push({ key: "sector", label: sector, clear: () => setSector("All") });
    if (query.trim()) chips.push({ key: "query", label: `"${query.trim()}"`, clear: () => setQuery("") });
    return chips;
  }, [year, country, regulator, theme, sector, query]);

  const themeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const record of filtered) {
      const { theme } = splitBreachCategories(record.breach_categories);
      if (theme) counts.set(theme, (counts.get(theme) ?? 0) + 1);
    }
    return counts;
  }, [filtered]);

  const allThemes = useMemo(
    () => overview.data?.themes ?? buildBreakdown(filtered, getRecordThemes, 40),
    [filtered, overview.data?.themes],
  );
  const themes = useMemo(() => (overview.data?.themes ?? buildBreakdown(filtered, getRecordThemes, 9)).slice(0, 9), [filtered, overview.data?.themes]);
  const regulators = useMemo(() => (overview.data?.regulators ?? buildBreakdown(filtered, (record) => [record.regulator], 9)).slice(0, 9), [filtered, overview.data?.regulators]);
  const sectors = useMemo(() => (overview.data?.sectors ?? buildBreakdown(filtered, (record) => [record.firm_category || "Sector not recorded"], 8)).slice(0, 8), [filtered, overview.data?.sectors]);

  // Rank by the same measure the module claims to show, and size each bar
  // against the largest count rather than against `share`, which is share of
  // penalty VALUE. Using it made the bar disagree with the number printed
  // beside it: OCC's 5,598 actions rendered shorter than SEC's 1,803 because
  // the OCC's monetary total is smaller.
  const byActionVolume = <T extends { label: string; count: number }>(items: T[]) => {
    const ranked = items.slice().sort((left, right) => right.count - left.count).slice(0, 5);
    const max = ranked[0]?.count ?? 0;
    return ranked.map((item) => ({
      ...item,
      width: max > 0 ? Math.max(4, (item.count / max) * 100) : 4,
    }));
  };
  // Two corrections here, both visible on the page before this.
  //
  // `themes` is sliced to 9 for the other views, and it arrives sorted by
  // penalty value, so ranking by count within that slice was really "the
  // busiest of the nine most valuable" — SUPERVISORY_SANCTION sat 12th by value
  // with 14,001 actions and never appeared at all. Rank across everything the
  // API returns instead.
  //
  // And the field mixes action types with subject matter, so "Top themes" led
  // with "Monetary Sanction", which is not a theme. Action types are excluded.
  const topThemes = useMemo(
    () => byActionVolume(allThemes.filter((item) => !isActionTypeCategory(item.label))),
    [allThemes],
  );
  const topRegulators = useMemo(() => byActionVolume(regulators), [regulators]);

  const firms = useMemo(() => (overview.data?.firms ?? buildBreakdown(filtered, (record) => [record.firm_individual], 10)).slice(0, 10), [filtered, overview.data?.firms]);
  const availableThemes = useMemo(() => buildBreakdown(fines, getRecordThemes, 50).map((entry) => entry.label), [fines]);
  const availableSectors = useMemo(() => Array.from(new Set(fines.map((record) => record.firm_category).filter(Boolean) as string[])).sort(), [fines]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (year) next.set("year", String(year));
    if (regulator !== "All") next.set("regulator", regulator);
    if (country !== "All") next.set("country", country);
    if (theme !== "All") next.set("theme", theme);
    if (sector !== "All") next.set("sector", sector);
    if (query) next.set("q", query);
    if (selectedYears.length) next.set("years", selectedYears.join(","));
    if (selectedRegulators.length) next.set("regulators", selectedRegulators.join(","));
    if (selectedThemes.length) next.set("themes", selectedThemes.join(","));
    setSearchParams(next, { replace: true });
  }, [country, query, regulator, sector, selectedRegulators, selectedThemes, selectedYears, setSearchParams, theme, year]);

  const openSelection = async (selection: { year?: number; month?: number; regulator?: string; theme?: string; sector?: string; firm?: string }, title: string) => {
    const records = recordsForSelection(filtered, selection);
    const apply = selection.month ? undefined : () => {
      if (selection.year) setYear(selection.year);
      if (selection.regulator) setRegulator(selection.regulator);
      if (selection.theme) setTheme(selection.theme);
      setDrawer(null);
    };
    setDrawer({
      title,
      records,
      description: "Loading the complete matching evidence set...",
      apply,
    });
    try {
      const result = await fetchWorkspaceRecords({
        regulator: selection.regulator ?? (regulator !== "All" ? regulator : undefined),
        country: country !== "All" ? country : undefined,
        year: selection.year ?? (year || undefined),
        month: selection.month,
        breachCategory: selection.theme ?? (theme !== "All" ? theme : undefined),
        sector: selection.sector ?? (sector !== "All" ? sector : undefined),
        firmName: selection.firm,
        sortBy: "date_issued",
        order: "desc",
      });
      setDrawer((current) => current?.title === title ? {
        ...current,
        records: result.records,
        description: result.truncated
          ? `Showing the first ${result.records.length.toLocaleString("en-GB")} of ${result.total.toLocaleString("en-GB")} matching actions.`
          : `${result.total.toLocaleString("en-GB")} matching ${result.total === 1 ? "action" : "actions"} with source evidence where available.`,
      } : current);
    } catch {
      setDrawer((current) => current?.title === title ? {
        ...current,
        description: "The live record query could not be refreshed. The loaded working set is shown.",
      } : current);
    }
  };

  const toggleLimited = <T,>(items: T[], value: T, maximum: number, setter: (items: T[]) => void) => {
    if (items.includes(value)) setter(items.filter((item) => item !== value));
    else if (items.length < maximum) setter([...items, value]);
  };

  const handleThemeClick = (label: string) => {
    if (compareMode) toggleLimited(selectedThemes, label, 5, setSelectedThemes);
    else openSelection({ theme: label }, label);
  };
  const handleRegulatorClick = (code: string) => {
    if (compareMode) toggleLimited(selectedRegulators, code, 5, setSelectedRegulators);
    else openSelection({ regulator: code }, `${code} actions`);
  };
  const handleYearClick = (value: number) => {
    if (compareMode) toggleLimited(selectedYears, value, 3, setSelectedYears);
    else openSelection({ year: value }, `${value} enforcement actions`);
  };

  const loadedComparisonFallback = useMemo(() => filtered.filter((record) => {
    if (selectedYears.length && !selectedYears.includes(record.year_issued)) return false;
    if (selectedRegulators.length && !selectedRegulators.includes(record.regulator)) return false;
    if (selectedThemes.length && !getRecordThemes(record).some((item) => selectedThemes.includes(item))) return false;
    return true;
  }), [filtered, selectedRegulators, selectedThemes, selectedYears]);
  const annualMovement = useMemo(() => {
    const populated = yearly.filter((point) => point.count > 0).slice().sort((left, right) => left.year - right.year);
    const latest = populated[populated.length - 1];
    const previous = latest
      ? populated.find((point) => point.year === latest.year - 1) ?? populated[populated.length - 2]
      : undefined;
    const change = latest && previous && previous.amount > 0
      ? ((latest.amount - previous.amount) / previous.amount) * 100
      : null;
    return { latest, previous, change };
  }, [yearly]);
  useEffect(() => {
    let active = true;
    const hasSelection =
      selectedYears.length > 0 ||
      selectedRegulators.length > 0 ||
      selectedThemes.length > 0;

    if (!hasSelection) {
      setComparisonRecords([]);
      setComparisonTotal(0);
      setComparisonTruncated(false);
      setComparisonSummaries([]);
      setComparisonLoading(false);
      return () => {
        active = false;
      };
    }

    const years = selectedYears.length
      ? selectedYears
      : year
        ? [year]
        : undefined;
    const regulatorsForComparison = selectedRegulators.length
      ? selectedRegulators
      : regulator !== "All"
        ? [regulator]
        : undefined;
    const themesForComparison = selectedThemes.length
      ? selectedThemes
      : theme !== "All"
        ? [theme]
        : undefined;
    const shared: Omit<UnifiedOverviewParams, "year" | "regulator" | "breachCategory"> = {
      country: country !== "All" ? country : undefined,
      sector: sector !== "All" ? sector : undefined,
      q: query || undefined,
      currency: "GBP",
    };
    const descriptors: Array<Omit<ComparisonSummary, "metrics" | "records">> = [
      ...selectedYears.map((selectedYear) => ({
        key: `year-${selectedYear}`,
        dimension: "Year",
        label: String(selectedYear),
        selection: { year: selectedYear },
      })),
      ...selectedRegulators.map((selectedRegulator) => ({
        key: `regulator-${selectedRegulator}`,
        dimension: "Regulator",
        label: selectedRegulator,
        selection: { regulator: selectedRegulator },
      })),
      ...selectedThemes.map((selectedTheme) => ({
        key: `theme-${selectedTheme}`,
        dimension: "Theme",
        label: selectedTheme,
        selection: { theme: selectedTheme },
      })),
    ];

    setComparisonLoading(true);
    Promise.all([
      fetchWorkspaceRecords({
        regulator: regulatorsForComparison,
        country: shared.country,
        year: years,
        breachCategory: themesForComparison,
        sector: shared.sector,
        q: shared.q,
        sortBy: "date_issued",
        order: "desc",
      }),
      Promise.all(
        descriptors.map((descriptor) =>
          fetchUnifiedOverview({
            ...shared,
            year: descriptor.selection.year ?? years,
            regulator: descriptor.selection.regulator
              ? [descriptor.selection.regulator]
              : regulatorsForComparison,
            breachCategory: descriptor.selection.theme
              ? [descriptor.selection.theme]
              : themesForComparison,
          }),
        ),
      ),
    ])
      .then(([recordResult, summaryResults]) => {
        if (!active) return;
        setComparisonRecords(recordResult.records);
        setComparisonTotal(recordResult.total);
        setComparisonTruncated(recordResult.truncated);
        setComparisonSummaries(
          descriptors.map((descriptor, index) => ({
            ...descriptor,
            metrics: {
              count: summaryResults[index]?.metrics.count ?? 0,
              total: summaryResults[index]?.metrics.total ?? 0,
            },
            records: recordResult.records.filter((record) => {
              if (
                descriptor.selection.year &&
                record.year_issued !== descriptor.selection.year
              ) return false;
              if (
                descriptor.selection.regulator &&
                record.regulator !== descriptor.selection.regulator
              ) return false;
              if (
                descriptor.selection.theme &&
                !getRecordThemes(record).includes(descriptor.selection.theme)
              ) return false;
              return true;
            }),
          })),
        );
      })
      .catch(() => {
        if (!active) return;
        setComparisonRecords(loadedComparisonFallback);
        setComparisonTotal(loadedComparisonFallback.length);
        setComparisonTruncated(false);
        setComparisonSummaries([]);
      })
      .finally(() => {
        if (active) setComparisonLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    country,
    loadedComparisonFallback,
    query,
    regulator,
    sector,
    selectedRegulators,
    selectedThemes,
    selectedYears,
    theme,
    year,
  ]);
  const decisionAnalytics = useMemo(() => {
    const monetary = filtered.filter((record) => !record.requires_amount_review && record.amount > 0).slice().sort((left, right) => left.amount - right.amount);
    const monetaryTotal = monetary.reduce((sum, record) => sum + record.amount, 0);
    const topTenTotal = monetary.slice(-10).reduce((sum, record) => sum + record.amount, 0);
    const p75 = monetary.length ? monetary[Math.floor((monetary.length - 1) * .75)]?.amount ?? 0 : 0;
    const buckets = [
      { label: "Non-monetary / undisclosed", min: -1, max: 0 },
      { label: "Under £100k", min: 0, max: 100_000 },
      { label: "£100k to £1m", min: 100_000, max: 1_000_000 },
      { label: "£1m to £10m", min: 1_000_000, max: 10_000_000 },
      { label: "£10m to £100m", min: 10_000_000, max: 100_000_000 },
      { label: "£100m+", min: 100_000_000, max: Number.POSITIVE_INFINITY },
    ].map((bucket) => ({ ...bucket, records: filtered.filter((record) => bucket.min < 0 ? record.amount <= 0 : record.amount > bucket.min && record.amount <= bucket.max) }));
    return {
      concentration: monetaryTotal > 0 ? (topTenTotal / monetaryTotal) * 100 : 0,
      p75,
      outliers: monetary.filter((record) => p75 > 0 && record.amount > p75 * 3).sort((left, right) => right.amount - left.amount),
      buckets,
    };
  }, [filtered]);

  // "So what" callouts for the overview zone: derived from the loaded monthly
  // trend and theme breakdown, not invented figures.
  const monthlySoWhat = useMemo(() => {
    if (monthly.length < 2) return null;
    const windowTotal = monthly.reduce((sum, point) => sum + point.amount, 0);
    if (windowTotal <= 0) return null;
    const peak = monthly.slice().sort((left, right) => right.amount - left.amount)[0];
    const share = (peak.amount / windowTotal) * 100;
    if (share < 15) return null;
    return `${peak.label} carries ${share.toFixed(0)}% of the ${monthly.length}-month total in this view. Read the trend on volume as well as value.`;
  }, [monthly]);
  const themeSoWhat = useMemo(() => {
    if (themes.length < 2) return null;
    const byValue = themes[0];
    const byVolume = themes.slice().sort((left, right) => right.count - left.count)[0];
    if (!byValue || !byVolume) return null;
    if (byValue.label === byVolume.label) {
      return `${formatBreachCategory(byValue.label)} leads both fine value and action count in this view — the most concentrated theme by either measure.`;
    }
    return `${formatBreachCategory(byValue.label)} leads by fine value; ${formatBreachCategory(byVolume.label)} leads by number of actions. Benchmarking on value alone under-weights ${formatBreachCategory(byVolume.label)}.`;
  }, [themes]);

  const exact = overview.data?.metrics;
  const metricCount = exact?.count ?? sampleMetrics.count;
  const metricTotal = exact?.total ?? sampleMetrics.total;
  const metricMedian = exact?.median ?? sampleMetrics.median;
  const metricLargest = exact?.largest ?? sampleMetrics.largest?.amount ?? 0;
  const metricLargestFirm = exact?.largestFirm || sampleMetrics.largest?.firm_individual || "No matching action";
  const metricAffectedFirms = exact?.affectedFirms ?? sampleMetrics.affectedFirms;

  // Rendered by the loading and error branches too. The whole page used to be
  // replaced by "Loading the enforcement workspace..." until 5,000 records had
  // arrived, so the <h1> and the page's identity did not exist for the first
  // few seconds. The heading depends on the route, not on the data, so there is
  // no reason to withhold it.
  //
  // The two actions that consume records ARE withheld while loading: exporting
  // an empty CSV or entering compare mode with nothing to compare would both be
  // worse than a disabled button.
  const pageHeading = (
    <header className={`workspace-page__heading${view === "actions" ? " workspace-page__heading--band" : ""}`}>
      <div>
        <h1>{view === "overview" ? "Fines Command Centre" : view === "actions" ? "Enforcement actions" : view === "analytics" ? "Fines analytics" : "Guided comparison"}</h1>
        <p>{view === "compare" ? "Select up to three years and five regulators or themes. Normal views open the underlying evidence on click." : "Global enforcement intelligence, financial penalties and source-linked actions in one working view."}</p>
      </div>
      <div className="workspace-page__heading-actions">
        <Link className="workspace-button workspace-button--primary" to={`/board-pack?from=${encodeURIComponent(`/fines${searchParams.toString() ? `?${searchParams.toString()}` : ""}`)}&fromLabel=Fines%20workspace`}><Sparkles size={15} /> Create board pack</Link>
        <button type="button" className={`workspace-button${compareMode ? " workspace-button--active" : ""}`} disabled={loading} onClick={() => setCompareMode((value) => !value)}><SlidersHorizontal size={15} /> {compareMode ? "Exit compare mode" : "Compare selections"}</button>
        <button type="button" className="workspace-button" disabled={loading} onClick={() => exportData({ filename: "regactions-fines-evidence", format: "csv", records: filtered })}><Download size={15} /> Export evidence</button>
      </div>
    </header>
  );

  if (loading)
    return (
      <ProductWorkspaceShell scope="fines" title="Fines">
        <div className="workspace-page">
          {pageHeading}
          <div className="workspace-loading">Loading the enforcement workspace...</div>
        </div>
      </ProductWorkspaceShell>
    );
  if (error)
    return (
      <ProductWorkspaceShell scope="fines" title="Fines">
        <div className="workspace-page">
          {pageHeading}
          <div className="workspace-error">{error}</div>
        </div>
      </ProductWorkspaceShell>
    );

  const recent = filtered.slice().sort((left, right) => right.date_issued.localeCompare(left.date_issued));
  const top = filtered.slice().sort((left, right) => right.amount - left.amount);

  return (
    <ProductWorkspaceShell scope="fines" title="Fines">
      <div className="workspace-page">
        {/* Breadcrumbs come from SiteHeader (which also emits the BreadcrumbList
            JSON-LD). This page used to render a second, near-identical trail. */}
        {pageHeading}


        {/* Search first, then the four filters people actually reach for.
            Sector sits behind the disclosure: one long row of six gave a rarely
            used control the same prominence as Regulator. */}
        <section className="workspace-filterbar" aria-label="Fines filters">
          <label className="workspace-filterbar__search">
            <span className="sr-only">Search enforcement actions</span>
            <Search size={14} aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search firm, person or keyword..." />
          </label>
          <label>Jurisdiction<select value={country} onChange={(event) => setCountry(event.target.value)}><option>All</option>{countries.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
          <label>Regulator<select value={regulator} onChange={(event) => setRegulator(event.target.value)}><option>All</option>{LIVE_REGULATOR_NAV_ITEMS.filter((item) => item.dashboardEnabled).map((item) => <option value={item.code} key={item.code}>{item.code}</option>)}</select></label>
          <label>Year<select value={year} onChange={(event) => setYear(Number(event.target.value))}><option value={0}>All years</option>{YEARS.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
          <label>Theme<select value={theme} onChange={(event) => setTheme(event.target.value)}><option>All</option>{availableThemes.map((value) => <option value={value} key={value}>{formatBreachCategory(value)}</option>)}</select></label>
          <button
            type="button"
            className={`workspace-filterbar__more${moreFilters ? " is-open" : ""}`}
            aria-expanded={moreFilters}
            onClick={() => setMoreFilters((open: boolean) => !open)}
          >
            {moreFilters ? "Fewer filters" : "More filters"}
          </button>
          {moreFilters && (
            <label className="workspace-filterbar__extra">Sector<select value={sector} onChange={(event) => setSector(event.target.value)}><option>All</option>{availableSectors.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
          )}
        </section>

        {activeFilters.length > 0 && (
          <div className="workspace-chips" aria-label="Active filters">
            {activeFilters.map((chip) => (
              <button type="button" key={chip.key} onClick={chip.clear}>
                {chip.label} <span aria-hidden="true">×</span>
                <span className="sr-only">Remove filter</span>
              </button>
            ))}
            <button type="button" className="workspace-chips__clear" onClick={() => { setYear(0); setCountry("All"); setRegulator("All"); setTheme("All"); setSector("All"); setQuery(""); }}>
              Clear all
            </button>
          </div>
        )}

        {view === "actions" ? (
          <>
            {/* Anchor metric first, then four supporting ones. Six equal boxes
                gave a £55bn total the same weight as a median, so nothing led. */}
            <section className="workspace-metric-strip" aria-label="Key figures">
              <div className="workspace-metric-strip__anchor">
                <span>Total penalties</span>
                <strong>{formatWorkspaceAmount(metricTotal)}</strong>
                {annualMovement.change !== null && (
                  <small className={annualMovement.change < 0 ? "is-down" : "is-up"}>
                    {annualMovement.change >= 0 ? "▲" : "▼"} {Math.abs(annualMovement.change).toFixed(0)}% vs {annualMovement.previous?.year}
                  </small>
                )}
              </div>
              <div className="workspace-metric-strip__rest">
                <div><strong>{metricCount.toLocaleString("en-GB")}</strong><span>Actions</span></div>
                <div><strong>{formatWorkspaceAmount(metricMedian)}</strong><span>Median fine</span></div>
                <div><strong>{metricAffectedFirms.toLocaleString("en-GB")}</strong><span>Firms affected</span></div>
                <div><strong>{formatWorkspaceAmount(metricLargest)}</strong><span>Largest fine</span></div>
              </div>
            </section>
            {/* One sentence that reads the numbers, rather than leaving the user
                to. Rendered only when there is a real year-on-year comparison. */}
            {annualMovement.change !== null && annualMovement.previous && (
              <p className="workspace-insight">
                <Info size={14} aria-hidden="true" />
                {metricCount.toLocaleString("en-GB")} actions are recorded, while aggregate penalties are{" "}
                {Math.abs(annualMovement.change).toFixed(0)}%{" "}
                {annualMovement.change < 0 ? "below" : "above"} the {annualMovement.previous.year} comparison period.
              </p>
            )}
          </>
        ) : view !== "overview" ? (
          <section className="workspace-kpis" aria-label="Current view key figures">
            <article className="workspace-kpi"><span>Total fines</span><strong>{formatWorkspaceAmount(metricTotal)}</strong><small>{overview.error ? "Loaded working set" : "Exact current public view"}</small></article>
            <article className="workspace-kpi"><span>Number of actions</span><strong>{metricCount.toLocaleString("en-GB")}</strong><small>Click any chart mark to inspect</small></article>
            <article className="workspace-kpi"><span>Median fine</span><strong>{formatWorkspaceAmount(metricMedian)}</strong><small>Less distorted by outliers</small></article>
            <article className="workspace-kpi"><span>Largest fine</span><strong>{formatWorkspaceAmount(metricLargest)}</strong><small>{metricLargestFirm}</small></article>
            <article className="workspace-kpi"><span>Firms affected</span><strong>{metricAffectedFirms.toLocaleString("en-GB")}</strong><small>Distinct firms and individuals</small></article>
            <article className="workspace-kpi"><span>Year-over-year change</span><strong><em>{annualMovement.change === null ? "Not available" : `${annualMovement.change >= 0 ? "+" : ""}${annualMovement.change.toFixed(1)}%`}</em></strong><small>{annualMovement.latest && annualMovement.previous ? `${annualMovement.latest.year} vs ${annualMovement.previous.year}` : "Insufficient annual history"}</small></article>
          </section>
        ) : null}

        {compareMode && (
          <div className="workspace-selection-tray">
            <div className="workspace-selection-tray__chips">
              {selectedYears.map((item) => <button type="button" key={item} onClick={() => toggleLimited(selectedYears, item, 3, setSelectedYears)} aria-label={`Remove year ${item}`}>{item} ×</button>)}
              {selectedRegulators.map((item) => <button type="button" key={item} onClick={() => toggleLimited(selectedRegulators, item, 5, setSelectedRegulators)} aria-label={`Remove regulator ${item}`}>{item} ×</button>)}
              {selectedThemes.map((item) => <button type="button" key={item} onClick={() => toggleLimited(selectedThemes, item, 5, setSelectedThemes)} aria-label={`Remove theme ${item}`}>{item} ×</button>)}
              {!selectedYears.length && !selectedRegulators.length && !selectedThemes.length && <span>Select years, regulators or themes below</span>}
            </div>
            <div className="workspace-selection-tray__actions">
              {(selectedYears.length > 0 || selectedRegulators.length > 0 || selectedThemes.length > 0) && <button type="button" className="workspace-button" onClick={() => { setSelectedYears([]); setSelectedRegulators([]); setSelectedThemes([]); }}>Clear</button>}
              <button type="button" className="workspace-button" disabled={comparisonLoading || !comparisonTotal} onClick={() => setDrawer({ title: "Selected comparison data", records: comparisonRecords, description: comparisonTruncated ? `Showing the first ${comparisonRecords.length.toLocaleString("en-GB")} of ${comparisonTotal.toLocaleString("en-GB")} selected actions.` : `${formatWorkspaceActionCount(comparisonTotal)} in the selected comparison, with source evidence where available.` })}>{comparisonLoading ? "Loading comparison..." : "Open selected data"}</button>
              <button type="button" className="workspace-button workspace-button--primary" onClick={() => navigator.clipboard.writeText(window.location.href)}><Clipboard size={14} /> Copy comparison link</button>
            </div>
          </div>
        )}

        {view === "actions" ? (
          <div className="workspace-actions-layout">
            <section className="workspace-card workspace-card--full">
              <div className="workspace-card__heading">
                <h2>Enforcement activity</h2>
                <span>{year ? `${year} by month` : "Last 12 months in this view"}</span>
              </div>
              <div className="workspace-trend-layout">
                <EnforcementTrendChart
                  data={actionMonths}
                  onSelectMonth={(point: TrendPoint) => openSelection({ year: point.year, month: point.month ?? 0 }, `${point.label} actions`)}
                />
                {latestMonth && (
                  <aside className="workspace-whatchanged" aria-label="Latest month">
                    <div className="workspace-whatchanged__head">
                      <h3>What changed?</h3>
                      <span>{latestMonth.label}</span>
                    </div>
                    <p><strong>{formatWorkspaceActionCount(latestMonth.count)}</strong></p>
                    <p><strong>{formatWorkspaceAmount(latestMonth.amount)}</strong> in penalties</p>
                    {monthOverMonth.penalties !== null && (
                      <p className={`workspace-whatchanged__delta${monthOverMonth.penalties < 0 ? " workspace-whatchanged__delta--down" : ""}`}>
                        {monthOverMonth.penalties >= 0 ? "▲" : "▼"} {Math.abs(monthOverMonth.penalties).toFixed(0)}% penalties vs {monthOverMonth.priorLabel}
                      </p>
                    )}
                    {monthOverMonth.actions !== null && (
                      <p className={`workspace-whatchanged__delta${monthOverMonth.actions < 0 ? " workspace-whatchanged__delta--down" : ""}`}>
                        {monthOverMonth.actions >= 0 ? "▲" : "▼"} {Math.abs(monthOverMonth.actions).toFixed(0)}% actions vs {monthOverMonth.priorLabel}
                      </p>
                    )}
                    <small>The most recent month is often incomplete; regulators publish on a lag.</small>
                  </aside>
                )}
              </div>
            </section>

            <div className="workspace-modules">
              <section className="workspace-card">
                <div className="workspace-card__heading"><h2>Top themes</h2><span>By action volume</span></div>
                <div className="workspace-bars">
                  {topThemes.map((item) => (
                    <button className="workspace-bar" type="button" key={item.label} onClick={() => handleThemeClick(item.label)}>
                      <span>{formatBreachCategory(item.label)}</span>
                      <div className="workspace-bar__track"><div className="workspace-bar__fill" style={{ width: `${item.width}%` }} /></div>
                      <strong>{item.count.toLocaleString("en-GB")}</strong>
                    </button>
                  ))}
                </div>
              </section>
              <section className="workspace-card">
                <div className="workspace-card__heading"><h2>Most active regulators</h2><span>By action volume</span></div>
                <div className="workspace-bars">
                  {topRegulators.map((item) => (
                    <button className="workspace-bar" type="button" key={item.label} onClick={() => handleRegulatorClick(item.label)}>
                      <span>{item.label}</span>
                      <div className="workspace-bar__track"><div className="workspace-bar__fill" style={{ width: `${item.width}%` }} /></div>
                      <strong>{item.count.toLocaleString("en-GB")}</strong>
                    </button>
                  ))}
                </div>
              </section>
              <section className="workspace-card">
                <div className="workspace-card__heading"><h2>Largest actions</h2><span>By disclosed value</span></div>
                <ol className="workspace-largest">
                  {top.slice(0, 3).map((record, index) => (
                    <li key={`${record.id ?? record.fine_reference}-${index}`}>
                      <span className="workspace-largest__rank">{index + 1}</span>
                      <span className="workspace-largest__name">{displayFirmName(record.firm_individual)}</span>
                      <strong>{formatWorkspaceAmount(record.amount)}</strong>
                    </li>
                  ))}
                </ol>
              </section>
            </div>

            <section className="workspace-card workspace-card--full">
              <div className="workspace-card__heading"><h2>{metricCount.toLocaleString("en-GB")} enforcement actions</h2><span>First {Math.min(100, filtered.length).toLocaleString("en-GB")} shown</span></div>
              <EnforcementTable records={recent} limit={100} themeCounts={themeCounts} onCompare={handleThemeClick} />
            </section>
          </div>
        ) : view === "compare" ? (
          <div className="workspace-grid">
            <section className="workspace-card workspace-card--half"><div className="workspace-card__heading"><h2>Select years</h2><span>Maximum 3</span></div><div className="workspace-treemap">{yearly.slice(-12).map((point) => <button type="button" aria-pressed={selectedYears.includes(point.year)} className={`workspace-tile${selectedYears.includes(point.year) ? " workspace-tile--selected" : ""}`} key={point.year} onClick={() => handleYearClick(point.year)}><span>{point.year}</span><strong>{formatWorkspaceAmount(point.amount)}</strong><small>{formatWorkspaceActionCount(point.count)}</small></button>)}</div></section>
            <section className="workspace-card workspace-card--half"><div className="workspace-card__heading"><h2>Select regulators</h2><span>Maximum 5</span></div><div className="workspace-treemap">{regulators.map((item) => <button type="button" aria-pressed={selectedRegulators.includes(item.label)} className={`workspace-tile${selectedRegulators.includes(item.label) ? " workspace-tile--selected" : ""}`} key={item.label} onClick={() => handleRegulatorClick(item.label)}><span>{item.label}</span><strong>{formatWorkspaceAmount(item.amount)}</strong><small>{formatWorkspaceActionCount(item.count)}</small></button>)}</div></section>
            <section className="workspace-card workspace-card--half"><div className="workspace-card__heading"><h2>Select themes</h2><span>Maximum 5</span></div><div className="workspace-treemap">{themes.map((item) => <button type="button" aria-pressed={selectedThemes.includes(item.label)} className={`workspace-tile${selectedThemes.includes(item.label) ? " workspace-tile--selected" : ""}`} key={item.label} onClick={() => handleThemeClick(item.label)}><span>{formatBreachCategory(item.label)}</span><strong>{formatWorkspaceAmount(item.amount)}</strong><small>{formatWorkspaceActionCount(item.count)}</small></button>)}</div></section>
            <section className="workspace-card workspace-card--half"><div className="workspace-card__heading"><h2>Comparison summary</h2><span>{comparisonLoading ? "Calculating exact totals..." : comparisonSummaries.length ? `${comparisonSummaries.length} selected views` : "Choose at least one view"}</span></div>{comparisonSummaries.length ? <div className="workspace-comparison-cards">{comparisonSummaries.map((item) => <button type="button" aria-label={`${item.dimension} ${item.label}: ${formatWorkspaceAmount(item.metrics.total)}, ${formatWorkspaceActionCount(item.metrics.count)}`} key={item.key} onClick={() => setDrawer({ title: `${item.dimension}: ${item.label}`, records: item.records, description: item.records.length < item.metrics.count ? `Showing ${item.records.length.toLocaleString("en-GB")} loaded records from ${formatWorkspaceActionCount(item.metrics.count)} in this comparison view.` : `${formatWorkspaceActionCount(item.metrics.count)} in this comparison view.` })}><small>{item.dimension}</small><strong>{item.label}</strong><span>{formatWorkspaceAmount(item.metrics.total)}</span><em>{formatWorkspaceActionCount(item.metrics.count)}</em></button>)}</div> : <p className="workspace-empty-guidance">Select two or more years to compare annual fine value, or combine years with regulators and themes.</p>}</section>
            <section className="workspace-card workspace-card--full"><div className="workspace-card__heading"><h2>Comparison result</h2><button type="button" className="workspace-card__action" disabled={comparisonLoading || !comparisonTotal} onClick={() => setDrawer({ title: "Selected comparison data", records: comparisonRecords, description: comparisonTruncated ? `Showing the first ${comparisonRecords.length.toLocaleString("en-GB")} of ${comparisonTotal.toLocaleString("en-GB")} selected actions.` : `${formatWorkspaceActionCount(comparisonTotal)} in the selected comparison.` })}>Open all selected data <ArrowRight size={11}/></button></div><RecordTable records={comparisonRecords.slice().sort((a,b) => b.amount-a.amount)} limit={12} onOpen={(record) => setDrawer({ title: record.firm_individual, records: [record], description: record.summary })} /></section>
          </div>
        ) : view === "overview" ? (
          <>
            <ZoneHeader index="01" title="Where the value sits" />
            <div className="workspace-hero-band">
              <div>
                <div className="workspace-hero-band__eyebrow">Total fines · current view</div>
                <div className="workspace-hero-band__total">{formatWorkspaceAmount(metricTotal)}</div>
                <div className="workspace-hero-band__meta">
                  <span>{formatWorkspaceActionCount(metricCount)}</span>
                  <span>
                    <em>{annualMovement.change === null ? "Not available" : `${annualMovement.change >= 0 ? "+" : ""}${annualMovement.change.toFixed(1)}%`}</em>{" "}
                    {annualMovement.latest && annualMovement.previous ? `${annualMovement.latest.year} vs ${annualMovement.previous.year}` : "Insufficient annual history"}
                  </span>
                </div>
              </div>
              <div className="workspace-hero-band__kpis">
                <div><span>Median fine</span><strong>{formatWorkspaceAmount(metricMedian)}</strong><small>Less distorted by outliers</small></div>
                <div><span>Largest fine</span><strong>{formatWorkspaceAmount(metricLargest)}</strong><small>{metricLargestFirm}</small></div>
                <div><span>Firms affected</span><strong>{metricAffectedFirms.toLocaleString("en-GB")}</strong><small>Distinct firms and individuals</small></div>
                <div><span>Regulators in view</span><strong>{regulators.length}</strong><small>By disclosed value</small></div>
              </div>
            </div>

            <ZoneHeader index="02" title="What changed" />
            <div className="workspace-grid">
              <section className="workspace-card workspace-card--half">
                <div className="workspace-card__heading"><h2>Monthly fines trend</h2><span>Click a mark to open its actions</span></div>
                <p className="workspace-chart__hint">Every mark is a drill-down. Filtering is a separate action inside the evidence drawer.</p>
                <div className="workspace-chart">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 640, height: 250 }}>
                    <BarChart data={monthly} margin={{ top: 10, right: 6, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="label" interval="preserveStartEnd" /><YAxis tickFormatter={(value) => formatWorkspaceAmount(Number(value))} width={62}/><Tooltip formatter={(value) => formatWorkspaceAmount(Number(value))}/>
                      <Bar isAnimationActive={false} className="workspace-chart__click-target" dataKey="amount" fill="#0FA77D" radius={[3,3,0,0]} onClick={(payload: any) => openSelection({ year: Number(payload?.year), month: Number(payload?.month) }, `${payload?.label ?? "Selected period"} actions`)} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {monthlySoWhat && <div className="workspace-so-what"><span>So what</span><p>{monthlySoWhat}</p></div>}
              </section>

              <section className="workspace-card workspace-card--half">
                <div className="workspace-card__heading"><h2>Top themes by fine value</h2><button type="button" className="workspace-card__action" onClick={() => setDrawer({ title: "All themes", records: filtered })}>View data <ArrowRight size={11}/></button></div>
                <div className="workspace-bars">{themes.slice(0, 7).map((item) => <button className="workspace-bar" type="button" key={item.label} onClick={() => handleThemeClick(item.label)}><span>{formatBreachCategory(item.label)}</span><div className="workspace-bar__track"><div className="workspace-bar__fill" style={{ width: `${Math.max(4, item.share)}%` }}/></div><strong>{formatWorkspaceAmount(item.amount)}</strong></button>)}</div>
                {themeSoWhat && <div className="workspace-so-what"><span>So what</span><p>{themeSoWhat}</p></div>}
              </section>
            </div>

            <ZoneHeader index="03" title="What to do next" />
            <div className="workspace-grid">
              <section className="workspace-card workspace-card--wide"><div className="workspace-card__heading"><h2>Recent enforcement actions</h2><Link className="workspace-card__action" to="/fines/actions">View all <ArrowRight size={11}/></Link></div><RecordTable records={recent} onOpen={(record) => setDrawer({ title: record.firm_individual, records: [record], description: record.summary })} /></section>
              <section className="workspace-card"><div className="workspace-card__heading"><h2>What matters now</h2><Sparkles size={15}/></div><ul className="workspace-insights"><li><CheckCircle2 size={14}/><span>{themes[0] ? `${themes[0].label} represents the largest disclosed fine value in this view.` : "No dominant theme in the current view."}</span></li><li><CheckCircle2 size={14}/><span>{regulators[0] ? `${regulators[0].label} is the most active regulator by disclosed value.` : "No regulator activity matches the current filters."}</span></li><li><CheckCircle2 size={14}/><span>{metricLargest ? `${metricLargestFirm} is the largest penalty in scope at ${formatWorkspaceAmount(metricLargest)}.` : "No penalty is in scope."}</span></li><li><Info size={14}/><span>Open records to test each conclusion against the linked official evidence.</span></li></ul></section>
            </div>
          </>
        ) : (
          <div className="workspace-grid">
            <section className={`workspace-card ${view === "analytics" ? "workspace-card--wide" : "workspace-card--half"}`}>
              <div className="workspace-card__heading"><h2>{view === "analytics" ? "Fines over time" : "Monthly fines trend"}</h2><span>Click a mark to open its actions</span></div>
              <p className="workspace-chart__hint">Every mark is a drill-down. Filtering is a separate action inside the evidence drawer.</p>
              <div className="workspace-chart">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 640, height: 250 }}>
                  {view === "analytics" ? (
                    <AreaChart data={yearly} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <defs><linearGradient id="workspaceArea" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0FA77D" stopOpacity={0.25}/><stop offset="95%" stopColor="#0FA77D" stopOpacity={0}/></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="label" /><YAxis tickFormatter={(value) => formatWorkspaceAmount(Number(value))} width={62}/><Tooltip formatter={(value) => formatWorkspaceAmount(Number(value))}/>
                      <Area isAnimationActive={false} className="workspace-chart__click-target" type="monotone" dataKey="amount" stroke="#0B8463" strokeWidth={2.2} fill="url(#workspaceArea)" activeDot={{ r: 6, onClick: (_event: unknown, payload: any) => handleYearClick(Number(payload?.payload?.year)) }} />
                    </AreaChart>
                  ) : (
                    <BarChart data={monthly} margin={{ top: 10, right: 6, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="label" interval="preserveStartEnd" /><YAxis tickFormatter={(value) => formatWorkspaceAmount(Number(value))} width={62}/><Tooltip formatter={(value) => formatWorkspaceAmount(Number(value))}/>
                      <Bar isAnimationActive={false} className="workspace-chart__click-target" dataKey="amount" fill="#276de5" radius={[3,3,0,0]} onClick={(payload: any) => openSelection({ year: Number(payload?.year), month: Number(payload?.month) }, `${payload?.label ?? "Selected period"} actions`)} />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            </section>

            <section className={`workspace-card ${view === "analytics" ? "" : "workspace-card--half"}`}>
              <div className="workspace-card__heading"><h2>Top themes by fine value</h2><button type="button" className="workspace-card__action" onClick={() => setDrawer({ title: "All themes", records: filtered })}>View data <ArrowRight size={11}/></button></div>
              {view === "analytics" ? <div className="workspace-treemap">{themes.slice(0, 6).map((item) => <button key={item.label} type="button" className={`workspace-tile${selectedThemes.includes(item.label) ? " workspace-tile--selected" : ""}`} onClick={() => handleThemeClick(item.label)}><span>{formatBreachCategory(item.label)}</span><strong>{formatWorkspaceAmount(item.amount)}</strong><small>{item.share.toFixed(1)}% of theme value</small></button>)}</div> : <div className="workspace-bars">{themes.slice(0, 7).map((item) => <button className="workspace-bar" type="button" key={item.label} onClick={() => handleThemeClick(item.label)}><span>{formatBreachCategory(item.label)}</span><div className="workspace-bar__track"><div className="workspace-bar__fill" style={{ width: `${Math.max(4, item.share)}%` }}/></div><strong>{formatWorkspaceAmount(item.amount)}</strong></button>)}</div>}
            </section>

            <section className="workspace-card workspace-card--wide"><div className="workspace-card__heading"><h2>{view === "analytics" ? "Largest penalties" : "Recent enforcement actions"}</h2><Link className="workspace-card__action" to="/fines/actions">View all <ArrowRight size={11}/></Link></div><RecordTable records={view === "analytics" ? top : recent} onOpen={(record) => setDrawer({ title: record.firm_individual, records: [record], description: record.summary })} /></section>
            <section className="workspace-card"><div className="workspace-card__heading"><h2>What matters now</h2><Sparkles size={15}/></div><ul className="workspace-insights"><li><CheckCircle2 size={14}/><span>{themes[0] ? `${themes[0].label} represents the largest disclosed fine value in this view.` : "No dominant theme in the current view."}</span></li><li><CheckCircle2 size={14}/><span>{regulators[0] ? `${regulators[0].label} is the most active regulator by disclosed value.` : "No regulator activity matches the current filters."}</span></li><li><CheckCircle2 size={14}/><span>{metricLargest ? `${metricLargestFirm} is the largest penalty in scope at ${formatWorkspaceAmount(metricLargest)}.` : "No penalty is in scope."}</span></li><li><Info size={14}/><span>Open records to test each conclusion against the linked official evidence.</span></li></ul></section>

            {view === "analytics" && <>
              <section className="workspace-card"><div className="workspace-card__heading"><h2>Fine concentration</h2><span>Loaded evidence set</span></div><button type="button" className="workspace-decision-metric" onClick={() => setDrawer({ title: "Ten largest penalties", records: top.slice(0,10), description: "The ten largest disclosed penalties in the current evidence set." })}><strong>{decisionAnalytics.concentration.toFixed(1)}%</strong><span>of disclosed value sits in the ten largest penalties</span></button></section>
              <section className="workspace-card workspace-card--wide"><div className="workspace-card__heading"><h2>Penalty-size distribution</h2><span>Click a band to inspect cases</span></div><div className="workspace-distribution">{decisionAnalytics.buckets.map((bucket) => <button type="button" key={bucket.label} onClick={() => setDrawer({ title: bucket.label, records: bucket.records, description: `${formatWorkspaceActionCount(bucket.records.length)} in this penalty band.` })}><span>{bucket.label}</span><strong>{bucket.records.length}</strong><i style={{height:`${Math.max(5,(bucket.records.length / Math.max(...decisionAnalytics.buckets.map((item) => item.records.length),1))*100)}%`}}/></button>)}</div></section>
              <section className="workspace-card workspace-card--wide"><div className="workspace-card__heading"><h2>Monthly enforcement heatmap</h2><span>Amount and action cadence</span></div><div className="workspace-heatmap">{monthly.slice(-24).map((item) => <button type="button" key={item.key} style={{"--heat":Math.max(.08,item.amount / Math.max(...monthly.map((point) => point.amount),1))} as CSSProperties} onClick={() => openSelection({year:item.year,month:item.month},`${item.label} actions`)}><span>{item.label}</span><strong>{formatWorkspaceAmount(item.amount)}</strong><small>{item.count} actions</small></button>)}</div></section>
              <section className="workspace-card"><div className="workspace-card__heading"><h2>Outlier cases</h2><span>Above three times the 75th percentile</span></div>{decisionAnalytics.outliers.length ? <div className="workspace-bars">{decisionAnalytics.outliers.slice(0,7).map((record) => <button className="workspace-bar" type="button" key={record.canonical_case_id ?? record.id} onClick={() => setDrawer({ title: record.firm_individual, records: [record], description: record.summary })}><span>{record.firm_individual}</span><strong>{formatWorkspaceAmount(record.amount)}</strong></button>)}</div> : <p className="workspace-empty-guidance">No disclosed penalty exceeds the current outlier threshold.</p>}</section>
              <section className="workspace-card workspace-card--half"><div className="workspace-card__heading"><h2>Regulators by fine value</h2><span>Click to drill down</span></div><div className="workspace-bars">{regulators.map((item) => <button className="workspace-bar" type="button" key={item.label} onClick={() => handleRegulatorClick(item.label)}><span>{item.label}</span><div className="workspace-bar__track"><div className="workspace-bar__fill" style={{width:`${Math.max(4,item.share)}%`}}/></div><strong>{formatWorkspaceAmount(item.amount)}</strong></button>)}</div></section>
              <section className="workspace-card workspace-card--half"><div className="workspace-card__heading"><h2>Top sectors</h2><span>By disclosed value</span></div><div className="workspace-treemap">{sectors.slice(0,6).map((item) => <button className="workspace-tile" type="button" key={item.label} onClick={() => openSelection({ sector: item.label }, item.label)}><span>{item.label}</span><strong>{formatWorkspaceAmount(item.amount)}</strong><small>{formatWorkspaceActionCount(item.count)}</small></button>)}</div></section>
              <section className="workspace-card workspace-card--half"><div className="workspace-card__heading"><h2>Firms under pressure</h2><span>Top 10</span></div><div className="workspace-bars">{firms.map((item) => <button className="workspace-bar" type="button" key={item.label} onClick={() => openSelection({firm:item.label},item.label)}><span>{item.label}</span><div className="workspace-bar__track"><div className="workspace-bar__fill" style={{width:`${Math.max(4,item.share)}%`}}/></div><strong>{formatWorkspaceAmount(item.amount)}</strong></button>)}</div></section>
              <section className="workspace-card workspace-card--half"><div className="workspace-card__heading"><h2>Methodology snapshot</h2><span>Current view</span></div><ul className="workspace-insights"><li><CheckCircle2 size={14}/><span>Amounts normalised to GBP for comparison.</span></li><li><CheckCircle2 size={14}/><span>Published actions are deduplicated before display.</span></li><li><CheckCircle2 size={14}/><span>Records link to official notices or regulator-level source pages.</span></li><li><CheckCircle2 size={14}/><span>Filters and comparisons are visible in the URL and contain no personal data.</span></li></ul></section>
            </>}
          </div>
        )}
      </div>

      <ActionDrawer open={Boolean(drawer)} title={drawer?.title ?? "Actions"} description={drawer?.description} records={drawer?.records ?? []} onClose={() => setDrawer(null)} onApplyFilter={drawer?.apply} />
    </ProductWorkspaceShell>
  );
}
