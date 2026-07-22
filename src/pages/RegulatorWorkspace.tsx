import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Info,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { ActionDrawer } from "../components/ActionDrawer.js";
import { ProductWorkspaceShell } from "../components/ProductWorkspaceShell.js";
import RegulatorMark from "../components/RegulatorMark.js";
import {
  LIVE_REGULATOR_NAV_ITEMS,
  getRegulatorCoverage,
} from "../data/regulatorCoverage.js";
import { getCountryByIso2, countrySlug } from "../data/countries.js";
import { useSEO } from "../hooks/useSEO.js";
import { useUnifiedData } from "../hooks/useUnifiedData.js";
import { useWorkspaceOverview } from "../hooks/useWorkspaceOverview.js";
import type { FineRecord } from "../types.js";
import {
  buildBreakdown,
  buildYearlyTrend,
  formatWorkspaceActionCount,
  formatWorkspaceAmount,
  getRecordThemes,
  getWorkspaceMetrics,
  recordsForSelection,
} from "../utils/workspaceAnalytics.js";
import { fetchWorkspaceRecords } from "../utils/fetchWorkspaceRecords.js";

export type RegulatorWorkspaceView = "overview" | "actions" | "analytics" | "compare";

interface RegulatorWorkspaceProps { view: RegulatorWorkspaceView; }
interface DrawerState { title: string; description?: string; records: FineRecord[]; }

const CURRENT_YEAR = new Date().getFullYear();

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function RegulatorTable({ records, onOpen, limit = 8 }: { records: FineRecord[]; onOpen: (record: FineRecord) => void; limit?: number }) {
  return <table className="workspace-table"><thead><tr><th>Date</th><th>Firm / individual</th><th>Theme</th><th>Breach type</th><th>Fine</th></tr></thead><tbody>{records.slice(0, limit).map((record) => <tr key={`${record.id ?? record.fine_reference}-${record.date_issued}`} onClick={() => onOpen(record)} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") onOpen(record); }}><td>{formatDate(record.date_issued)}</td><td><strong>{record.firm_individual}</strong></td><td><span className="workspace-tag">{getRecordThemes(record)[0]}</span></td><td>{record.breach_type || "Not classified"}</td><td><strong>{formatWorkspaceAmount(record.amount)}</strong></td></tr>)}</tbody></table>;
}

export function RegulatorWorkspace({ view }: RegulatorWorkspaceProps) {
  const { regulatorCode = "fca" } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const coverage = getRegulatorCoverage(regulatorCode);
  const code = coverage?.code ?? regulatorCode.toUpperCase();
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const year = Number(searchParams.get("year") || 0);
  const theme = searchParams.get("theme") || "All";
  const sector = searchParams.get("sector") || "All";
  const query = searchParams.get("q") || "";
  const comparisonRegulator = searchParams.get("compare") || (code === "SEC" ? "FCA" : "SEC");
  const updateScope = (key: string, value: string | number, emptyValue: string | number) => {
    const next = new URLSearchParams(searchParams);
    if (value === emptyValue || value === "") next.delete(key);
    else next.set(key, String(value));
    setSearchParams(next, { replace: true });
  };

  const primary = useUnifiedData({ regulator: code, country: "All", year, currency: "GBP" });
  const comparison = useUnifiedData({ regulator: comparisonRegulator, country: "All", year, currency: "GBP" });
  const primaryOverview = useWorkspaceOverview({ regulator: code, year: year || undefined, breachCategory: theme, sector, q: query, currency: "GBP" });
  const comparisonOverview = useWorkspaceOverview({ regulator: comparisonRegulator, year: year || undefined, breachCategory: theme, sector, q: query, currency: "GBP" });

  const records = useMemo(() => primary.fines.filter((record) => {
    if (theme !== "All" && !getRecordThemes(record).includes(theme)) return false;
    if (sector !== "All" && (record.firm_category || "Sector not recorded") !== sector) return false;
    if (query.trim() && ![record.firm_individual, record.summary, record.breach_type].filter(Boolean).join(" ").toLowerCase().includes(query.trim().toLowerCase())) return false;
    return true;
  }), [primary.fines, query, sector, theme]);
  const comparisonRecords = useMemo(() => comparison.fines.filter((record) => {
    if (theme !== "All" && !getRecordThemes(record).includes(theme)) return false;
    if (sector !== "All" && (record.firm_category || "Sector not recorded") !== sector) return false;
    if (query.trim() && ![record.firm_individual, record.summary, record.breach_type].filter(Boolean).join(" ").toLowerCase().includes(query.trim().toLowerCase())) return false;
    return true;
  }), [comparison.fines, query, sector, theme]);

  const sampleMetrics = useMemo(() => getWorkspaceMetrics(records), [records]);
  const yearly = useMemo(() => primaryOverview.data?.yearly ?? buildYearlyTrend(records), [primaryOverview.data?.yearly, records]);
  const themes = useMemo(() => (primaryOverview.data?.themes ?? buildBreakdown(records, getRecordThemes, 7)).slice(0,7), [primaryOverview.data?.themes, records]);
  const sectors = useMemo(() => (primaryOverview.data?.sectors ?? buildBreakdown(records, (record) => [record.firm_category || "Sector not recorded"], 7)).slice(0,7), [primaryOverview.data?.sectors, records]);
  const actionTypes = useMemo(() => buildBreakdown(records, (record) => [record.breach_type || "Not classified"], 7), [records]);
  const recent = useMemo(() => records.slice().sort((a,b) => b.date_issued.localeCompare(a.date_issued)), [records]);
  const top = useMemo(() => records.slice().sort((a,b) => b.amount-a.amount), [records]);
  const years = useMemo(() => Array.from(new Set(primary.fines.map((record) => record.year_issued))).sort((a,b) => b-a), [primary.fines]);
  const themeOptions = useMemo(() => buildBreakdown(primary.fines, getRecordThemes, 50).map((entry) => entry.label), [primary.fines]);
  const sectorOptions = useMemo(() => Array.from(new Set(primary.fines.map((record) => record.firm_category || "Sector not recorded"))).sort(), [primary.fines]);
  const yearComparison = useMemo(() => {
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

  const currentYearFines = useMemo(() => primary.fines
    .filter((record) => record.year_issued === CURRENT_YEAR && !record.requires_amount_review && record.amount > 0)
    .sort((left, right) => right.date_issued.localeCompare(left.date_issued)), [primary.fines]);
  const currentYearTotal = useMemo(
    () => currentYearFines.reduce((total, record) => total + record.amount, 0),
    [currentYearFines],
  );
  const currentYearLargest = useMemo(
    () => currentYearFines.slice().sort((left, right) => right.amount - left.amount)[0],
    [currentYearFines],
  );
  const isFcaOverview = code === "FCA" && view === "overview";
  const showFcaAnswer = isFcaOverview && year === 0 && theme === "All" && sector === "All" && !query;

  useSEO({
    title: isFcaOverview
      ? "FCA Fines: Latest Penalties, Totals and Enforcement Actions | RegActions"
      : `${coverage?.fullName ?? code} ${view === "overview" ? "Executive Summary" : view} | RegActions`,
    description: isFcaOverview
      ? `Search FCA fines and enforcement actions, inspect official source evidence, and review ${CURRENT_YEAR} totals, trends, firms and breach themes.`
      : `Public enforcement intelligence, penalties and official evidence for ${coverage?.fullName ?? code}.`,
    keywords: isFcaOverview
      ? `FCA fines, FCA fines ${CURRENT_YEAR}, FCA penalties, Financial Conduct Authority fines, FCA enforcement actions`
      : undefined,
    canonicalPath: `/regulators/${regulatorCode.toLowerCase()}${view === "overview" ? "" : `/${view}`}`,
    ogType: "website",
  });

  if (!coverage || !coverage.dashboardEnabled) return <Navigate to="/regulators" replace />;
  // Cross-link to this regulator's country risk report (fixes the orphaned
  // regulator↔country cluster). Resolved from coverage.countryCode; null if the
  // country has no report so we render no dead link.
  const reportCountry = coverage.countryCode ? getCountryByIso2(coverage.countryCode) : undefined;
  if (primary.loading) return <ProductWorkspaceShell scope="regulator" regulatorCode={regulatorCode}><div className="workspace-loading">Loading {code} enforcement intelligence...</div></ProductWorkspaceShell>;
  if (primary.error) return <ProductWorkspaceShell scope="regulator" regulatorCode={regulatorCode}><div className="workspace-error">{primary.error}</div></ProductWorkspaceShell>;

  const openSelection = async (selection: {year?: number; theme?: string}, title: string) => {
    setDrawer({ title, records: recordsForSelection(records, selection), description: "Loading the complete matching evidence set..." });
    try {
      const result = await fetchWorkspaceRecords({
        regulator: code,
        year: selection.year ?? (year || undefined),
        breachCategory: selection.theme ?? (theme !== "All" ? theme : undefined),
        sector: sector !== "All" ? sector : undefined,
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
      setDrawer((current) => current?.title === title ? { ...current, description: "The live record query could not be refreshed. The loaded working set is shown." } : current);
    }
  };
  const exact = primaryOverview.data?.metrics;
  const metrics = {
    ...sampleMetrics,
    count: exact?.count ?? sampleMetrics.count,
    total: exact?.total ?? sampleMetrics.total,
    average: exact?.average ?? sampleMetrics.average,
    median: exact?.median ?? sampleMetrics.median,
    affectedFirms: exact?.affectedFirms ?? sampleMetrics.affectedFirms,
    largest: exact ? ({ amount: exact.largest, firm_individual: exact.largestFirm } as FineRecord) : sampleMetrics.largest,
  };
  const comparisonSampleMetrics = getWorkspaceMetrics(comparisonRecords);
  const comparisonExact = comparisonOverview.data?.metrics;
  const comparisonMetrics = {
    ...comparisonSampleMetrics,
    count: comparisonExact?.count ?? comparisonSampleMetrics.count,
    total: comparisonExact?.total ?? comparisonSampleMetrics.total,
    average: comparisonExact?.average ?? comparisonSampleMetrics.average,
    median: comparisonExact?.median ?? comparisonSampleMetrics.median,
    affectedFirms: comparisonExact?.affectedFirms ?? comparisonSampleMetrics.affectedFirms,
    largest: comparisonExact ? ({ amount: comparisonExact.largest, firm_individual: comparisonExact.largestFirm } as FineRecord) : comparisonSampleMetrics.largest,
  };
  const dominantTheme = themes[0]?.label ?? "No dominant theme";

  return (
    <ProductWorkspaceShell scope="regulator" regulatorCode={regulatorCode} title={code}>
      <div className="workspace-page">
        <div className="workspace-page__breadcrumb"><Link to="/regulators">Regulators</Link><span>/</span><span>{code}</span><span>/</span><strong>{view === "overview" ? "Executive Summary" : view[0].toUpperCase()+view.slice(1)}</strong></div>

        <section className="regulator-workspace__hero">
          <div className="regulator-workspace__identity">
            <div className="regulator-workspace__mark"><RegulatorMark regulator={code} label={coverage.fullName} size="large" /></div>
            <div><h1>{isFcaOverview ? "FCA Fines and Enforcement Actions" : `${coverage.fullName} (${code})`}</h1><p><ShieldCheck size={13} /> {isFcaOverview ? `${coverage.fullName} enforcement activity and official-source evidence for the United Kingdom.` : `All data on this page reflects ${code} enforcement activity in ${coverage.country}.`}</p></div>
          </div>
          <div className="regulator-workspace__context">
            <div className="regulator-workspace__country"><span>{coverage.flag}</span><div><strong>{coverage.country}</strong><small>Jurisdiction</small></div></div>
            <div className="regulator-workspace__scope"><ShieldCheck size={18}/><div><small>You are viewing data for</small><strong>{code} · {coverage.country}</strong><span>Charts and tables are restricted to this regulator.</span></div></div>
          </div>
        </section>

        {showFcaAnswer && (
          <section className="regulator-workspace__answer" aria-labelledby="fca-fines-current-year">
            <div className="regulator-workspace__answer-copy">
              <span>Latest FCA fines</span>
              <h2 id="fca-fines-current-year">FCA fines in {CURRENT_YEAR}</h2>
              <p>
                RegActions currently records {formatWorkspaceAmount(currentYearTotal)} across {formatWorkspaceActionCount(currentYearFines.length)} with a disclosed monetary penalty in {CURRENT_YEAR}. Non-monetary actions and amounts awaiting review are excluded from this total.
              </p>
              <div className="regulator-workspace__answer-links">
                <Link to={`/topics/fca-fines-${CURRENT_YEAR}`}>View the {CURRENT_YEAR} monthly report <ArrowRight size={13} /></Link>
                <a href={`https://www.fca.org.uk/news/news-stories/${CURRENT_YEAR}-fines`} target="_blank" rel="noopener noreferrer">Check the FCA&apos;s official fines page <ExternalLink size={13} /></a>
              </div>
            </div>
            <div className="regulator-workspace__answer-metrics">
              <div><span>Disclosed total</span><strong>{formatWorkspaceAmount(currentYearTotal)}</strong></div>
              <div><span>Monetary penalties</span><strong>{currentYearFines.length.toLocaleString("en-GB")}</strong></div>
              <div><span>Largest penalty</span><strong>{formatWorkspaceAmount(currentYearLargest?.amount ?? 0)}</strong><small>{currentYearLargest?.firm_individual ?? "No disclosed penalty recorded"}</small></div>
            </div>
          </section>
        )}

        <section className="workspace-assurance-strip" aria-label={`${code} coverage assurance`}>
          <div><span>Coverage confidence</span><strong>{coverage.operationalConfidence === "standard" ? "Standard" : "Directional"}</strong><small>{coverage.automationLevel.replaceAll("_", " ")}</small></div>
          <div><span>Latest official action</span><strong>{exact?.latestDate ? formatDate(exact.latestDate) : "Not recorded"}</strong><small>Action date, not collection time</small></div>
          <div><span>Last source check</span><strong>{exact?.latestSourceCheckAt ? formatDate(exact.latestSourceCheckAt) : "Pending verification run"}</strong><small>{coverage.feedContract.cadence} source cadence</small></div>
          <div><span>Last ingestion</span><strong>{exact?.latestIngestionAt ? formatDate(exact.latestIngestionAt) : "Not recorded"}</strong><small>{coverage.coverageStatus} archive</small></div>
          <div><span>Amount review</span><strong>{exact?.amountReviewCount ?? 0}</strong><small>Excluded from monetary totals</small></div>
        </section>

        <section className="workspace-filterbar" aria-label={`${code} filters`}>
          <label>Year<select value={year} onChange={(event) => updateScope("year", Number(event.target.value), 0)}><option value={0}>All years</option>{years.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label>Regulator<select value={code} onChange={(event) => navigate(`/regulators/${event.target.value.toLowerCase()}/${view === "overview" ? "" : view}?${searchParams.toString()}`)}><option value={code}>{code}</option>{LIVE_REGULATOR_NAV_ITEMS.filter((item) => item.dashboardEnabled && item.code !== code).map((item) => <option key={item.code} value={item.code}>{item.code}</option>)}</select></label>
          <label>Country<select value={coverage.countryCode} disabled><option>{coverage.countryCode}</option></select></label>
          <label>Breach theme<select value={theme} onChange={(event) => updateScope("theme", event.target.value, "All")}><option>All</option>{themeOptions.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>Sector<select value={sector} onChange={(event) => updateScope("sector", event.target.value, "All")}><option>All</option>{sectorOptions.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>Search<input value={query} onChange={(event) => updateScope("q", event.target.value, "")} placeholder="Firm, person, keyword..." /></label>
        </section>

        <section className="workspace-kpis">
          <article className="workspace-kpi"><span>Total {code} fines</span><strong>{formatWorkspaceAmount(metrics.total)}</strong><small>Disclosed monetary outcomes</small></article>
          <article className="workspace-kpi"><span>Number of actions</span><strong>{metrics.count.toLocaleString("en-GB")}</strong><small>Matching current filters</small></article>
          <article className="workspace-kpi"><span>Median fine</span><strong>{formatWorkspaceAmount(metrics.median)}</strong><small>Current view median</small></article>
          <article className="workspace-kpi"><span>Largest fine</span><strong>{formatWorkspaceAmount(metrics.largest?.amount ?? 0)}</strong><small>{metrics.largest?.firm_individual ?? "No matching record"}</small></article>
          <article className="workspace-kpi"><span>Most affected sector</span><strong>{sectors[0]?.label ?? "Not recorded"}</strong><small>{sectors[0] ? formatWorkspaceAmount(sectors[0].amount) : "No matching value"}</small></article>
          <article className="workspace-kpi"><span>Year-over-year change</span><strong><em>{yearComparison.change === null ? "Not available" : `${yearComparison.change >= 0 ? "+" : ""}${yearComparison.change.toFixed(1)}%`}</em></strong><small>{yearComparison.latest && yearComparison.previous ? `${yearComparison.latest.year} vs ${yearComparison.previous.year}` : "Insufficient annual history"}</small></article>
        </section>

        {view === "actions" ? (
          <section className="workspace-card workspace-card--full"><div className="workspace-card__heading"><h2>All {code} enforcement actions</h2><span>{records.length} records</span></div><RegulatorTable records={recent} limit={150} onOpen={(record) => setDrawer({ title: record.firm_individual, records:[record], description: record.summary })}/></section>
        ) : view === "compare" ? (
          <div className="workspace-grid">
            <section className="workspace-card workspace-card--full"><div className="workspace-card__heading"><h2>Compare {code} with another regulator</h2><span>Identical filters apply to both regulators</span></div><div className="workspace-filterbar"><label>Primary regulator<select value={code} disabled><option>{code}</option></select></label><label>Comparator<select value={comparisonRegulator} onChange={(event) => updateScope("compare", event.target.value, "")} >{LIVE_REGULATOR_NAV_ITEMS.filter((item) => item.dashboardEnabled && item.code !== code).map((item) => <option key={item.code} value={item.code}>{item.code}</option>)}</select></label><label>Year<select value={year} onChange={(event) => updateScope("year", Number(event.target.value), 0)}><option value={0}>All years</option>{years.map((value)=><option key={value} value={value}>{value}</option>)}</select></label></div><div className="workspace-scope-summary" role="status"><strong>Comparison scope</strong><span>{year || "All years"}</span><span>{theme}</span><span>{sector}</span>{query ? <span>Search: {query}</span> : null}</div></section>
            {[{label:code,data:metrics},{label:comparisonRegulator,data:comparisonMetrics}].map((item) => <section className="workspace-card workspace-card--half" key={item.label}><div className="workspace-card__heading"><h2>{item.label}</h2><span>Current comparison scope</span></div><section className="workspace-kpis" style={{gridTemplateColumns:"repeat(2,1fr)",margin:0}}><article className="workspace-kpi"><span>Total value</span><strong>{formatWorkspaceAmount(item.data.total)}</strong></article><article className="workspace-kpi"><span>Actions</span><strong>{item.data.count}</strong></article><article className="workspace-kpi"><span>Median</span><strong>{formatWorkspaceAmount(item.data.median)}</strong></article><article className="workspace-kpi"><span>Largest</span><strong>{formatWorkspaceAmount(item.data.largest?.amount ?? 0)}</strong></article></section></section>)}
            <section className="workspace-card workspace-card--half"><div className="workspace-card__heading"><h2>{code} top penalties</h2></div><RegulatorTable records={top} limit={8} onOpen={(record)=>setDrawer({title:record.firm_individual,records:[record],description:record.summary})}/></section>
            <section className="workspace-card workspace-card--half"><div className="workspace-card__heading"><h2>{comparisonRegulator} top penalties</h2></div><RegulatorTable records={comparisonRecords.slice().sort((a,b)=>b.amount-a.amount)} limit={8} onOpen={(record)=>setDrawer({title:record.firm_individual,records:[record],description:record.summary})}/></section>
          </div>
        ) : (
          <div className="workspace-grid">
            {view === "overview" && <section className="workspace-card"><div className="workspace-card__heading"><h2>What matters now</h2><Sparkles size={15}/></div><p style={{fontSize:12,lineHeight:1.55,color:"#53667a"}}>{code} enforcement activity in this view is concentrated in {dominantTheme.toLowerCase()}, with {formatWorkspaceActionCount(metrics.count)} and {formatWorkspaceAmount(metrics.total)} in disclosed fines.</p><ul className="workspace-insights"><li><CheckCircle2 size={14}/><span>{themes[0] ? `${themes[0].label} accounts for ${themes[0].share.toFixed(1)}% of classified fine value.` : "No leading theme is recorded."}</span></li><li><CheckCircle2 size={14}/><span>{sectors[0] ? `${sectors[0].label} is the leading affected sector.` : "Sector information is limited."}</span></li><li><TrendingUp size={14}/><span>{yearComparison.change === null ? "Annual movement cannot yet be calculated for this scope." : `Disclosed fine value moved ${Math.abs(yearComparison.change).toFixed(1)}% ${yearComparison.change >= 0 ? "up" : "down"} against the preceding annual period.`}</span></li><li><Info size={14}/><span>Open any chart mark or table row to review the underlying evidence.</span></li></ul></section>}

            <section className={`workspace-card ${view === "overview" ? "workspace-card--half" : "workspace-card--wide"}`}><div className="workspace-card__heading"><h2>{code} fines over time (GBP)</h2><span>Click a point to open its actions</span></div><div className="workspace-chart"><ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 520, height: 250 }}><AreaChart data={yearly} margin={{top:10,right:8,left:0,bottom:0}}><defs><linearGradient id="regulatorArea" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#176ee7" stopOpacity={.28}/><stop offset="95%" stopColor="#176ee7" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="label"/><YAxis width={62} tickFormatter={(value)=>formatWorkspaceAmount(Number(value))}/><Tooltip formatter={(value)=>formatWorkspaceAmount(Number(value))}/><Area isAnimationActive={false} dataKey="amount" type="monotone" stroke="#176ee7" strokeWidth={2.2} fill="url(#regulatorArea)" activeDot={{r:6,onClick:(_event:unknown,payload:any)=>openSelection({year:Number(payload?.payload?.year)},`${payload?.payload?.year} ${code} actions`)}}/></AreaChart></ResponsiveContainer></div></section>

            <section className="workspace-card"><div className="workspace-card__heading"><h2>Top breach themes</h2><button type="button" className="workspace-card__action" onClick={()=>setDrawer({title:`All ${code} themes`,records})}>View all <ArrowRight size={11}/></button></div><div className="workspace-bars">{themes.map((item)=><button type="button" className="workspace-bar" key={item.label} onClick={()=>openSelection({theme:item.label},item.label)}><span>{item.label}</span><div className="workspace-bar__track"><div className="workspace-bar__fill" style={{width:`${Math.max(4,item.share)}%`}}/></div><strong>{formatWorkspaceAmount(item.amount)}</strong></button>)}</div></section>

            <section className="workspace-card workspace-card--half"><div className="workspace-card__heading"><h2>Recent {code} enforcement actions</h2><Link to={`/regulators/${regulatorCode}/actions`} className="workspace-card__action">View all <ArrowRight size={11}/></Link></div><RegulatorTable records={recent} onOpen={(record)=>setDrawer({title:record.firm_individual,records:[record],description:record.summary})}/></section>
            <section className="workspace-card workspace-card--half"><div className="workspace-card__heading"><h2>Top penalties ({code})</h2><span>By disclosed value</span></div><RegulatorTable records={top} onOpen={(record)=>setDrawer({title:record.firm_individual,records:[record],description:record.summary})}/></section>

            <section className="workspace-card"><div className="workspace-card__heading"><h2>Fines by sector</h2><span>Click to drill down</span></div><div className="workspace-bars">{sectors.map((item)=><button className="workspace-bar" type="button" key={item.label} onClick={()=>setDrawer({title:item.label,records:records.filter((record)=>(record.firm_category||"Sector not recorded")===item.label)})}><span>{item.label}</span><div className="workspace-bar__track"><div className="workspace-bar__fill" style={{width:`${Math.max(4,item.share)}%`}}/></div><strong>{formatWorkspaceAmount(item.amount)}</strong></button>)}</div></section>
            <section className="workspace-card"><div className="workspace-card__heading"><h2>Fines by action type</h2><span>Click to drill down</span></div><div className="workspace-treemap">{actionTypes.slice(0,6).map((item)=><button className="workspace-tile" type="button" key={item.label} onClick={()=>setDrawer({title:item.label,records:records.filter((record)=>(record.breach_type||"Not classified")===item.label)})}><span>{item.label}</span><strong>{formatWorkspaceAmount(item.amount)}</strong><small>{formatWorkspaceActionCount(item.count)}</small></button>)}</div></section>
            <section className="workspace-card"><div className="workspace-card__heading"><h2>Key themes / emerging issues</h2></div><ul className="workspace-insights">{themes.slice(0,4).map((item)=><li key={item.label}><CheckCircle2 size={14}/><span>{item.label}: {formatWorkspaceActionCount(item.count)} and {formatWorkspaceAmount(item.amount)} in disclosed fines.</span></li>)}</ul></section>

            <section className="workspace-card workspace-card--half"><div className="workspace-card__heading"><h2>Regulator scope, methodology and data</h2></div><table className="workspace-table"><tbody><tr><th>Scope</th><td>{coverage.fullName} activity in {coverage.country}</td></tr><tr><th>Time period</th><td>{coverage.years}</td></tr><tr><th>Coverage</th><td>{formatWorkspaceActionCount(metrics.count)} in the current view</td></tr><tr><th>Currency</th><td>Normalised to GBP for comparison</td></tr>{reportCountry && <tr><th>Country risk</th><td><Link to={`/countries/${countrySlug(reportCountry)}`}>Country risk report: {reportCountry.name} →</Link></td></tr>}</tbody></table></section>
            <section className="workspace-card workspace-card--half"><div className="workspace-card__heading"><h2>About {coverage.fullName}</h2></div><p style={{fontSize:11,lineHeight:1.55,color:"#53667a"}}>{coverage.note ?? `${coverage.fullName} is the primary regulatory authority represented in this public enforcement workspace.`}</p><ul className="workspace-insights">{coverage.officialSources.map((source)=><li key={source.url}><ExternalLink size={13}/><a href={source.url} target="_blank" rel="noreferrer">{source.label}</a><span>{source.description}</span></li>)}</ul></section>
          </div>
        )}
      </div>
      <ActionDrawer open={Boolean(drawer)} title={drawer?.title ?? `${code} actions`} description={drawer?.description} records={drawer?.records ?? []} onClose={()=>setDrawer(null)}/>
    </ProductWorkspaceShell>
  );
}
