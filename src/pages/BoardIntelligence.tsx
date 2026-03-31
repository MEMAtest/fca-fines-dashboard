import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  Download,
  FileBadge2,
  Gauge,
  LoaderCircle,
  Radar,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import {
  BOARD_ARCHETYPES,
  BOARD_ARCHETYPES_BY_ID,
  BOARD_FOCUS_OPTIONS,
  BOARD_THEME_OPTIONS,
  DEFAULT_BOARD_PROFILE,
  type BoardArchetypeId,
  type BoardFocusId,
  type BoardFirmProfile,
  type BoardThemeId,
} from "../data/boardIntelligence.js";
import {
  LIVE_REGULATOR_NAV_ITEMS,
  getRegulatorCoverage,
} from "../data/regulatorCoverage.js";
import { useLocalStorage } from "../hooks/useLocalStorage.js";
import { useSEO } from "../hooks/useSEO.js";
import { useUnifiedData } from "../hooks/useUnifiedData.js";
import {
  buildBoardPack,
  buildControlChecklist,
  summarizeControlChallenge,
  type ControlStatus,
  type ExposureBand,
  type ThemeSeverity,
} from "../utils/boardIntelligence.js";
import "../styles/board-intelligence.css";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) {
    return "No recent date";
  }

  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function toggleSelection<T>(values: T[], value: T) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function getBandLabel(band: ExposureBand) {
  if (band === "severe") return "Severe";
  if (band === "material") return "Material";
  if (band === "moderate") return "Moderate";
  return "Low";
}

function getSeverityLabel(severity: ThemeSeverity) {
  if (severity === "critical") return "Critical";
  if (severity === "material") return "Material";
  if (severity === "elevated") return "Elevated";
  return "Watch";
}

function getStatusLabel(status: ControlStatus) {
  if (status === "needs-work") return "Needs work";
  if (status === "evidence-partial") return "Partially evidenced";
  if (status === "evidenced") return "Evidenced";
  return "Not tested";
}

const CONTROL_STATUS_OPTIONS: ControlStatus[] = [
  "not-tested",
  "needs-work",
  "evidence-partial",
  "evidenced",
];

const REGULATOR_OPTIONS = LIVE_REGULATOR_NAV_ITEMS.filter(
  (coverage) => coverage.dashboardEnabled,
).sort((left, right) => left.navOrder - right.navOrder);

const REGION_OPTIONS = Array.from(
  new Set(REGULATOR_OPTIONS.map((coverage) => coverage.region)),
);

export function BoardIntelligence() {
  useSEO({
    title: "Board Pack Studio | Regulatory Fines",
    description:
      "Turn enforcement history into a board-ready pack with exposure scoring, peer cases, scenario bands, and control challenge prompts.",
    keywords:
      "board pack, enforcement intelligence, compliance board report, regulatory exposure score, controls challenge",
    canonicalPath: "/board-pack",
    ogType: "website",
  });

  const [draftProfile, setDraftProfile] = useLocalStorage<BoardFirmProfile>(
    "board-pack-profile-v1",
    DEFAULT_BOARD_PROFILE,
  );
  const [controlStatuses, setControlStatuses] = useLocalStorage<
    Record<string, ControlStatus>
  >("board-pack-control-statuses-v1", {});
  const [activeProfile, setActiveProfile] = useState<BoardFirmProfile>(
    draftProfile,
  );
  const [generatedAt, setGeneratedAt] = useState<Date>(new Date());

  const { fines, loading, error } = useUnifiedData({
    regulator: "All",
    country: "All",
    year: 0,
    currency: "GBP",
  });

  const pack = useMemo(() => {
    if (!fines.length) {
      return null;
    }
    return buildBoardPack(fines, activeProfile);
  }, [activeProfile, fines]);

  const controlChecklist = useMemo(
    () => (pack ? buildControlChecklist(pack) : []),
    [pack],
  );

  useEffect(() => {
    if (!controlChecklist.length) {
      return;
    }

    setControlStatuses((current) => {
      let changed = false;
      const next = { ...current };

      for (const item of controlChecklist) {
        if (!next[item.id]) {
          next[item.id] = item.defaultStatus;
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [controlChecklist, setControlStatuses]);

  const controlSummary = useMemo(
    () =>
      controlChecklist.length
        ? summarizeControlChallenge(controlChecklist, controlStatuses)
        : null,
    [controlChecklist, controlStatuses],
  );

  const lowerConfidenceSelections = useMemo(
    () =>
      activeProfile.priorityRegulators
        .map((code) => getRegulatorCoverage(code))
        .filter(
          (coverage): coverage is NonNullable<typeof coverage> =>
            Boolean(coverage && coverage.operationalConfidence === "lower"),
        ),
    [activeProfile.priorityRegulators],
  );

  function updateDraftProfile(
    patch:
      | Partial<BoardFirmProfile>
      | ((current: BoardFirmProfile) => BoardFirmProfile),
  ) {
    setDraftProfile((current) =>
      typeof patch === "function" ? patch(current) : { ...current, ...patch },
    );
  }

  function applyArchetypePreset(archetypeId: BoardArchetypeId) {
    const archetype = BOARD_ARCHETYPES_BY_ID[archetypeId];
    updateDraftProfile((current) => ({
      ...current,
      archetypeId,
      priorityThemeIds: archetype.defaultThemes,
      priorityRegulators: archetype.suggestedRegulators,
      focusRegions: archetype.suggestedRegions,
    }));
  }

  function generateBoardPack() {
    setActiveProfile(draftProfile);
    setGeneratedAt(new Date());
  }

  function handlePrint() {
    if (typeof window !== "undefined") {
      window.print();
    }
  }

  return (
    <div className="board-intelligence">
      <section className="board-intelligence__hero">
        <div className="board-intelligence__hero-copy">
          <span className="board-intelligence__eyebrow">
            Board intelligence
          </span>
          <h1>Board Pack Studio</h1>
          <p className="board-intelligence__lede">
            Turn live enforcement history into a board-ready pack with exposure
            scoring, peer cases, scenario bands, and control challenge prompts.
          </p>
          <div className="board-intelligence__hero-points">
            <span>
              <ShieldCheck size={16} />
              Evidence linked to tracked enforcement actions
            </span>
            <span>
              <Radar size={16} />
              Scenario bands rather than false-precision predictions
            </span>
            <span>
              <FileBadge2 size={16} />
              Designed for board and committee challenge
            </span>
          </div>
        </div>

        <div className="board-intelligence__hero-card">
          <div className="board-intelligence__hero-stat">
            <strong>{REGULATOR_OPTIONS.length}</strong>
            <span>live regulators in board-pack scope</span>
          </div>
          <div className="board-intelligence__hero-stat">
            <strong>{fines.length.toLocaleString()}</strong>
            <span>actions available for peer-case matching</span>
          </div>
          <div className="board-intelligence__hero-stat">
            <strong>Board pack</strong>
            <span>scorecard, scenarios, and controls challenge</span>
          </div>
        </div>
      </section>

      <section className="board-intelligence__layout">
        <aside className="board-intelligence__builder">
          <div className="board-intelligence__panel">
            <div className="board-intelligence__panel-header">
              <div>
                <span className="board-intelligence__panel-kicker">
                  Firm profile
                </span>
                <h2>Configure the pack</h2>
              </div>
              <Sparkles size={18} />
            </div>

            <label className="board-intelligence__field">
              <span>Firm or profile name</span>
              <input
                type="text"
                aria-label="Firm or profile name"
                value={draftProfile.firmName}
                onChange={(event) =>
                  updateDraftProfile({ firmName: event.target.value })
                }
                placeholder="Example: NorthStar Payments"
              />
            </label>

            <label className="board-intelligence__field">
              <span>Business model</span>
              <select
                aria-label="Business model"
                value={draftProfile.archetypeId}
                onChange={(event) =>
                  applyArchetypePreset(event.target.value as BoardArchetypeId)
                }
              >
                {BOARD_ARCHETYPES.map((archetype) => (
                  <option key={archetype.id} value={archetype.id}>
                    {archetype.label}
                  </option>
                ))}
              </select>
              <small>
                {BOARD_ARCHETYPES_BY_ID[draftProfile.archetypeId].description}
              </small>
            </label>

            <label className="board-intelligence__field">
              <span>Board lens</span>
              <select
                aria-label="Board lens"
                value={draftProfile.boardFocus}
                onChange={(event) =>
                  updateDraftProfile({
                    boardFocus: event.target.value as BoardFocusId,
                  })
                }
              >
                {BOARD_FOCUS_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <small>
                {
                  BOARD_FOCUS_OPTIONS.find(
                    (option) => option.id === draftProfile.boardFocus,
                  )?.description
                }
              </small>
            </label>

            <div className="board-intelligence__field">
              <span>Priority regulators</span>
              <div className="board-intelligence__pill-grid">
                {REGULATOR_OPTIONS.map((coverage) => {
                  const selected = draftProfile.priorityRegulators.includes(
                    coverage.code,
                  );
                  return (
                    <button
                      key={coverage.code}
                      type="button"
                      className={`board-intelligence__pill${selected ? " board-intelligence__pill--active" : ""}`}
                      onClick={() =>
                        updateDraftProfile((current) => ({
                          ...current,
                          priorityRegulators: toggleSelection(
                            current.priorityRegulators,
                            coverage.code,
                          ),
                        }))
                      }
                    >
                      <span>{coverage.flag}</span>
                      <span>{coverage.code}</span>
                    </button>
                  );
                })}
              </div>
              <small>
                Leave several selected. This is a focus signal, not a hard
                exclusion model.
              </small>
            </div>

            <div className="board-intelligence__field">
              <span>Focus regions</span>
              <div className="board-intelligence__pill-grid board-intelligence__pill-grid--compact">
                {REGION_OPTIONS.map((region) => {
                  const selected = draftProfile.focusRegions.includes(region);
                  return (
                    <button
                      key={region}
                      type="button"
                      className={`board-intelligence__pill${selected ? " board-intelligence__pill--active" : ""}`}
                      onClick={() =>
                        updateDraftProfile((current) => ({
                          ...current,
                          focusRegions: toggleSelection(
                            current.focusRegions,
                            region,
                          ),
                        }))
                      }
                    >
                      {region}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="board-intelligence__field">
              <span>Priority themes</span>
              <div className="board-intelligence__theme-grid">
                {BOARD_THEME_OPTIONS.map((theme) => {
                  const selected = draftProfile.priorityThemeIds.includes(
                    theme.id,
                  );
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      className={`board-intelligence__theme-card${selected ? " board-intelligence__theme-card--active" : ""}`}
                      onClick={() =>
                        updateDraftProfile((current) => ({
                          ...current,
                          priorityThemeIds: toggleSelection(
                            current.priorityThemeIds,
                            theme.id,
                          ),
                        }))
                      }
                    >
                      <strong>{theme.shortLabel}</strong>
                      <span>{theme.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="board-intelligence__builder-actions">
              <button
                type="button"
                className="board-intelligence__primary"
                onClick={generateBoardPack}
              >
                Generate board pack
              </button>
              <button
                type="button"
                className="board-intelligence__secondary"
                onClick={() => applyArchetypePreset(draftProfile.archetypeId)}
              >
                Reset to archetype defaults
              </button>
            </div>
          </div>
        </aside>

        <div className="board-intelligence__report">
          <div className="board-intelligence__report-header">
            <div>
              <span className="board-intelligence__panel-kicker">
                Generated report
              </span>
              <h2>{activeProfile.firmName}</h2>
              <p>
                Generated on {formatDate(generatedAt.toISOString())} for{" "}
                {BOARD_ARCHETYPES_BY_ID[activeProfile.archetypeId].label.toLowerCase()}{" "}
                under a {activeProfile.boardFocus.replace("-", " ")} lens.
              </p>
            </div>
            <div className="board-intelligence__report-actions">
              <button
                type="button"
                className="board-intelligence__secondary"
                onClick={handlePrint}
              >
                <Download size={16} />
                Print pack
              </button>
              <Link to="/search" className="board-intelligence__link-action">
                Open enforcement search
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>

          {loading && (
            <div className="board-intelligence__empty">
              <LoaderCircle className="board-intelligence__spin" size={36} />
              <h3>Loading live enforcement data</h3>
              <p>
                Pulling the tracked enforcement set so the board pack can be
                built from current coverage.
              </p>
            </div>
          )}

          {!loading && error && (
            <div className="board-intelligence__empty board-intelligence__empty--error">
              <AlertTriangle size={36} />
              <h3>Unable to build the board pack</h3>
              <p>{error}</p>
            </div>
          )}

          {!loading && !error && pack && (
            <>
              <div className="board-intelligence__summary">
                <div className="board-intelligence__summary-lead">
                  <div className="board-intelligence__summary-badge">
                    <Gauge size={16} />
                    Exposure band: {getBandLabel(pack.exposureBand)}
                  </div>
                  <h3>{pack.summaryHeadline}</h3>
                  <p>{pack.summaryNarrative}</p>
                </div>

                <div className="board-intelligence__metric-grid">
                  <article className="board-intelligence__metric-card">
                    <span>Exposure score</span>
                    <strong>{pack.exposureScore}/100</strong>
                    <small>Derived from theme intensity, recency, and regulator spread</small>
                  </article>
                  <article className="board-intelligence__metric-card">
                    <span>Relevant actions</span>
                    <strong>{pack.relevantActionCount}</strong>
                    <small>{pack.recentActionCount} within the current live window</small>
                  </article>
                  <article className="board-intelligence__metric-card">
                    <span>Primary regulators</span>
                    <strong>{pack.primaryRegulators.join(", ")}</strong>
                    <small>{pack.activeRegulatorCount} regulators contributing to the pack</small>
                  </article>
                  <article className="board-intelligence__metric-card">
                    <span>Penalty value in scope</span>
                    <strong>{formatCurrency(pack.totalAmount)}</strong>
                    <small>Tracked monetary exposure from matched cases</small>
                  </article>
                </div>
              </div>

              {lowerConfidenceSelections.length > 0 && (
                <div className="board-intelligence__coverage-strip">
                  <AlertTriangle size={18} />
                  <p>
                    Selected scope includes lower-confidence live feeds:{" "}
                    {lowerConfidenceSelections
                      .map((coverage) => coverage.code)
                      .join(", ")}
                    . Treat those trend signals as directional while the feed
                    matures.
                  </p>
                </div>
              )}

              <section className="board-intelligence__section">
                <div className="board-intelligence__section-heading">
                  <Target size={18} />
                  <div>
                    <h3>Exposure outlook</h3>
                    <p>
                      The themes the board should most likely challenge first.
                    </p>
                  </div>
                </div>
                <div className="board-intelligence__theme-summary-grid">
                  {pack.topThemes.map((theme) => (
                    <article
                      key={theme.id}
                      className={`board-intelligence__exposure-card board-intelligence__exposure-card--${theme.severity}`}
                    >
                      <div className="board-intelligence__exposure-header">
                        <strong>{theme.label}</strong>
                        <span>{getSeverityLabel(theme.severity)}</span>
                      </div>
                      <p>{theme.rationale}</p>
                      <div className="board-intelligence__exposure-metrics">
                        <span>{theme.matchedActions} actions</span>
                        <span>{formatCurrency(theme.totalAmount)}</span>
                        <span>{theme.activeRegulators.join(", ") || "No regulators"}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="board-intelligence__section">
                <div className="board-intelligence__section-heading">
                  <BriefcaseBusiness size={18} />
                  <div>
                    <h3>Peer cases worth taking to the board</h3>
                    <p>
                      Evidence-linked comparator cases that most closely match
                      the chosen profile.
                    </p>
                  </div>
                </div>
                <div className="board-intelligence__case-list">
                  {pack.notableCases.map((caseStudy) => (
                    <article
                      key={caseStudy.id}
                      className="board-intelligence__case-card"
                    >
                      <div className="board-intelligence__case-topline">
                        <div>
                          <h4>{caseStudy.firm}</h4>
                          <p>
                            {caseStudy.regulator} · {formatDate(caseStudy.dateIssued)}
                          </p>
                        </div>
                        <strong>{formatCurrency(caseStudy.amount)}</strong>
                      </div>
                      <p>{caseStudy.summary}</p>
                      <div className="board-intelligence__case-meta">
                        <span>{caseStudy.reason}</span>
                        {caseStudy.sourceUrl && (
                          <a
                            href={caseStudy.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View source
                          </a>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="board-intelligence__section">
                <div className="board-intelligence__section-heading">
                  <Sparkles size={18} />
                  <div>
                    <h3>Board challenge agenda</h3>
                    <p>
                      The questions and actions this pack suggests for the next
                      committee cycle.
                    </p>
                  </div>
                </div>
                <div className="board-intelligence__two-column">
                  <div className="board-intelligence__list-panel">
                    <h4>Questions to ask management</h4>
                    <ul>
                      {pack.boardQuestions.map((question) => (
                        <li key={question}>{question}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="board-intelligence__list-panel">
                    <h4>Recommended actions</h4>
                    <ul>
                      {pack.recommendedActions.map((action) => (
                        <li key={action}>{action}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>

              <section className="board-intelligence__section">
                <div className="board-intelligence__section-heading">
                  <Radar size={18} />
                  <div>
                    <h3>Scenario studio</h3>
                    <p>
                      Bounded severity bands based on the current case pattern,
                      not a false-precision fine prediction.
                    </p>
                  </div>
                </div>
                <div className="board-intelligence__scenario-grid">
                  {pack.scenarios.map((scenario) => (
                    <article
                      key={scenario.themeId}
                      className={`board-intelligence__scenario-card board-intelligence__scenario-card--${scenario.band}`}
                    >
                      <div className="board-intelligence__scenario-header">
                        <strong>{scenario.themeLabel}</strong>
                        <span>{getBandLabel(scenario.band)}</span>
                      </div>
                      <p>{scenario.headline}</p>
                      <small>
                        Confidence:{" "}
                        {scenario.confidence === "directional"
                          ? "Directional"
                          : scenario.confidence === "moderate"
                            ? "Moderate"
                            : "High"}
                      </small>
                      <ul>
                        {scenario.drivers.map((driver) => (
                          <li key={driver}>{driver}</li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>
              </section>

              <section className="board-intelligence__section">
                <div className="board-intelligence__section-heading">
                  <ShieldCheck size={18} />
                  <div>
                    <h3>Controls challenge</h3>
                    <p>
                      Pressure-test key controls and see how much board comfort
                      is justified by the current evidence.
                    </p>
                  </div>
                </div>

                {controlSummary && (
                  <div className="board-intelligence__control-summary">
                    <div className="board-intelligence__control-summary-card">
                      <span>Residual readiness</span>
                      <strong>{getBandLabel(controlSummary.readinessBand)}</strong>
                      <small>{controlSummary.challengeHeadline}</small>
                    </div>
                    <div className="board-intelligence__control-summary-card">
                      <span>Weak controls</span>
                      <strong>{controlSummary.weakControlCount}</strong>
                      <small>Controls marked as needing work</small>
                    </div>
                    <div className="board-intelligence__control-summary-card">
                      <span>Evidence gaps</span>
                      <strong>{controlSummary.evidenceGapCount}</strong>
                      <small>Controls not tested or only partially evidenced</small>
                    </div>
                  </div>
                )}

                <div className="board-intelligence__control-grid">
                  {controlChecklist.map((item) => (
                    <article
                      key={item.id}
                      className="board-intelligence__control-card"
                    >
                      <div className="board-intelligence__control-card-header">
                        <div>
                          <strong>{item.control}</strong>
                          <p>{item.themeLabel}</p>
                        </div>
                        <select
                          value={
                            controlStatuses[item.id] ?? item.defaultStatus
                          }
                          onChange={(event) =>
                            setControlStatuses((current) => ({
                              ...current,
                              [item.id]: event.target.value as ControlStatus,
                            }))
                          }
                          aria-label={`Control status for ${item.control}`}
                        >
                          {CONTROL_STATUS_OPTIONS.map((status) => (
                            <option key={status} value={status}>
                              {getStatusLabel(status)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <p>{item.guidance}</p>
                    </article>
                  ))}
                </div>

                {controlSummary && controlSummary.actionItems.length > 0 && (
                  <div className="board-intelligence__list-panel board-intelligence__list-panel--full">
                    <h4>Immediate control actions</h4>
                    <ul>
                      {controlSummary.actionItems.map((action) => (
                        <li key={action}>{action}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>

              <section className="board-intelligence__footer-cta">
                <div>
                  <h3>Use this as a consultancy-led board brief</h3>
                  <p>
                    The strongest commercial path is still consultancy-led SaaS:
                    generate the pack here, then layer analyst judgment,
                    management interviews, and board-ready commentary on top.
                  </p>
                </div>
                <div className="board-intelligence__footer-actions">
                  <Link to="/dashboard" className="board-intelligence__link-action">
                    Review the live dashboard
                    <ArrowRight size={16} />
                  </Link>
                  <Link to="/blog" className="board-intelligence__link-action">
                    Read enforcement insights
                    <ArrowRight size={16} />
                  </Link>
                </div>
              </section>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
