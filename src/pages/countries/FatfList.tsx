import {
  useMemo,
  useState,
} from "react";
import {
  Link,
} from "react-router-dom";
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
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from "recharts";
import {
  getCountryByIso2,
  countrySlug,
  flagEmoji,
  type Country,
} from "../../data/countries.js";
import {
  FATF_STATUS,
  FATF_LAST_PLENARY,
  FATF_NEXT_PLENARY,
  FATF_NEXT_PLENARY_START,
  FATF_NEXT_PLENARY_START_CONFIRMED,
  FATF_SOURCE_URL,
  FATF_RECENT_CHANGES,
  FATF_UPDATED_THIS_CYCLE,
  fatfChangesByCycle,
  isFatfUpdatedThisCycle,
  type FatfStatus,
} from "../../data/fatfStatus.js";







import {
  formatDate,
} from "../../data/countryView.js";


import "../../styles/country-hub.css";

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

export const REGION_COLOUR: Record<string, string> = {
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
  if (!FATF_NEXT_PLENARY_START_CONFIRMED) return `Next plenary: expected ${label}`;
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

export function FatfList() {
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
          <p className="mon__subtitle">FATF monitoring lists and country risk status</p>
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
