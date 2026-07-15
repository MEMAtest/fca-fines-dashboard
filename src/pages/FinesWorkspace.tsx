import { useEffect, useMemo, useState } from "react";
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
  Clipboard,
  Download,
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
  buildMonthlyTrend,
  buildYearlyTrend,
  formatWorkspaceAmount,
  getRecordThemes,
  getWorkspaceMetrics,
  recordsForSelection,
} from "../utils/workspaceAnalytics.js";
import { fetchWorkspaceRecords } from "../utils/fetchWorkspaceRecords.js";

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

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: Math.max(1, CURRENT_YEAR - 2012) }, (_, index) => CURRENT_YEAR - index);

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function exportWorkspaceCsv(records: FineRecord[]) {
  const lines = [
    ["Date", "Firm or individual", "Regulator", "Breach type", "Amount GBP"],
    ...records.map((record) => [
      record.date_issued,
      record.firm_individual,
      record.regulator,
      record.breach_type ?? "",
      String(record.amount),
    ]),
  ].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","));
  const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `regactions-fines-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function RecordTable({ records, onOpen, limit = 8 }: { records: FineRecord[]; onOpen: (record: FineRecord) => void; limit?: number }) {
  return (
    <table className="workspace-table">
      <thead><tr><th>Date</th><th>Firm / individual</th><th>Regulator</th><th>Theme</th><th>Amount</th></tr></thead>
      <tbody>
        {records.slice(0, limit).map((record) => (
          <tr key={`${record.id ?? record.fine_reference}-${record.date_issued}`} onClick={() => onOpen(record)} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") onOpen(record); }}>
            <td>{formatDate(record.date_issued)}</td>
            <td><strong>{record.firm_individual}</strong></td>
            <td><span className="workspace-tag">{record.regulator}</span></td>
            <td>{getRecordThemes(record)[0]}</td>
            <td><strong>{formatWorkspaceAmount(record.amount)}</strong></td>
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
  const themes = useMemo(() => (overview.data?.themes ?? buildBreakdown(filtered, getRecordThemes, 9)).slice(0, 9), [filtered, overview.data?.themes]);
  const regulators = useMemo(() => (overview.data?.regulators ?? buildBreakdown(filtered, (record) => [record.regulator], 9)).slice(0, 9), [filtered, overview.data?.regulators]);
  const sectors = useMemo(() => (overview.data?.sectors ?? buildBreakdown(filtered, (record) => [record.firm_category || "Sector not recorded"], 8)).slice(0, 8), [filtered, overview.data?.sectors]);
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
          : `${result.total.toLocaleString("en-GB")} matching actions with source evidence where available.`,
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

  const compareRecords = useMemo(() => filtered.filter((record) => {
    if (selectedYears.length && !selectedYears.includes(record.year_issued)) return false;
    if (selectedRegulators.length && !selectedRegulators.includes(record.regulator)) return false;
    if (selectedThemes.length && !getRecordThemes(record).some((item) => selectedThemes.includes(item))) return false;
    return true;
  }), [filtered, selectedRegulators, selectedThemes, selectedYears]);

  const exact = overview.data?.metrics;
  const metricCount = exact?.count ?? sampleMetrics.count;
  const metricTotal = exact?.total ?? sampleMetrics.total;
  const metricMedian = exact?.median ?? sampleMetrics.median;
  const metricLargest = exact?.largest ?? sampleMetrics.largest?.amount ?? 0;
  const metricLargestFirm = exact?.largestFirm || sampleMetrics.largest?.firm_individual || "No matching action";
  const metricAffectedFirms = exact?.affectedFirms ?? sampleMetrics.affectedFirms;

  if (loading) return <ProductWorkspaceShell scope="fines"><div className="workspace-loading">Loading the enforcement workspace...</div></ProductWorkspaceShell>;
  if (error) return <ProductWorkspaceShell scope="fines"><div className="workspace-error">{error}</div></ProductWorkspaceShell>;

  const recent = filtered.slice().sort((left, right) => right.date_issued.localeCompare(left.date_issued));
  const top = filtered.slice().sort((left, right) => right.amount - left.amount);

  return (
    <ProductWorkspaceShell scope="fines" title="Fines">
      <div className="workspace-page">
        <div className="workspace-page__breadcrumb"><Link to="/">Home</Link><span>/</span><span>Fines</span><span>/</span><strong>{view === "overview" ? "Command Centre" : view[0].toUpperCase() + view.slice(1)}</strong></div>
        <header className="workspace-page__heading">
          <div>
            <h1>{view === "overview" ? "Fines Command Centre" : view === "actions" ? "Enforcement actions" : view === "analytics" ? "Fines analytics" : "Guided comparison"}</h1>
            <p>{view === "compare" ? "Select up to three years and five regulators or themes. Normal views open the underlying evidence on click." : "Global enforcement intelligence, financial penalties and source-linked actions in one working view."}</p>
          </div>
          <div className="workspace-page__heading-actions">
            <Link className="workspace-button workspace-button--primary" to="/board-pack"><Sparkles size={15} /> Create board pack</Link>
            <button type="button" className={`workspace-button${compareMode ? " workspace-button--active" : ""}`} onClick={() => setCompareMode((value) => !value)}><SlidersHorizontal size={15} /> {compareMode ? "Exit compare mode" : "Compare selections"}</button>
            <button type="button" className="workspace-button" onClick={() => exportWorkspaceCsv(filtered)}><Download size={15} /> Export</button>
          </div>
        </header>

        <section className="workspace-filterbar" aria-label="Fines filters">
          <label>Year<select value={year} onChange={(event) => setYear(Number(event.target.value))}><option value={0}>All years</option>{YEARS.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
          <label>Jurisdiction<select value={country} onChange={(event) => setCountry(event.target.value)}><option>All</option>{countries.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
          <label>Regulator<select value={regulator} onChange={(event) => setRegulator(event.target.value)}><option>All</option>{LIVE_REGULATOR_NAV_ITEMS.filter((item) => item.dashboardEnabled).map((item) => <option value={item.code} key={item.code}>{item.code}</option>)}</select></label>
          <label>Breach theme<select value={theme} onChange={(event) => setTheme(event.target.value)}><option>All</option>{availableThemes.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
          <label>Sector<select value={sector} onChange={(event) => setSector(event.target.value)}><option>All</option>{availableSectors.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
          <label>Search<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Firm, person, keyword..." /></label>
        </section>

        <section className="workspace-kpis" aria-label="Current view key figures">
          <article className="workspace-kpi"><span>Total fines</span><strong>{formatWorkspaceAmount(metricTotal)}</strong><small>{overview.error ? "Loaded working set" : "Exact current public view"}</small></article>
          <article className="workspace-kpi"><span>Number of actions</span><strong>{metricCount.toLocaleString("en-GB")}</strong><small>Click any chart mark to inspect</small></article>
          <article className="workspace-kpi"><span>Median fine</span><strong>{formatWorkspaceAmount(metricMedian)}</strong><small>Less distorted by outliers</small></article>
          <article className="workspace-kpi"><span>Largest fine</span><strong>{formatWorkspaceAmount(metricLargest)}</strong><small>{metricLargestFirm}</small></article>
          <article className="workspace-kpi"><span>Firms affected</span><strong>{metricAffectedFirms.toLocaleString("en-GB")}</strong><small>Distinct firms and individuals</small></article>
          <article className="workspace-kpi"><span>Evidence access</span><strong><em>Source-linked</em></strong><small>Official evidence where available</small></article>
        </section>

        {compareMode && (
          <div className="workspace-selection-tray">
            <div>{selectedYears.map((item) => <span key={item}>{item}</span>)}{selectedRegulators.map((item) => <span key={item}>{item}</span>)}{selectedThemes.map((item) => <span key={item}>{item}</span>)}{!selectedYears.length && !selectedRegulators.length && !selectedThemes.length && <span>Select chart marks or tiles</span>}</div>
            <button type="button" className="workspace-button workspace-button--primary" onClick={() => navigator.clipboard.writeText(window.location.href)}><Clipboard size={14} /> Copy comparison link</button>
          </div>
        )}

        {view === "actions" ? (
          <section className="workspace-card workspace-card--full">
            <div className="workspace-card__heading"><h2>Matching enforcement actions</h2><span>First {Math.min(100, filtered.length).toLocaleString("en-GB")} shown | {metricCount.toLocaleString("en-GB")} total</span></div>
            <RecordTable records={recent} limit={100} onOpen={(record) => setDrawer({ title: record.firm_individual, records: [record], description: record.summary })} />
          </section>
        ) : view === "compare" ? (
          <div className="workspace-grid">
            <section className="workspace-card workspace-card--half"><div className="workspace-card__heading"><h2>Select years</h2><span>Maximum 3</span></div><div className="workspace-treemap">{yearly.slice(-12).map((point) => <button type="button" className={`workspace-tile${selectedYears.includes(point.year) ? " workspace-tile--selected" : ""}`} key={point.year} onClick={() => handleYearClick(point.year)}><span>{point.year}</span><strong>{formatWorkspaceAmount(point.amount)}</strong><small>{point.count} actions</small></button>)}</div></section>
            <section className="workspace-card workspace-card--half"><div className="workspace-card__heading"><h2>Select regulators</h2><span>Maximum 5</span></div><div className="workspace-treemap">{regulators.map((item) => <button type="button" className={`workspace-tile${selectedRegulators.includes(item.label) ? " workspace-tile--selected" : ""}`} key={item.label} onClick={() => handleRegulatorClick(item.label)}><span>{item.label}</span><strong>{formatWorkspaceAmount(item.amount)}</strong><small>{item.count} actions</small></button>)}</div></section>
            <section className="workspace-card workspace-card--half"><div className="workspace-card__heading"><h2>Select themes</h2><span>Maximum 5</span></div><div className="workspace-treemap">{themes.map((item) => <button type="button" className={`workspace-tile${selectedThemes.includes(item.label) ? " workspace-tile--selected" : ""}`} key={item.label} onClick={() => handleThemeClick(item.label)}><span>{item.label}</span><strong>{formatWorkspaceAmount(item.amount)}</strong><small>{item.count} actions</small></button>)}</div></section>
            <section className="workspace-card workspace-card--half"><div className="workspace-card__heading"><h2>Comparison result</h2><span>{compareRecords.length} matching actions</span></div><RecordTable records={compareRecords.slice().sort((a,b) => b.amount-a.amount)} limit={10} onOpen={(record) => setDrawer({ title: record.firm_individual, records: [record], description: record.summary })} /></section>
          </div>
        ) : (
          <div className="workspace-grid">
            <section className={`workspace-card ${view === "analytics" ? "workspace-card--wide" : "workspace-card--half"}`}>
              <div className="workspace-card__heading"><h2>{view === "analytics" ? "Fines over time" : "Monthly fines trend"}</h2><span>Click a mark to open its actions</span></div>
              <p className="workspace-chart__hint">Every mark is a drill-down. Filtering is a separate action inside the evidence drawer.</p>
              <div className="workspace-chart">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 640, height: 250 }}>
                  {view === "analytics" ? (
                    <AreaChart data={yearly} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <defs><linearGradient id="workspaceArea" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#236fe8" stopOpacity={0.25}/><stop offset="95%" stopColor="#236fe8" stopOpacity={0}/></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="label" /><YAxis tickFormatter={(value) => formatWorkspaceAmount(Number(value))} width={62}/><Tooltip formatter={(value) => formatWorkspaceAmount(Number(value))}/>
                      <Area className="workspace-chart__click-target" type="monotone" dataKey="amount" stroke="#176ee7" strokeWidth={2.2} fill="url(#workspaceArea)" activeDot={{ r: 6, onClick: (_event: unknown, payload: any) => handleYearClick(Number(payload?.payload?.year)) }} />
                    </AreaChart>
                  ) : (
                    <BarChart data={monthly} margin={{ top: 10, right: 6, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="label" interval="preserveStartEnd" /><YAxis tickFormatter={(value) => formatWorkspaceAmount(Number(value))} width={62}/><Tooltip formatter={(value) => formatWorkspaceAmount(Number(value))}/>
                      <Bar className="workspace-chart__click-target" dataKey="amount" fill="#276de5" radius={[3,3,0,0]} onClick={(payload: any) => openSelection({ year: Number(payload?.year), month: Number(payload?.month) }, `${payload?.label ?? "Selected period"} actions`)} />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            </section>

            <section className={`workspace-card ${view === "analytics" ? "" : "workspace-card--half"}`}>
              <div className="workspace-card__heading"><h2>Top themes by fine value</h2><button type="button" className="workspace-card__action" onClick={() => setDrawer({ title: "All themes", records: filtered })}>View data <ArrowRight size={11}/></button></div>
              {view === "analytics" ? <div className="workspace-treemap">{themes.slice(0, 6).map((item) => <button key={item.label} type="button" className={`workspace-tile${selectedThemes.includes(item.label) ? " workspace-tile--selected" : ""}`} onClick={() => handleThemeClick(item.label)}><span>{item.label}</span><strong>{formatWorkspaceAmount(item.amount)}</strong><small>{item.share.toFixed(1)}% of theme value</small></button>)}</div> : <div className="workspace-bars">{themes.slice(0, 7).map((item) => <button className="workspace-bar" type="button" key={item.label} onClick={() => handleThemeClick(item.label)}><span>{item.label}</span><div className="workspace-bar__track"><div className="workspace-bar__fill" style={{ width: `${Math.max(4, item.share)}%` }}/></div><strong>{formatWorkspaceAmount(item.amount)}</strong></button>)}</div>}
            </section>

            <section className="workspace-card workspace-card--wide"><div className="workspace-card__heading"><h2>{view === "analytics" ? "Largest penalties" : "Recent enforcement actions"}</h2><Link className="workspace-card__action" to="/fines/actions">View all <ArrowRight size={11}/></Link></div><RecordTable records={view === "analytics" ? top : recent} onOpen={(record) => setDrawer({ title: record.firm_individual, records: [record], description: record.summary })} /></section>
            <section className="workspace-card"><div className="workspace-card__heading"><h2>What matters now</h2><Sparkles size={15}/></div><ul className="workspace-insights"><li><CheckCircle2 size={14}/><span>{themes[0] ? `${themes[0].label} represents the largest disclosed fine value in this view.` : "No dominant theme in the current view."}</span></li><li><CheckCircle2 size={14}/><span>{regulators[0] ? `${regulators[0].label} is the most active regulator by disclosed value.` : "No regulator activity matches the current filters."}</span></li><li><CheckCircle2 size={14}/><span>{metricLargest ? `${metricLargestFirm} is the largest penalty in scope at ${formatWorkspaceAmount(metricLargest)}.` : "No penalty is in scope."}</span></li><li><Info size={14}/><span>Open records to test each conclusion against the linked official evidence.</span></li></ul></section>

            {view === "analytics" && <>
              <section className="workspace-card workspace-card--half"><div className="workspace-card__heading"><h2>Regulators by fine value</h2><span>Click to drill down</span></div><div className="workspace-bars">{regulators.map((item) => <button className="workspace-bar" type="button" key={item.label} onClick={() => handleRegulatorClick(item.label)}><span>{item.label}</span><div className="workspace-bar__track"><div className="workspace-bar__fill" style={{width:`${Math.max(4,item.share)}%`}}/></div><strong>{formatWorkspaceAmount(item.amount)}</strong></button>)}</div></section>
              <section className="workspace-card workspace-card--half"><div className="workspace-card__heading"><h2>Top sectors</h2><span>By disclosed value</span></div><div className="workspace-treemap">{sectors.slice(0,6).map((item) => <button className="workspace-tile" type="button" key={item.label} onClick={() => openSelection({ sector: item.label }, item.label)}><span>{item.label}</span><strong>{formatWorkspaceAmount(item.amount)}</strong><small>{item.count} actions</small></button>)}</div></section>
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
