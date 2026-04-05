import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { RegulatorMark } from "../components/RegulatorMark.js";
import {
  LIVE_REGULATOR_NAV_ITEMS,
  PIPELINE_REGULATOR_NAV_ITEMS,
  REGULATOR_NAV_ITEMS,
  type RegulatorCoverage,
} from "../data/regulatorCoverage.js";
import { useSEO } from "../hooks/useSEO.js";
import "../styles/regulators-grid.css";

type RegionFilter =
  | "all"
  | "europe"
  | "americas"
  | "apac"
  | "mena_africa"
  | "offshore";

type SortMode = "actions_desc" | "actions_asc" | "name_asc";

const REGION_TABS: Array<{ key: RegionFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "europe", label: "Europe" },
  { key: "americas", label: "Americas" },
  { key: "apac", label: "APAC" },
  { key: "mena_africa", label: "MENA & Africa" },
  { key: "offshore", label: "Offshore" },
];

function matchesRegion(
  coverage: RegulatorCoverage,
  filter: RegionFilter,
): boolean {
  if (filter === "all") return true;
  switch (filter) {
    case "europe":
      return coverage.region === "UK" || coverage.region === "Europe";
    case "americas":
      return (
        coverage.region === "North America" ||
        coverage.region === "Latin America"
      );
    case "apac":
      return coverage.region === "APAC";
    case "mena_africa":
      return coverage.region === "MENA" || coverage.region === "Africa";
    case "offshore":
      return coverage.region === "Offshore";
    default:
      return true;
  }
}

function sortRegulators(
  items: RegulatorCoverage[],
  mode: SortMode,
): RegulatorCoverage[] {
  const sorted = [...items];
  switch (mode) {
    case "actions_desc":
      return sorted.sort((a, b) => b.count - a.count);
    case "actions_asc":
      return sorted.sort((a, b) => a.count - b.count);
    case "name_asc":
      return sorted.sort((a, b) => a.code.localeCompare(b.code));
    default:
      return sorted;
  }
}

export function Regulators() {
  useSEO({
    title:
      "Consolidated Global Regulator Intelligence | Live Hubs & Expansion Pipeline",
    description:
      "Interactive grid of live and pipeline financial regulators. Filter by region, sort by enforcement actions, and explore regulator hubs.",
  });

  const [regionFilter, setRegionFilter] = useState<RegionFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("actions_desc");
  const [showAll, setShowAll] = useState(false);

  const allItems = REGULATOR_NAV_ITEMS;

  const filteredItems = useMemo(() => {
    const base = showAll ? allItems : LIVE_REGULATOR_NAV_ITEMS;
    const regionFiltered = base.filter((r) => matchesRegion(r, regionFilter));
    return sortRegulators(regionFiltered, sortMode);
  }, [allItems, showAll, regionFilter, sortMode]);

  const liveCount = LIVE_REGULATOR_NAV_ITEMS.length;
  const pipelineCount = PIPELINE_REGULATOR_NAV_ITEMS.length;
  const totalActions = LIVE_REGULATOR_NAV_ITEMS.reduce(
    (sum, r) => sum + r.count,
    0,
  );

  return (
    <div className="reg-grid-page">
      <div className="reg-grid-page__header">
        <h1 className="reg-grid-page__title">
          Consolidated Global Regulator Intelligence
        </h1>
        <p className="reg-grid-page__subtitle">
          Built on deep FCA history, with additional insights from{" "}
          {liveCount - 1} other financial regulators.{" "}
          {pipelineCount} more in the validated pipeline.
        </p>
      </div>

      {/* Controls */}
      <div className="reg-grid__controls">
        <div className="reg-grid__filters">
          {REGION_TABS.map((tab) => (
            <button
              key={tab.key}
              className={`reg-grid__filter-tab${regionFilter === tab.key ? " reg-grid__filter-tab--active" : ""}`}
              onClick={() => setRegionFilter(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <select
          className="reg-grid__sort"
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
        >
          <option value="actions_desc">Actions: High → Low</option>
          <option value="actions_asc">Actions: Low → High</option>
          <option value="name_asc">Name: A → Z</option>
        </select>

        <button
          className={`reg-grid__toggle${showAll ? " reg-grid__toggle--active" : ""}`}
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? "Live + Pipeline" : "Live only"}
        </button>
      </div>

      {/* Summary stats */}
      <div className="reg-grid__stats">
        <span>
          Showing <strong>{filteredItems.length}</strong> regulators
        </span>
        <span>
          <strong>{liveCount}</strong> live
        </span>
        <span>
          <strong>{totalActions.toLocaleString()}</strong> actions tracked
        </span>
      </div>

      {/* Grid */}
      <div className="reg-grid">
        {filteredItems.map((reg) => {
          const isLive = reg.stage === "live";

          const cardContent = (
            <>
              <div className="reg-grid__card-top">
                <RegulatorMark
                  regulator={reg.code}
                  size="small"
                  country={reg.country}
                  decorative
                />
                <span className="reg-grid__card-code">{reg.code}</span>
                <span
                  className={`reg-grid__card-badge ${isLive ? "reg-grid__card-badge--live" : "reg-grid__card-badge--pipeline"}`}
                >
                  {isLive ? "Live" : "Pipeline"}
                </span>
              </div>

              <span className="reg-grid__card-count">
                {reg.count > 0 ? reg.count.toLocaleString() : "\u2014"}
              </span>

              <span className="reg-grid__card-country">{reg.country}</span>
            </>
          );

          if (isLive) {
            return (
              <Link
                key={reg.code}
                to={reg.overviewPath}
                className="reg-grid__card"
              >
                {cardContent}
              </Link>
            );
          }

          const pipelineHref = reg.officialSources[0]?.url;
          return pipelineHref ? (
            <a
              key={reg.code}
              href={pipelineHref}
              target="_blank"
              rel="noopener noreferrer"
              className="reg-grid__card reg-grid__card--pipeline"
            >
              {cardContent}
            </a>
          ) : (
            <div
              key={reg.code}
              className="reg-grid__card reg-grid__card--pipeline"
            >
              {cardContent}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="reg-grid__footer">
        <p>
          The current live product is anchored in FCA depth and expanding into
          global public enforcement feeds. Pipeline regulators have validated
          official sources, ready for ingestion.
        </p>
        <Link to="/dashboard" className="reg-grid__footer-cta">
          Open live dashboard
        </Link>
      </div>
    </div>
  );
}
