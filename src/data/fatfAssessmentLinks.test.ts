import { describe, expect, it } from "vitest";
import { getCountryByIso2 } from "./countries.js";
import { FATF_ASSESSMENT_RECORDS } from "./fatfAssessmentData.js";
import {
  FATF_COUNTRY_PAGE_BASE,
  fatfCountrySlug,
  fatfCountryUrl,
  getFatfAssessmentLink,
} from "./fatfAssessmentLinks.js";

describe("FATF mutual-evaluation dates + report links", () => {
  it("builds FATF country-page slugs matching the observed URL scheme", () => {
    // Verified against real FATF pages (17 July 2026).
    expect(fatfCountrySlug("Malta")).toBe("Malta");
    expect(fatfCountrySlug("United Kingdom")).toBe("United-Kingdom");
    expect(fatfCountrySlug("United States")).toBe("United-States");
    expect(fatfCountrySlug("Lao People's Democratic Republic")).toBe(
      "Lao-People-s-Democratic-Republic",
    );
    // Diacritics are stripped in the slug.
    expect(fatfCountrySlug("Türkiye")).toBe("Turkiye");
  });

  it("produces the verified country-page URLs for real countries", () => {
    // Malta, United Kingdom, United States — all verified live.
    expect(fatfCountryUrl("MT")).toBe(
      "https://www.fatf-gafi.org/en/countries/detail/Malta.html",
    );
    expect(fatfCountryUrl("GB")).toBe(
      "https://www.fatf-gafi.org/en/countries/detail/United-Kingdom.html",
    );
    expect(fatfCountryUrl("US")).toBe(
      "https://www.fatf-gafi.org/en/countries/detail/United-States.html",
    );
  });

  it("applies name overrides where FATF's English name differs from RegActions'", () => {
    // RegActions "South Korea" -> FATF "Korea".
    expect(fatfCountryUrl("KR")).toBe(
      "https://www.fatf-gafi.org/en/countries/detail/Korea.html",
    );
    // RegActions "Turkey" (display Türkiye) -> FATF slug "Turkey".
    expect(fatfCountryUrl("TR")).toBe(
      "https://www.fatf-gafi.org/en/countries/detail/Turkey.html",
    );
  });

  it("all FATF-page URLs start from the country-detail base and end in .html", () => {
    for (const iso2 of Object.keys(FATF_ASSESSMENT_RECORDS)) {
      const url = fatfCountryUrl(iso2);
      // Every assessed country resolves against countries.ts or an override.
      expect(url, iso2).toBeDefined();
      expect(url!.startsWith(FATF_COUNTRY_PAGE_BASE), iso2).toBe(true);
      expect(url!.endsWith(".html"), iso2).toBe(true);
    }
  });

  it("surfaces the mutual-evaluation year from the existing assessment data", () => {
    // Malta's record carries assessmentDate 2019 (on-site) — no duplication here.
    const mt = getFatfAssessmentLink("MT");
    expect(mt).toBeDefined();
    expect(mt!.year).toBeGreaterThanOrEqual(2010);
    expect(mt!.year).toBeLessThanOrEqual(new Date().getUTCFullYear());
    expect(mt!.reportUrl).toContain("/Malta.html");
    expect(["evaluation", "ratings"]).toContain(mt!.yearSource);
  });

  it("returns a link for (nearly) every assessed country", () => {
    let linked = 0;
    for (const iso2 of Object.keys(FATF_ASSESSMENT_RECORDS)) {
      if (getFatfAssessmentLink(iso2)) linked += 1;
    }
    // The vast majority of assessment records carry a usable date.
    expect(linked).toBeGreaterThan(150);
  });

  it("returns undefined for countries without a FATF assessment record", () => {
    // Micro-states / non-assessed jurisdictions have no record.
    const noRecord = getFatfAssessmentLink("ZZ");
    expect(noRecord).toBeUndefined();
  });

  it("every assessed ISO2 resolves against countries.ts (or an explicit override)", () => {
    for (const iso2 of Object.keys(FATF_ASSESSMENT_RECORDS)) {
      const resolvedName =
        getCountryByIso2(iso2)?.name ?? fatfCountryUrl(iso2);
      expect(resolvedName, iso2).toBeTruthy();
    }
  });
});
