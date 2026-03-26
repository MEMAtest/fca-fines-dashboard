import { Link } from "react-router-dom";
import RegulatorBadge from "./RegulatorBadge.js";

interface RegulatorCardProps {
  code: string;
  name: string;
  coverage: string;
  primaryStatValue: number | string;
  primaryStatLabel: string;
  secondaryStatValue?: number | string;
  secondaryStatLabel?: string;
  badge?: string;
  to?: string;
  href?: string;
  footerLabel?: string;
}

export default function RegulatorCard({
  code,
  name,
  coverage,
  primaryStatValue,
  primaryStatLabel,
  secondaryStatValue,
  secondaryStatLabel,
  badge,
  to,
  href,
  footerLabel,
}: RegulatorCardProps) {
  const content = (
    <>
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
          <span className="regulator-card__stat-value">{primaryStatValue}</span>
          <span className="regulator-card__stat-label">{primaryStatLabel}</span>
        </div>
        <div>
          <span className="regulator-card__stat-value">
            {secondaryStatValue ?? "N/A"}
          </span>
          <span className="regulator-card__stat-label">
            {secondaryStatLabel ?? "Data quality"}
          </span>
        </div>
      </div>

      <div className="regulator-card__footer">
        <span>
          {footerLabel ??
            (href ? "Review official source" : "Open regulator hub")}
        </span>
        <span aria-hidden="true">{"->"}</span>
      </div>
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="regulator-card"
      >
        {content}
      </a>
    );
  }

  if (to) {
    return (
      <Link to={to} className="regulator-card">
        {content}
      </Link>
    );
  }

  return <div className="regulator-card">{content}</div>;
}
