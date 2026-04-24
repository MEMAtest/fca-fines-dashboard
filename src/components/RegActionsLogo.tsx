/**
 * RegActions Meridian Logo System
 *
 * Variant B — Offset Marker + Halo
 * Three strokes (circle, meridian ellipse, equator) plus a teal accent
 * dot positioned at the upper-meridian region, implying "Europe" where
 * most tracked regulators sit. A subtle halo around the dot suggests
 * a live signal.
 *
 * Design spec: 48×48 viewBox, stroke 2.2, circle r=18, ellipse rx=7 ry=18,
 * marker at cy=16.5 r=3.2, halo r=6.5 opacity=0.35.
 */

// Brand palette — Meridian system
export const BRAND = {
  navy: "#0B1F2A",
  ink: "#0E2A38",
  teal: "#0FA77D",
  tealDark: "#0B8463",
  cyan: "#19C9E6",
  mist: "#E8F3F0",
  off: "#F7F9FA",
  muted: "#6B7C85",
  paper: "#F1F4F6",
} as const;

interface MeridianMarkProps {
  size?: number;
  color?: string;
  accent?: string;
  stroke?: number;
  className?: string;
}

export function MeridianMark({
  size = 40,
  color = BRAND.navy,
  accent = BRAND.teal,
  stroke = 2.2,
  className,
}: MeridianMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <circle cx="24" cy="24" r="18" stroke={color} strokeWidth={stroke} />
      <ellipse cx="24" cy="24" rx="7" ry="18" stroke={color} strokeWidth={stroke} />
      <path d="M6 24h36" stroke={color} strokeWidth={stroke} strokeLinecap="round" />
      <circle cx="24" cy="16.5" r="3.2" fill={accent} />
      <circle cx="24" cy="16.5" r="6.5" stroke={accent} strokeWidth="1" opacity="0.35" />
    </svg>
  );
}

interface WordmarkProps {
  color?: string;
  accent?: string;
  size?: number;
  weight?: number;
  tracking?: number;
  splitAccent?: boolean;
  className?: string;
}

export function Wordmark({
  color = BRAND.navy,
  accent = BRAND.teal,
  size = 26,
  weight = 600,
  tracking = -0.02,
  splitAccent = true,
  className,
}: WordmarkProps) {
  return (
    <span
      className={className}
      style={{
        fontFamily: "'Inter', -apple-system, system-ui, sans-serif",
        fontWeight: weight,
        fontSize: size,
        letterSpacing: `${tracking}em`,
        color,
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      {splitAccent ? (
        <>
          Reg<span style={{ color: accent }}>Actions</span>
        </>
      ) : (
        <>RegActions</>
      )}
    </span>
  );
}

interface LogoLockupProps {
  markSize?: number;
  wordSize?: number;
  wordWeight?: number;
  color?: string;
  accent?: string;
  gap?: number;
  splitAccent?: boolean;
  className?: string;
}

/**
 * Horizontal lockup: Meridian B mark + split-accent wordmark.
 * Default sizing matches the site header at 32px mark + 19px wordmark.
 */
export function LogoLockup({
  markSize = 32,
  wordSize = 19,
  wordWeight = 600,
  color = BRAND.navy,
  accent = BRAND.teal,
  gap = 10,
  splitAccent = true,
  className,
}: LogoLockupProps) {
  return (
    <span
      className={className}
      style={{ display: "inline-flex", alignItems: "center", gap }}
    >
      <MeridianMark size={markSize} color={color} accent={accent} />
      <Wordmark
        color={color}
        accent={accent}
        size={wordSize}
        weight={wordWeight}
        splitAccent={splitAccent}
      />
    </span>
  );
}
