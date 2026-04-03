import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  OFFICIAL_REGULATOR_LOGOS,
  buildRegulatorMonogram,
  getRenderableOfficialRegulatorLogo,
  getOfficialRegulatorLogo,
  hasOfficialRegulatorLogo,
  isOfficialLogoApprovedForSurface,
} from "./regulatorLogos.js";
import { REGULATOR_CODES } from "./regulatorCoverage.js";

describe("regulator logo registry", () => {
  it("resolves managed logo assets for every regulator in scope", () => {
    expect(hasOfficialRegulatorLogo("FCA")).toBe(true);
    expect(hasOfficialRegulatorLogo("BaFin")).toBe(true);
    expect(hasOfficialRegulatorLogo("SEC")).toBe(true);
    expect(hasOfficialRegulatorLogo("SEBI")).toBe(true);
    expect(hasOfficialRegulatorLogo("OSC")).toBe(true);
    REGULATOR_CODES.forEach((code) => {
      expect(hasOfficialRegulatorLogo(code)).toBe(true);
    });
    expect(getOfficialRegulatorLogo("FCA")).toMatchObject({
      assetPath: "/regulator-logos/fca.ico",
      sourceUrl: "https://www.fca.org.uk/themes/custom/fca/favicon.ico",
    });
    expect(getOfficialRegulatorLogo("SEBI")).toMatchObject({
      assetPath: "/regulator-logos/sebi.png",
      sourceUrl: "https://www.sebi.gov.in/images/icons/sebi-icon.png",
    });
    expect(getOfficialRegulatorLogo("OSC")).toMatchObject({
      assetPath: "/regulator-logos/osc.png",
      sourceUrl: "https://www.osc.ca/themes/custom/osc_glider/192x192.png",
    });
    expect(getOfficialRegulatorLogo("DNB")).toMatchObject({
      compactLogo: {
        assetPath: "/regulator-logos/dnb-compact.svg",
      },
    });
  });

  it("references local public assets for every approved official logo", () => {
    Object.values(OFFICIAL_REGULATOR_LOGOS).forEach((logo) => {
      expect(logo).toBeDefined();
      const assetPath = join(
        process.cwd(),
        "public",
        logo!.assetPath.replace(/^\//, ""),
      );
      expect(existsSync(assetPath)).toBe(true);

      if (logo?.compactLogo) {
        const compactAssetPath = join(
          process.cwd(),
          "public",
          logo.compactLogo.assetPath.replace(/^\//, ""),
        );
        expect(existsSync(compactAssetPath)).toBe(true);
      }
    });
  });

  it("builds compact fallback monograms for missing logos", () => {
    expect(buildRegulatorMonogram("BaFin")).toBe("BAF");
    expect(buildRegulatorMonogram("CBUAE")).toBe("CBU");
    expect(buildRegulatorMonogram("SEC")).toBe("SEC");
  });

  it("enforces dark and print approvals for official logos", () => {
    const syntheticLogo = {
      assetPath: "/regulator-logos/test.svg",
      sourceUrl: "https://example.com/logo.svg",
      sourceType: "official-site" as const,
      backgroundMode: "transparent" as const,
      approvedForDarkUi: false,
      approvedForPrint: true,
      lastReviewedAt: "2026-04-02",
    };

    expect(isOfficialLogoApprovedForSurface(syntheticLogo, "light")).toBe(true);
    expect(isOfficialLogoApprovedForSurface(syntheticLogo, "dark")).toBe(false);
    expect(isOfficialLogoApprovedForSurface(syntheticLogo, "print")).toBe(true);
    expect(getRenderableOfficialRegulatorLogo("FCA", "dark")).toMatchObject({
      assetPath: "/regulator-logos/fca.ico",
    });
    expect(getRenderableOfficialRegulatorLogo("DNB", "light", "small")).toMatchObject({
      assetPath: "/regulator-logos/dnb-compact.svg",
    });
    expect(getRenderableOfficialRegulatorLogo("DNB", "light", "medium")).toMatchObject({
      assetPath: "/regulator-logos/dnb.svg",
    });
  });
});
