import { getRegulatorCoverage } from "../data/regulatorCoverage.js";
import RegulatorMark from "./RegulatorMark.js";
import "../styles/regulator-badge.css";

interface RegulatorBadgeProps {
  regulator: string;
  country?: string;
  size?: "small" | "medium" | "large";
  showTooltip?: boolean;
}

function getCoverageItem(code: string) {
  return getRegulatorCoverage(code);
}

const RegulatorBadge = ({
  regulator,
  country,
  size = "medium",
  showTooltip = true,
}: RegulatorBadgeProps) => {
  const item = getCoverageItem(regulator);
  const title = showTooltip
    ? `${item?.fullName ?? regulator}${country || item?.country ? ` (${country || item?.country})` : ""}`
    : undefined;

  return (
    <span
      className={`regulator-badge regulator-badge--${size}`}
      title={title}
      aria-label={title || regulator}
    >
      <RegulatorMark
        regulator={regulator}
        label={item?.fullName}
        country={country || item?.country}
        size={size}
        decorative
      />
      <span className="regulator-badge__code">{regulator}</span>
      {showTooltip && (
        <span className="sr-only">
          {item?.fullName ?? regulator}
          {country || item?.country ? ` (${country || item?.country})` : ""}
        </span>
      )}
    </span>
  );
};

export default RegulatorBadge;

export const RegulatorBadgeList = ({
  regulators,
  maxDisplay = 3,
  size = "small",
}: {
  regulators: string[];
  maxDisplay?: number;
  size?: "small" | "medium" | "large";
}) => {
  const displayRegulators = regulators.slice(0, maxDisplay);
  const remainingCount = regulators.length - maxDisplay;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "0.375rem",
      }}
    >
      {displayRegulators.map((regulator) => (
        <RegulatorBadge key={regulator} regulator={regulator} size={size} />
      ))}
      {remainingCount > 0 && (
        <span
          style={{
            fontSize: "0.75rem",
            color: "#6b7280",
            marginLeft: "0.25rem",
          }}
        >
          +{remainingCount} more
        </span>
      )}
    </div>
  );
};
