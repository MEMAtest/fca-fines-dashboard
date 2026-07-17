import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  AlertCircle,
  Clock,
  Download,
  Eye,
  ExternalLink,
  Maximize2,
  Minus,
  Plus,
  Search,
  X,
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
import { getCountryByIso2, countrySlug, flagEmoji, type Country } from "../data/countries.js";
import {
  FATF_STATUS,
  FATF_LAST_PLENARY,
  FATF_NEXT_PLENARY,
  FATF_NEXT_PLENARY_START,
  FATF_SOURCE_URL,
  FATF_RECENT_CHANGES,
  FATF_UPDATED_THIS_CYCLE,
  fatfChangesByCycle,
  isFatfUpdatedThisCycle,
  fatfLabel,
  type FatfStatus,
} from "../data/fatfStatus.js";
import { sanctionsTierLabel, type SanctionsTier } from "../data/sanctionsStatus.js";
import {
  bandLabel,
  bandFor,
  scoreBreakdown,
  type RiskBand,
} from "../data/countryRiskScore.js";
import { computeCountryRiskV2 } from "../data/countryRiskV2.js";
import {
  buildCountryIndex,
  regionalAverages,
  pillarAverages,
  globalRank,
  regionRank,
  formatDate,
  type CountryIndexEntry,
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

// ─── Global Country Risk dashboard (default /countries) ─────────────────────

type Tab = "overview" | "map" | "matrix" | "ratings";
type Quadrant = "weak-high" | "strong-high" | "weak-low" | "strong-low";
type RatedCountryIndexEntry = CountryIndexEntry & { score: number; band: RiskBand };

function isRatedEntry(entry: CountryIndexEntry): entry is RatedCountryIndexEntry {
  return entry.score !== null && entry.band !== null;
}

const PILLAR_FILL: Record<string, string> = {
  governance: "#0fa77d",
  fatf: "#dc2626",
  sanctions: "#ea580c",
};

const DRIVER_LABEL: Record<string, string> = {
  corruption: "High corruption",
  ruleOfLaw: "Weak rule of law",
  politicalStability: "Political instability",
  accountability: "Weak accountability",
};

function keyDrivers(iso2: string): string[] {
  const bd = scoreBreakdown(iso2);
  const result = computeCountryRiskV2(iso2);
  if (result.score === null) {
    return ["Headline score withheld: fewer than two v2 pillars are available"];
  }
  const out: string[] = [];
  result.regulatoryFlags.forEach((flag) => out.push(flag.label));
  bd.domains
    .filter((d) => d.risk !== null && (d.risk as number) >= 5)
    .sort((a, b) => (b.risk as number) - (a.risk as number))
    .forEach((d) => {
      if (out.length < 4) out.push(DRIVER_LABEL[d.key] ?? d.label);
    });
  if (result.status === "provisional") out.push("Provisional: one pillar unavailable");
  return out.length ? out.slice(0, 4) : ["No elevated regulatory flag identified"];
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
          <span className={`cx-detail__band cx-detail__band--${entry.band ?? "insufficient"}`}>
            {hasScore ? `${bandLabel(entry.band!)} risk` : "Insufficient data"}
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
          <span className="cx-detail__cap">{hasScore ? "Overall / 10" : "Score withheld"}</span>
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
}: any) {
  return (
    <div className="cx-filters">
      <label className="cx-filters__search">
        <Search size={15} />
        <input type="search" placeholder="Search country" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
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
        aria-label="Sanctions"
        disabled={!sanctionsScoringReady}
        title={sanctionsScoringReady ? undefined : "Official sanctions evidence is incomplete"}
      >
        <option value="All">{sanctionsScoringReady ? "All sanctions" : "Evidence incomplete"}</option>
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

// ─── Overview tab (default) — the #21 report-style landing ───────────────────
function OverviewTab({
  onRegion,
  onBand,
}: {
  onRegion: (region: string) => void;
  onBand: (band: RiskBand) => void;
}) {
  const index = useMemo(() => buildCountryIndex(), []);
  const [mapExpanded, setMapExpanded] = useState(false);
  useEffect(() => {
    if (!mapExpanded) return;
    const opener = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // lock the page behind the modal
    const closeBtn = document.querySelector<HTMLElement>(".cx-mapzoom-overlay__close");
    closeBtn?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMapExpanded(false);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, [mapExpanded]);
  const total = index.filter(isRatedEntry).length;
  const insufficient = index.length - total;
  const counts = useMemo(() => {
    const c: Record<RiskBand, number> = { low: 0, moderate: 0, high: 0, "very-high": 0 };
    for (const e of index) if (e.band) c[e.band] += 1;
    return c;
  }, [index]);
  const fatfCounts = useMemo(() => {
    let black = 0;
    let grey = 0;
    for (const e of index) {
      if (e.fatf?.listing === "call-for-action") black += 1;
      else if (e.fatf?.listing === "increased-monitoring") grey += 1;
    }
    return { black, grey };
  }, [index]);
  const regionStats = useMemo(() => regionalAverages(), []);
  const [findQ, setFindQ] = useState("");
  const findMatches = useMemo(() => {
    const q = findQ.trim().toLowerCase();
    if (!q) return [];
    return index
      .filter(
        (e) =>
          e.country.name.toLowerCase().includes(q) ||
          e.country.iso2.toLowerCase() === q ||
          e.country.iso3.toLowerCase() === q,
      )
      .slice(0, 6);
  }, [index, findQ]);
  const added = FATF_RECENT_CHANGES.filter((c) => c.change === "added");
  const removed = FATF_RECENT_CHANGES.filter((c) => c.change === "removed");
  const nameOf = (iso2: string) => getCountryByIso2(iso2)?.name ?? iso2;
  const top = useMemo(() => index.filter(isRatedEntry).slice(0, 8), [index]);
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const regionDonut = useMemo(
    () => [...regionStats].map((r) => ({ name: r.region, value: r.count, avg: r.avg })).sort((a, b) => b.value - a.value),
    [regionStats],
  );
  const topRegions = useMemo(
    () => [...regionStats].sort((a, b) => b.avg - a.avg).slice(0, 2).map((r) => r.region),
    [regionStats],
  );
  const dist: Array<{ band: RiskBand; n: number }> = [
    { band: "low", n: counts.low },
    { band: "moderate", n: counts.moderate },
    { band: "high", n: counts.high },
    { band: "very-high", n: counts["very-high"] },
  ];

  return (
    <div className="cx-ov">
      <div className="cx-ov__top">
        <div className="mon-panel cx-ov__heat">
          <button
            type="button"
            className="cx-mapzoom-expand"
            aria-label="Expand the risk heat map"
            onClick={() => setMapExpanded(true)}
          >
            <Maximize2 size={13} aria-hidden="true" />
          </button>
          <h3>Global risk heat map</h3>
          <Suspense fallback={<div className="cx-map__ph" style={{ height: 320 }} />}>
            <CountryRiskMap />
          </Suspense>
        </div>
        <div className="cx-ov__side">
          <div className="mon-panel">
            <h3>Risk distribution</h3>
            <div className="cx-dist__bar">
              {dist.map((d) =>
                d.n > 0 ? (
                  <button type="button" key={d.band} className={`cx-dist__seg cx-dist__seg--${d.band}`} style={{ flexGrow: d.n }} onClick={() => onBand(d.band)} aria-label={`Show ${bandLabel(d.band)} risk countries`} title={`${bandLabel(d.band)}: ${d.n}`} />
                ) : null,
              )}
            </div>
            <ul className="cx-dist__legend">
              {dist.map((d) => (
                <li key={d.band}>
                  <button type="button" className="cx-drill" onClick={() => onBand(d.band)}>
                    <span className={`cx-dist__dot cx-dist__dot--${d.band}`} />
                    {bandLabel(d.band)}
                    <span className="cx-dist__n">{d.n} ({pct(d.n)}%)</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Quick jump to a country report */}
          <div className="mon-panel cx-ovfind">
            <h3>Find a country</h3>
            <input
              type="search"
              className="cx-ovfind__input"
              placeholder="Search 211 jurisdictions…"
              value={findQ}
              onChange={(e) => setFindQ(e.target.value)}
              aria-label="Search for a country report"
            />
            {findQ.trim() && (
              <ul className="cx-ovfind__list">
                {findMatches.length === 0 && (
                  <li className="cx-ovfind__none">No match for &ldquo;{findQ.trim()}&rdquo;</li>
                )}
                {findMatches.map((e) => (
                  <li key={e.country.iso2}>
                    <Link to={`/countries/${countrySlug(e.country)}`} className="cx-ovfind__row">
                      <span aria-hidden="true">{e.flag}</span>
                      <span className="cx-ovfind__name">{e.country.name}</span>
                      {e.score !== null ? (
                        <span className={`country-ratings__score country-ratings__score--${e.band}`}>
                          {e.score.toFixed(1)}
                        </span>
                      ) : (
                        <span className="cx-ovfind__nr">Not rated</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Regional averages — click a region to drill into its list */}
          <div className="mon-panel">
            <h3>Average score by region</h3>
            <ul className="cx-region-bars">
              {[...regionStats].sort((a, b) => b.avg - a.avg).map((r) => (
                <li key={r.region}>
                  <button type="button" className="cx-drill" onClick={() => onRegion(r.region)}>
                    <span className="cx-region-bars__label">{r.region}</span>
                    <span className="cx-region-bars__track">
                      <span className="cx-region-bars__fill" style={{ width: `${(r.avg / 10) * 100}%`, background: BAND_COLOUR[bandFor(r.avg)] }} />
                    </span>
                    <span className="cx-region-bars__val">{r.avg.toFixed(1)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="cx-ov__mid">
        <div className="mon-panel">
          <div className="cx-panel-head">
            <h3>Top attention countries</h3>
            <Link to="/countries/fatf-grey-list" className="cx-panel-link">View all →</Link>
          </div>
          <div className="cx-attn">
            {top.slice(0, 6).map((e) => (
              <Link key={e.country.iso2} to={`/countries/${countrySlug(e.country)}`} className="cx-attn__card">
                <span className="cx-attn__flag" aria-hidden="true">{e.flag}</span>
                <span className="cx-attn__name">{e.country.name}</span>
                <span className={`country-ratings__score country-ratings__score--${e.band}`}>{e.score.toFixed(1)}</span>
                <span className="cx-attn__sub">{e.country.region}</span>
              </Link>
            ))}
          </div>
        </div>
        <div className="mon-panel">
          <h3>FATF changes this cycle</h3>
          <p className="mon-change mon-change--add">
            <Plus size={14} /> <strong>Added ({added.length})</strong>
            <span>{added.map((c) => nameOf(c.iso2)).join(", ") || "None"}</span>
          </p>
          <p className="mon-change mon-change--rem">
            <Minus size={14} /> <strong>Removed ({removed.length})</strong>
            <span>{removed.map((c) => nameOf(c.iso2)).join(", ") || "None"}</span>
          </p>
          <p className="cx-plenary-chip">Next FATF plenary · <b>{formatDate(FATF_NEXT_PLENARY)}</b></p>
          <Link to="/countries/fatf-grey-list" className="cx-panel-link">FATF monitoring centre →</Link>
        </div>
        <div className="mon-panel">
          <h3>Regional breakdown</h3>
          <div className="mon-donut">
            <ResponsiveContainer width="100%" height={170}>
              <PieChart>
                <Pie data={regionDonut} dataKey="value" nameKey="name" innerRadius={44} outerRadius={68} paddingAngle={2} onClick={(d: { name?: string }) => d?.name && onRegion(d.name)} cursor="pointer">
                  {regionDonut.map((d) => (
                    <Cell key={d.name} fill={REGION_COLOUR[d.name] ?? "#cbd5e1"} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as { name: string; value: number; avg: number };
                    const share = total > 0 ? Math.round((d.value / total) * 100) : 0;
                    return (
                      <div className="cx-donut-tip">
                        <strong>{d.name}</strong>
                        <span>{d.value} countries · {share}% of rated</span>
                        <span>Average score {d.avg.toFixed(1)}/10</span>
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <ul className="mon-donut__legend">
              {regionDonut.map((d) => (
                <li key={d.name}>
                  <button type="button" className="cx-drill" onClick={() => onRegion(d.name)}>
                    <span className="mon-donut__swatch" style={{ background: REGION_COLOUR[d.name] ?? "#cbd5e1" }} />
                    {d.name}
                    <span className="mon-donut__count">{d.value}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mon-panel">
          <h3>What firms should do</h3>
          <ul className="mon-actions">
            <li><strong>Review client exposure</strong> in high-risk and FATF-listed jurisdictions.</li>
            <li><strong>Apply enhanced due diligence</strong> and source-of-funds checks.</li>
            <li><strong>Monitor changes</strong> each FATF cycle and in the methodology.</li>
          </ul>
        </div>
      </div>

      <div className="cx-ov__bot">
        <div className="mon-panel cx-ov__table">
          <div className="cx-panel-head">
            <h3>Highest-risk countries</h3>
            <span className="cx-panel-sub">Top 8</span>
          </div>
          <table className="country-ratings">
            <thead>
              <tr>
                <th>#</th>
                <th>Country</th>
                <th className="country-ratings__num">Score</th>
                <th>Risk</th>
                <th>Region</th>
                <th>FATF</th>
              </tr>
            </thead>
            <tbody>
              {top.map((e, i) => (
                <tr key={e.country.iso2}>
                  <td className="country-ratings__rank">{i + 1}</td>
                  <td>
                    <Link to={`/countries/${countrySlug(e.country)}`} className="country-ratings__name">
                      <span aria-hidden="true">{e.flag}</span> {e.country.name}
                    </Link>
                  </td>
                  <td className="country-ratings__num">
                    <span className={`country-ratings__score country-ratings__score--${e.band}`}>{e.score.toFixed(1)}</span>
                  </td>
                  <td>{bandLabel(e.band)}</td>
                  <td className="country-ratings__region">{e.country.region}</td>
                  <td>{e.fatf ? fatfLabel(e.fatf.listing) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mon-panel cx-ov__exec">
          <h3>Executive summary</h3>
          <p className="cx-ov__exec-p">
            Of {total} rated jurisdictions, {fatfCounts.black} are on the FATF black list ({pct(fatfCounts.black)}%)
            and {fatfCounts.grey} on the grey list ({pct(fatfCounts.grey)}%). {counts.high + counts["very-high"]}{" "}
            score High or above ({pct(counts.high + counts["very-high"])}%).
          </p>
          <h4 className="cx-ov__watch-title">Key watch areas</h4>
          <ul className="cx-prose__bullets">
            <li>Highest-risk regions: {topRegions.join(" and ")}.</li>
            <li>{fatfCounts.black + fatfCounts.grey} jurisdictions under FATF monitoring.</li>
            <li>{insufficient} jurisdictions have no headline score because the required governance evidence is unavailable.</li>
            <li>Governance quality is the primary risk driver across the index.</li>
          </ul>
          <Link to="/countries/methodology" className="cx-panel-link">View methodology →</Link>
        </div>
      </div>

      {mapExpanded && (
        <div
          className="cx-mapzoom-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Expanded global risk heat map"
          onClick={() => setMapExpanded(false)}
        >
          <div className="cx-mapzoom-overlay__panel" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="cx-mapzoom-overlay__close"
              aria-label="Close expanded map"
              onClick={() => setMapExpanded(false)}
            >
              <X size={16} aria-hidden="true" />
            </button>
            <h3>Global risk heat map</h3>
            <Suspense fallback={<div className="cx-map__ph" style={{ height: 480 }} />}>
              <CountryRiskMap variant="overlay" />
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
}

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
    index.filter(isRatedEntry).forEach((e, i) => m.set(e.country.iso2, i + 1));
    return m;
  }, [index]);

  // No auto-selection: the detail panel appears only after the user clicks.
  const selectedEntry = useMemo(
    () => (selectedIso ? (index.find((e) => e.country.iso2 === selectedIso) ?? null) : null),
    [index, selectedIso],
  );

  const top = useMemo(() => index.filter(isRatedEntry).slice(0, 12), [index]);
  const regional = useMemo(() => regionalAverages(), []);
  const pillars = useMemo(() => pillarAverages(), []);
  const overall = useMemo(
    () =>
      ratedCount
        ? Math.round((index.reduce((s, e) => s + (e.score ?? 0), 0) / ratedCount) * 10) / 10
        : 0,
    [index, ratedCount],
  );
  const added = FATF_RECENT_CHANGES.filter((c) => c.change === "added");
  const removed = FATF_RECENT_CHANGES.filter((c) => c.change === "removed");
  const nameOf = (iso2: string) => getCountryByIso2(iso2)?.name ?? iso2;

  const pillarData = [
    { key: "governance", name: "Governance contribution", value: pillars.governance },
    { key: "fatf", name: "AML/CFT contribution", value: pillars.fatf },
    { key: "sanctions", name: "Sanctions contribution", value: pillars.sanctions },
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
    { label: "Complete", value: completeCount, cls: "rated", pressed: statusFilter === "complete", onClick: () => setStatusFilter(statusFilter === "complete" ? "All" : "complete") },
    { label: "Provisional", value: provisionalCount, cls: "insufficient", pressed: statusFilter === "provisional", onClick: () => setStatusFilter(statusFilter === "provisional" ? "All" : "provisional") },
    { label: "Black list", value: fatfCounts.black, cls: "black", pressed: fatfFilter === "black", onClick: () => setFatfFilter(fatfFilter === "black" ? "All" : "black") },
    { label: "Grey list", value: fatfCounts.grey, cls: "grey", pressed: fatfFilter === "grey", onClick: () => setFatfFilter(fatfFilter === "grey" ? "All" : "grey") },
    { label: "High risk", value: counts.high + counts["very-high"], cls: "high", pressed: band === "high", onClick: () => setBand(band === "high" ? "All" : "high") },
    { label: "Moderate", value: counts.moderate, cls: "moderate", pressed: band === "moderate", onClick: () => setBand(band === "moderate" ? "All" : "moderate") },
  ];

  const PREVIEW = 25;
  const visibleRows = showAll ? rows : rows.slice(0, PREVIEW);

  return (
    <div className="cx-dash">
      <header className="cx-dash__head">
        <h1 className="country-index__title">Global Country Risk Ratings</h1>
        <p className="cx-dash__lead">
          Country-by-country AML and financial-crime risk coverage for {index.length} jurisdictions.
          {" "}{completeCount} v2 scores are complete and {provisionalCount} are explicitly provisional;
          {insufficientCount ? ` ${insufficientCount} are withheld because fewer than two pillars are available.` : " no headline score is currently withheld."}
          The sanctions pillar is based on a complete deterministic official-evidence snapshot.
          Enforcement volume and corruption perception are shown for context but never scored.{" "}
          <Link to="/countries/methodology">How the score works →</Link>
          {" · "}
          <Link to="/countries/changes">What changed →</Link>
        </p>
      </header>

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
        {(["overview", "map", "matrix", "ratings"] as Tab[]).map((t) => (
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
                      {bandLabel(b)}
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
                <span className="cx-rail__title">Sanctions exposure</span>
                <select
                  value={sanctionsFilter}
                  onChange={(e) => setSanctionsFilter(e.target.value as typeof sanctionsFilter)}
                  disabled={!sanctionsScoringReady}
                  title={sanctionsScoringReady ? undefined : "Official sanctions evidence is incomplete"}
                >
                  <option value="All">{sanctionsScoringReady ? "All" : "Evidence incomplete"}</option>
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
                    title={sanctionsScoringReady ? undefined : "Official sanctions evidence is incomplete"}
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
          />
          <p className="country-index__count">{rows.length} shown</p>
          <table className="country-ratings">
            <thead>
              <tr>
                <th>#</th>
                <th><button type="button" className="cx-sort" onClick={() => toggleSort("name")}>Country{sortArrow("name")}</button></th>
                <th className="country-ratings__num"><button type="button" className="cx-sort" onClick={() => toggleSort("score")}>Score · v2{sortArrow("score")}</button></th>
                <th>Risk</th>
                <th><button type="button" className="cx-sort" onClick={() => toggleSort("region")}>Region{sortArrow("region")}</button></th>
                <th>FATF</th>
                <th>Sanctions · v2</th>
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
                  <td>{e.band ? `${bandLabel(e.band)}${e.status === "provisional" ? " · provisional" : ""}` : "Insufficient data"}</td>
                  <td className="country-ratings__region">{e.country.region}</td>
                  <td>{e.fatf ? fatfLabel(e.fatf.listing) : "—"}</td>
                  <td>{e.sanctionsCoverageComplete
                    ? e.sanctionsTier
                      ? sanctionsTierLabel(e.sanctionsTier)
                      : "No direct regime"
                    : "Evidence incomplete"}</td>
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

      <footer className="country-hub__sources">
        <span>Sources:</span>{" "}
        <a href={FATF_SOURCE_URL} target="_blank" rel="noopener noreferrer">FATF <ExternalLink size={12} /></a>{" "}
        · World Bank WGI (CC BY 4.0) · OFAC / UK / EU / UN sanctions · TI CPI (display)
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

// Whole days from today (UTC) until an ISO date; negative once past.
function daysUntil(iso: string): number {
  const target = new Date(`${iso}T00:00:00Z`).getTime();
  const now = Date.now();
  return Math.ceil((target - now) / 86_400_000);
}

// Honest countdown phrasing. The plenary runs over several days and the exact
// start can shift, so we say "expected" and never render a stale/negative count.
function nextPlenaryChip(): string {
  const label = formatDate(FATF_NEXT_PLENARY); // month precision, e.g. "Oct 2026"
  const n = daysUntil(FATF_NEXT_PLENARY_START);
  if (n > 1) return `Next plenary: expected ${label} · in ${n} days`;
  if (n === 1) return `Next plenary: expected ${label} · tomorrow`;
  if (n === 0) return `Next plenary: expected ${label} · today`;
  return `Next plenary: expected ${label}`;
}

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
  const cycles = useMemo(fatfChangesByCycle, []);
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
          <p className="mon__asof">
            <strong>{grey.length}</strong> jurisdictions under increased monitoring
            {" · "}as of {formatDate(FATF_LAST_PLENARY)}
            {" · "}next FATF plenary {formatDate(FATF_NEXT_PLENARY)}
          </p>
        </div>
        <div className="mon__header-actions">
          <span className="mon__countdown">
            <Clock size={13} /> {nextPlenaryChip()}
          </span>
          <Link to="/countries/changes" className="mon__changes-link">
            What changed →
          </Link>
          <button type="button" className="mon__download" onClick={downloadCsv}>
            <Download size={16} /> Download report
          </button>
        </div>
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

          <div className="mon-panel mon-changelog">
            <h3>Plenary change-log</h3>
            <ol className="mon-changelog__list">
              {cycles.map((cy) => (
                <li key={cy.date} className="mon-changelog__cycle">
                  <div className="mon-changelog__head">
                    <span className="mon-changelog__label">{cy.label}</span>
                    <span className="mon-changelog__date">{formatDate(cy.date)}</span>
                  </div>
                  {cy.added.length > 0 && (
                    <p className="mon-change mon-change--add">
                      <Plus size={13} /> <strong>Added</strong>
                      <span>{cy.added.map((c) => nameOf(c.iso2)).join(", ")}</span>
                    </p>
                  )}
                  {cy.removed.length > 0 && (
                    <p className="mon-change mon-change--rem">
                      <Minus size={13} /> <strong>Removed</strong>
                      <span>{cy.removed.map((c) => nameOf(c.iso2)).join(", ")}</span>
                    </p>
                  )}
                </li>
              ))}
            </ol>
            <p className="mon-changelog__src">
              Verified against FATF plenary outcomes.{" "}
              <a href={FATF_SOURCE_URL} target="_blank" rel="noopener noreferrer">
                FATF black &amp; grey lists <ExternalLink size={11} />
              </a>
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
