import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  FileBadge2,
  Gauge,
  LibraryBig,
  LoaderCircle,
  Printer,
  Radar,
  ShieldCheck,
  SlidersHorizontal,
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
  type BoardFirmProfile,
  type BoardFocusId,
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

function formatAmountDisplay(value: number) {
  return value > 0 ? formatCurrency(value) : "Not disclosed";
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

function formatList(values: string[]) {
  if (values.length <= 1) {
    return values[0] ?? "";
  }
  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

function toggleSelection<T>(values: T[], value: T) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function getBandLabel(band: ExposureBand) {
  if (band === "severe") return "High";
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

function getPeerDeltaLabel(delta: number) {
  if (delta > 0) return `+${delta} vs baseline`;
  if (delta < 0) return `${delta} vs baseline`;
  return "Aligned to baseline";
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
    title: "Board Pack | Regulatory Fines",
    description:
      "Generate a MEMA board pack with exposure scoring, peer-case evidence, and committee-ready challenge points built from live enforcement history.",
    keywords:
      "board pack, board advisory pack, enforcement intelligence, compliance board report, exposure score, peer enforcement analysis",
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
  const [activeProfile, setActiveProfile] =
    useState<BoardFirmProfile>(draftProfile);
  const [generatedAt, setGeneratedAt] = useState<Date>(new Date());
  const [editorOpen, setEditorOpen] = useState(false);

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
        .filter((coverage): coverage is NonNullable<typeof coverage> =>
          Boolean(coverage && coverage.operationalConfidence === "lower"),
        ),
    [activeProfile.priorityRegulators],
  );

  const draftDirty = useMemo(
    () => JSON.stringify(draftProfile) !== JSON.stringify(activeProfile),
    [activeProfile, draftProfile],
  );

  const activeArchetype = BOARD_ARCHETYPES_BY_ID[activeProfile.archetypeId];
  const activeBoardFocus = BOARD_FOCUS_OPTIONS.find(
    (option) => option.id === activeProfile.boardFocus,
  );

  const profileSummary = useMemo(() => {
    const themeLabels = activeProfile.priorityThemeIds.length
      ? activeProfile.priorityThemeIds
          .slice(0, 3)
          .map(
            (themeId) =>
              BOARD_THEME_OPTIONS.find((theme) => theme.id === themeId)
                ?.shortLabel,
          )
          .filter((value): value is string => Boolean(value))
      : activeArchetype.defaultThemes
          .slice(0, 3)
          .map(
            (themeId) =>
              BOARD_THEME_OPTIONS.find((theme) => theme.id === themeId)
                ?.shortLabel,
          )
          .filter((value): value is string => Boolean(value));

    const regulators = activeProfile.priorityRegulators.length
      ? activeProfile.priorityRegulators.slice(0, 4)
      : ["All live regulators"];
    const regions = activeProfile.focusRegions.length
      ? activeProfile.focusRegions
      : ["All regions"];

    return `${activeArchetype.label} under a ${activeBoardFocus?.label.toLowerCase() ?? "board assurance"} lens, focused on ${formatList(
      themeLabels.map((label) => label.toLowerCase()),
    )}. Priority regulators: ${formatList(regulators)}. Regions: ${formatList(regions)}.`;
  }, [
    activeArchetype,
    activeBoardFocus,
    activeProfile.focusRegions,
    activeProfile.priorityRegulators,
    activeProfile.priorityThemeIds,
  ]);

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
    setEditorOpen(false);
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
            MEMA advisory deck
          </span>
          <h1>Board Pack</h1>
          <p className="board-intelligence__lede">
            A printable enforcement brief for board and risk committee use,
            built from live enforcement history, peer cases, and evidence-led
            exposure scoring.
          </p>
          <div className="board-intelligence__hero-points">
            <span>
              <FileBadge2 size={16} />
              Designed for board and committee discussion
            </span>
            <span>
              <Gauge size={16} />
              Numeric exposure scoring without false precision
            </span>
            <span>
              <ShieldCheck size={16} />
              Evidence linked back to tracked enforcement actions
            </span>
          </div>
        </div>

        <div className="board-intelligence__hero-card">
          <div className="board-intelligence__hero-stat">
            <span>Prepared for</span>
            <strong>{activeProfile.firmName}</strong>
            <small>{activeArchetype.label}</small>
          </div>
          <div className="board-intelligence__hero-stat">
            <span>Committee lens</span>
            <strong>{activeBoardFocus?.label ?? "Board assurance"}</strong>
            <small>{activeBoardFocus?.description}</small>
          </div>
          <div className="board-intelligence__hero-stat">
            <span>Coverage in scope</span>
            <strong>{REGULATOR_OPTIONS.length} live regulators</strong>
            <small>
              {fines.length.toLocaleString()} tracked actions available
            </small>
          </div>
        </div>
      </section>

      <section className="board-intelligence__setup-shell board-intelligence__no-print">
        <div className="board-intelligence__setup-summary">
          <div>
            <span className="board-intelligence__panel-kicker">
              Profile setup
            </span>
            <h2>{activeProfile.firmName}</h2>
            <p>{profileSummary}</p>
          </div>

          <div className="board-intelligence__builder-actions">
            <button
              type="button"
              className="board-intelligence__secondary"
              onClick={() => setEditorOpen((current) => !current)}
            >
              <SlidersHorizontal size={16} />
              {editorOpen ? "Hide profile editor" : "Refine profile"}
            </button>
            <button
              type="button"
              className="board-intelligence__secondary"
              onClick={handlePrint}
            >
              <Printer size={16} />
              Print / Save PDF
            </button>
            <Link to="/search" className="board-intelligence__link-action">
              Open enforcement search
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>

        {editorOpen && (
          <div className="board-intelligence__panel">
            <div className="board-intelligence__panel-header">
              <div>
                <span className="board-intelligence__panel-kicker">
                  Board pack inputs
                </span>
                <h2>Refine the firm profile</h2>
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
              <button
                type="button"
                className="board-intelligence__secondary"
                onClick={() => setEditorOpen(false)}
              >
                Close editor
              </button>
            </div>

            {draftDirty && (
              <p className="board-intelligence__draft-note">
                Draft changes are not in the printed board pack until you
                regenerate it.
              </p>
            )}
          </div>
        )}
      </section>

      <section className="board-intelligence__report">
        <div className="board-intelligence__report-topline">
          <span className="board-intelligence__panel-kicker">
            MEMA board advisory
          </span>
          <div className="board-intelligence__report-meta">
            <span>
              <CalendarDays size={14} />
              Generated {formatDate(generatedAt.toISOString())}
            </span>
            <span>
              <BriefcaseBusiness size={14} />
              {activeArchetype.label}
            </span>
            <span>
              <FileBadge2 size={14} />
              Board / Risk Committee Use
            </span>
          </div>
        </div>

        {loading && (
          <div className="board-intelligence__empty">
            <LoaderCircle className="board-intelligence__spin" size={36} />
            <h3>Loading live enforcement data</h3>
            <p>
              Pulling the tracked enforcement set so the board pack can be built
              from current coverage.
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
            <article className="board-intelligence__deck-cover board-intelligence__deck-slide">
              <div className="board-intelligence__deck-cover-copy">
                <span className="board-intelligence__panel-kicker">
                  Board pack
                </span>
                <h2>{activeProfile.firmName}</h2>
                <p className="board-intelligence__deck-cover-lede">
                  {pack.summaryHeadline}
                </p>
                <p>{pack.summaryNarrative}</p>
              </div>

              <div className="board-intelligence__cover-facts">
                <article className="board-intelligence__metric-card">
                  <span>Exposure score</span>
                  <strong>{pack.exposureScore}/100</strong>
                  <small>{getBandLabel(pack.exposureBand)} exposure</small>
                </article>
                <article className="board-intelligence__metric-card">
                  <span>Peer baseline</span>
                  <strong>{pack.peerBaselineScore}/100</strong>
                  <small>{getPeerDeltaLabel(pack.peerBaselineDelta)}</small>
                </article>
                <article className="board-intelligence__metric-card">
                  <span>Relevant actions</span>
                  <strong>{pack.relevantActionCount}</strong>
                  <small>{pack.recentActionCount} recent</small>
                </article>
                <article className="board-intelligence__metric-card">
                  <span>Primary regulators</span>
                  <strong>
                    {pack.primaryRegulators.slice(0, 3).join(", ")}
                  </strong>
                  <small>{pack.activeRegulatorCount} regulators in scope</small>
                </article>
              </div>
            </article>

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

            <section className="board-intelligence__deck-slide">
              <div className="board-intelligence__section-heading">
                <Sparkles size={18} />
                <div>
                  <h2>Executive summary</h2>
                  <p>The headline readout for the board and risk committee.</p>
                </div>
              </div>

              <div className="board-intelligence__two-column">
                <div className="board-intelligence__list-panel">
                  <h3>Key messages</h3>
                  <ul>
                    {pack.executiveSummaryBullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                </div>

                <div className="board-intelligence__summary board-intelligence__summary--compact">
                  <div className="board-intelligence__summary-badge">
                    <Gauge size={16} />
                    {pack.peerBaselineLabel}
                  </div>
                  <h3>{pack.summaryHeadline}</h3>
                  <p>{pack.peerBaselineNarrative}</p>
                </div>
              </div>
            </section>

            <section className="board-intelligence__deck-slide">
              <div className="board-intelligence__section-heading">
                <CalendarDays size={18} />
                <div>
                  <h2>Why now</h2>
                  <p>
                    What makes this enforcement profile worth discussing at the
                    next committee cycle.
                  </p>
                </div>
              </div>

              <div className="board-intelligence__two-column">
                <div className="board-intelligence__list-panel">
                  <h3>Current rationale</h3>
                  <ul>
                    {pack.whyNowBullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                </div>

                <div className="board-intelligence__regulator-grid">
                  {pack.regulatorSignals.map((signal) => (
                    <article
                      key={signal.code}
                      className={`board-intelligence__signal-card board-intelligence__signal-card--${signal.band}`}
                    >
                      <div className="board-intelligence__signal-header">
                        <strong>{signal.code}</strong>
                        <span>{signal.score}/100</span>
                      </div>
                      <p>{signal.rationale}</p>
                      <small>
                        {signal.actionCount} actions ·{" "}
                        {signal.recentActionCount} recent
                      </small>
                    </article>
                  ))}
                </div>
              </div>
            </section>

            <section className="board-intelligence__deck-slide">
              <div className="board-intelligence__section-heading">
                <Gauge size={18} />
                <div>
                  <h2>Exposure overview</h2>
                  <p>
                    Overall score, peer baseline, and the four board-facing
                    exposure pillars.
                  </p>
                </div>
              </div>

              <div className="board-intelligence__overview-grid">
                <div className="board-intelligence__overview-highlight">
                  <div className="board-intelligence__summary-badge">
                    <Gauge size={16} />
                    {getBandLabel(pack.exposureBand)} exposure
                  </div>
                  <h3>{pack.exposureScore}/100</h3>
                  <p>{pack.peerBaselineNarrative}</p>
                  <div className="board-intelligence__overview-meta">
                    <span>{getPeerDeltaLabel(pack.peerBaselineDelta)}</span>
                    <span>
                      {formatAmountDisplay(pack.totalAmount)} in scope
                    </span>
                  </div>
                </div>

                <div className="board-intelligence__pillar-grid">
                  {pack.pillarScores.map((pillar) => (
                    <article
                      key={pillar.id}
                      className={`board-intelligence__pillar-card board-intelligence__pillar-card--${pillar.band}`}
                    >
                      <div className="board-intelligence__pillar-topline">
                        <strong>{pillar.label}</strong>
                        <span>{pillar.score}/100</span>
                      </div>
                      <p>{pillar.rationale}</p>
                      <small>
                        {pillar.actionCount} actions ·{" "}
                        {getBandLabel(pillar.band)}
                      </small>
                    </article>
                  ))}
                </div>
              </div>
            </section>

            <section className="board-intelligence__deck-slide">
              <div className="board-intelligence__section-heading">
                <Target size={18} />
                <div>
                  <h2>Key exposure themes</h2>
                  <p>
                    The themes the board should challenge first, with explicit
                    scores and implications.
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
                      <div>
                        <strong>{theme.label}</strong>
                        <p>{theme.score}/100 theme score</p>
                      </div>
                      <span>{getSeverityLabel(theme.severity)}</span>
                    </div>
                    <p>{theme.rationale}</p>
                    <div className="board-intelligence__exposure-metrics">
                      <span>{theme.matchedActions} actions</span>
                      <span>{formatAmountDisplay(theme.totalAmount)}</span>
                      <span>
                        {theme.activeRegulators.join(", ") || "No regulators"}
                      </span>
                    </div>
                    <ul className="board-intelligence__driver-list">
                      {theme.topDrivers.map((driver) => (
                        <li key={driver}>{driver}</li>
                      ))}
                    </ul>
                    <div className="board-intelligence__implication-callout">
                      <strong>Board implication</strong>
                      <p>{theme.boardImplication}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="board-intelligence__deck-slide">
              <div className="board-intelligence__section-heading">
                <BriefcaseBusiness size={18} />
                <div>
                  <h2>Peer cases worth taking to the board</h2>
                  <p>
                    Comparator cases that most closely match the selected
                    profile and should anchor challenge.
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
                        <h3>{caseStudy.firm}</h3>
                        <p>
                          {caseStudy.regulator} ·{" "}
                          {formatDate(caseStudy.dateIssued)}
                        </p>
                      </div>
                      <strong>{formatAmountDisplay(caseStudy.amount)}</strong>
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

            <section className="board-intelligence__deck-slide">
              <div className="board-intelligence__section-heading">
                <LibraryBig size={18} />
                <div>
                  <h2>Implications for the firm</h2>
                  <p>
                    What the evidence implies for oversight, governance, and
                    remediation quality.
                  </p>
                </div>
              </div>

              <div className="board-intelligence__list-panel">
                <h3>Implications</h3>
                <ul>
                  {pack.implications.map((implication) => (
                    <li key={implication}>{implication}</li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="board-intelligence__deck-slide">
              <div className="board-intelligence__section-heading">
                <Sparkles size={18} />
                <div>
                  <h2>Board challenge agenda</h2>
                  <p>
                    Questions that should shape the next board or risk committee
                    conversation.
                  </p>
                </div>
              </div>

              <div className="board-intelligence__list-panel">
                <h3>Questions to ask management</h3>
                <ul>
                  {pack.boardQuestions.map((question) => (
                    <li key={question}>{question}</li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="board-intelligence__deck-slide">
              <div className="board-intelligence__section-heading">
                <ShieldCheck size={18} />
                <div>
                  <h2>Immediate next steps</h2>
                  <p>
                    Restrained follow-up actions grounded in the evidence set.
                  </p>
                </div>
              </div>

              <div className="board-intelligence__list-panel">
                <h3>Recommended follow-up</h3>
                <ul>
                  {pack.nextSteps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="board-intelligence__deck-slide board-intelligence__deck-slide--appendix">
              <div className="board-intelligence__section-heading">
                <Radar size={18} />
                <div>
                  <h2>Appendix</h2>
                  <p>
                    Methodology, supporting case evidence, scenario notes, and
                    the controls challenge.
                  </p>
                </div>
              </div>

              <div className="board-intelligence__appendix-grid">
                <div className="board-intelligence__list-panel">
                  <h3>Methodology</h3>
                  <ul>
                    {pack.appendix.methodology.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </div>

                <div className="board-intelligence__list-panel">
                  <h3>Supporting case file</h3>
                  <ul>
                    {pack.appendix.fullCaseList.map((caseStudy) => (
                      <li key={caseStudy.id}>
                        <strong>{caseStudy.firm}</strong> ·{" "}
                        {caseStudy.regulator} ·{" "}
                        {formatDate(caseStudy.dateIssued)}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="board-intelligence__appendix-grid">
                <div className="board-intelligence__list-panel">
                  <h3>Scenario analysis</h3>
                  <ul>
                    {pack.appendix.scenarioNotes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </div>

                <div className="board-intelligence__list-panel">
                  <h3>Controls evidence notes</h3>
                  <ul>
                    {pack.appendix.controlsNotes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="board-intelligence__appendix-grid">
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

                <div className="board-intelligence__appendix-controls">
                  {controlSummary && (
                    <div className="board-intelligence__control-summary">
                      <div className="board-intelligence__control-summary-card">
                        <span>Residual readiness</span>
                        <strong>
                          {getBandLabel(controlSummary.readinessBand)}
                        </strong>
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
                        <small>
                          Controls not tested or partially evidenced
                        </small>
                      </div>
                    </div>
                  )}

                  {controlSummary && controlSummary.actionItems.length > 0 && (
                    <div className="board-intelligence__list-panel">
                      <h3>Immediate control actions</h3>
                      <ul>
                        {controlSummary.actionItems.map((action) => (
                          <li key={action}>{action}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="board-intelligence__control-grid board-intelligence__no-print">
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
                </div>
              </div>
            </section>
          </>
        )}
      </section>
    </div>
  );
}
