import { lazy, Suspense, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  AlertCircle,
  Clock,
  Download,
  Eye,
  ExternalLink,
  Minus,
  Plus,
  Search,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { getCountryByIso2, countrySlug, flagEmoji, type Country } from "../data/countries.js";
import {
  FATF_STATUS,
  FATF_LAST_PLENARY,
  FATF_NEXT_PLENARY,
  FATF_SOURCE_URL,
  FATF_RECENT_CHANGES,
  FATF_UPDATED_THIS_CYCLE,
  isFatfUpdatedThisCycle,
  fatfLabel,
  type FatfStatus,
} from "../data/fatfStatus.js";
import { sanctionsTierLabel, type SanctionsTier } from "../data/sanctionsStatus.js";
import { bandLabel, bandFor, type RiskBand } from "../data/countryRiskScore.js";
import {
  buildCountryIndex,
  regionalAverages,
  pillarAverages,
  formatDate,
} from "../data/countryView.js";
import "../styles/country-hub.css";

// Flat SVG choropleth — lazy so /countries never pulls it into first paint.
const CountryRiskMap = lazy(() =>
  import("../components/CountryRiskMap.js").then((m) => ({
    default: m.CountryRiskMap,
  })),
);

// ─── Global Country Risk index (default /countries) ─────────────────────────

const BAND_ORDER: RiskBand[] = ["very-high", "high", "moderate", "low"];

const BAND_COLOUR: Record<RiskBand, string> = {
  "very-high": "#dc2626",
  high: "#ea580c",
  moderate: "#f59e0b",
  low: "#10b981",
};

function GlobalIndex() {
  const index = useMemo(() => buildCountryIndex(), []);
  const regions = useMemo(
    () => ["All", ...[...new Set(index.map((e) => e.country.region))].sort()],
    [index],
  );
  const [region, setRegion] = useState("All");
  const [band, setBand] = useState<"All" | RiskBand>("All");
  const [query, setQuery] = useState("");
  const [fatfFilter, setFatfFilter] = useState<"All" | "black" | "grey" | "none">("All");
  const [sanctionsFilter, setSanctionsFilter] = useState<"All" | SanctionsTier | "none">("All");
  const [sortKey, setSortKey] = useState<"score" | "name" | "region">("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const counts = useMemo(() => {
    const c: Record<RiskBand, number> = { "very-high": 0, high: 0, moderate: 0, low: 0 };
    for (const e of index) c[e.band] += 1;
    return c;
  }, [index]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = index.filter((e) => {
      if (region !== "All" && e.country.region !== region) return false;
      if (band !== "All" && e.band !== band) return false;
      if (q && !e.country.name.toLowerCase().includes(q)) return false;
      if (fatfFilter !== "All") {
        const l = e.fatf?.listing;
        const key = l === "call-for-action" ? "black" : l === "increased-monitoring" ? "grey" : "none";
        if (key !== fatfFilter) return false;
      }
      if (sanctionsFilter !== "All" && (e.sanctionsTier ?? "none") !== sanctionsFilter) return false;
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === "name") return dir * a.country.name.localeCompare(b.country.name);
      if (sortKey === "region")
        return (
          dir *
          (a.country.region.localeCompare(b.country.region) ||
            a.country.name.localeCompare(b.country.name))
        );
      return dir * (a.score - b.score || a.country.name.localeCompare(b.country.name));
    });
  }, [index, region, band, query, fatfFilter, sanctionsFilter, sortKey, sortDir]);

  const overall = useMemo(
    () =>
      index.length
        ? Math.round((index.reduce((s, e) => s + e.score, 0) / index.length) * 10) / 10
        : 0,
    [index],
  );
  const top = useMemo(() => index.slice(0, 10), [index]);
  const regional = useMemo(() => regionalAverages(), []);
  const pillars = useMemo(() => pillarAverages(), []);
  const [showAll, setShowAll] = useState(false);

  const added = FATF_RECENT_CHANGES.filter((c) => c.change === "added");
  const removed = FATF_RECENT_CHANGES.filter((c) => c.change === "removed");
  const nameOf = (iso2: string) => getCountryByIso2(iso2)?.name ?? iso2;

  const PILLAR_FILL: Record<string, string> = {
    governance: "#0fa77d",
    fatf: "#dc2626",
    sanctions: "#ea580c",
  };
  const pillarData = [
    { key: "governance", name: "Governance base", value: pillars.governance },
    { key: "fatf", name: "FATF escalator", value: pillars.fatf },
    { key: "sanctions", name: "Sanctions escalator", value: pillars.sanctions },
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
  const hasFilters =
    region !== "All" ||
    band !== "All" ||
    query !== "" ||
    fatfFilter !== "All" ||
    sanctionsFilter !== "All";
  const clearFilters = () => {
    setRegion("All");
    setBand("All");
    setQuery("");
    setFatfFilter("All");
    setSanctionsFilter("All");
    setShowAll(false);
  };

  const PREVIEW = 20;
  const visibleRows = showAll ? rows : rows.slice(0, PREVIEW);

  return (
    <div className="cx-index">
      <header className="country-index__header">
        <h1 className="country-index__title">Global Country Risk Ratings</h1>
        <p className="country-index__lead">
          The RegActions Country Risk Score for {index.length} jurisdictions — a
          transparent composite of FATF status, sanctions exposure and World Bank
          governance indicators (higher = higher risk). Enforcement and CPI are shown
          on each country page but not scored.{" "}
          <Link to="/countries/methodology">How it&rsquo;s scored →</Link>
        </p>
      </header>

      {/* KPI cards — band counts (click to filter) + total tracked */}
      <div className="cx-kpis">
        {BAND_ORDER.map((b) => (
          <button
            key={b}
            type="button"
            className={`cx-kpi cx-kpi--${b}${band === b ? " cx-kpi--active" : ""}`}
            onClick={() => setBand(band === b ? "All" : b)}
            aria-pressed={band === b}
          >
            <span className="cx-kpi__value">{counts[b]}</span>
            <span className="cx-kpi__label">{bandLabel(b)} risk</span>
          </button>
        ))}
        <div className="cx-kpi cx-kpi--total">
          <span className="cx-kpi__value">{index.length}</span>
          <span className="cx-kpi__label">Countries tracked</span>
        </div>
      </div>

      {/* Flat map + right rail */}
      <div className="cx-index__main">
        <div className="cx-index__map-wrap">
          <Suspense fallback={<div className="cx-map__ph" style={{ height: 320 }} />}>
            <CountryRiskMap />
          </Suspense>
        </div>

        <aside className="cx-index__rail">
          <div className="mon-panel">
            <div className="cx-panel-head">
              <h3>Highest-risk countries</h3>
              <a href="#full-ranking" className="cx-panel-link">
                View full ranking →
              </a>
            </div>
            <ol className="cx-rank">
              {top.map((e) => (
                <li key={e.country.iso2}>
                  <Link
                    to={`/countries/${countrySlug(e.country)}`}
                    className="cx-rank__row"
                  >
                    <span className="cx-rank__flag" aria-hidden="true">
                      {e.flag}
                    </span>
                    <span className="cx-rank__name">{e.country.name}</span>
                    <span
                      className={`country-ratings__score country-ratings__score--${e.band}`}
                    >
                      {e.score.toFixed(1)}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>

          <div className="mon-panel">
            <h3>Recent FATF changes</h3>
            <p className="mon-change mon-change--add">
              <Plus size={14} /> <strong>Added ({added.length})</strong>
              <span>{added.map((c) => nameOf(c.iso2)).join(", ") || "None"}</span>
            </p>
            <p className="mon-change mon-change--rem">
              <Minus size={14} /> <strong>Removed ({removed.length})</strong>
              <span>{removed.map((c) => nameOf(c.iso2)).join(", ") || "None"}</span>
            </p>
            <Link to="/countries/fatf-grey-list" className="cx-panel-link">
              FATF grey &amp; black list →
            </Link>
          </div>
        </aside>
      </div>

      {/* Bottom analytics — regional overview + risk-by-pillar donut */}
      <div className="cx-index__panels">
        <div className="mon-panel">
          <h3>Regional risk overview</h3>
          <ul className="cx-region-bars">
            {regional.map((r) => (
              <li key={r.region}>
                <span className="cx-region-bars__label">{r.region}</span>
                <span className="cx-region-bars__track">
                  <span
                    className="cx-region-bars__fill"
                    style={{
                      width: `${(r.avg / 10) * 100}%`,
                      background: BAND_COLOUR[bandFor(r.avg)],
                    }}
                  />
                </span>
                <span className="cx-region-bars__val">{r.avg.toFixed(1)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mon-panel">
          <h3>
            Risk by pillar{" "}
            <span className="cx-panel-sub">global average, 0–10</span>
          </h3>
          <div className="mon-donut cx-pillar-donut">
            <div className="cx-pillar-donut__chart">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={pillarData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={52}
                    outerRadius={78}
                    paddingAngle={2}
                  >
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
                  <span
                    className="mon-donut__swatch"
                    style={{ background: PILLAR_FILL[d.key] }}
                  />
                  {d.name}
                  <span className="mon-donut__count">{d.value.toFixed(1)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Full ranked table — filterable, collapsed to top 20 */}
      <section id="full-ranking" className="cx-index__table">
        <div className="cx-table-head">
          <h2 className="cx-table-title">Full ranking</h2>
          <span className="country-index__count">
            {rows.length} shown{band !== "All" ? ` · ${bandLabel(band)}` : ""}
          </span>
        </div>

        <div className="cx-filters">
          <label className="cx-filters__search">
            <Search size={15} />
            <input
              type="search"
              placeholder="Search country"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowAll(false);
              }}
            />
          </label>
          <select
            value={region}
            onChange={(e) => {
              setRegion(e.target.value);
              setShowAll(false);
            }}
            aria-label="Region"
          >
            {regions.map((r) => (
              <option key={r} value={r}>
                {r === "All" ? "All regions" : r}
              </option>
            ))}
          </select>
          <select
            value={fatfFilter}
            onChange={(e) => {
              setFatfFilter(e.target.value as typeof fatfFilter);
              setShowAll(false);
            }}
            aria-label="FATF listing"
          >
            <option value="All">All FATF</option>
            <option value="black">Black list</option>
            <option value="grey">Grey list</option>
            <option value="none">Not listed</option>
          </select>
          <select
            value={sanctionsFilter}
            onChange={(e) => {
              setSanctionsFilter(e.target.value as typeof sanctionsFilter);
              setShowAll(false);
            }}
            aria-label="Sanctions"
          >
            <option value="All">All sanctions</option>
            <option value="comprehensive">Comprehensive</option>
            <option value="sectoral">Sectoral</option>
            <option value="targeted">Targeted</option>
            <option value="none">None</option>
          </select>
          {hasFilters && (
            <button type="button" className="cx-filters__clear" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>

        <table className="country-ratings">
          <thead>
            <tr>
              <th>#</th>
              <th>
                <button type="button" className="cx-sort" onClick={() => toggleSort("name")}>
                  Country{sortArrow("name")}
                </button>
              </th>
              <th className="country-ratings__num">
                <button type="button" className="cx-sort" onClick={() => toggleSort("score")}>
                  Score{sortArrow("score")}
                </button>
              </th>
              <th>Risk</th>
              <th>
                <button type="button" className="cx-sort" onClick={() => toggleSort("region")}>
                  Region{sortArrow("region")}
                </button>
              </th>
              <th>FATF</th>
              <th>Sanctions</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((e, i) => (
              <tr key={e.country.iso2}>
                <td className="country-ratings__rank">{i + 1}</td>
                <td>
                  <Link
                    to={`/countries/${countrySlug(e.country)}`}
                    className="country-ratings__name"
                  >
                    <span aria-hidden="true">{e.flag}</span> {e.country.name}
                  </Link>
                </td>
                <td className="country-ratings__num">
                  <span
                    className={`country-ratings__score country-ratings__score--${e.band}`}
                  >
                    {e.score.toFixed(1)}
                  </span>
                </td>
                <td>{bandLabel(e.band)}</td>
                <td className="country-ratings__region">{e.country.region}</td>
                <td>{e.fatf ? fatfLabel(e.fatf.listing) : "—"}</td>
                <td>{e.sanctionsTier ? sanctionsTierLabel(e.sanctionsTier) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {rows.length > PREVIEW && (
          <button
            type="button"
            className="cx-showall"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? "Show fewer" : `Show all ${rows.length}`}
          </button>
        )}
      </section>

      <footer className="country-hub__sources">
        <span>Sources:</span>{" "}
        <a href={FATF_SOURCE_URL} target="_blank" rel="noopener noreferrer">
          FATF <ExternalLink size={12} />
        </a>{" "}
        · World Bank WGI (CC BY 4.0) · OFAC / UK / EU / UN sanctions
      </footer>
    </div>
  );
}

// ─── FATF grey/black list view (/countries/fatf-grey-list) ──────────────────

interface ListedCountry {
  country: Country;
  fatf: FatfStatus;
  isNew: boolean;
  isUpdated: boolean;
}

const ADDED_ISO2 = new Set(
  FATF_RECENT_CHANGES.filter((c) => c.change === "added").map((c) => c.iso2),
);

function buildListed(): ListedCountry[] {
  return FATF_STATUS.map((fatf) => {
    const country = getCountryByIso2(fatf.iso2);
    return country
      ? {
          country,
          fatf,
          isNew: ADDED_ISO2.has(fatf.iso2),
          isUpdated: isFatfUpdatedThisCycle(fatf.iso2),
        }
      : null;
  }).filter((x): x is ListedCountry => x !== null);
}

const REGION_COLOUR: Record<string, string> = {
  Africa: "#0891b2",
  "Asia Pacific": "#6366f1",
  Europe: "#ec4899",
  "Middle East": "#f59e0b",
  Americas: "#10b981",
  "Offshore / IFC": "#94a3b8",
};

function MonitoringCard({ item }: { item: ListedCountry }) {
  const { country, fatf, isNew, isUpdated } = item;
  const black = fatf.listing === "call-for-action";
  return (
    <Link to={`/countries/${countrySlug(country)}`} className="mon-card">
      <div className="mon-card__top">
        <span className="mon-card__flag" aria-hidden="true">{flagEmoji(country.iso2)}</span>
        <span className="mon-card__id">
          <span className="mon-card__name">{country.name}</span>
          <span className="mon-card__region">{country.region}</span>
        </span>
      </div>
      <div className="mon-card__tags">
        <span className={`mon-pill mon-pill--${black ? "black" : "grey"}`}>
          {black ? "Black list" : "Grey list"}
        </span>
        {isNew && <span className="mon-pill mon-pill--new">New</span>}
        {isUpdated && (
          <span className="mon-pill mon-pill--updated">
            <Clock size={11} /> Updated
          </span>
        )}
        {fatf.since && <span className="mon-card__since">since {formatDate(fatf.since)}</span>}
      </div>
    </Link>
  );
}

function FatfList() {
  const listed = useMemo(buildListed, []);
  const [query, setQuery] = useState("");
  const [listFilter, setListFilter] = useState<"all" | FatfStatus["listing"]>("all");
  const [region, setRegion] = useState("All");
  const [sort, setSort] = useState<"change" | "name" | "region">("change");

  const black = listed.filter((l) => l.fatf.listing === "call-for-action");
  const grey = listed.filter((l) => l.fatf.listing === "increased-monitoring");
  const added = FATF_RECENT_CHANGES.filter((c) => c.change === "added");
  const removed = FATF_RECENT_CHANGES.filter((c) => c.change === "removed");
  const nameOf = (iso2: string) => getCountryByIso2(iso2)?.name ?? iso2;

  const regions = useMemo(
    () => ["All", ...[...new Set(listed.map((l) => l.country.region))].sort()],
    [listed],
  );
  const regionDist = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const l of listed) counts[l.country.region] = (counts[l.country.region] ?? 0) + 1;
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));
  }, [listed]);

  const filterSort = (items: ListedCountry[]) =>
    items
      .filter((l) => listFilter === "all" || l.fatf.listing === listFilter)
      .filter((l) => region === "All" || l.country.region === region)
      .filter((l) => l.country.name.toLowerCase().includes(query.trim().toLowerCase()))
      .sort((a, b) =>
        sort === "name"
          ? a.country.name.localeCompare(b.country.name)
          : sort === "region"
            ? a.country.region.localeCompare(b.country.region) ||
              a.country.name.localeCompare(b.country.name)
            : Number(b.isNew) - Number(a.isNew) ||
              Number(b.isUpdated) - Number(a.isUpdated) ||
              a.country.name.localeCompare(b.country.name),
      );

  const shownBlack = filterSort(black);
  const shownGrey = filterSort(grey);

  const downloadCsv = () => {
    const rows = [
      ["Country", "List", "Region", "Status change", "Since"],
      ...listed.map((l) => [
        l.country.name,
        l.fatf.listing === "call-for-action" ? "Black list" : "Grey list",
        l.country.region,
        l.isNew ? "New" : l.isUpdated ? "Updated" : "",
        l.fatf.since ?? "",
      ]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `fatf-monitoring-${FATF_LAST_PLENARY}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const kpis = [
    { icon: <AlertCircle size={16} />, label: "Black list", sub: "Call for Action", value: black.length, cls: "black" },
    { icon: <Eye size={16} />, label: "Grey list", sub: "Increased Monitoring", value: grey.length, cls: "grey" },
    { icon: <Plus size={16} />, label: "Newly added", sub: "This cycle", value: added.length, cls: "added" },
    { icon: <Minus size={16} />, label: "Removed", sub: "This cycle", value: removed.length, cls: "removed" },
    { icon: <Clock size={16} />, label: "Recently updated", sub: "This cycle", value: FATF_UPDATED_THIS_CYCLE.length, cls: "upd" },
  ];

  return (
    <div className="mon">
      <header className="mon__header">
        <div>
          <h1 className="mon__title">Country Monitoring Command Centre</h1>
          <p className="mon__subtitle">FATF-style AML/CFT monitoring lists and country risk status</p>
        </div>
        <button type="button" className="mon__download" onClick={downloadCsv}>
          <Download size={16} /> Download report
        </button>
      </header>

      <div className="mon__kpis">
        {kpis.map((k) => (
          <div key={k.label} className={`mon-kpi mon-kpi--${k.cls}`}>
            <div className="mon-kpi__head">
              <span className="mon-kpi__icon">{k.icon}</span>
              <span className="mon-kpi__label">
                {k.label}
                <span className="mon-kpi__sub">{k.sub}</span>
              </span>
            </div>
            <span className="mon-kpi__value">{k.value}</span>
          </div>
        ))}
      </div>

      <div className="mon-updates">
        <span className="mon-updates__tag">Latest updates</span>
        {added.length > 0 && (
          <span>
            <strong>Added:</strong> {added.map((c) => nameOf(c.iso2)).join(", ")}
          </span>
        )}
        {removed.length > 0 && (
          <span>
            <strong>Removed:</strong> {removed.map((c) => nameOf(c.iso2)).join(", ")}
          </span>
        )}
        <span className="mon-updates__cycle">Cycle of {formatDate(FATF_LAST_PLENARY)}</span>
      </div>

      <div className="mon__grid">
        <main className="mon__main">
          <div className="mon-controls">
            <label className="mon-search">
              <Search size={15} />
              <input
                type="search"
                placeholder="Search countries"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <select value={listFilter} onChange={(e) => setListFilter(e.target.value as typeof listFilter)}>
              <option value="all">All lists</option>
              <option value="call-for-action">Black list</option>
              <option value="increased-monitoring">Grey list</option>
            </select>
            <select value={region} onChange={(e) => setRegion(e.target.value)}>
              {regions.map((r) => (
                <option key={r} value={r}>{r === "All" ? "All regions" : r}</option>
              ))}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
              <option value="change">Sort: Recent change</option>
              <option value="name">Sort: Name</option>
              <option value="region">Sort: Region</option>
            </select>
          </div>

          {(listFilter === "all" || listFilter === "call-for-action") && shownBlack.length > 0 && (
            <section aria-labelledby="black-heading">
              <h2 id="black-heading" className="mon-section-title mon-section-title--black">
                Black list — Call for Action ({shownBlack.length})
              </h2>
              <div className="mon-cards">
                {shownBlack.map((l) => (
                  <MonitoringCard key={l.country.iso2} item={l} />
                ))}
              </div>
            </section>
          )}

          {(listFilter === "all" || listFilter === "increased-monitoring") && shownGrey.length > 0 && (
            <section aria-labelledby="grey-heading">
              <h2 id="grey-heading" className="mon-section-title mon-section-title--grey">
                Grey list — Increased Monitoring ({shownGrey.length})
              </h2>
              <div className="mon-cards">
                {shownGrey.map((l) => (
                  <MonitoringCard key={l.country.iso2} item={l} />
                ))}
              </div>
            </section>
          )}

          {shownBlack.length === 0 && shownGrey.length === 0 && (
            <p className="mon-empty">No jurisdictions match these filters.</p>
          )}
        </main>

        <aside className="mon__side">
          <div className="mon-panel">
            <h3>What changed this cycle</h3>
            <p className="mon-change mon-change--add">
              <Plus size={14} /> <strong>Added ({added.length})</strong>
              <span>{added.map((c) => nameOf(c.iso2)).join(", ") || "None"}</span>
            </p>
            <p className="mon-change mon-change--rem">
              <Minus size={14} /> <strong>Removed ({removed.length})</strong>
              <span>{removed.map((c) => nameOf(c.iso2)).join(", ") || "None"}</span>
            </p>
            <p className="mon-change mon-change--upd">
              <Clock size={14} /> <strong>Updated ({FATF_UPDATED_THIS_CYCLE.length})</strong>
              <span>{FATF_UPDATED_THIS_CYCLE.map(nameOf).join(", ")}</span>
            </p>
          </div>

          <div className="mon-panel">
            <h3>Regional distribution</h3>
            <div className="mon-donut">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={regionDist} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2}>
                    {regionDist.map((d) => (
                      <Cell key={d.name} fill={REGION_COLOUR[d.name] ?? "#cbd5e1"} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <ul className="mon-donut__legend">
                {regionDist.map((d) => (
                  <li key={d.name}>
                    <span className="mon-donut__swatch" style={{ background: REGION_COLOUR[d.name] ?? "#cbd5e1" }} />
                    {d.name}
                    <span className="mon-donut__count">
                      {d.value} ({Math.round((d.value / listed.length) * 100)}%)
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mon-donut__total">Total countries <strong>{listed.length}</strong></p>
            </div>
          </div>

          <div className="mon-panel">
            <h3>Actions for firms</h3>
            <ul className="mon-actions">
              <li><strong>Review client exposure</strong> — check onboarding and ongoing monitoring for listed countries.</li>
              <li><strong>Enhance due diligence</strong> — apply enhanced due diligence and source-of-funds checks.</li>
              <li><strong>Stay informed</strong> — monitor updates each FATF cycle and regulatory guidance.</li>
            </ul>
          </div>
        </aside>
      </div>

      <footer className="mon__footer">
        <span>
          Source:{" "}
          <a href={FATF_SOURCE_URL} target="_blank" rel="noopener noreferrer">
            FATF public statements <ExternalLink size={11} />
          </a>
        </span>
        <span>Cycle of {formatDate(FATF_LAST_PLENARY)}</span>
        <span>Next review: {formatDate(FATF_NEXT_PLENARY)} (scheduled)</span>
      </footer>
    </div>
  );
}

export function Countries() {
  const { pathname } = useLocation();
  return pathname.endsWith("/fatf-grey-list") ? <FatfList /> : <GlobalIndex />;
}

export default Countries;
