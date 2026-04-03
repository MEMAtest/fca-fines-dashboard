import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BellRing,
  BookOpenText,
  Braces,
  Database,
  Radar,
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

type RoadmapTab = "coverage" | "product";

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

const LIVE_EUROPE_REGULATORS = LIVE_REGULATOR_NAV_ITEMS.filter(
  (coverage) => coverage.region === "Europe" || coverage.region === "UK",
);

function getClusterOptions(phases: RoadmapPhaseWithRegulators[]) {
  return Array.from(
    new Set(
      phases.flatMap((phase) =>
        phase.regulators
          .map((regulator) => regulator.countryCluster)
          .filter((value): value is string => Boolean(value)),
      ),
    ),
  );
}

type RoadmapPhaseWithRegulators = CoverageRoadmapPhase & {
  regulators: RegulatorCoverage[];
};

function buildCoveragePhases(): RoadmapPhaseWithRegulators[] {
  return EUROPE_EEA_COVERAGE_PHASES.map((phase) => ({
    ...phase,
    regulators: phase.codes
      .map((code) => getRegulatorCoverage(code))
      .filter((coverage): coverage is RegulatorCoverage => Boolean(coverage)),
  }));
}

function formatPriority(coverage: RegulatorCoverage) {
  return `Priority ${coverage.priorityTier}`;
}

function formatCollectionMode(coverage: RegulatorCoverage) {
  if (coverage.automationLevel === "curated_archive") {
    return "Manifest-driven";
  }
  if (coverage.automationLevel === "sparse_source") {
    return "Sparse-source";
  }
  return "Automated-ready";
}

function getPhaseStatusLabel(phase: CoverageRoadmapPhase["phase"]) {
  if (phase === 1) return "Validated next";
  if (phase === 2) return "In build queue";
  return "Later wave";
}

export function Roadmap() {
  useSEO({
    title: "Coverage Roadmap | Europe Expansion and Product Delivery",
    description:
      "Track the Europe and EEA regulator rollout in phased coverage waves, alongside the next product work for enforcement intelligence.",
    canonicalPath: "/roadmap",
  });

  const [activeTab, setActiveTab] = useState<RoadmapTab>("coverage");
  const coveragePhases = useMemo(buildCoveragePhases, []);
  const clusterOptions = useMemo(
    () => ["all", ...getClusterOptions(coveragePhases)],
    [coveragePhases],
  );
  const [selectedCluster, setSelectedCluster] = useState<string>("all");
  const [selectedCode, setSelectedCode] = useState<string>(
    coveragePhases[0]?.regulators[0]?.code ?? "FINMA",
  );

  const filteredPhases = useMemo(() => {
    if (selectedCluster === "all") return coveragePhases;

    return coveragePhases
      .map((phase) => ({
        ...phase,
        regulators: phase.regulators.filter(
          (regulator) => regulator.countryCluster === selectedCluster,
        ),
      }))
      .filter((phase) => phase.regulators.length > 0);
  }, [coveragePhases, selectedCluster]);

  const visibleCodes = filteredPhases.flatMap((phase) =>
    phase.regulators.map((regulator) => regulator.code),
  );

  const selectedCoverage =
    (visibleCodes.includes(selectedCode)
      ? getRegulatorCoverage(selectedCode)
      : filteredPhases[0]?.regulators[0]) ?? null;

  return (
    <div className="roadmap-page">
      <section className="roadmap-hero">
        <div className="roadmap-hero__container">
          <div className="roadmap-hero__eyebrow">
            <Sparkles size={16} />
            <span>Mission control</span>
          </div>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
            className="roadmap-hero__title"
          >
            Coverage roadmap
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.1 }}
            className="roadmap-hero__description"
          >
            Europe comes first. Italy, Switzerland, France banking completion,
            Luxembourg, Belgium, Austria, Portugal, Cyprus, and the Nordics are
            now mapped into an explicit three-phase rollout instead of a vague
            backlog.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.2 }}
            className="roadmap-hero__stats"
          >
            <HeroStat
              value={REGULATOR_STAGE_COUNTS.live}
              label="Live now"
              helper="Public hubs and dashboards"
            />
            <HeroStat
              value={coveragePhases.flatMap((phase) => phase.regulators).length}
              label="Europe / EEA next"
              helper="Validated phase rollout"
            />
            <HeroStat
              value={REGULATOR_STAGE_COUNTS.pipeline}
              label="Validated next"
              helper="Queued regulators"
            />
            <HeroStat
              value={REGULATOR_STAGE_COUNTS.total}
              label="Tracked total"
              helper="Live, internal, and pipeline"
            />
          </motion.div>

          <div className="roadmap-tabs" role="tablist" aria-label="Roadmap view">
            <TabButton
              active={activeTab === "coverage"}
              label="Coverage Roadmap"
              onClick={() => setActiveTab("coverage")}
            />
            <TabButton
              active={activeTab === "product"}
              label="Product Roadmap"
              onClick={() => setActiveTab("product")}
            />
          </div>
        </div>
      </section>

      <section className="roadmap-console">
        <div className="roadmap-console__container">
          {activeTab === "coverage" ? (
            <>
              <div className="roadmap-console__topline">
                <div>
                  <span className="roadmap-console__kicker">
                    Europe + EEA rollout
                  </span>
                  <h2>Horizontal delivery rail</h2>
                </div>
                <p>
                  The coverage tab is registry-driven. Every card below is tied
                  to a tracked regulator entry, official source set, and phase.
                </p>
              </div>

              <div className="roadmap-filter-chips">
                {clusterOptions.map((cluster) => (
                  <button
                    key={cluster}
                    type="button"
                    className={
                      cluster === selectedCluster
                        ? "roadmap-chip roadmap-chip--active"
                        : "roadmap-chip"
                    }
                    onClick={() => setSelectedCluster(cluster)}
                  >
                    {cluster === "all" ? "All clusters" : cluster}
                  </button>
                ))}
              </div>

              <div className="roadmap-live-strip" data-testid="coverage-live-strip">
                <div className="roadmap-live-strip__header">
                  <span>Live now</span>
                  <strong>{LIVE_EUROPE_REGULATORS.length} European anchors</strong>
                </div>
                <div className="roadmap-live-strip__items">
                  {LIVE_EUROPE_REGULATORS.map((coverage) => (
                    <Link
                      key={coverage.code}
                      to={coverage.overviewPath}
                      className="roadmap-live-pill"
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
              </div>

              <div
                className="roadmap-rail"
                role="region"
                aria-label="Coverage roadmap phases"
                data-testid="coverage-roadmap-rail"
              >
                {filteredPhases.map((phase) => (
                  <section
                    key={phase.id}
                    className="roadmap-phase"
                    data-testid={`coverage-phase-${phase.phase}`}
                  >
                    <div className="roadmap-phase__header">
                      <div>
                        <span className="roadmap-phase__label">{phase.label}</span>
                        <h3>{phase.title}</h3>
                      </div>
                      <div className="roadmap-phase__meta">
                        <span>{phase.targetWindow}</span>
                        <span>{getPhaseStatusLabel(phase.phase)}</span>
                      </div>
                    </div>

                    <p className="roadmap-phase__description">
                      {phase.description}
                    </p>

                    <div className="roadmap-phase__spotlight">
                      <Radar size={16} />
                      <span>{phase.spotlight}</span>
                    </div>

                    <div className="roadmap-phase__cards">
                      {phase.regulators.map((coverage) => (
                        <button
                          key={coverage.code}
                          type="button"
                          className={
                            selectedCoverage?.code === coverage.code
                              ? "roadmap-regulator-card roadmap-regulator-card--active"
                              : "roadmap-regulator-card"
                          }
                          onClick={() => setSelectedCode(coverage.code)}
                          data-testid={`coverage-card-${coverage.code.toLowerCase()}`}
                        >
                          <div className="roadmap-regulator-card__header">
                            <RegulatorMark
                              regulator={coverage.code}
                              label={coverage.fullName}
                              country={coverage.country}
                              size="small"
                              showCode
                              decorative
                            />
                            <span className="roadmap-stage-badge">
                              {formatPriority(coverage)}
                            </span>
                          </div>

                          <h4>{coverage.fullName}</h4>
                          <p>
                            {coverage.countryCluster ?? coverage.country} ·{" "}
                            {coverage.country}
                          </p>

                          <div className="roadmap-regulator-card__meta">
                            <span>{coverage.scrapeMode.replace(/_/g, " ")}</span>
                            <span>{formatCollectionMode(coverage)}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>

              {selectedCoverage ? (
                <div
                  className="roadmap-detail"
                  data-testid="coverage-detail-panel"
                >
                  <div className="roadmap-detail__hero">
                    <div className="roadmap-detail__mark">
                      <RegulatorMark
                        regulator={selectedCoverage.code}
                        label={selectedCoverage.fullName}
                        country={selectedCoverage.country}
                        size="large"
                        showCode
                        decorative
                        surface="dark"
                      />
                    </div>
                    <div className="roadmap-detail__copy">
                      <span className="roadmap-console__kicker">
                        {selectedCoverage.rolloutPhase
                          ? `Europe phase ${selectedCoverage.rolloutPhase}`
                          : "Pipeline"}
                      </span>
                      <h3>{selectedCoverage.fullName}</h3>
                      <p>
                        {selectedCoverage.country} ·{" "}
                        {selectedCoverage.countryCluster ?? selectedCoverage.regionCluster}
                      </p>
                    </div>
                    <div className="roadmap-detail__stats">
                      <DetailStat
                        label="Source surface"
                        value={selectedCoverage.scrapeMode.replace(/_/g, " ")}
                      />
                      <DetailStat
                        label="Collection mode"
                        value={formatCollectionMode(selectedCoverage)}
                      />
                      <DetailStat
                        label="Status"
                        value={getPhaseStatusLabel(
                          selectedCoverage.rolloutPhase ?? 3,
                        )}
                      />
                    </div>
                  </div>

                  <div className="roadmap-detail__body">
                    <div className="roadmap-detail__panel">
                      <h4>Why it belongs in the rollout</h4>
                      <p>
                        {selectedCoverage.stage === "pipeline"
                          ? selectedCoverage.feedContract.sourceContractSummary
                          : (selectedCoverage.note ??
                            selectedCoverage.feedContract.sourceContractSummary)}
                      </p>
                    </div>
                    <div className="roadmap-detail__panel">
                      <h4>Official sources</h4>
                      <ul className="roadmap-source-list">
                        {selectedCoverage.officialSources.map((source) => (
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
              ) : null}
            </>
          ) : (
            <>
              <div className="roadmap-console__topline">
                <div>
                  <span className="roadmap-console__kicker">Product track</span>
                  <h2>Platform work that follows the coverage push</h2>
                </div>
                <p>
                  Product items stay separate from regulator rollout so the
                  coverage story is no longer diluted by mixed roadmap cards.
                </p>
              </div>

              <div className="roadmap-product-grid" data-testid="product-roadmap-grid">
                {PRODUCT_ROADMAP_ITEMS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.id} className="roadmap-product-card">
                      <div className="roadmap-product-card__header">
                        <div className="roadmap-product-card__icon">
                          <Icon size={18} />
                        </div>
                        <span
                          className={
                            item.status === "in-progress"
                              ? "roadmap-stage-badge roadmap-stage-badge--amber"
                              : "roadmap-stage-badge"
                          }
                        >
                          {item.status === "in-progress"
                            ? "In progress"
                            : "Planned"}
                        </span>
                      </div>
                      <h3>{item.title}</h3>
                      <p>{item.description}</p>
                      <div className="roadmap-product-card__footer">
                        <span>{item.targetWindow}</span>
                        <strong>{item.outcome}</strong>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function HeroStat({
  value,
  label,
  helper,
}: {
  value: number;
  label: string;
  helper: string;
}) {
  return (
    <div className="roadmap-stat">
      <strong>{value}</strong>
      <span>{label}</span>
      <small>{helper}</small>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="roadmap-detail-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={active ? "roadmap-tab roadmap-tab--active" : "roadmap-tab"}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export default Roadmap;
