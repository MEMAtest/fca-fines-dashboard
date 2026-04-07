import { useMemo, useRef, useState } from "react";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  BellRing,
  BookOpenText,
  Braces,
  ChevronRight,
  Database,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";
import RegulatorMark from "../components/RegulatorMark.js";
import {
  EUROPE_EEA_COVERAGE_PHASES,
  LIVE_REGULATOR_NAV_ITEMS,
  REGULATOR_STAGE_COUNTS,
  getRegulatorCoverage,
  type CoverageRoadmapPhase,
  type RegulatorCoverage,
} from "../data/regulatorCoverage.js";
import { useSEO } from "../hooks/useSEO.js";
import "../styles/roadmap.css";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type TimelineCategory = "regulator" | "feature";
type TimelineStatus = "live" | "in-progress" | "planned" | "future";

interface TimelineItem {
  id: string;
  category: TimelineCategory;
  title: string;
  subtitle: string;
  quarter: string;
  status: TimelineStatus;
  regulatorCode?: string;
  coverage?: RegulatorCoverage;
  icon?: typeof BellRing;
  description?: string;
  outcome?: string;
  targetWindow?: string;
}

interface QuarterGroup {
  quarter: string;
  items: TimelineItem[];
}

type CategoryFilter = "all" | "regulator" | "feature";
type QuarterFilter = string; // "all" or "Q2 2026" etc.

/* ------------------------------------------------------------------ */
/*  Product roadmap data                                               */
/* ------------------------------------------------------------------ */

interface ProductRoadmapItem {
  id: string;
  title: string;
  targetWindow: string;
  status: "in-progress" | "planned";
  description: string;
  outcome: string;
  icon: typeof BellRing;
}

const PRODUCT_ROADMAP_ITEMS: ProductRoadmapItem[] = [
  {
    id: "alerts",
    title: "Search and alert precision",
    targetWindow: "2026 Q2",
    status: "in-progress",
    description:
      "Tighten thematic search ranking, alert quality, and enforcement signal grouping.",
    outcome: "Sharper firm, regulator, and concept-led monitoring.",
    icon: BellRing,
  },
  {
    id: "board-pack",
    title: "Board pack persistence",
    targetWindow: "2026 Q3",
    status: "planned",
    description:
      "Move board-pack profiles and consultant workflow beyond local browser storage.",
    outcome: "Reusable advisory packs and easier internal collaboration.",
    icon: BookOpenText,
  },
  {
    id: "exports",
    title: "Branded export and sharing",
    targetWindow: "2026 Q3",
    status: "planned",
    description:
      "Improve print/export fidelity for board packs, regulator views, and search outputs.",
    outcome: "Cleaner committee-ready and client-facing deliverables.",
    icon: Database,
  },
  {
    id: "api",
    title: "API and embedded surfaces",
    targetWindow: "2026 Q4",
    status: "planned",
    description:
      "Expose regulated search and coverage data through embed-friendly and API-ready interfaces.",
    outcome: "Reusable enforcement intelligence across client and internal stacks.",
    icon: Braces,
  },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const LIVE_EUROPE_REGULATORS = LIVE_REGULATOR_NAV_ITEMS.filter(
  (c) => c.region === "Europe" || c.region === "UK",
);

function phaseToQuarter(phase: CoverageRoadmapPhase): string {
  return phase.targetWindow.replace(/(\d{4})\s+(Q\d)/, "$2 $1");
}

function productWindowToQuarter(targetWindow: string): string {
  return targetWindow.replace(/(\d{4})\s+(Q\d)/, "$2 $1");
}

function phaseToStatus(phase: 1 | 2 | 3): TimelineStatus {
  if (phase === 1) return "planned";
  if (phase === 2) return "planned";
  return "future";
}

function buildTimelineItems(): TimelineItem[] {
  const items: TimelineItem[] = [];

  // Regulator items from coverage phases
  for (const phase of EUROPE_EEA_COVERAGE_PHASES) {
    const quarter = phaseToQuarter(phase);
    for (const code of phase.codes) {
      const coverage = getRegulatorCoverage(code);
      if (!coverage) continue;
      items.push({
        id: `reg-${code}`,
        category: "regulator",
        title: coverage.code,
        subtitle: `${coverage.country}${coverage.countryCluster ? ` \u00b7 ${coverage.countryCluster}` : ""}`,
        quarter,
        status: phaseToStatus(phase.phase),
        regulatorCode: coverage.code,
        coverage,
      });
    }
  }

  // Product items
  for (const item of PRODUCT_ROADMAP_ITEMS) {
    items.push({
      id: `feat-${item.id}`,
      category: "feature",
      title: item.title,
      subtitle: item.outcome,
      quarter: productWindowToQuarter(item.targetWindow),
      status: item.status === "in-progress" ? "in-progress" : "planned",
      icon: item.icon,
      description: item.description,
      outcome: item.outcome,
      targetWindow: item.targetWindow,
    });
  }

  return items;
}

const QUARTER_SORT_ORDER: Record<string, number> = {
  "Q2 2026": 1,
  "Q3 2026": 2,
  "Q4 2026": 3,
};

function groupByQuarter(items: TimelineItem[]): QuarterGroup[] {
  const map = new Map<string, TimelineItem[]>();
  for (const item of items) {
    const existing = map.get(item.quarter);
    if (existing) {
      existing.push(item);
    } else {
      map.set(item.quarter, [item]);
    }
  }

  return Array.from(map.entries())
    .sort(
      ([a], [b]) =>
        (QUARTER_SORT_ORDER[a] ?? 99) - (QUARTER_SORT_ORDER[b] ?? 99),
    )
    .map(([quarter, items]) => ({ quarter, items }));
}

function getStatusColor(status: TimelineStatus): string {
  switch (status) {
    case "live":
      return "#10b981";
    case "in-progress":
      return "#f59e0b";
    case "planned":
      return "#3b82f6";
    case "future":
      return "#94a3b8";
  }
}

function getStatusLabel(status: TimelineStatus): string {
  switch (status) {
    case "live":
      return "Live";
    case "in-progress":
      return "In progress";
    case "planned":
      return "Planned";
    case "future":
      return "Future";
  }
}

function formatCollectionMode(coverage: RegulatorCoverage) {
  if (coverage.automationLevel === "curated_archive") return "Manifest-driven";
  if (coverage.automationLevel === "sparse_source") return "Sparse-source";
  return "Automated-ready";
}

function getPhaseStatusLabel(phase: CoverageRoadmapPhase["phase"]) {
  if (phase === 1) return "Validated next";
  if (phase === 2) return "In build queue";
  return "Later wave";
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function Roadmap() {
  useSEO({
    title: "Platform Roadmap | Regulator Coverage and Product Delivery",
    description:
      "Track the Europe and EEA regulator rollout in phased coverage waves, alongside the next product work for enforcement intelligence.",
    canonicalPath: "/roadmap",
  });

  const allItems = useMemo(buildTimelineItems, []);
  const allQuarters = useMemo(
    () => Array.from(new Set(allItems.map((i) => i.quarter))).sort(
      (a, b) => (QUARTER_SORT_ORDER[a] ?? 99) - (QUARTER_SORT_ORDER[b] ?? 99),
    ),
    [allItems],
  );

  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [quarterFilter, setQuarterFilter] = useState<QuarterFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
      if (quarterFilter !== "all" && item.quarter !== quarterFilter) return false;
      return true;
    });
  }, [allItems, categoryFilter, quarterFilter]);

  const quarterGroups = useMemo(() => groupByQuarter(filteredItems), [filteredItems]);

  const timelineRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: timelineRef,
    offset: ["start center", "end center"],
  });
  const lineHeight = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);

  const europeNextCount = EUROPE_EEA_COVERAGE_PHASES.reduce(
    (sum, phase) => sum + phase.codes.length,
    0,
  );

  function toggleExpanded(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="roadmap-page">
      {/* ── Hero ── */}
      <section className="tl-hero">
        <div className="tl-hero__container">
          <div className="tl-hero__eyebrow">
            <Sparkles size={16} />
            <span>Mission control</span>
          </div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
            className="tl-hero__title"
          >
            Platform Roadmap
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.1 }}
            className="tl-hero__subtitle"
          >
            <strong>{REGULATOR_STAGE_COUNTS.live}</strong> live{" \u00b7 "}
            <strong>{europeNextCount}</strong> Europe next{" \u00b7 "}
            <strong>{REGULATOR_STAGE_COUNTS.total}</strong> tracked total
          </motion.p>

          {/* ── Filters ── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.2 }}
            className="tl-filters"
          >
            <div className="tl-filters__group" role="group" aria-label="Filter by category">
              {(["all", "regulator", "feature"] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`tl-chip${categoryFilter === cat ? " tl-chip--active" : ""}`}
                  aria-pressed={categoryFilter === cat}
                  onClick={() => setCategoryFilter(cat)}
                >
                  {cat === "all"
                    ? "All"
                    : cat === "regulator"
                      ? "Regulators"
                      : "Features"}
                </button>
              ))}
            </div>
            <span className="tl-filters__divider" aria-hidden="true" />
            <div className="tl-filters__group" role="group" aria-label="Filter by quarter">
              <button
                type="button"
                className={`tl-chip${quarterFilter === "all" ? " tl-chip--active" : ""}`}
                aria-pressed={quarterFilter === "all"}
                onClick={() => setQuarterFilter("all")}
              >
                All quarters
              </button>
              {allQuarters.map((q) => (
                <button
                  key={q}
                  type="button"
                  className={`tl-chip${quarterFilter === q ? " tl-chip--active" : ""}`}
                  aria-pressed={quarterFilter === q}
                  onClick={() => setQuarterFilter(q)}
                >
                  {q}
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Timeline body ── */}
      <section className="tl-body" aria-label="Timeline">
        <div className="tl-body__container">
          {/* Live regulators strip */}
          {categoryFilter !== "feature" && quarterFilter === "all" && (
            <motion.div
              className="tl-live-strip"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              data-testid="coverage-live-strip"
            >
              <div className="tl-live-strip__header">
                <span className="tl-live-strip__label">Live now</span>
                <strong>
                  {LIVE_EUROPE_REGULATORS.length} European anchors
                </strong>
              </div>
              <div className="tl-live-strip__items">
                {LIVE_EUROPE_REGULATORS.map((coverage) => (
                  <Link
                    key={coverage.code}
                    to={coverage.overviewPath}
                    className="tl-live-pill"
                    aria-label={`${coverage.fullName} overview`}
                  >
                    <RegulatorMark
                      regulator={coverage.code}
                      label={coverage.fullName}
                      country={coverage.country}
                      size="small"
                      showCode
                      decorative
                    />
                  </Link>
                ))}
              </div>
            </motion.div>
          )}

          {/* Timeline */}
          <div className="tl-timeline" ref={timelineRef}>
            {/* Progress line */}
            {filteredItems.length > 0 && (
              <div className="tl-timeline__track" aria-hidden="true">
                <motion.div
                  className="tl-timeline__progress"
                  style={{ height: lineHeight }}
                />
              </div>
            )}

            {quarterGroups.map((group, groupIdx) => (
              <div key={group.quarter} className="tl-quarter">
                {/* Quarter divider */}
                <motion.div
                  className="tl-quarter__divider"
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.4 }}
                >
                  <span className="tl-quarter__dot" aria-hidden="true" />
                  <span className="tl-quarter__label">{group.quarter}</span>
                </motion.div>

                {/* Milestones */}
                {group.items.map((item, itemIdx) => (
                  <TimelineMilestone
                    key={item.id}
                    item={item}
                    isExpanded={expandedId === item.id}
                    onToggle={() => toggleExpanded(item.id)}
                    delay={groupIdx * 0.05 + itemIdx * 0.06}
                  />
                ))}
              </div>
            ))}

            {filteredItems.length === 0 && (
              <div className="tl-empty">
                <p>No milestones match the current filters.</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Timeline Milestone                                                 */
/* ------------------------------------------------------------------ */

function TimelineMilestone({
  item,
  isExpanded,
  onToggle,
  delay,
}: {
  item: TimelineItem;
  isExpanded: boolean;
  onToggle: () => void;
  delay: number;
}) {
  const statusColor = getStatusColor(item.status);
  const Icon = item.icon;

  return (
    <motion.div
      className="tl-milestone"
      initial={{ opacity: 0, x: 30 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.45, delay: Math.min(delay, 0.3) }}
    >
      {/* Node on the timeline */}
      <div
        className={`tl-node tl-node--${item.status}`}
        style={{ "--node-color": statusColor } as React.CSSProperties}
        aria-label={`${item.title} - ${getStatusLabel(item.status)}`}
      />

      {/* Connector line */}
      <div className="tl-connector" aria-hidden="true" />

      {/* Card */}
      <div className="tl-card-wrapper">
        <button
          type="button"
          className={`tl-card${isExpanded ? " tl-card--expanded" : ""}`}
          onClick={onToggle}
          aria-expanded={isExpanded}
          aria-controls={`detail-${item.id}`}
          data-testid={
            item.category === "regulator"
              ? `coverage-card-${item.regulatorCode?.toLowerCase()}`
              : `product-card-${item.id}`
          }
        >
          <div className="tl-card__row">
            {/* Icon */}
            <div className="tl-card__icon">
              {item.category === "regulator" && item.regulatorCode ? (
                <RegulatorMark
                  regulator={item.regulatorCode}
                  label={item.coverage?.fullName}
                  country={item.coverage?.country}
                  size="small"
                  showCode
                  decorative
                />
              ) : Icon ? (
                <span className="tl-card__feature-icon">
                  <Icon size={18} />
                </span>
              ) : null}
            </div>

            {/* Title + subtitle */}
            <div className="tl-card__text">
              <span className="tl-card__title">{item.title}</span>
              <span className="tl-card__subtitle">{item.subtitle}</span>
            </div>

            {/* Badges */}
            <div className="tl-card__badges">
              <span
                className="tl-badge"
                style={
                  {
                    "--badge-color": statusColor,
                  } as React.CSSProperties
                }
              >
                {getStatusLabel(item.status)}
              </span>
              <span className="tl-badge tl-badge--quarter">{item.quarter}</span>
            </div>

            {/* Chevron */}
            <motion.span
              className="tl-card__chevron"
              animate={{ rotate: isExpanded ? 90 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronRight size={18} />
            </motion.span>
          </div>
        </button>

        {/* Expanded detail */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              id={`detail-${item.id}`}
              className="tl-detail"
              role="region"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{
                duration: 0.3,
                ease: "easeInOut",
                opacity: { duration: 0.15 },
              }}
            >
              <div className="tl-detail__inner">
                {item.category === "regulator" && item.coverage ? (
                  <RegulatorDetail coverage={item.coverage} />
                ) : (
                  <FeatureDetail item={item} />
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Regulator detail (expanded)                                        */
/* ------------------------------------------------------------------ */

function RegulatorDetail({ coverage }: { coverage: RegulatorCoverage }) {
  return (
    <div className="tl-reg-detail">
      <div className="tl-reg-detail__top">
        <div className="tl-reg-detail__mark">
          <RegulatorMark
            regulator={coverage.code}
            label={coverage.fullName}
            country={coverage.country}
            size="large"
            showCode
            decorative
            surface="dark"
          />
        </div>
        <div className="tl-reg-detail__meta">
          <h4>{coverage.fullName}</h4>
          <p>
            {coverage.country}
            {coverage.countryCluster
              ? ` \u00b7 ${coverage.countryCluster}`
              : coverage.regionCluster
                ? ` \u00b7 ${coverage.regionCluster}`
                : ""}
          </p>
          <div className="tl-reg-detail__stats">
            <DetailStat
              label="Source surface"
              value={coverage.scrapeMode.replace(/_/g, " ")}
            />
            <DetailStat
              label="Collection mode"
              value={formatCollectionMode(coverage)}
            />
            <DetailStat
              label="Status"
              value={getPhaseStatusLabel(coverage.rolloutPhase ?? 3)}
            />
          </div>
        </div>
      </div>

      <div className="tl-reg-detail__body">
        <div className="tl-reg-detail__panel">
          <h5>Why it belongs in the rollout</h5>
          <p>
            {coverage.stage === "pipeline"
              ? coverage.feedContract.sourceContractSummary
              : (coverage.note ?? coverage.feedContract.sourceContractSummary)}
          </p>
        </div>
        <div className="tl-reg-detail__panel">
          <h5>Official sources</h5>
          <ul className="tl-source-list">
            {coverage.officialSources.map((source) => (
              <li key={source.url}>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span>{source.label}</span>
                  <ArrowRight size={14} />
                </a>
                <p>{source.description}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Feature detail (expanded)                                          */
/* ------------------------------------------------------------------ */

function FeatureDetail({ item }: { item: TimelineItem }) {
  const Icon = item.icon;
  return (
    <div className="tl-feat-detail">
      <div className="tl-feat-detail__top">
        {Icon && (
          <div className="tl-feat-detail__icon-lg">
            <Icon size={28} />
          </div>
        )}
        <div>
          <h4>{item.title}</h4>
          {item.targetWindow && (
            <span className="tl-feat-detail__window">
              Target: {item.targetWindow}
            </span>
          )}
        </div>
      </div>

      {item.description && (
        <div className="tl-feat-detail__section">
          <h5>Description</h5>
          <p>{item.description}</p>
        </div>
      )}

      {item.outcome && (
        <div className="tl-feat-detail__section">
          <h5>Expected outcome</h5>
          <p>{item.outcome}</p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Detail stat                                                        */
/* ------------------------------------------------------------------ */

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="tl-detail-stat">
      <span className="tl-detail-stat__label">{label}</span>
      <strong className="tl-detail-stat__value">{value}</strong>
    </div>
  );
}

export default Roadmap;
