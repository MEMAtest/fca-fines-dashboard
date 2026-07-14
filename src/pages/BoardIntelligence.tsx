import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  ExternalLink,
  FileBadge2,
  LibraryBig,
  LoaderCircle,
  Printer,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import RegulatorMark from "../components/RegulatorMark.js";
import { BoardPackDashboard } from "../components/BoardPackDashboard.js";
import {
  BOARD_ARCHETYPES,
  BOARD_ARCHETYPES_BY_ID,
  BOARD_FOCUS_OPTIONS,
  BOARD_PACK_TEMPLATES,
  BOARD_PACK_TEMPLATES_BY_ID,
  BOARD_THEME_OPTIONS,
  DEFAULT_BOARD_PACK_SETTINGS,
  DEFAULT_BOARD_PROFILE,
  type BoardArchetypeId,
  type BoardFirmProfile,
  type BoardFocusId,
  type BoardPackBrandingMode,
  type BoardPackPresentationSettings,
  type BoardPackTemplateId,
  type BoardPackViewMode,
  type BoardThemeId,
  type SavedBoardPackProfile,
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
} from "../utils/boardIntelligence.js";
import { trackEvent } from "../utils/analytics.js";
import "../styles/board-intelligence.css";

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

function formatSavedProfileDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function toggleSelection<T>(values: T[], value: T) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function normalizePresentationSettings(
  settings: Partial<BoardPackPresentationSettings> | null | undefined,
): BoardPackPresentationSettings {
  return {
    ...DEFAULT_BOARD_PACK_SETTINGS,
    ...settings,
  };
}

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
  const [draftSettings, setDraftSettings] =
    useLocalStorage<BoardPackPresentationSettings>(
      "board-pack-settings-v1",
      DEFAULT_BOARD_PACK_SETTINGS,
    );
  const [controlStatuses, setControlStatuses] = useLocalStorage<
    Record<string, ControlStatus>
  >("board-pack-control-statuses-v1", {});
  const [savedProfiles, setSavedProfiles] = useLocalStorage<
    SavedBoardPackProfile[]
  >("board-pack-saved-profiles-v1", []);
  const [activeProfile, setActiveProfile] =
    useState<BoardFirmProfile>(draftProfile);
  const [activeSettings, setActiveSettings] =
    useState<BoardPackPresentationSettings>(
      normalizePresentationSettings(draftSettings),
    );
  const [generatedAt, setGeneratedAt] = useState<Date>(new Date());
  const [editorOpen, setEditorOpen] = useState(false);
  const normalizedDraftSettings = useMemo(
    () => normalizePresentationSettings(draftSettings),
    [draftSettings],
  );

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

  useEffect(() => {
    setDraftSettings((current) => normalizePresentationSettings(current));
  }, [setDraftSettings]);

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
    () =>
      JSON.stringify(draftProfile) !== JSON.stringify(activeProfile) ||
      JSON.stringify(normalizedDraftSettings) !==
        JSON.stringify(activeSettings),
    [activeProfile, activeSettings, draftProfile, normalizedDraftSettings],
  );

  const activeArchetype = BOARD_ARCHETYPES_BY_ID[activeProfile.archetypeId];
  const activeBoardFocus = BOARD_FOCUS_OPTIONS.find(
    (option) => option.id === activeProfile.boardFocus,
  );
  const activeTemplate = activeSettings.templateId
    ? BOARD_PACK_TEMPLATES_BY_ID[activeSettings.templateId]
    : null;
  const boardMode = activeSettings.viewMode === "board";

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

  function updateDraftSettings(
    patch:
      | Partial<BoardPackPresentationSettings>
      | ((
          current: BoardPackPresentationSettings,
        ) => BoardPackPresentationSettings),
  ) {
    setDraftSettings((current) =>
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

  function applyBoardPackTemplate(templateId: BoardPackTemplateId) {
    const template = BOARD_PACK_TEMPLATES_BY_ID[templateId];
    if (!template) {
      return;
    }

    setDraftProfile(template.profile);
    setDraftSettings((current) => ({
      ...current,
      ...DEFAULT_BOARD_PACK_SETTINGS,
      ...template.settings,
      templateId: template.id,
    }));
  }

  function saveCurrentProfile() {
    const label =
      normalizedDraftSettings.clientLabel.trim() ||
      draftProfile.firmName.trim() ||
      "Untitled board pack";
    const updatedAt = new Date().toISOString();

    setSavedProfiles((current) => {
      const existingIndex = current.findIndex((item) => item.label === label);
      const nextProfile: SavedBoardPackProfile = {
        id:
          existingIndex >= 0
            ? current[existingIndex].id
            : `board-pack-${updatedAt}`,
        label,
        profile: draftProfile,
        settings: normalizedDraftSettings,
        updatedAt,
      };

      const next =
        existingIndex >= 0
          ? current.map((item, index) =>
              index === existingIndex ? nextProfile : item,
            )
          : [nextProfile, ...current];

      return next.slice(0, 8);
    });
  }

  function loadSavedProfile(savedProfile: SavedBoardPackProfile) {
    const normalizedSettings = normalizePresentationSettings(
      savedProfile.settings,
    );
    setDraftProfile(savedProfile.profile);
    setDraftSettings(normalizedSettings);
    setActiveProfile(savedProfile.profile);
    setActiveSettings(normalizedSettings);
    setGeneratedAt(new Date());
    setEditorOpen(false);
  }

  function deleteSavedProfile(profileId: string) {
    setSavedProfiles((current) =>
      current.filter((savedProfile) => savedProfile.id !== profileId),
    );
  }

  function generateBoardPack() {
    trackEvent("board_pack_start", {
      template: normalizedDraftSettings.templateId,
      archetype: draftProfile.archetypeId,
      focus: draftProfile.boardFocus,
    });
    setActiveProfile(draftProfile);
    setActiveSettings(normalizedDraftSettings);
    setGeneratedAt(new Date());
    setEditorOpen(false);
  }

  function handlePrint() {
    trackEvent("board_pack_export", {
      mode: "print",
      branding: activeSettings.brandingMode,
    });
    if (typeof window !== "undefined") {
      window.print();
    }
  }

  return (
    <div
      className={`board-intelligence board-intelligence--${activeSettings.brandingMode} board-intelligence--${activeSettings.viewMode}`}
    >
      <header className="board-intelligence__topbar">
        <div>
          <span className="board-intelligence__eyebrow">
            Board intelligence
          </span>
          <h1>Board Pack</h1>
          <p>
            Concise enforcement intelligence and control challenge for board and
            risk committee decision-making.
          </p>
        </div>
        <a
          href="https://memaconsultants.com"
          target="_blank"
          rel="noreferrer"
          className="board-intelligence__advisory-link board-intelligence__no-print"
          onClick={() =>
            trackEvent("mema_advisory_click", {
              source: "board_pack_header",
              firmType: activeProfile.archetypeId,
            })
          }
        >
          MEMA advisory support
          <ExternalLink size={14} />
        </a>
      </header>

      <section className="board-intelligence__setup-shell board-intelligence__no-print">
        <div className="board-intelligence__setup-summary">
          <div className="board-intelligence__setup-toolbar-label">
            <span className="board-intelligence__panel-kicker">
              Active profile
            </span>
            <strong>{activeProfile.firmName}</strong>
            <span>{boardMode ? "Board summary" : "Working copy"}</span>
            {activeTemplate && <span>{activeTemplate.label}</span>}
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

        {savedProfiles.length > 0 && (
          <div className="board-intelligence__saved-profiles">
            <div className="board-intelligence__panel-header">
              <div>
                <span className="board-intelligence__panel-kicker">
                  Saved packs
                </span>
                <h2>Reusable profile snapshots</h2>
              </div>
              <FileBadge2 size={18} />
            </div>
            <div className="board-intelligence__saved-grid">
              {savedProfiles.map((savedProfile) => (
                <article
                  key={savedProfile.id}
                  className="board-intelligence__saved-card"
                >
                  <div>
                    <strong>{savedProfile.label}</strong>
                    <p>
                      {savedProfile.settings.viewMode === "board"
                        ? "Board summary"
                        : "Working copy"}{" "}
                      · Updated {formatSavedProfileDate(savedProfile.updatedAt)}
                    </p>
                  </div>
                  <div className="board-intelligence__builder-actions">
                    <button
                      type="button"
                      className="board-intelligence__secondary"
                      onClick={() => loadSavedProfile(savedProfile)}
                    >
                      Load
                    </button>
                    <button
                      type="button"
                      className="board-intelligence__secondary"
                      onClick={() => deleteSavedProfile(savedProfile.id)}
                    >
                      Remove
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

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

            <div className="board-intelligence__field">
              <span>Reusable templates</span>
              <div className="board-intelligence__template-grid">
                {BOARD_PACK_TEMPLATES.map((template) => {
                  const selected =
                    normalizedDraftSettings.templateId === template.id;
                  return (
                    <button
                      key={template.id}
                      type="button"
                      className={`board-intelligence__template-card${selected ? " board-intelligence__template-card--active" : ""}`}
                      onClick={() => applyBoardPackTemplate(template.id)}
                    >
                      <strong>{template.label}</strong>
                      <span>{template.description}</span>
                    </button>
                  );
                })}
              </div>
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

            <label className="board-intelligence__field">
              <span>Audience mode</span>
              <select
                aria-label="Audience mode"
                value={normalizedDraftSettings.viewMode}
                onChange={(event) =>
                  updateDraftSettings({
                    viewMode: event.target.value as BoardPackViewMode,
                  })
                }
              >
                <option value="board">Board summary</option>
                <option value="working">Working copy</option>
              </select>
              <small>
                Board summary compresses supporting detail. Working copy keeps
                the deeper scenario and controls appendix open.
              </small>
            </label>

            <label className="board-intelligence__field">
              <span>Branding mode</span>
              <select
                aria-label="Branding mode"
                value={normalizedDraftSettings.brandingMode}
                onChange={(event) =>
                  updateDraftSettings({
                    brandingMode: event.target.value as BoardPackBrandingMode,
                  })
                }
              >
                <option value="mema">MEMA advisory</option>
                <option value="client-ready">Client-ready presentation</option>
              </select>
            </label>

            <label className="board-intelligence__field">
              <span>Client label</span>
              <input
                type="text"
                aria-label="Client label"
                value={normalizedDraftSettings.clientLabel}
                onChange={(event) =>
                  updateDraftSettings({ clientLabel: event.target.value })
                }
                placeholder="Example: NorthStar Payments plc"
              />
            </label>

            <label className="board-intelligence__field">
              <span>Confidentiality label</span>
              <input
                type="text"
                aria-label="Confidentiality label"
                value={normalizedDraftSettings.confidentialityLabel}
                onChange={(event) =>
                  updateDraftSettings({
                    confidentialityLabel: event.target.value,
                  })
                }
                placeholder="Board / Risk Committee Use"
              />
            </label>

            <label className="board-intelligence__field">
              <span>MEMA advisory note</span>
              <textarea
                aria-label="MEMA advisory note"
                value={normalizedDraftSettings.analystNote}
                onChange={(event) =>
                  updateDraftSettings({ analystNote: event.target.value })
                }
                rows={4}
                placeholder="Optional consultant note to sit near the executive summary."
              />
              <small>
                Use this for a short consultancy overlay, not for replacing the
                evidence-led deck.
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
                      <RegulatorMark
                        regulator={coverage.code}
                        label={coverage.fullName}
                        country={coverage.country}
                        size="small"
                        decorative
                      />
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
                onClick={saveCurrentProfile}
              >
                Save current profile
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
            {activeSettings.brandingMode === "client-ready"
              ? "MEMA client-ready advisory"
              : "MEMA board advisory"}
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
              {activeSettings.confidentialityLabel}
            </span>
            {activeSettings.clientLabel && (
              <span>
                <LibraryBig size={14} />
                {activeSettings.clientLabel}
              </span>
            )}
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
          <BoardPackDashboard
            pack={pack}
            profileSummary={profileSummary}
            archetypeLabel={activeArchetype.label}
            boardFocusLabel={activeBoardFocus?.label ?? "Board assurance"}
            generatedLabel={formatDate(generatedAt.toISOString())}
            confidentialityLabel={activeSettings.confidentialityLabel}
            clientLabel={activeSettings.clientLabel}
            analystNote={activeSettings.analystNote}
            workingMode={!boardMode}
            lowerConfidenceCodes={lowerConfidenceSelections.map(
              (coverage) => coverage.code,
            )}
            controlSummary={controlSummary}
            controlChecklist={controlChecklist}
            controlStatuses={controlStatuses}
            onControlStatusChange={(controlId, status) =>
              setControlStatuses((current) => ({
                ...current,
                [controlId]: status,
              }))
            }
          />
        )}

      </section>
    </div>
  );
}
