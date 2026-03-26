/**
 * RegulatorBadge Component
 *
 * Displays a visual badge for regulatory authorities with:
 * - Country flag emoji
 * - Regulator code (FCA, BaFin, etc.)
 * - Tooltip with full name and country
 *
 * Used in FineCard, Timeline, LatestNotices, etc.
 */

import React from "react";
import { getRegulatorCoverage } from "../data/regulatorCoverage.js";
import "../styles/regulator-badge.css";

interface RegulatorBadgeProps {
  regulator: string;
  country?: string;
  size?: "small" | "medium" | "large";
  showTooltip?: boolean;
}

interface RegulatorConfig {
  color: string;
  bgColor: string;
}

const REGULATOR_CONFIG: Record<string, RegulatorConfig> = {
  FCA: {
    color: "#1e40af", // blue-800
    bgColor: "#dbeafe", // blue-100
  },
  BaFin: {
    color: "#991b1b", // red-800
    bgColor: "#fee2e2", // red-100
  },
  AMF: {
    color: "#6b21a8", // purple-800
    bgColor: "#f3e8ff", // purple-100
  },
  CNMV: {
    color: "#ca8a04", // yellow-700
    bgColor: "#fef9c3", // yellow-100
  },
  CBI: {
    color: "#15803d", // green-700
    bgColor: "#dcfce7", // green-100
  },
  SFC: {
    color: "#0f766e",
    bgColor: "#ccfbf1",
  },
  AFM: {
    color: "#ea580c", // orange-600
    bgColor: "#ffedd5", // orange-100
  },
  DNB: {
    color: "#c2410c", // orange-700
    bgColor: "#fed7aa", // orange-200
  },
  ESMA: {
    color: "#1e3a8a", // blue-900
    bgColor: "#bfdbfe", // blue-200
  },
  ECB: {
    color: "#1d4ed8",
    bgColor: "#dbeafe",
  },
  DFSA: {
    color: "#9a3412",
    bgColor: "#ffedd5",
  },
  FSRA: {
    color: "#b45309",
    bgColor: "#fef3c7",
  },
  CBUAE: {
    color: "#166534",
    bgColor: "#dcfce7",
  },
  JFSC: {
    color: "#334155",
    bgColor: "#e2e8f0",
  },
  GFSC: {
    color: "#4338ca",
    bgColor: "#e0e7ff",
  },
  CIRO: {
    color: "#7c2d12",
    bgColor: "#ffedd5",
  },
  SEBI: {
    color: "#9f1239",
    bgColor: "#ffe4e6",
  },
  HKMA: {
    color: "#0f766e",
    bgColor: "#ccfbf1",
  },
  ASIC: {
    color: "#1d4ed8",
    bgColor: "#dbeafe",
  },
  MAS: {
    color: "#166534",
    bgColor: "#dcfce7",
  },
  OCC: {
    color: "#4338ca",
    bgColor: "#e0e7ff",
  },
  FINMA: {
    color: "#991b1b",
    bgColor: "#fee2e2",
  },
  SESC: {
    color: "#9f1239",
    bgColor: "#ffe4e6",
  },
  FSCA: {
    color: "#166534",
    bgColor: "#dcfce7",
  },
  FMANZ: {
    color: "#0369a1",
    bgColor: "#e0f2fe",
  },
  CSRC: {
    color: "#b91c1c",
    bgColor: "#fee2e2",
  },
  FDIC: {
    color: "#1e40af",
    bgColor: "#dbeafe",
  },
  FRB: {
    color: "#312e81",
    bgColor: "#e0e7ff",
  },
  CMASA: {
    color: "#166534",
    bgColor: "#dcfce7",
  },
  TWFSC: {
    color: "#0f766e",
    bgColor: "#ccfbf1",
  },
  CVM: {
    color: "#166534",
    bgColor: "#dcfce7",
  },
  CNBV: {
    color: "#065f46",
    bgColor: "#d1fae5",
  },
  CMF: {
    color: "#991b1b",
    bgColor: "#fee2e2",
  },
};

const RegulatorBadge: React.FC<RegulatorBadgeProps> = ({
  regulator,
  country,
  size = "medium",
  showTooltip = true,
}) => {
  const coverage = getRegulatorCoverage(regulator);
  const accent = REGULATOR_CONFIG[regulator];
  const config = {
    flag: coverage?.flag ?? "🏛️",
    fullName: coverage?.fullName ?? regulator,
    country: country || coverage?.country || "Unknown",
    color: accent?.color ?? "#4b5563",
    bgColor: accent?.bgColor ?? "#f3f4f6",
  };

  return (
    <span
      className={`regulator-badge regulator-badge--${size}`}
      style={{
        color: config.color,
        backgroundColor: config.bgColor,
      }}
      title={showTooltip ? `${config.fullName} (${config.country})` : undefined}
      role="img"
      aria-label={`${regulator} - ${config.fullName}`}
    >
      <span
        className={`regulator-badge__flag regulator-badge__flag--${size}`}
        aria-hidden="true"
      >
        {config.flag}
      </span>
      <span className="regulator-badge__code">{regulator}</span>
      {showTooltip && (
        <span className="sr-only">
          {config.fullName} ({config.country})
        </span>
      )}
    </span>
  );
};

export default RegulatorBadge;

/**
 * RegulatorBadgeList Component
 *
 * Displays multiple regulator badges in a horizontal list
 * Used for showing cross-border enforcement cases
 */
export const RegulatorBadgeList: React.FC<{
  regulators: string[];
  maxDisplay?: number;
  size?: "small" | "medium" | "large";
}> = ({ regulators, maxDisplay = 3, size = "small" }) => {
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
