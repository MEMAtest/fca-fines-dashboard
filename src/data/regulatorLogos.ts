export type RegulatorMarkSurface = "light" | "dark" | "print";

export interface RegulatorPalette {
  ink: string;
  surface: string;
  ring: string;
}

export interface OfficialRegulatorLogo {
  assetPath: string;
  sourceUrl: string;
  sourceType: "official-site" | "media-kit" | "press-page";
  backgroundMode: "transparent" | "light-box-required";
  approvedForDarkUi: boolean;
  approvedForPrint: boolean;
  lastReviewedAt: string;
}

export interface RegulatorLogoConfig {
  palette: RegulatorPalette;
  officialLogo?: OfficialRegulatorLogo;
}

const DEFAULT_PALETTE: RegulatorPalette = {
  ink: "#1f2937",
  surface: "#e5e7eb",
  ring: "#cbd5e1",
};

const REGULATOR_PALETTES: Record<string, RegulatorPalette> = {
  FCA: { ink: "#1e40af", surface: "#dbeafe", ring: "#93c5fd" },
  BAFIN: { ink: "#991b1b", surface: "#fee2e2", ring: "#fca5a5" },
  AMF: { ink: "#6b21a8", surface: "#f3e8ff", ring: "#d8b4fe" },
  CNMV: { ink: "#a16207", surface: "#fef3c7", ring: "#fcd34d" },
  CBI: { ink: "#166534", surface: "#dcfce7", ring: "#86efac" },
  SFC: { ink: "#0f766e", surface: "#ccfbf1", ring: "#5eead4" },
  AFM: { ink: "#c2410c", surface: "#ffedd5", ring: "#fdba74" },
  DNB: { ink: "#9a3412", surface: "#fed7aa", ring: "#fb923c" },
  ESMA: { ink: "#1e3a8a", surface: "#dbeafe", ring: "#93c5fd" },
  ECB: { ink: "#1d4ed8", surface: "#dbeafe", ring: "#60a5fa" },
  DFSA: { ink: "#9a3412", surface: "#ffedd5", ring: "#fdba74" },
  FSRA: { ink: "#92400e", surface: "#fef3c7", ring: "#fbbf24" },
  CBUAE: { ink: "#166534", surface: "#dcfce7", ring: "#86efac" },
  JFSC: { ink: "#334155", surface: "#e2e8f0", ring: "#cbd5e1" },
  GFSC: { ink: "#4338ca", surface: "#e0e7ff", ring: "#a5b4fc" },
  CIRO: { ink: "#7c2d12", surface: "#ffedd5", ring: "#fdba74" },
  SEC: { ink: "#1e3a8a", surface: "#dbeafe", ring: "#93c5fd" },
  SEBI: { ink: "#9f1239", surface: "#ffe4e6", ring: "#fda4af" },
  HKMA: { ink: "#0f766e", surface: "#ccfbf1", ring: "#5eead4" },
  ASIC: { ink: "#1d4ed8", surface: "#dbeafe", ring: "#93c5fd" },
  MAS: { ink: "#166534", surface: "#dcfce7", ring: "#86efac" },
  OCC: { ink: "#4338ca", surface: "#e0e7ff", ring: "#a5b4fc" },
  FINMA: { ink: "#991b1b", surface: "#fee2e2", ring: "#fca5a5" },
  SESC: { ink: "#9f1239", surface: "#ffe4e6", ring: "#fda4af" },
  FSCA: { ink: "#166534", surface: "#dcfce7", ring: "#86efac" },
  FMANZ: { ink: "#0369a1", surface: "#e0f2fe", ring: "#7dd3fc" },
  CSRC: { ink: "#b91c1c", surface: "#fee2e2", ring: "#fca5a5" },
  FDIC: { ink: "#1e40af", surface: "#dbeafe", ring: "#93c5fd" },
  FRB: { ink: "#312e81", surface: "#e0e7ff", ring: "#a5b4fc" },
  CMASA: { ink: "#166534", surface: "#dcfce7", ring: "#86efac" },
  TWFSC: { ink: "#0f766e", surface: "#ccfbf1", ring: "#5eead4" },
  CVM: { ink: "#166534", surface: "#dcfce7", ring: "#86efac" },
  CNBV: { ink: "#065f46", surface: "#d1fae5", ring: "#6ee7b7" },
  CMF: { ink: "#991b1b", surface: "#fee2e2", ring: "#fca5a5" },
};

export const OFFICIAL_REGULATOR_LOGOS: Partial<
  Record<string, OfficialRegulatorLogo>
> = {
  FCA: {
    assetPath: "/regulator-logos/fca.png",
    sourceUrl: "https://www.fca.org.uk/themes/custom/fca/images/logo.png",
    sourceType: "official-site",
    backgroundMode: "light-box-required",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-02",
  },
  SEBI: {
    assetPath: "/regulator-logos/sebi.png",
    sourceUrl: "https://www.sebi.gov.in/images/icons/sebi-icon.png",
    sourceType: "official-site",
    backgroundMode: "light-box-required",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-02",
  },
};

export function normalizeRegulatorCode(code: string) {
  return code.trim().toUpperCase();
}

export function buildRegulatorMonogram(code: string) {
  const compact = normalizeRegulatorCode(code).replace(/[^A-Z0-9]/g, "");
  return compact.slice(0, compact.length > 4 ? 3 : 4) || "REG";
}

export function getRegulatorSigilVariant(code: string) {
  const normalized = normalizeRegulatorCode(code);
  let hash = 0;

  for (const character of normalized) {
    hash = (hash * 31 + character.charCodeAt(0)) % 5;
  }

  return hash;
}

export function getRegulatorPalette(code: string): RegulatorPalette {
  return REGULATOR_PALETTES[normalizeRegulatorCode(code)] ?? DEFAULT_PALETTE;
}

export function getOfficialRegulatorLogo(code: string) {
  return OFFICIAL_REGULATOR_LOGOS[normalizeRegulatorCode(code)] ?? null;
}

export function hasOfficialRegulatorLogo(code: string) {
  return Boolean(getOfficialRegulatorLogo(code));
}

export function isOfficialLogoApprovedForSurface(
  logo: OfficialRegulatorLogo,
  surface: RegulatorMarkSurface,
) {
  if (surface === "dark") {
    return logo.approvedForDarkUi;
  }

  if (surface === "print") {
    return logo.approvedForPrint;
  }

  return true;
}

export function getRenderableOfficialRegulatorLogo(
  code: string,
  surface: RegulatorMarkSurface = "light",
) {
  const logo = getOfficialRegulatorLogo(code);
  if (!logo) {
    return null;
  }

  return isOfficialLogoApprovedForSurface(logo, surface) ? logo : null;
}

export function getRegulatorLogoConfig(code: string): RegulatorLogoConfig {
  return {
    palette: getRegulatorPalette(code),
    officialLogo: getOfficialRegulatorLogo(code) ?? undefined,
  };
}
