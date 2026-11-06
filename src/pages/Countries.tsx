import {
  lazy,
  Suspense,
  useMemo,
  useState,
} from "react";
import { downloadCsvFile } from "../utils/csvFile.js";
import {
  Link,
  useLocation,
} from "react-router-dom";
import {
  BookOpen,
  Briefcase,
  Download,
  ExternalLink,
  Minus,
  Plus,
  Search,
  ShieldAlert,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ReferenceLine,
  Tooltip,
} from "recharts";
import {
  getCountryByIso2,
  countrySlug,
  type Country,
} from "../data/countries.js";
import {
  FATF_SOURCE_URL,
  FATF_RECENT_CHANGES,
  fatfLabel,
} from "../data/fatfStatus.js";
import {
  sanctionsTierLabel,
  type SanctionsTier,
} from "../data/sanctionsStatus.js";
import {
  unscoredStatusLabel,
  hasLegalStatus,
} from "../data/unscoredStatus.js";
import {
  bandFor,
  type RiskBand,
} from "../data/countryRiskScore.js";
import {
  computeCountryRiskCurrent,
} from "../data/countryRiskMethodology.js";
import {
  buildCountryCsv,
  countryCsvFilename,
} from "../utils/countryCsv.js";
import {
  publicCountryRiskStatusLabel,
} from "../data/countryRiskPresentation.js";
import {
  countryRiskV3BandLabel,
  countryRiskV3ResultKindLabel,
} from "../data/countryRiskV3Presentation.js";
import {
  buildCountryIndex,
  regionalAverages,
  pillarAverages,
  globalRank,
  regionRank,
  type CountryIndexEntry,
} from "../data/countryView.js";

import {
  CountryFinder,
} from "../components/CountryFinder.js";
import "../styles/country-hub.css";
import {
  FatfList,
} from "./countries/FatfList.js";
import { BAND_COLOUR, CountryRiskMap, isRatedEntry, isPreciselyRankedEntry } from "./countries/shared.js";
import { OverviewTab } from "./countries/OverviewTab.js";

// ─── Global Country Risk dashboard (default /countries) ─────────────────────

const CountryMovers = lazy(() => import("../components/CountryMovers.js"));

type Tab = "overview" | "map" | "matrix" | "ratings" | "movers";
type Quadrant = "weak-high" | "strong-high" | "weak-low" | "strong-low";
const PILLAR_FILL: Record<string, string> = {
  effectiveness: "#dc2626",
  safeguards: "#ea580c",
  governance: "#0fa77d",
};

const DRIVER_LABEL: Record<string, string> = {
  effectiveness: "AML/CFT effectiveness gaps",
  safeguards: "Technical safeguards gaps",
  governance: "Governance and institutional weakness",
  icrg: "FATF public determination (no mutual evaluation)",
};

function keyDrivers(iso2: string): string[] {
  const result = computeCountryRiskCurrent(iso2);
  if (result.score === null) {
    // Withholding the score does not mean there is nothing to say: the legal
    // status is a fact, and it is the most useful thing a reviewer can be told
    // about a country the model declines to score.
    const legal = hasLegalStatus(iso2)
      ? [`${unscoredStatusLabel(iso2)} — legal status, not a modelled score`]
      : [];
    return [...legal, "Not enough information is available to publish a score"];
  }
  const out: string[] = [];
  if (result.overlays.fatf.listing === "call-for-action") out.push("FATF call-for-action overlay");
  else if (result.overlays.fatf.listing === "increased-monitoring") out.push("FATF increased-monitoring overlay");
  if (result.overlays.sanctions.highestTier) {
    out.push(`${result.overlays.sanctions.highestTier} sanctions overlay`);
  }
  Object.entries(result.pillars)
    .filter(([, pillar]) => pillar.score !== null && pillar.score >= 5)
    .sort(([, a], [, b]) => (b.score ?? 0) - (a.score ?? 0))
    .forEach(([key]) => {
      if (out.length < 4) out.push(DRIVER_LABEL[key] ?? key);
    });
  if (result.beneficialOwnership.score !== null && result.beneficialOwnership.score >= 5 && out.length < 4) {
    out.push("Beneficial-ownership control gaps");
  }
  if (result.status === "provisional") out.push("Some information is unavailable");
  return out.length ? out.slice(0, 4) : ["No elevated current-methodology driver identified"];
}

function inQuadrant(e: CountryIndexEntry, q: Quadrant): boolean {
  // Quadrants live on the risk matrix, which only plots jurisdictions with
  // RegActions enforcement coverage — never the "not yet assessed" majority
  // (whose enforcement exposure is unknown, not zero). Keeping this in step
  // with the plotted set means the quadrant counts, the scatter and the
  // Ratings-tab click-filter all agree on the same population.
  if (!e.hasEnforcement || e.controlStrength === null) return false;
  const weak = e.controlStrength < 5;
  const high = e.enforcementExposure >= 5;
  return q === "weak-high"
    ? weak && high
    : q === "strong-high"
      ? !weak && high
      : q === "weak-low"
        ? weak && !high
        : !weak && !high;
}

function DetailPanel({
  entry,
  onClose,
}: {
  entry: CountryIndexEntry;
  onClose?: () => void;
}) {
  const iso2 = entry.country.iso2;
  const gr = globalRank(iso2);
  const rr = regionRank(iso2, entry.country.region);
  const drivers = keyDrivers(iso2);
  const hasScore = entry.score !== null && entry.band !== null;
  return (
    <aside className="cx-detail">
      <div className="cx-detail__head">
        <span className="cx-detail__flag" aria-hidden="true">{entry.flag}</span>
        <div className="cx-detail__id">
          <h3 className="cx-detail__name">{entry.country.name}</h3>
          <span
            className={`cx-detail__band cx-detail__band--${
              entry.band ?? (hasLegalStatus(iso2) ? "legal" : "insufficient")
            }`}
          >
            {hasScore ? `${countryRiskV3BandLabel(entry.band!)} risk` : unscoredStatusLabel(iso2)}
          </span>
        </div>
        {onClose && (
          <button type="button" className="cx-detail__close" onClick={onClose} aria-label="Clear selection">
            ×
          </button>
        )}
      </div>
      <div className="cx-detail__scores">
        <div className="cx-detail__score-main">
          <span className={`country-ratings__score country-ratings__score--${entry.band ?? "insufficient"}`}>
            {hasScore ? entry.score!.toFixed(1) : "—"}
          </span>
          <span className="cx-detail__cap">{hasScore ? "Overall / 10" : "No score published"}</span>
        </div>
        <div>
          <b>{gr.rank === null ? "—" : `#${gr.rank}`}</b>
          <span className="cx-detail__cap">Global / {gr.total}</span>
        </div>
        <div>
          <b>{rr.rank === null ? "—" : `#${rr.rank}`}</b>
          <span className="cx-detail__cap">{entry.country.region} / {rr.total}</span>
        </div>
      </div>
      <div className="cx-detail__metrics">
        <div>
          <span className="cx-detail__cap">Control strength</span>
          <b>{entry.controlStrength !== null ? entry.controlStrength.toFixed(1) : "n/a"}</b>
        </div>
        <div>
          <span className="cx-detail__cap">Enforcement exposure</span>
          <b>{entry.enforcementExposure.toFixed(1)}</b>
        </div>
      </div>
      <div className="cx-detail__fatf">
        FATF: <strong>{entry.fatf ? fatfLabel(entry.fatf.listing) : "Not listed"}</strong>
      </div>
      <p className="cx-detail__status">{publicCountryRiskStatusLabel(entry.status)}</p>
      <p className="cx-detail__status"><strong>{countryRiskV3ResultKindLabel(entry.resultKind)}</strong>{entry.nearThreshold ? " · close to a band threshold" : ""}</p>
      <div className="cx-detail__drivers">
        <span className="cx-detail__drivers-title">Key drivers</span>
        <ul>
          {drivers.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      </div>
      <Link to={`/countries/${countrySlug(entry.country)}`} className="cx-detail__cta">
        View full profile →
      </Link>
    </aside>
  );
}

function MatrixTip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="cx-matrix__tip">
      <b>{p.name}</b>
      <span>Control {p.x.toFixed(1)} · Exposure {p.y.toFixed(1)}</span>
    </div>
  );
}

function RiskMatrix({
  entries,
  quadrant,
  onQuadrant,
}: {
  entries: CountryIndexEntry[];
  quadrant: Quadrant | null;
  onQuadrant: (q: Quadrant | null) => void;
}) {
  // Plot ONLY jurisdictions with RegActions enforcement coverage. The other
  // ~85% have no tracked enforcement, so their exposure is "not yet assessed",
  // not zero — plotting them would pile a meaningless flat line onto the axis
  // and dress unassessed jurisdictions up as zero-exposure.
  const covered = entries.filter((e) => e.hasEnforcement);
  const data = covered
    .filter((e) => e.controlStrength !== null && e.band !== null)
    .map((e) => ({
      x: e.controlStrength as number,
      y: e.enforcementExposure,
      band: e.band as RiskBand,
      name: e.country.name,
    }));
  const count = (q: Quadrant) => covered.filter((e) => inQuadrant(e, q)).length;
  const quad = (q: Quadrant, label: string) => (
    <button
      type="button"
      aria-pressed={quadrant === q}
      className={`cx-matrix__quad${quadrant === q ? " cx-matrix__quad--on" : ""}`}
      onClick={() => onQuadrant(quadrant === q ? null : q)}
    >
      <b>{count(q)}</b> {label}
    </button>
  );
  return (
    <div className="cx-matrix">
      <div className="cx-matrix__chart">
        <span className="cx-matrix__ylab">Enforcement exposure →</span>
        <ResponsiveContainer width="100%" height={330}>
          <ScatterChart margin={{ top: 10, right: 16, bottom: 10, left: 4 }}>
            <XAxis type="number" dataKey="x" domain={[0, 10]} tick={{ fontSize: 11 }} />
            <YAxis type="number" dataKey="y" domain={[0, 10]} tick={{ fontSize: 11 }} />
            <ReferenceLine x={5} stroke="#cbd5e1" />
            <ReferenceLine y={5} stroke="#cbd5e1" />
            <Tooltip cursor={{ strokeDasharray: "3 3" }} content={<MatrixTip />} />
            <Scatter data={data} fillOpacity={0.75}>
              {data.map((d, i) => (
                <Cell key={i} fill={BAND_COLOUR[d.band]} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
        <span className="cx-matrix__xlab">Control strength (weak → strong) →</span>
      </div>
      <p className="cx-matrix__note">
        Showing the {data.length} jurisdictions with RegActions enforcement coverage.
        Other countries are not yet assessed, not zero exposure.
      </p>
      <div className="cx-matrix__quadrants">
        {quad("weak-high", "Weak controls · high exposure")}
        {quad("strong-high", "Strong controls · high exposure")}
        {quad("weak-low", "Weak controls · low exposure")}
        {quad("strong-low", "Strong controls · low exposure")}
      </div>
    </div>
  );
}

function FilterBar({
  query,
  setQuery,
  region,
  setRegion,
  regions,
  fatfFilter,
  setFatfFilter,
  sanctionsFilter,
  setSanctionsFilter,
  sanctionsScoringReady,
  hasFilters,
  clearFilters,
  band,
  setBand,
}: any) {
  return (
    <div className="cx-filters">
      <label className="cx-filters__search">
        <Search size={15} />
        <input type="search" placeholder="Search country" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      {/* Risk band was filterable only from the overview drill-downs, which set
          the band and jumped here — leaving the table filtered with nothing on
          screen saying which band was applied. */}
      {setBand && (
        <div className="cx-filters__bands" role="group" aria-label="Risk band">
          <button
            type="button"
            aria-pressed={band === "All"}
            className={`cx-chip${band === "All" ? " cx-chip--on" : ""}`}
            onClick={() => setBand("All")}
          >
            All bands
          </button>
          {(["low", "moderate", "high", "very-high"] as RiskBand[]).map((b) => (
            <button
              key={b}
              type="button"
              aria-pressed={band === b}
              className={`cx-chip cx-chip--${b}${band === b ? " cx-chip--on" : ""}`}
              onClick={() => setBand(band === b ? "All" : b)}
            >
              {countryRiskV3BandLabel(b)}
            </button>
          ))}
        </div>
      )}
      <select value={region} onChange={(e) => setRegion(e.target.value)} aria-label="Region">
        {regions.map((r: string) => (
          <option key={r} value={r}>{r === "All" ? "All regions" : r}</option>
        ))}
      </select>
      <select value={fatfFilter} onChange={(e) => setFatfFilter(e.target.value)} aria-label="FATF listing">
        <option value="All">All FATF</option>
        <option value="black">Black list</option>
        <option value="grey">Grey list</option>
        <option value="none">Not listed</option>
      </select>
      <select
        value={sanctionsFilter}
        onChange={(e) => setSanctionsFilter(e.target.value)}
        aria-label="International sanctions"
        disabled={!sanctionsScoringReady}
        title={sanctionsScoringReady ? undefined : "International sanctions information is incomplete"}
      >
        <option value="All">{sanctionsScoringReady ? "All international sanctions" : "Information incomplete"}</option>
        <option value="comprehensive">Comprehensive</option>
        <option value="sectoral">Sectoral</option>
        <option value="targeted">Targeted</option>
        <option value="none">None</option>
      </select>
      {hasFilters && (
        <button type="button" className="cx-filters__clear" onClick={clearFilters}>Clear filters</button>
      )}
    </div>
  );
}

// ─── Index page-level sidebar nav (sticky, 246px) ────────────────────────────
function IndexSidebar() {
  return (
    <aside className="cx-idx-nav" aria-label="Country risk section navigation">
      <div className="cx-idx-nav__inner">
        <div className="cx-idx-nav__label">Country risk</div>
        <div className="cx-idx-nav__list">
          <span className="cx-idx-nav__item cx-idx-nav__item--on" aria-current="page">
            <ShieldAlert size={16} aria-hidden="true" />
            Country risk
          </span>
        </div>
        <div className="cx-idx-nav__divider" />
        <div className="cx-idx-nav__list">
          <Link to="/board-pack" className="cx-idx-nav__item">
            <Briefcase size={16} aria-hidden="true" />
            Board pack
          </Link>
          <Link to="/countries/methodology" className="cx-idx-nav__item">
            <BookOpen size={16} aria-hidden="true" />
            Scoring methodology
          </Link>
        </div>
      </div>
    </aside>
  );
}

// ─── Numbered section header ("01 The global picture") ──────────────────────
function GlobalIndex() {
  const index = useMemo(() => buildCountryIndex(), []);
  const regions = useMemo(
    () => ["All", ...[...new Set(index.map((e) => e.country.region))].sort()],
    [index],
  );
  const [tab, setTab] = useState<Tab>("overview");
  const [region, setRegion] = useState("All");
  const [band, setBand] = useState<"All" | RiskBand>("All");
  const [query, setQuery] = useState("");
  const [fatfFilter, setFatfFilter] = useState<"All" | "black" | "grey" | "none">("All");
  const [sanctionsFilter, setSanctionsFilter] = useState<"All" | SanctionsTier | "none">("All");
  const [statusFilter, setStatusFilter] = useState<"All" | "complete" | "provisional" | "insufficient-data">("All");
  const [quadrant, setQuadrant] = useState<Quadrant | null>(null);
  const [sortKey, setSortKey] = useState<"score" | "name" | "region">("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedIso, setSelectedIso] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const sanctionsScoringReady = useMemo(
    () => index.every((entry) => entry.sanctionsCoverageComplete),
    [index],
  );

  const counts = useMemo(() => {
    const c: Record<RiskBand, number> = { "very-high": 0, high: 0, moderate: 0, low: 0 };
    for (const e of index) if (e.band) c[e.band] += 1;
    return c;
  }, [index]);
  const ratedCount = useMemo(() => index.filter(isRatedEntry).length, [index]);
  const completeCount = useMemo(() => index.filter((entry) => entry.status === "complete").length, [index]);
  const provisionalCount = useMemo(() => index.filter((entry) => entry.status === "provisional").length, [index]);
  const insufficientCount = useMemo(() => index.filter((entry) => entry.status === "insufficient-data").length, [index]);
  const fatfCounts = useMemo(() => {
    let black = 0;
    let grey = 0;
    for (const e of index) {
      if (e.fatf?.listing === "call-for-action") black += 1;
      else if (e.fatf?.listing === "increased-monitoring") grey += 1;
    }
    return { black, grey };
  }, [index]);

  // Everything EXCEPT the quadrant filter — the risk matrix reads this so its
  // scatter + quadrant counts respect region/band/FATF/sanctions/search too.
  const baseFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return index.filter((e) => {
      if (region !== "All" && e.country.region !== region) return false;
      if (band !== "All" && e.band !== band) return false;
      if (statusFilter !== "All" && e.status !== statusFilter) return false;
      if (q && !e.country.name.toLowerCase().includes(q)) return false;
      if (fatfFilter !== "All") {
        const l = e.fatf?.listing;
        const key = l === "call-for-action" ? "black" : l === "increased-monitoring" ? "grey" : "none";
        if (key !== fatfFilter) return false;
      }
      if (sanctionsScoringReady
        && sanctionsFilter !== "All"
        && (e.sanctionsTier ?? "none") !== sanctionsFilter) return false;
      return true;
    });
  }, [index, region, band, statusFilter, query, fatfFilter, sanctionsFilter, sanctionsScoringReady]);

  const rows = useMemo(() => {
    const filtered = quadrant ? baseFiltered.filter((e) => inQuadrant(e, quadrant)) : baseFiltered;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) =>
      sortKey === "name"
        ? dir * a.country.name.localeCompare(b.country.name)
        : sortKey === "region"
          ? dir *
            (a.country.region.localeCompare(b.country.region) ||
              a.country.name.localeCompare(b.country.name))
          : a.score === null
            ? b.score === null
              ? a.country.name.localeCompare(b.country.name)
              : 1
            : b.score === null
              ? -1
              : a.score === b.score
                ? a.country.name.localeCompare(b.country.name)
                : dir * (a.score - b.score),
    );
  }, [baseFiltered, quadrant, sortKey, sortDir]);

  const hasFilters =
    region !== "All" ||
    band !== "All" ||
    query !== "" ||
    fatfFilter !== "All" ||
    sanctionsFilter !== "All" ||
    statusFilter !== "All" ||
    quadrant !== null;
  const indexIso = useMemo(
    () => new Set(index.filter(isRatedEntry).map((e) => e.country.iso2)),
    [index],
  );
  const rowIso = useMemo(() => new Set(rows.map((e) => e.country.iso2)), [rows]);
  // Only dim SCORED countries that fail the filter — never the grey no-data ones.
  const dimUnmatched = hasFilters
    ? (iso2: string) => indexIso.has(iso2) && !rowIso.has(iso2)
    : undefined;

  // Stable global risk rank (index is sorted score-desc) for the ratings "#".
  const rankOf = useMemo(() => {
    const m = new Map<string, number>();
    index.filter((entry) => isRatedEntry(entry) && entry.resultKind !== "indicative-governance-proxy").forEach((e, i) => m.set(e.country.iso2, i + 1));
    return m;
  }, [index]);

  // No auto-selection: the detail panel appears only after the user clicks.
  const selectedEntry = useMemo(
    () => (selectedIso ? (index.find((e) => e.country.iso2 === selectedIso) ?? null) : null),
    [index, selectedIso],
  );

  const top = useMemo(() => index.filter(isPreciselyRankedEntry).slice(0, 12), [index]);
  const regional = useMemo(() => regionalAverages(), []);
  const pillars = useMemo(() => pillarAverages(), []);
  const overall = useMemo(
    () =>
      ratedCount
        ? Math.round((index.reduce((s, e) => s + (e.score ?? 0), 0) / ratedCount) * 10) / 10
        : 0,
    [index, ratedCount],
  );
  /**
   * Exports the CURRENTLY FILTERED rows, not the whole index — the filters are
   * the point of the export. Uses the same `rows` the table renders, so the CSV
   * always matches what the user is looking at.
   */
  const downloadCountryCsv = () => {
    downloadCsvFile(
      buildCountryCsv(rows, { rankOf }),
      countryCsvFilename(new Date().toISOString().slice(0, 10)),
    );
  };

  const added = FATF_RECENT_CHANGES.filter((c) => c.change === "added");
  const removed = FATF_RECENT_CHANGES.filter((c) => c.change === "removed");
  const nameOf = (iso2: string) => getCountryByIso2(iso2)?.name ?? iso2;

  const pillarData = [
    { key: "effectiveness", name: "FATF effectiveness", value: pillars.effectiveness },
    { key: "safeguards", name: "Technical safeguards", value: pillars.safeguards },
    { key: "governance", name: "Governance and institutions", value: pillars.governance },
  ];

  const toggleSort = (key: "score" | "name" | "region") => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "score" ? "desc" : "asc");
    }
    setShowAll(false);
  };
  const sortArrow = (key: "score" | "name" | "region") =>
    sortKey === key ? (sortDir === "desc" ? " ↓" : " ↑") : "";
  const clearFilters = () => {
    setRegion("All");
    setBand("All");
    setQuery("");
    setFatfFilter("All");
    setSanctionsFilter("All");
    setStatusFilter("All");
    setQuadrant(null);
    setShowAll(false);
  };

  const kpis: Array<{ label: string; value: number; cls: string; pressed: boolean; onClick: () => void }> = [
    { label: "Full information", value: completeCount, cls: "rated", pressed: statusFilter === "complete", onClick: () => setStatusFilter(statusFilter === "complete" ? "All" : "complete") },
    { label: "Some information missing", value: provisionalCount, cls: "insufficient", pressed: statusFilter === "provisional", onClick: () => setStatusFilter(statusFilter === "provisional" ? "All" : "provisional") },
    { label: "Black list", value: fatfCounts.black, cls: "black", pressed: fatfFilter === "black", onClick: () => setFatfFilter(fatfFilter === "black" ? "All" : "black") },
    { label: "Grey list", value: fatfCounts.grey, cls: "grey", pressed: fatfFilter === "grey", onClick: () => setFatfFilter(fatfFilter === "grey" ? "All" : "grey") },
    { label: "High risk", value: counts.high + counts["very-high"], cls: "high", pressed: band === "high", onClick: () => setBand(band === "high" ? "All" : "high") },
    { label: "Moderate", value: counts.moderate, cls: "moderate", pressed: band === "moderate", onClick: () => setBand(band === "moderate" ? "All" : "moderate") },
  ];

  const PREVIEW = 25;
  const visibleRows = showAll ? rows : rows.slice(0, PREVIEW);

  return (
    <div className="cx-idx-shell">
      <IndexSidebar />
      <div className="cx-dash">
      <header className="cx-dash__head">
        <h1 className="country-index__title">Global Country Risk Ratings</h1>
        <p className="cx-dash__lead">
          Compare financial-crime and country risk across {index.length} jurisdictions. Full
          information is available for {completeCount}; {provisionalCount} have some information
          missing{insufficientCount ? `; ${insufficientCount} do not have enough information for a score` : ""}.
          Missing information is never treated as zero risk. Enforcement activity and corruption
          perception are shown as useful context but do not change the score.{" "}
          <Link to="/countries/methodology">How scores are calculated →</Link>
          {" · "}
          <Link to="/countries/changes">See what changed →</Link>
        </p>
      </header>

      <CountryFinder entries={index} />

      <div className="cx-dash__kpis">
        {kpis.map((k) => (
          <button
            key={k.label}
            type="button"
            aria-pressed={k.pressed}
            className={`cx-kpi2 cx-kpi2--${k.cls}${k.pressed ? " cx-kpi2--on" : ""}`}
            onClick={k.onClick}
          >
            <span className="cx-kpi2__value">{k.value}</span>
            <span className="cx-kpi2__label">{k.label}</span>
          </button>
        ))}
      </div>

      <div className="cx-tabs">
        {(["overview", "map", "matrix", "ratings", "movers"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tab === t}
            className={`cx-tab${tab === t ? " cx-tab--on" : ""}`}
            onClick={() => setTab(t)}
          >
            {t === "overview"
              ? "Overview"
              : t === "map"
                ? "Map view"
                : t === "matrix"
                  ? "Risk matrix"
                  : t === "movers"
                    ? "Movers"
                    : "Ratings"}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <OverviewTab
          onRegion={(r) => { clearFilters(); setRegion(r); setTab("ratings"); }}
          onBand={(b) => { clearFilters(); setBand(b); setTab("ratings"); }}
        />
      )}

      {tab === "map" && (
        <>
          <div className="cx-dash__grid">
            <aside className="cx-rail">
              <label className="cx-filters__search">
                <Search size={15} />
                <input type="search" placeholder="Search country" value={query} onChange={(e) => setQuery(e.target.value)} />
              </label>
              <div className="cx-rail__group">
                <span className="cx-rail__title">Risk band</span>
                <div className="cx-rail__bands">
                  <button type="button" aria-pressed={band === "All"} className={`cx-chip${band === "All" ? " cx-chip--on" : ""}`} onClick={() => setBand("All")}>All</button>
                  {(["low", "moderate", "high", "very-high"] as RiskBand[]).map((b) => (
                    <button key={b} type="button" aria-pressed={band === b} className={`cx-chip cx-chip--${b}${band === b ? " cx-chip--on" : ""}`} onClick={() => setBand(band === b ? "All" : b)}>
                      {countryRiskV3BandLabel(b)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="cx-rail__group">
                <span className="cx-rail__title">Region</span>
                <select value={region} onChange={(e) => setRegion(e.target.value)}>
                  {regions.map((r) => (
                    <option key={r} value={r}>{r === "All" ? "All regions" : r}</option>
                  ))}
                </select>
              </div>
              <div className="cx-rail__group">
                <span className="cx-rail__title">FATF status</span>
                <select value={fatfFilter} onChange={(e) => setFatfFilter(e.target.value as typeof fatfFilter)}>
                  <option value="All">All</option>
                  <option value="black">Black list</option>
                  <option value="grey">Grey list</option>
                  <option value="none">Not listed</option>
                </select>
              </div>
              <div className="cx-rail__group">
                <span className="cx-rail__title">International sanctions</span>
                <select
                  value={sanctionsFilter}
                  onChange={(e) => setSanctionsFilter(e.target.value as typeof sanctionsFilter)}
                  disabled={!sanctionsScoringReady}
                  title={sanctionsScoringReady ? undefined : "International sanctions information is incomplete"}
                >
                  <option value="All">{sanctionsScoringReady ? "All" : "Information incomplete"}</option>
                  <option value="comprehensive">Comprehensive</option>
                  <option value="sectoral">Sectoral</option>
                  <option value="targeted">Targeted</option>
                  <option value="none">None</option>
                </select>
              </div>
              <div className="cx-rail__group">
                <span className="cx-rail__title">Quick segments</span>
                <div className="cx-rail__segments">
                  <button type="button" className="cx-seg" onClick={() => { clearFilters(); setFatfFilter("grey"); }}>FATF grey list <b>{fatfCounts.grey}</b></button>
                  <button type="button" className="cx-seg" onClick={() => { clearFilters(); setFatfFilter("black"); }}>Black list <b>{fatfCounts.black}</b></button>
                  <button
                    type="button"
                    className="cx-seg"
                    disabled={!sanctionsScoringReady}
                    title={sanctionsScoringReady ? undefined : "International sanctions information is incomplete"}
                    onClick={() => { clearFilters(); setSanctionsFilter("comprehensive"); }}
                  >Comprehensive sanctions</button>
                  <button type="button" className="cx-seg" onClick={() => { clearFilters(); setBand("very-high"); }}>Very high risk <b>{counts["very-high"]}</b></button>
                  <button type="button" className="cx-seg" onClick={() => { clearFilters(); setQuadrant("weak-high"); setTab("matrix"); }}>Weak controls · high exposure</button>
                </div>
              </div>
              {hasFilters && (
                <button type="button" className="cx-rail__reset" onClick={clearFilters}>Reset all</button>
              )}
            </aside>

            <div className="cx-dash__map">
              <Suspense fallback={<div className="cx-map__ph" style={{ height: 360 }} />}>
                <CountryRiskMap
                  onSelect={setSelectedIso}
                  selectedIso2={selectedEntry?.country.iso2}
                  dimUnmatched={dimUnmatched}
                />
              </Suspense>
              <p className="cx-dash__count">
                {rows.length} of {index.length} covered jurisdictions shown
                {hasFilters && rows.length === 0 ? " · no countries match these filters" : ""}
              </p>
            </div>

            {selectedEntry ? (
              <DetailPanel entry={selectedEntry} onClose={() => setSelectedIso(null)} />
            ) : (
              <aside className="cx-detail cx-detail--empty">
                <p>Click any country on the map to see its score, rank and key risk drivers.</p>
              </aside>
            )}
          </div>

          <div className="cx-dash__below">
            <div className="mon-panel cx-spotlight">
              <h3>High-risk spotlight</h3>
              <div className="cx-spotlight__row">
                {top.map((e) => (
                  <Link key={e.country.iso2} to={`/countries/${countrySlug(e.country)}`} className="cx-spot">
                    <span className="cx-spot__flag" aria-hidden="true">{e.flag}</span>
                    <span className="cx-spot__name">{e.country.name}</span>
                    <span className={`country-ratings__score country-ratings__score--${e.band}`}>{e.score.toFixed(1)}</span>
                  </Link>
                ))}
              </div>
            </div>
            <div className="mon-panel">
              <h3>FATF new this cycle</h3>
              <p className="mon-change mon-change--add">
                <Plus size={14} /> <strong>Added ({added.length})</strong>
                <span>{added.map((c) => nameOf(c.iso2)).join(", ") || "None"}</span>
              </p>
              <p className="mon-change mon-change--rem">
                <Minus size={14} /> <strong>Removed ({removed.length})</strong>
                <span>{removed.map((c) => nameOf(c.iso2)).join(", ") || "None"}</span>
              </p>
              <Link to="/countries/fatf-grey-list" className="cx-panel-link">FATF grey &amp; black list →</Link>
            </div>
          </div>
        </>
      )}

      {tab === "matrix" && (
        <div className="cx-dash__matrix">
          <div className="mon-panel">
            <h3>
              Control strength vs enforcement exposure{" "}
              <span className="cx-panel-sub">derived view metrics, not part of the score</span>
            </h3>
            <RiskMatrix entries={baseFiltered} quadrant={quadrant} onQuadrant={setQuadrant} />
          </div>
          <div className="cx-index__panels">
            <div className="mon-panel">
              <h3>Regional risk overview</h3>
              <ul className="cx-region-bars">
                {regional.map((r) => (
                  <li key={r.region}>
                    <span className="cx-region-bars__label">{r.region}</span>
                    <span className="cx-region-bars__track">
                      <span className="cx-region-bars__fill" style={{ width: `${(r.avg / 10) * 100}%`, background: BAND_COLOUR[bandFor(r.avg)] }} />
                    </span>
                    <span className="cx-region-bars__val">{r.avg.toFixed(1)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mon-panel">
              <h3>
                What drives global risk <span className="cx-panel-sub">average points, 0–10</span>
              </h3>
              <div className="mon-donut cx-pillar-donut">
                <div className="cx-pillar-donut__chart">
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={pillarData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={2}>
                        {pillarData.map((d) => (
                          <Cell key={d.key} fill={PILLAR_FILL[d.key]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="cx-pillar-donut__center">
                    <span className="cx-pillar-donut__num">{overall.toFixed(1)}</span>
                    <span className="cx-pillar-donut__cap">overall</span>
                  </div>
                </div>
                <ul className="mon-donut__legend">
                  {pillarData.map((d) => (
                    <li key={d.key}>
                      <span className="mon-donut__swatch" style={{ background: PILLAR_FILL[d.key] }} />
                      {d.name}
                      <span className="mon-donut__count">{d.value.toFixed(1)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "movers" && (
        <Suspense fallback={null}>
          <CountryMovers />
        </Suspense>
      )}

      {tab === "ratings" && (
        <section className="cx-index__table">
          <FilterBar
            query={query}
            setQuery={setQuery}
            region={region}
            setRegion={setRegion}
            regions={regions}
            fatfFilter={fatfFilter}
            setFatfFilter={setFatfFilter}
            sanctionsFilter={sanctionsFilter}
            setSanctionsFilter={setSanctionsFilter}
            sanctionsScoringReady={sanctionsScoringReady}
            hasFilters={hasFilters}
            clearFilters={clearFilters}
            band={band}
            setBand={setBand}
          />
          <div className="cx-index__toolbar">
            <p className="country-index__count">{rows.length} shown</p>
            <button
              type="button"
              className="cx-export"
              onClick={downloadCountryCsv}
              disabled={rows.length === 0}
            >
              <Download size={14} aria-hidden="true" /> Export CSV
            </button>
          </div>
          <table className="country-ratings">
            <thead>
              <tr>
                <th>#</th>
                <th><button type="button" className="cx-sort" onClick={() => toggleSort("name")}>Country{sortArrow("name")}</button></th>
                <th className="country-ratings__num"><button type="button" className="cx-sort" onClick={() => toggleSort("score")}>Risk score{sortArrow("score")}</button></th>
                <th>Risk</th>
                <th><button type="button" className="cx-sort" onClick={() => toggleSort("region")}>Region{sortArrow("region")}</button></th>
                <th>FATF</th>
                <th>International sanctions</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((e) => (
                <tr key={e.country.iso2}>
                  <td className="country-ratings__rank">{rankOf.get(e.country.iso2) ?? "—"}</td>
                  <td>
                    <Link to={`/countries/${countrySlug(e.country)}`} className="country-ratings__name">
                      <span aria-hidden="true">{e.flag}</span> {e.country.name}
                    </Link>
                  </td>
                  <td className="country-ratings__num">
                    <span className={`country-ratings__score country-ratings__score--${e.band ?? "insufficient"}`}>
                      {e.score === null ? "—" : e.score.toFixed(1)}
                    </span>
                  </td>
                    <td>{e.band ? `${countryRiskV3BandLabel(e.band)} · ${countryRiskV3ResultKindLabel(e.resultKind)}${e.nearThreshold ? " · near threshold" : ""}` : unscoredStatusLabel(e.country.iso2)}</td>
                  <td className="country-ratings__region">{e.country.region}</td>
                  <td>{e.fatf ? fatfLabel(e.fatf.listing) : <span className="cx-fatf-none">Not listed</span>}</td>
                  <td>{e.sanctionsCoverageComplete
                    ? e.sanctionsTier
                      ? sanctionsTierLabel(e.sanctionsTier)
                      : "No direct country restrictions"
                    : "Information incomplete"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="cx-ratings-empty">
                    No jurisdictions match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {rows.length > PREVIEW && (
            <button type="button" className="cx-showall" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Show fewer" : `Show all ${rows.length}`}
            </button>
          )}
        </section>
      )}

      <div className="country-hub__sources">
        <span>Sources:</span>{" "}
        <a href={FATF_SOURCE_URL} target="_blank" rel="noopener noreferrer">FATF <ExternalLink size={12} /></a>{" "}
        · World Bank WGI (CC BY 4.0) · UN / UK / EU / US sanctions · TI CPI (context only)
      </div>
      </div>
    </div>
  );
}

export function Countries() {
  const { pathname } = useLocation();
  return pathname.endsWith("/fatf-grey-list") ? <FatfList /> : <GlobalIndex />;
}

export default Countries;
