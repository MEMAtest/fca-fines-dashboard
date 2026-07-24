import { AlertCircle, Info } from "lucide-react";
import type { RegulatorCoverage } from "../data/regulatorCoverage.js";
import "../styles/data-coverage-notice.css";

interface DataCoverageNoticeProps {
  coverage: RegulatorCoverage;
  showWarning?: boolean;
  recordCount?: number;
}

export function DataCoverageNotice({
  coverage,
  showWarning = true,
  recordCount,
}: DataCoverageNoticeProps) {
  const displayedCount = recordCount ?? coverage.count;
  const isLowerConfidence =
    coverage.stage === "live" && coverage.operationalConfidence === "lower";
  const isLimitedSample = displayedCount < 10;
  const isRecentWindow = coverage.earliestYear >= 2021;
  const shouldShowWarning =
    showWarning && (isLowerConfidence || isLimitedSample || isRecentWindow);
  const lowerConfidenceMessage =
    coverage.automationLevel === "curated_archive"
      ? "This regulator publishes outcomes across separate official documents. Treat trend comparisons as directional while the historical record is expanded."
      : coverage.automationLevel === "sparse_source"
        ? "This regulator is live, but the official source publishes very few explicit monetary penalties. Trend views are directionally useful, but the source itself remains sparse."
        : coverage.automationLevel === "low_frequency"
          ? "This regulator's official source publishes enforcement outcomes irregularly. The archive is monitored in full, but quiet periods make trend comparisons directional."
        : "This regulator currently has a thinner official publication history than the anchor datasets. Treat trend comparisons as directional while coverage expands.";
  const modifierClass = shouldShowWarning
    ? isLowerConfidence
      ? "data-coverage--caution"
      : "data-coverage--warning"
    : "data-coverage--info";

  return (
    <div className={`data-coverage ${modifierClass}`}>
      <div className="data-coverage__icon">
        {shouldShowWarning ? <AlertCircle size={20} /> : <Info size={20} />}
      </div>
      <div className="data-coverage__content">
        <div className="data-coverage__header">
          <strong>Data Coverage: {coverage.years}</strong>
          <span className="data-coverage__badge">
            {displayedCount.toLocaleString()} enforcement actions
          </span>
        </div>
        <p className="data-coverage__note">
          Based on official regulator publications. Coverage is reviewed
          regularly, with source evidence linked from individual actions where
          available.
        </p>
        {isLowerConfidence && (
          <p className="data-coverage__warning-text">
            {lowerConfidenceMessage}
          </p>
        )}
        {isLimitedSample && (
          <p className="data-coverage__warning-text">
            Small sample size ({displayedCount} actions). Statistics may not yet
            be fully representative.
          </p>
        )}
        {!isLowerConfidence && !isLimitedSample && isRecentWindow && (
          <p className="data-coverage__warning-text">
            The currently published live window begins in{" "}
            {coverage.earliestYear}. Earlier archive coverage is still being
            expanded.
          </p>
        )}
      </div>
    </div>
  );
}
