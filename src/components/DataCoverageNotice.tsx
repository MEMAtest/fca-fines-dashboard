import { AlertCircle, Info } from "lucide-react";
import type { RegulatorCoverage } from "../data/regulatorCoverage.js";
import "../styles/data-coverage-notice.css";

interface DataCoverageNoticeProps {
  coverage: RegulatorCoverage;
  showWarning?: boolean;
}

export function DataCoverageNotice({
  coverage,
  showWarning = true,
}: DataCoverageNoticeProps) {
  const isLowerConfidence =
    coverage.stage === "live" && coverage.operationalConfidence === "lower";
  const isLimitedSample = coverage.count < 10;
  const isRecentWindow = coverage.earliestYear >= 2021;
  const shouldShowWarning =
    showWarning && (isLowerConfidence || isLimitedSample || isRecentWindow);
  const lowerConfidenceMessage =
    coverage.automationLevel === "curated_archive"
      ? "This regulator is live, but the collection path still depends on curated archive discovery from official documents and manifests. Treat trend comparisons as directional while the feed matures."
      : coverage.automationLevel === "sparse_source"
        ? "This regulator is live, but the official source publishes very few explicit monetary penalties. Trend views are directionally useful, but the source itself remains sparse."
        : "This regulator is live, but the collection path still depends on thinner official-source coverage than the anchor feeds. Treat trend comparisons as directional while the feed matures.";
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
            {coverage.count} enforcement actions
          </span>
        </div>
        {coverage.note && (
          <p className="data-coverage__note">{coverage.note}</p>
        )}
        {isLowerConfidence && (
          <p className="data-coverage__warning-text">
            {lowerConfidenceMessage}
          </p>
        )}
        {isLimitedSample && (
          <p className="data-coverage__warning-text">
            Small sample size ({coverage.count} actions). Statistics may not yet
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
