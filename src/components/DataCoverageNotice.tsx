import { AlertCircle, Info } from 'lucide-react';
import type { RegulatorCoverage } from '../data/regulatorCoverage';
import '../styles/data-coverage-notice.css';

interface DataCoverageNoticeProps {
  coverage: RegulatorCoverage;
  showWarning?: boolean;
}

export function DataCoverageNotice({ coverage, showWarning = true }: DataCoverageNoticeProps) {
  const isLimitedSample = coverage.count < 10;
  const isEmerging = coverage.earliestYear >= 2021;
  const shouldShowWarning = showWarning && (isLimitedSample || isEmerging);

  return (
    <div className={`data-coverage ${shouldShowWarning ? 'data-coverage--warning' : 'data-coverage--info'}`}>
      <div className="data-coverage__icon">
        {shouldShowWarning ? <AlertCircle size={20} /> : <Info size={20} />}
      </div>
      <div className="data-coverage__content">
        <div className="data-coverage__header">
          <strong>Data Coverage: {coverage.years}</strong>
          <span className="data-coverage__badge">{coverage.count} enforcement actions</span>
        </div>
        {coverage.note && (
          <p className="data-coverage__note">{coverage.note}</p>
        )}
        {isLimitedSample && (
          <p className="data-coverage__warning-text">
            ⚠️ Small sample size ({coverage.count} fines) - statistics may not be fully representative
          </p>
        )}
      </div>
    </div>
  );
}
