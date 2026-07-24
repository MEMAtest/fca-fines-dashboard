import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  CircleHelp,
  ClipboardCheck,
  FileSearch,
  Gauge,
  Landmark,
  ListChecks,
  ShieldCheck,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import RegulatorMark from "./RegulatorMark.js";
import type {
  ControlChallengeSummary,
  ControlChecklistItem,
  ControlStatus,
  BoardPackResult,
  ExposureBand,
} from "../utils/boardIntelligence.js";
import "../styles/board-pack-dashboard.css";

interface BoardPackDashboardProps {
  pack: BoardPackResult;
  profileSummary: string;
  archetypeLabel: string;
  boardFocusLabel: string;
  generatedLabel: string;
  confidentialityLabel: string;
  clientLabel: string;
  analystNote: string;
  workingMode: boolean;
  readOnly?: boolean;
  lowerConfidenceCodes: string[];
  controlSummary: ControlChallengeSummary | null;
  controlChecklist: ControlChecklistItem[];
  controlStatuses: Record<string, ControlStatus>;
  onControlStatusChange: (controlId: string, status: ControlStatus) => void;
}

const DRIVER_COLOURS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6"];

const CONTROL_STATUS_OPTIONS: ControlStatus[] = [
  "unassessed",
  "not-tested",
  "needs-work",
  "evidence-partial",
  "evidenced",
];

function getBandLabel(band: ExposureBand) {
  if (band === "severe") return "High";
  if (band === "material") return "Material";
  if (band === "moderate") return "Moderate";
  return "Low";
}

function getStatusLabel(status: ControlStatus) {
  if (status === "unassessed") return "Unassessed";
  if (status === "needs-work") return "Needs work";
  if (status === "evidence-partial") return "Partially evidenced";
  if (status === "evidenced") return "Evidenced";
  return "Not tested";
}

function formatDate(value: string | null) {
  if (!value) return "Date not recorded";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function buildDriverGradient(scores: number[]) {
  const safeScores = scores.map((score) => Math.max(score, 1));
  const total = safeScores.reduce((sum, score) => sum + score, 0) || 1;
  let cursor = 0;
  const stops = safeScores.map((score, index) => {
    const start = cursor;
    cursor += (score / total) * 100;
    return `${DRIVER_COLOURS[index % DRIVER_COLOURS.length]} ${start.toFixed(1)}% ${cursor.toFixed(1)}%`;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

function ScoreMeter({
  value,
  benchmark,
}: {
  value: number;
  benchmark?: number;
}) {
  return (
    <div
      className="board-pack-dashboard__meter"
      aria-label={`Score ${value} out of 100`}
    >
      <span style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }} />
      {typeof benchmark === "number" && (
        <i style={{ left: `${Math.min(Math.max(benchmark, 0), 100)}%` }} />
      )}
    </div>
  );
}

export function BoardPackDashboard({
  pack,
  profileSummary,
  archetypeLabel,
  boardFocusLabel,
  generatedLabel,
  confidentialityLabel,
  clientLabel,
  analystNote,
  workingMode,
  readOnly = false,
  lowerConfidenceCodes,
  controlSummary,
  controlChecklist,
  controlStatuses,
  onControlStatusChange,
}: BoardPackDashboardProps) {
  const driverThemes = pack.topThemes.slice(0, 5);
  const driverTotal =
    driverThemes.reduce((sum, theme) => sum + Math.max(theme.score, 1), 0) || 1;
  const actionItems = [...pack.recommendedActions, ...pack.nextSteps].filter(
    (item, index, all) => all.indexOf(item) === index,
  );

  return (
    <div className="board-pack-dashboard">
      <header className="board-pack-dashboard__profile-header">
        <div>
          <span className="board-pack-dashboard__eyebrow">
            Board intelligence pack
          </span>
          <h2>{pack.profile.firmName}</h2>
          {clientLabel && (
            <p className="board-pack-dashboard__client">
              Prepared for {clientLabel}
            </p>
          )}
          <p>{profileSummary}</p>
          <div className="board-pack-dashboard__chips">
            <span>{archetypeLabel}</span>
            <span>{boardFocusLabel}</span>
            <span>Generated {generatedLabel}</span>
            <span>{confidentialityLabel}</span>
          </div>
        </div>
        <div className="board-pack-dashboard__headline-score">
          <span>Enforcement pressure</span>
          <strong>
            {pack.exposureScore}
            <small>/100</small>
          </strong>
          <em
            className={`board-pack-dashboard__band board-pack-dashboard__band--${pack.exposureBand}`}
          >
            {getBandLabel(pack.exposureBand)} external pressure
          </em>
          <ScoreMeter
            value={pack.exposureScore}
            benchmark={pack.peerBaselineScore}
          />
          <small>Reference benchmark {pack.peerBaselineScore}</small>
        </div>
      </header>

      <section
        className="board-pack-dashboard__kpis"
        aria-label="Board pack key indicators"
      >
        <article>
          <Gauge size={18} />
          <span>Enforcement pressure</span>
          <strong>{pack.exposureScore}/100</strong>
          <small>{getBandLabel(pack.exposureBand)} external pressure</small>
        </article>
        <article>
          <ShieldCheck size={18} />
          <span>Control readiness</span>
          <strong>
            {controlSummary
              ? controlSummary.readinessBand
                ? getBandLabel(controlSummary.readinessBand)
                : "Unassessed"
              : "Unassessed"}
          </strong>
          <small>
            {controlSummary?.challengeHeadline ??
              "Control evidence review required"}
          </small>
        </article>
        <article>
          <ClipboardCheck size={18} />
          <span>Assessed controls</span>
          <strong>{controlSummary?.assessedControlCount ?? 0}</strong>
          <small>Based only on supplied responses</small>
        </article>
        <article>
          <FileSearch size={18} />
          <span>Control prompts</span>
          <strong>{controlChecklist.length}</strong>
          <small>Evidence requests for management</small>
        </article>
      </section>

      {lowerConfidenceCodes.length > 0 && (
        <div className="board-pack-dashboard__coverage-warning">
          <AlertCircle size={17} />
          <span>
            Directional source coverage applies to{" "}
            {lowerConfidenceCodes.join(", ")}. Validate material decisions
            against the linked official evidence.
          </span>
        </div>
      )}

      <div className="board-pack-dashboard__grid">
        {pack.selectedCases.length > 0 && (
          <section className="board-pack-dashboard__card board-pack-dashboard__card--wide">
            <div className="board-pack-dashboard__card-heading">
              <FileSearch size={19} />
              <h2>Cases selected for this pack</h2>
            </div>
            <div className="board-pack-dashboard__signals">
              {pack.selectedCases.map((caseStudy) => (
                <div key={caseStudy.id}>
                  <i />
                  <span><strong>{caseStudy.regulator}: {caseStudy.firm}</strong><small>{caseStudy.breachType ?? caseStudy.reason}</small></span>
                  <time dateTime={caseStudy.dateIssued}>{formatDate(caseStudy.dateIssued)}</time>
                </div>
              ))}
            </div>
          </section>
        )}
        <section className="board-pack-dashboard__card board-pack-dashboard__card--takeaways">
          <div className="board-pack-dashboard__card-heading">
            <Target size={19} />
            <h2>Executive takeaways</h2>
          </div>
          <ul className="board-pack-dashboard__check-list">
            {pack.executiveSummaryBullets.slice(0, 4).map((bullet) => (
              <li key={bullet}>
                <CheckCircle2 size={15} />
                {bullet}
              </li>
            ))}
          </ul>
          <div className="board-pack-dashboard__conclusion">
            <strong>Key conclusion</strong>
            <p>{pack.summaryHeadline}</p>
          </div>
        </section>

        <section className="board-pack-dashboard__card">
          <div className="board-pack-dashboard__card-heading">
            <BarChart3 size={19} />
            <h2>Exposure drivers</h2>
          </div>
          <div className="board-pack-dashboard__drivers">
            <div
              className="board-pack-dashboard__donut"
              style={{
                background: buildDriverGradient(
                  driverThemes.map((theme) => theme.score),
                ),
              }}
              role="img"
              aria-label="Share of exposure by leading theme"
            >
              <div>
                <strong>{pack.exposureScore}</strong>
                <span>Exposure</span>
              </div>
            </div>
            <ol className="board-pack-dashboard__legend">
              {driverThemes.map((theme, index) => (
                <li key={theme.id}>
                  <i style={{ background: DRIVER_COLOURS[index] }} />
                  <span>{theme.shortLabel}</span>
                  <strong>
                    {Math.round((Math.max(theme.score, 1) / driverTotal) * 100)}
                    %
                  </strong>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="board-pack-dashboard__card">
          <div className="board-pack-dashboard__card-heading">
            <Users size={19} />
            <h2>Peer comparison</h2>
          </div>
          <div className="board-pack-dashboard__comparison">
            <div>
              <span>Exposure score</span>
              <strong>{pack.exposureScore}</strong>
              <ScoreMeter
                value={pack.exposureScore}
                benchmark={pack.peerBaselineScore}
              />
              <small>Peer average {pack.peerBaselineScore}</small>
            </div>
            {pack.pillarScores.slice(0, 3).map((pillar) => (
              <div key={pillar.id}>
                <span>{pillar.label}</span>
                <strong>{pillar.score}</strong>
                <ScoreMeter value={pillar.score} />
                <small>{pillar.actionCount} matched actions</small>
              </div>
            ))}
          </div>
        </section>

        <section className="board-pack-dashboard__card">
          <div className="board-pack-dashboard__card-heading">
            <Landmark size={19} />
            <h2>Top regulators shaping this profile</h2>
          </div>
          <div className="board-pack-dashboard__regulators">
            {pack.regulatorSignals.slice(0, 5).map((signal) => (
              <div key={signal.code}>
                <RegulatorMark
                  regulator={signal.code}
                  label={signal.label}
                  size="small"
                  decorative
                />
                <span>
                  <strong>{signal.code}</strong>
                  <small>{signal.label}</small>
                </span>
                <em
                  className={`board-pack-dashboard__band board-pack-dashboard__band--${signal.band}`}
                >
                  {getBandLabel(signal.band)}
                </em>
              </div>
            ))}
          </div>
        </section>

        <section className="board-pack-dashboard__card">
          <div className="board-pack-dashboard__card-heading">
            <TrendingUp size={19} />
            <h2>Why this matters now</h2>
          </div>
          <ul className="board-pack-dashboard__plain-list">
            {pack.whyNowBullets.slice(0, 4).map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
        </section>

        <section className="board-pack-dashboard__card">
          <div className="board-pack-dashboard__card-heading">
            <AlertCircle size={19} />
            <h2>Key scenarios</h2>
          </div>
          <div className="board-pack-dashboard__scenario-list">
            {pack.scenarios.slice(0, 4).map((scenario) => (
              <article key={scenario.themeId}>
                <div>
                  <strong>{scenario.themeLabel}</strong>
                  <small>{scenario.headline}</small>
                </div>
                <em
                  className={`board-pack-dashboard__band board-pack-dashboard__band--${scenario.band}`}
                >
                  {getBandLabel(scenario.band)}
                </em>
              </article>
            ))}
          </div>
        </section>

        <section className="board-pack-dashboard__card">
          <div className="board-pack-dashboard__card-heading">
            <ClipboardCheck size={19} />
            <h2>Control evidence prompts</h2>
          </div>
          <div className="board-pack-dashboard__control-list">
            {controlChecklist.slice(0, workingMode ? 8 : 5).map((item) => {
              const status = controlStatuses[item.id] ?? item.defaultStatus;
              return (
                <div key={item.id}>
                  <span>
                    <strong>{item.control}</strong>
                    <small>{item.themeLabel}</small>
                  </span>
                  {workingMode && !readOnly ? (
                    <select
                      value={status}
                      onChange={(event) =>
                        onControlStatusChange(
                          item.id,
                          event.target.value as ControlStatus,
                        )
                      }
                      aria-label={`Control status for ${item.control}`}
                    >
                      {CONTROL_STATUS_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {getStatusLabel(option)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <em
                      className={`board-pack-dashboard__status board-pack-dashboard__status--${status}`}
                    >
                      {getStatusLabel(status)}
                    </em>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="board-pack-dashboard__card">
          <div className="board-pack-dashboard__card-heading">
            <ListChecks size={19} />
            <h2>Actions for next committee cycle</h2>
          </div>
          <ol className="board-pack-dashboard__actions">
            {actionItems.slice(0, 5).map((action, index) => (
              <li key={action}>
                <span>{index < 2 ? "P1" : "P2"}</span>
                <p>{action}</p>
                <strong>{index + 1}</strong>
              </li>
            ))}
          </ol>
        </section>

        <section className="board-pack-dashboard__card board-pack-dashboard__card--questions">
          <div className="board-pack-dashboard__card-heading">
            <CircleHelp size={19} />
            <h2>Board challenge agenda</h2>
          </div>
          <ul>
            {pack.boardQuestions.slice(0, 4).map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </section>

        <section className="board-pack-dashboard__card board-pack-dashboard__card--responses">
          <div className="board-pack-dashboard__card-heading">
            <ShieldCheck size={19} />
            <h2>Recommended management responses</h2>
          </div>
          <ul className="board-pack-dashboard__check-list">
            {pack.recommendedActions.slice(0, 5).map((action) => (
              <li key={action}>
                <CheckCircle2 size={15} />
                {action}
              </li>
            ))}
          </ul>
        </section>

        <section className="board-pack-dashboard__card">
          <div className="board-pack-dashboard__card-heading">
            <TrendingUp size={19} />
            <h2>Recent enforcement signals</h2>
          </div>
          <div className="board-pack-dashboard__signals">
            {pack.notableCases.slice(0, 5).map((caseStudy) => (
              <div key={caseStudy.id}>
                <i />
                <span>
                  <strong>
                    {caseStudy.regulator}: {caseStudy.firm}
                  </strong>
                  <small>{caseStudy.breachType ?? caseStudy.reason}</small>
                </span>
                <time dateTime={caseStudy.dateIssued}>
                  {formatDate(caseStudy.dateIssued)}
                </time>
              </div>
            ))}
          </div>
        </section>

        <section className="board-pack-dashboard__card">
          <div className="board-pack-dashboard__card-heading">
            <FileSearch size={19} />
            <h2>Key evidence</h2>
          </div>
          <ul className="board-pack-dashboard__evidence">
            <li>
              <strong>{pack.relevantActionCount}</strong>
              <span>matched enforcement actions analysed</span>
            </li>
            <li>
              <strong>{pack.recentActionCount}</strong>
              <span>actions in the recent analysis window</span>
            </li>
            <li>
              <strong>{pack.activeRegulatorCount}</strong>
              <span>regulators represented in scope</span>
            </li>
            <li>
              <strong>{pack.notableCases.length}</strong>
              <span>priority cases selected for board challenge</span>
            </li>
          </ul>
        </section>

        {analystNote.trim() && (
          <section className="board-pack-dashboard__card board-pack-dashboard__card--wide board-pack-dashboard__advisory">
            <div className="board-pack-dashboard__card-heading">
              <FileSearch size={19} />
              <h2>MEMA advisory note</h2>
            </div>
            <p>{analystNote}</p>
          </section>
        )}

        <section className="board-pack-dashboard__card board-pack-dashboard__card--wide board-pack-dashboard__appendix">
          <div className="board-pack-dashboard__card-heading">
            <ListChecks size={19} />
            <h2>Appendix</h2>
          </div>
          <div>
            <details>
              <summary>Methodology</summary>
              <ul>
                {pack.appendix.methodology.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </details>
            <details>
              <summary>Scenario notes</summary>
              <ul>
                {pack.appendix.scenarioNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </details>
            <details>
              <summary>Supporting case file</summary>
              <ul>
                {pack.appendix.fullCaseList
                  .slice(0, workingMode ? 12 : 6)
                  .map((caseStudy) => (
                    <li key={caseStudy.id}>
                      {caseStudy.regulator}: {caseStudy.firm}
                    </li>
                  ))}
              </ul>
            </details>
          </div>
        </section>
      </div>

      <footer className="board-pack-dashboard__footer">
        <span>
          Based on selected scope and linked regulatory evidence. Data reviewed{" "}
          {generatedLabel}.
        </span>
        <strong>{confidentialityLabel}</strong>
      </footer>
    </div>
  );
}
