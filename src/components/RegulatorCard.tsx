import { Link } from 'react-router-dom';
import RegulatorBadge from './RegulatorBadge';

interface RegulatorCardProps {
  code: string;
  name: string;
  coverage: string;
  finesCount: number;
  dataQuality?: string;
  badge?: string;
  to: string;
}

export default function RegulatorCard({
  code,
  name,
  coverage,
  finesCount,
  dataQuality,
  badge,
  to,
}: RegulatorCardProps) {
  return (
    <Link to={to} className="regulator-card">
      <div className="regulator-card__header">
        <RegulatorBadge regulator={code} size="medium" />
        {badge ? <span className="regulator-card__badge">{badge}</span> : null}
      </div>

      <div className="regulator-card__body">
        <h3 className="regulator-card__name">{name}</h3>
        <p className="regulator-card__meta">{coverage} coverage</p>
      </div>

      <div className="regulator-card__stats">
        <div>
          <span className="regulator-card__stat-value">{finesCount}</span>
          <span className="regulator-card__stat-label">Actions tracked</span>
        </div>
        <div>
          <span className="regulator-card__stat-value">{dataQuality ?? 'N/A'}</span>
          <span className="regulator-card__stat-label">Data quality</span>
        </div>
      </div>

      <div className="regulator-card__footer">
        <span>Open regulator hub</span>
        <span aria-hidden="true">{'->'}</span>
      </div>
    </Link>
  );
}
