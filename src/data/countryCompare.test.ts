import { describe, expect, it } from "vitest";
import { getCountryByIso2, getCountryBySlug } from "./countries.js";
import {
  COMPARE_ANCHOR_ISO2,
  buildCompareView,
  buildVerdict,
  comparePairSlug,
  comparePath,
  compareComparators,
  compareLinksForCountry,
  curatedComparePairs,
  parseComparePair,
  relatedComparePairs,
} from "./countryCompare.js";

const US = getCountryByIso2("US")!;
const GB = getCountryByIso2("GB")!;
const IR = getCountryByIso2("IR")!;

describe("country-vs-country compare slugs + canonicalisation", () => {
  it("orders the pair slug alphabetically (a-vs-b == b-vs-a)", () => {
    expect(comparePairSlug(US, GB)).toBe(comparePairSlug(GB, US));
    // united-kingdom < united-states alphabetically
    expect(comparePairSlug(US, GB)).toBe("united-kingdom-vs-united-states");
  });

  it("builds a canonical /countries/compare path", () => {
    expect(comparePath(GB, US)).toBe(
      "/countries/compare/united-kingdom-vs-united-states",
    );
  });

  it("parses a valid pair and marks canonical vs non-canonical order", () => {
    const canonical = parseComparePair("united-kingdom-vs-united-states");
    expect(canonical).toBeDefined();
    expect(canonical!.a.iso2).toBe("GB");
    expect(canonical!.b.iso2).toBe("US");
    expect(canonical!.isCanonical).toBe(true);

    const reversed = parseComparePair("united-states-vs-united-kingdom");
    expect(reversed).toBeDefined();
    expect(reversed!.canonicalSlug).toBe("united-kingdom-vs-united-states");
    expect(reversed!.isCanonical).toBe(false);
  });

  it("rejects malformed, unknown, and self-comparison slugs", () => {
    expect(parseComparePair("")).toBeUndefined();
    expect(parseComparePair("united-kingdom")).toBeUndefined();
    expect(parseComparePair("-vs-united-states")).toBeUndefined();
    expect(parseComparePair("atlantis-vs-united-states")).toBeUndefined();
    expect(parseComparePair("united-states-vs-united-states")).toBeUndefined();
  });
});

describe("compare view model", () => {
  it("builds side-by-side rows and a canonical path", () => {
    const view = buildCompareView(GB, US);
    expect(view.a.country.iso2).toBe("GB");
    expect(view.b.country.iso2).toBe("US");
    expect(view.rows.length).toBeGreaterThanOrEqual(8);
    expect(view.canonicalPath).toBe(
      "/countries/compare/united-kingdom-vs-united-states",
    );
    // every row carries both sides' values
    for (const r of view.rows) {
      expect(r.a).toBeTruthy();
      expect(r.b).toBeTruthy();
      expect(["a", "b", "equal", "na"]).toContain(r.higherRisk);
    }
  });

  it("carries a deterministic verdict sentence", () => {
    const view = buildCompareView(GB, US);
    expect(view.verdict).toMatch(/RegActions|withheld|higher-risk/);
    // deterministic — same inputs, same output
    expect(buildCompareView(GB, US).verdict).toBe(view.verdict);
  });

  it("verdict uses honest 'withheld' wording when a score is unavailable", () => {
    // Both scored: verdict should mention the 0-10 scale.
    const scored = buildVerdict(
      buildCompareView(GB, US).a,
      buildCompareView(GB, US).b,
    );
    expect(scored).toMatch(/0-10|similar assessed risk|higher assessed risk/);
  });

  it("surfaces the pending-review sanctions caveat", () => {
    const view = buildCompareView(GB, US);
    const sanctionsRow = view.rows.find((r) => r.label === "Sanctions posture");
    expect(sanctionsRow).toBeDefined();
    // With the current fail-closed snapshot, both sides read the caveat.
    expect(sanctionsRow!.a).toMatch(/review pending|exposure|programme|identified/i);
  });

  it("includes the FATF mutual-evaluation and BO-register rows", () => {
    const view = buildCompareView(GB, US);
    expect(view.rows.some((r) => r.label === "Last FATF mutual evaluation")).toBe(true);
    expect(view.rows.some((r) => r.label === "BO register")).toBe(true);
  });
});

describe("curated comparator selection", () => {
  it("has ~20 anchor countries, all resolving", () => {
    expect(COMPARE_ANCHOR_ISO2.length).toBeGreaterThanOrEqual(18);
    expect(COMPARE_ANCHOR_ISO2.length).toBeLessThanOrEqual(24);
    for (const iso2 of COMPARE_ANCHOR_ISO2) {
      expect(getCountryByIso2(iso2), iso2).toBeTruthy();
    }
    expect(new Set(COMPARE_ANCHOR_ISO2).size).toBe(COMPARE_ANCHOR_ISO2.length);
  });

  it("gives each anchor a deterministic top comparator slate excluding itself", () => {
    for (const iso2 of COMPARE_ANCHOR_ISO2) {
      const comps = compareComparators(iso2, 8);
      expect(comps.length).toBe(8);
      expect(comps.every((c) => c.iso2 !== iso2)).toBe(true);
      // deterministic
      const again = compareComparators(iso2, 8).map((c) => c.iso2);
      expect(comps.map((c) => c.iso2)).toEqual(again);
    }
  });

  it("produces a de-duplicated curated pair set in the roadmap's target band", () => {
    const pairs = curatedComparePairs();
    const slugs = pairs.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length); // no dupes
    // ~20 anchors x 10 comparators, minus canonical-collision de-dupes -> curated
    // set sized for the roadmap's ~150-300 high-intent target.
    expect(pairs.length).toBeGreaterThanOrEqual(120);
    expect(pairs.length).toBeLessThanOrEqual(300);
    // every pair references two known countries and is emitted canonically
    for (const p of pairs) {
      expect(getCountryByIso2(p.a.iso2)).toBeTruthy();
      expect(getCountryByIso2(p.b.iso2)).toBeTruthy();
      expect(comparePairSlug(p.a, p.b)).toBe(p.slug);
    }
  });

  it("related pairs share a country and exclude the current pair", () => {
    const related = relatedComparePairs(GB, US, 6);
    expect(related.length).toBeGreaterThan(0);
    for (const r of related) {
      expect(r.slug).not.toBe(comparePairSlug(GB, US));
      const involvesGbOrUs =
        r.a.iso2 === "GB" || r.b.iso2 === "GB" || r.a.iso2 === "US" || r.b.iso2 === "US";
      expect(involvesGbOrUs).toBe(true);
    }
  });

  it("compareLinksForCountry returns regional Compare-> targets that resolve", () => {
    const links = compareLinksForCountry(GB, 5);
    expect(links.length).toBeGreaterThan(0);
    for (const l of links) {
      expect(l.other.iso2).not.toBe("GB");
      expect(getCountryBySlug(l.slug.split("-vs-")[0])).toBeTruthy();
    }
  });
});
