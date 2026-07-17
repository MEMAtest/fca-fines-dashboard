/**
 * Coverage for the ~22 previously thin country pages (SEO audit L3): the micro-
 * states, small-island offshore centres and score-withheld territories that had
 * a report page in pageCountries() but no bespoke narrative block.
 *
 * Guards two things:
 *   1. Completeness: EVERY pageCountries() entry now has a grounded narrative,
 *      so no report page falls back to near-boilerplate.
 *   2. Well-formedness: each newly authored narrative matches the house shape
 *      (non-empty fields, 4 whyItMatters, 2+ watchpoints) and the house style
 *      (no em-dashes or en-dashes anywhere in the prose).
 *
 * The batch splits into scored jurisdictions (WGI governance present -> a
 * composite score) and score-withheld jurisdictions (no WGI data -> the page
 * honestly acknowledges the evidence-limited picture). Both are asserted below.
 */
import { describe, it, expect } from "vitest";

import { pageCountries } from "./countryView.js";
import { getNarrative, NARRATIVES } from "./countryNarratives.js";
import { computeCountryRiskScore } from "./countryRiskScore.js";
import { isFatfListed } from "./fatfStatus.js";
import { isSanctioned } from "./sanctionsStatus.js";

/** The 22 pages that were thin before this wave. */
const FILLED = [
  "AI",
  "AW",
  "BZ",
  "CK",
  "CW",
  "DM",
  "GD",
  "GI",
  "IM",
  "KN",
  "LC",
  "MH",
  "MS",
  "NR",
  "NU",
  "PW",
  "SB",
  "SX",
  "TC",
  "TO",
  "VA",
  "VC",
] as const;

/** Of those, the ones with no WGI governance data -> score is withheld. */
const SCORE_WITHHELD = ["CW", "GI", "IM", "MS", "SX", "TC", "VA"] as const;

describe("thin-page narratives (SEO audit L3 fill)", () => {
  it("gives EVERY pageCountries() entry a narrative (zero gaps remain)", () => {
    const missing = pageCountries()
      .filter((c) => getNarrative(c.iso2) === undefined)
      .map((c) => c.iso2);
    expect(missing).toEqual([]);
  });

  it("adds a narrative for each of the 22 previously thin pages", () => {
    for (const iso of FILLED) {
      expect(getNarrative(iso), iso).toBeTruthy();
    }
  });

  it("keeps every newly authored narrative well-formed", () => {
    for (const iso of FILLED) {
      const n = getNarrative(iso)!;
      // Summary: a real sentence, not a stub.
      expect(n.summary.length, `${iso}.summary`).toBeGreaterThan(80);
      // Exactly four "why it matters" bullets, matching the house shape.
      expect(n.whyItMatters.length, `${iso}.whyItMatters`).toBe(4);
      // At least two concrete, monitorable watchpoints (house shape is four).
      expect(
        n.keyWatchpoints.length,
        `${iso}.keyWatchpoints`,
      ).toBeGreaterThanOrEqual(2);
      // Substantive analysis and outlook paragraphs.
      expect(n.analysis.length, `${iso}.analysis`).toBeGreaterThan(300);
      expect(n.outlook.length, `${iso}.outlook`).toBeGreaterThan(300);
      // No empty strings anywhere in the bullet arrays.
      for (const w of [...n.whyItMatters, ...n.keyWatchpoints]) {
        expect(w.trim().length, `${iso} bullet`).toBeGreaterThan(0);
      }
    }
  });

  it("uses house style: no em-dashes or en-dashes in the prose", () => {
    for (const iso of FILLED) {
      const n = getNarrative(iso)!;
      expect(/[—–]/.test(JSON.stringify(n)), iso).toBe(false);
    }
  });

  it("applies no FATF or sanctions escalator (none of the batch is listed)", () => {
    for (const iso of FILLED) {
      expect(isFatfListed(iso), iso).toBe(false);
      expect(isSanctioned(iso), iso).toBe(false);
    }
  });

  it("computes a moderate/low composite for the scored jurisdictions", () => {
    const scored = FILLED.filter(
      (iso) => !(SCORE_WITHHELD as readonly string[]).includes(iso),
    );
    for (const iso of scored) {
      const rs = computeCountryRiskScore(iso);
      expect(rs.hasGovernance, iso).toBe(true);
      if (!rs.hasGovernance) throw new Error(`${iso} governance fixture missing`);
      // Small, well-governed island/offshore centres: comfortably below high.
      expect(rs.score, iso).toBeGreaterThan(0);
      expect(rs.score, iso).toBeLessThan(6);
      // No escalator applies; the composite equals the governance base.
      expect(rs.fatf.points, iso).toBe(0);
      expect(rs.sanctions.points, iso).toBe(0);
    }
  });

  it("withholds a score where WGI governance data is absent", () => {
    for (const iso of SCORE_WITHHELD) {
      const rs = computeCountryRiskScore(iso);
      expect(rs.hasGovernance, iso).toBe(false);
      expect(rs.score, iso).toBeNull();
      // The narrative must acknowledge the evidence-limited picture honestly.
      const n = getNarrative(iso)!;
      const prose = `${n.summary} ${n.analysis} ${n.outlook}`.toLowerCase();
      expect(
        prose.includes("evidence-limited") ||
          prose.includes("no composite") ||
          prose.includes("withhold") ||
          prose.includes("data are available") ||
          prose.includes("no world bank"),
        iso,
      ).toBe(true);
    }
  });

  it("does not introduce duplicate or malformed narrative keys", () => {
    for (const iso of FILLED) {
      expect(Object.prototype.hasOwnProperty.call(NARRATIVES, iso), iso).toBe(
        true,
      );
    }
    // Every key in the map is a two-letter uppercase ISO2 code.
    for (const key of Object.keys(NARRATIVES)) {
      expect(/^[A-Z]{2}$/.test(key), key).toBe(true);
    }
  });
});
