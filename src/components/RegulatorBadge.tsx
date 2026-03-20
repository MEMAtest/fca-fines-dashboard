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

import React from 'react';

interface RegulatorBadgeProps {
  regulator: string;
  country?: string;
  size?: 'small' | 'medium' | 'large';
  showTooltip?: boolean;
}

interface RegulatorConfig {
  flag: string;
  fullName: string;
  country: string;
  color: string;
  bgColor: string;
}

const REGULATOR_CONFIG: Record<string, RegulatorConfig> = {
  FCA: {
    flag: '🇬🇧',
    fullName: 'Financial Conduct Authority',
    country: 'United Kingdom',
    color: '#1e40af', // blue-800
    bgColor: '#dbeafe' // blue-100
  },
  BaFin: {
    flag: '🇩🇪',
    fullName: 'Federal Financial Supervisory Authority',
    country: 'Germany',
    color: '#991b1b', // red-800
    bgColor: '#fee2e2' // red-100
  },
  AMF: {
    flag: '🇫🇷',
    fullName: 'Autorité des marchés financiers',
    country: 'France',
    color: '#6b21a8', // purple-800
    bgColor: '#f3e8ff' // purple-100
  },
  CNMV: {
    flag: '🇪🇸',
    fullName: 'Comisión Nacional del Mercado de Valores',
    country: 'Spain',
    color: '#ca8a04', // yellow-700
    bgColor: '#fef9c3' // yellow-100
  },
  CBI: {
    flag: '🇮🇪',
    fullName: 'Central Bank of Ireland',
    country: 'Ireland',
    color: '#15803d', // green-700
    bgColor: '#dcfce7' // green-100
  },
  AFM: {
    flag: '🇳🇱',
    fullName: 'Authority for Financial Markets',
    country: 'Netherlands',
    color: '#ea580c', // orange-600
    bgColor: '#ffedd5' // orange-100
  },
  DNB: {
    flag: '🇳🇱',
    fullName: 'De Nederlandsche Bank',
    country: 'Netherlands',
    color: '#c2410c', // orange-700
    bgColor: '#fed7aa' // orange-200
  },
  ESMA: {
    flag: '🇪🇺',
    fullName: 'European Securities and Markets Authority',
    country: 'European Union',
    color: '#1e3a8a', // blue-900
    bgColor: '#bfdbfe' // blue-200
  }
};

const RegulatorBadge: React.FC<RegulatorBadgeProps> = ({
  regulator,
  country,
  size = 'medium',
  showTooltip = true
}) => {
  const config = REGULATOR_CONFIG[regulator] || {
    flag: '🏛️',
    fullName: regulator,
    country: country || 'Unknown',
    color: '#4b5563', // gray-600
    bgColor: '#f3f4f6' // gray-100
  };

  const sizeClasses = {
    small: 'text-xs px-1.5 py-0.5',
    medium: 'text-sm px-2 py-1',
    large: 'text-base px-3 py-1.5'
  };

  const flagSizes = {
    small: 'text-xs',
    medium: 'text-sm',
    large: 'text-base'
  };

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 rounded-md font-medium
        ${sizeClasses[size]}
        transition-all duration-200 hover:shadow-sm
      `}
      style={{
        color: config.color,
        backgroundColor: config.bgColor
      }}
      title={showTooltip ? `${config.fullName} (${config.country})` : undefined}
      role="img"
      aria-label={`${regulator} - ${config.fullName}`}
    >
      <span className={flagSizes[size]} aria-hidden="true">
        {config.flag}
      </span>
      <span className="font-semibold">
        {regulator}
      </span>
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
  size?: 'small' | 'medium' | 'large';
}> = ({ regulators, maxDisplay = 3, size = 'small' }) => {
  const displayRegulators = regulators.slice(0, maxDisplay);
  const remainingCount = regulators.length - maxDisplay;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {displayRegulators.map((regulator, index) => (
        <RegulatorBadge
          key={`${regulator}-${index}`}
          regulator={regulator}
          size={size}
        />
      ))}
      {remainingCount > 0 && (
        <span className="text-xs text-gray-500 ml-1">
          +{remainingCount} more
        </span>
      )}
    </div>
  );
};
