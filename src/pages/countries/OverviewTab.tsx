import {
  Suspense,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Link,
} from "react-router-dom";
import {
  AlertCircle,
  AlertTriangle,
  Clock,
  Eye,
  HelpCircle,
  Maximize2,
  Minus,
  Plus,
  Shield,
  ShieldAlert,
  X,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import {
  getCountryByIso2,
  countrySlug,
  type Country,
} from "../../data/countries.js";
import {
  FATF_NEXT_PLENARY,
  FATF_RECENT_CHANGES,
  fatfLabel,
} from "../../data/fatfStatus.js";

import {
  unscoredStatusLabel,
} from "../../data/unscoredStatus.js";
import {
  bandFor,
  type RiskBand,
} from "../../data/countryRiskScore.js";



import {
  countryRiskV3BandLabel,
} from "../../data/countryRiskV3Presentation.js";
import {
  buildCountryIndex,
  regionalAverages,
  formatDate,
  type CountryIndexEntry,
} from "../../data/countryView.js";
import {
  buildCountryChanges,
  type ChangeEvent,
} from "../../data/countryChanges.js";

import "../../styles/country-hub.css";
import {
  REGION_COLOUR,
} from "./FatfList.js";

import { BAND_COLOUR, CountryRiskMap, isRatedEntry, isPreciselyRankedEntry } from "./shared.js";

export function SectionHead({ num, title }: { num: string; title: string }) {
  return (
    <div className="cx-secnum-row">
      <span className="cx-secnum">{num}</span>
      <h2 className="cx-secnum-title">{title}</h2>
      <span className="cx-secnum-rule" aria-hidden="true" />
    </div>
  );
}

// ─── 5 band KPI cards ─────────────────────────────────────────────────────────
// No delta chip or sparkline: the composite score has exactly two historical
// snapshots today and neither carries the current methodology version, so
// `scoreDeltaEvents()` (src/data/countryChanges.ts) returns no comparable
// "vs last cycle" movement yet. Rather than invent a number, this renders the
// count and its real definition only.
export function BandKpiCards({
  counts,
  insufficientCount,
  onBand,
}: {
  counts: Record<RiskBand, number>;
  insufficientCount: number;
  onBand: (band: RiskBand) => void;
}) {
  const cards: Array<{
    key: string;
    label: string;
    value: number;
    note: string;
    icon: typeof ShieldAlert;
    color: string;
    onClick?: () => void;
  }> = [
    { key: "very-high", label: "Very high risk", value: counts["very-high"], note: "Score 7.0–10 on the composite index.", icon: ShieldAlert, color: BAND_COLOUR["very-high"], onClick: () => onBand("very-high") },
    { key: "high", label: "High risk", value: counts.high, note: "Score 5.0–6.9. Enhanced diligence is the default tier.", icon: AlertTriangle, color: BAND_COLOUR.high, onClick: () => onBand("high") },
    { key: "moderate", label: "Moderate risk", value: counts.moderate, note: "Score 3.0–4.9. Standard diligence with periodic review.", icon: AlertCircle, color: BAND_COLOUR.moderate, onClick: () => onBand("moderate") },
    { key: "low", label: "Lower risk", value: counts.low, note: "Score 0–2.9. Country risk is one input; apply relevant legal and customer-level controls.", icon: Shield, color: BAND_COLOUR.low, onClick: () => onBand("low") },
    { key: "insufficient", label: "Not enough information", value: insufficientCount, note: "Missing governance evidence — never scored as zero risk.", icon: HelpCircle, color: "#64748b" },
  ];
  return (
    <div className="cx-ov__bands">
      {cards.map((c) => {
        const Icon = c.icon;
        const body = (
          <>
            <span className="cx-ovband__head">
              <span className="cx-ovband__icon" style={{ background: `${c.color}1a`, color: c.color }}>
                <Icon size={15} aria-hidden="true" />
              </span>
              <span className="cx-ovband__label">{c.label}</span>
            </span>
            <span className="cx-ovband__value">{c.value}</span>
            <span className="cx-ovband__note">{c.note}</span>
          </>
        );
        return c.onClick ? (
          <button type="button" key={c.key} className="cx-ovband cx-ovband--btn" onClick={c.onClick}>
            {body}
          </button>
        ) : (
          <div key={c.key} className="cx-ovband">
            {body}
          </div>
        );
      })}
    </div>
  );
}

// ─── "Changes this cycle" card ────────────────────────────────────────────────
// Uses the real dated change feed (FATF plenary outcomes, sanctions regimes,
// EU tax list — src/data/countryChanges.ts). No score-based "improved/
// worsened" count is shown: see the BandKpiCards comment above for why.
function ChangesThisCycleCard({ added, removed }: { added: number; removed: number }) {
  const events = useMemo(() => buildCountryChanges(), []);
  return (
    <div className="mon-panel cx-ov__changes">
      <h3>Changes this cycle</h3>
      <div className="cx-ovchg__row">
        <div className="cx-ovchg__stat cx-ovchg__stat--add">
          <span className="cx-ovchg__n">{added}</span>
          <span className="cx-ovchg__l">added to a FATF list</span>
        </div>
        <div className="cx-ovchg__stat cx-ovchg__stat--rem">
          <span className="cx-ovchg__n">{removed}</span>
          <span className="cx-ovchg__l">removed from a FATF list</span>
        </div>
      </div>
      <p className="cx-card__note">
        {events.length} dated changes are tracked across FATF listings, sanctions regimes and the
        EU tax list.
      </p>
      <Link to="/countries/changes" className="cx-panel-link">
        View all {events.length} changes →
      </Link>
    </div>
  );
}

// ─── "Recent highlights" table (Jurisdiction / Score / Band / Latest change / Reviewed) ──
// Rows are jurisdictions with at least one real dated change on record, most
// recent first — a different shape and a different selection (change-driven,
// not score-ranked) from the "Highest-risk countries" table below.
function RecentHighlightsTable({ index }: { index: CountryIndexEntry[] }) {
  const events = useMemo(() => buildCountryChanges(), []);
  const rows = useMemo(() => {
    const byIso = new Map<string, ChangeEvent>();
    for (const e of events) {
      if (e.scope !== "country" || !e.iso2) continue;
      if (!byIso.has(e.iso2)) byIso.set(e.iso2, e); // events are already newest-first
    }
    return [...byIso.entries()]
      .map(([iso2, event]) => {
        const entry = index.find((i) => i.country.iso2 === iso2);
        return entry ? { entry, event } : null;
      })
      .filter((r): r is { entry: CountryIndexEntry; event: ChangeEvent } => r !== null)
      .sort((a, b) => b.event.date.localeCompare(a.event.date))
      .slice(0, 8);
  }, [events, index]);

  return (
    <div className="mon-panel cx-ov__recent">
      <div className="cx-panel-head">
        <h3>Recent highlights</h3>
        <Link to="/countries/changes" className="cx-panel-link">View all →</Link>
      </div>
      {rows.length === 0 ? (
        <p className="cx-card__note">No dated changes are currently tracked for individual jurisdictions.</p>
      ) : (
        <table className="country-ratings cx-recent-table">
          <thead>
            <tr>
              <th>Jurisdiction</th>
              <th className="country-ratings__num">Score</th>
              <th>Band</th>
              <th>Latest change</th>
              <th className="country-ratings__num">Reviewed</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ entry, event }) => (
              <tr key={entry.country.iso2}>
                <td>
                  <Link to={`/countries/${countrySlug(entry.country)}`} className="country-ratings__name">
                    <span aria-hidden="true">{entry.flag}</span> {entry.country.name}
                  </Link>
                </td>
                <td className="country-ratings__num">
                  {entry.score !== null ? (
                    <span className={`country-ratings__score country-ratings__score--${entry.band}`}>
                      {entry.score.toFixed(1)}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td>{entry.band ? countryRiskV3BandLabel(entry.band) : unscoredStatusLabel(entry.country.iso2)}</td>
                <td className="cx-recent-table__change">{event.title}</td>
                <td className="country-ratings__num cx-recent-table__date">{formatDate(event.date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Band definitions card ────────────────────────────────────────────────────
const BAND_DEFS: Array<{ band: RiskBand; range: string; note: string }> = [
  { band: "very-high", range: "7.0–10", note: "Enhanced due diligence as a baseline; senior sign-off for new relationships." },
  { band: "high", range: "5.0–6.9", note: "Enhanced due diligence and source-of-funds checks are the default tier." },
  { band: "moderate", range: "3.0–4.9", note: "Standard due diligence with periodic review." },
  { band: "low", range: "0–2.9", note: "Lower underlying country risk; sanctions, customer, product and transaction controls still apply independently." },
];

function BandDefinitionsCard() {
  return (
    <div className="mon-panel cx-ov__banddefs">
      <h3>Band definitions</h3>
      <div className="cx-banddefs">
        {BAND_DEFS.map((d) => (
          <div key={d.band} className="cx-banddefs__row">
            <span className="cx-banddefs__label">
              <span className={`cx-dist__dot cx-dist__dot--${d.band}`} aria-hidden="true" />
              {countryRiskV3BandLabel(d.band)}
            </span>
            <span className="cx-banddefs__range">{d.range}</span>
            <span className="cx-banddefs__note">{d.note}</span>
          </div>
        ))}
      </div>
      <Link to="/countries/methodology" className="cx-panel-link">View full scoring methodology →</Link>
    </div>
  );
}

// ─── Scoring notes card ────────────────────────────────────────────────────────
const SCORING_NOTES: Array<{ icon: typeof HelpCircle; title: string; body: string }> = [
  {
    icon: HelpCircle,
    title: "Missing data is never zero risk",
    body: "Countries without enough governance evidence carry no headline score, rather than a default of “low risk”.",
  },
  {
    icon: Eye,
    title: "Enforcement is context, not input",
    body: "Enforcement volume and corruption perception are shown for context but do not move the composite score.",
  },
  {
    icon: Clock,
    title: "Reviewed every FATF cycle",
    body: "Scores are re-checked at each FATF plenary and whenever the underlying governance or sanctions data refreshes.",
  },
];

function ScoringNotesCard() {
  return (
    <div className="mon-panel cx-ov__scoringnotes">
      <h3>Scoring notes</h3>
      <ul className="cx-scoringnotes">
        {SCORING_NOTES.map((n) => {
          const Icon = n.icon;
          return (
            <li key={n.title}>
              <span className="cx-scoringnotes__ico">
                <Icon size={14} aria-hidden="true" />
              </span>
              <span>
                <span className="cx-scoringnotes__title">{n.title}</span>
                <span className="cx-scoringnotes__body">{n.body}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Overview tab (default) — the #21 report-style landing ───────────────────
export function OverviewTab({
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
  const added = FATF_RECENT_CHANGES.filter((c) => c.change === "added");
  const removed = FATF_RECENT_CHANGES.filter((c) => c.change === "removed");
  const nameOf = (iso2: string) => getCountryByIso2(iso2)?.name ?? iso2;
  const top = useMemo(() => index.filter(isPreciselyRankedEntry).slice(0, 8), [index]);
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
      <SectionHead num="01" title="The global picture" />
      <BandKpiCards counts={counts} insufficientCount={insufficient} onBand={onBand} />
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
                  <button type="button" key={d.band} className={`cx-dist__seg cx-dist__seg--${d.band}`} style={{ flexGrow: d.n }} onClick={() => onBand(d.band)} aria-label={`Show ${countryRiskV3BandLabel(d.band)} risk countries`} title={`${countryRiskV3BandLabel(d.band)}: ${d.n}`} />
                ) : null,
              )}
            </div>
            <ul className="cx-dist__legend">
              {dist.map((d) => (
                <li key={d.band}>
                  <button type="button" className="cx-drill" onClick={() => onBand(d.band)}>
                    <span className={`cx-dist__dot cx-dist__dot--${d.band}`} />
                    {countryRiskV3BandLabel(d.band)}
                    <span className="cx-dist__n">{d.n} ({pct(d.n)}%)</span>
                  </button>
                </li>
              ))}
            </ul>
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

      <ChangesThisCycleCard added={added.length} removed={removed.length} />

      <SectionHead num="02" title="Where to look first" />
      <div className="cx-ov__highlights">
        <RecentHighlightsTable index={index} />
        <div className="cx-ov__highlights-side">
          <BandDefinitionsCard />
          <ScoringNotesCard />
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
                  <td>{countryRiskV3BandLabel(e.band)}</td>
                  <td className="country-ratings__region">{e.country.region}</td>
                  <td>{e.fatf ? fatfLabel(e.fatf.listing) : <span className="cx-fatf-none">Not listed</span>}</td>
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
            <li>Government effectiveness and rule of law are major drivers across the index.</li>
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
