import type { CSSProperties } from "react";
import {
  getRegulatorLogoConfig,
  getRenderableOfficialRegulatorLogo,
  getRegulatorSigilVariant,
  type RegulatorMarkSurface,
} from "../data/regulatorLogos.js";
import "../styles/regulator-badge.css";

interface RegulatorMarkProps {
  regulator: string;
  label?: string;
  country?: string;
  size?: "small" | "medium" | "large";
  surface?: RegulatorMarkSurface;
  showCode?: boolean;
  decorative?: boolean;
  className?: string;
}

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function RegulatorMark({
  regulator,
  label,
  country,
  size = "medium",
  surface = "light",
  showCode = false,
  decorative = true,
  className,
}: RegulatorMarkProps) {
  const config = getRegulatorLogoConfig(regulator);
  const officialLogo = getRenderableOfficialRegulatorLogo(regulator, surface, size);
  const showOfficialLogo = Boolean(officialLogo);
  const accessibleLabel = label || regulator;
  const sigilVariant = getRegulatorSigilVariant(regulator);
  const title = country ? `${accessibleLabel} (${country})` : accessibleLabel;

  return (
    <span
      className={joinClasses(
        "regulator-mark",
        `regulator-mark--${size}`,
        `regulator-mark--${surface}`,
        showOfficialLogo
          ? "regulator-mark--official"
          : "regulator-mark--fallback",
        showCode && "regulator-mark--with-code",
        className,
      )}
      style={
        {
          "--regulator-ink": config.palette.ink,
          "--regulator-surface": config.palette.surface,
          "--regulator-ring": config.palette.ring,
        } as CSSProperties
      }
      title={decorative ? undefined : title}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : title}
    >
      <span
        className={joinClasses(
          "regulator-mark__icon",
          showOfficialLogo
            && officialLogo?.backgroundMode === "light-box-required"
            && "regulator-mark__icon--light-box",
        )}
        aria-hidden="true"
      >
        {showOfficialLogo && officialLogo ? (
          <img
            className="regulator-mark__image"
            src={officialLogo.assetPath}
            alt=""
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span
            className={joinClasses(
              "regulator-mark__sigil",
              `regulator-mark__sigil--${sigilVariant}`,
            )}
          >
            <span className="regulator-mark__sigil-orbit" />
            <span className="regulator-mark__sigil-beam" />
            <span className="regulator-mark__sigil-core" />
            <span className="regulator-mark__sigil-spark regulator-mark__sigil-spark--a" />
            <span className="regulator-mark__sigil-spark regulator-mark__sigil-spark--b" />
          </span>
        )}
      </span>
      {showCode && <span className="regulator-mark__code">{regulator}</span>}
    </span>
  );
}

export default RegulatorMark;
