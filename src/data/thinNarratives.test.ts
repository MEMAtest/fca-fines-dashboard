/**
 * Coverage for the ~22 previously thin country pages (SEO audit L3): the micro-
 * states, small-island offshore centres and limited-evidence territories that had
 * a report page in pageCountries() but no bespoke narrative block.
 *
 * Guards three things:
 *   1. Completeness: EVERY pageCountries() entry now has a grounded narrative,
 *      so no report page falls back to near-boilerplate.
 *   2. Well-formedness: each newly authored narrative matches the house shape
 *      (non-empty fields, 4 whyItMatters, 2+ watchpoints) and the house style
 *      (no em-dashes or en-dashes anywhere in the prose).
 *   3. Score-agnosticism: the prose describes the DRIVERS of each country's risk
 *      (governance domains, CPI, FATF/sanctions/tax-list status) but never quotes
 *      a composite risk score, band label or "score withheld" claim. Those are
 *      products of the scoring engine and drift as the engine evolves, so tying
 *      the static prose to a specific composite value would silently rot. This
 *      guard makes that class of drift impossible to re-introduce.
 *   4. Data-vintage agnosticism (added in the crawler-prose reconciliation): the
 *      prose also quotes NO raw CPI numeral (score / rank) and NO WGI domain-risk
 *      decimal. Those are live, re-versioned data modules whose numbers are printed
 *      by the engine blocks on the same page, so a frozen numeral in the prose
 *      silently contradicts the on-page module the moment CPI or WGI is refreshed.
 *      The prose carries the qualitative MEANING; the modules carry the numbers.
 *
 * These are a CONTENT FOUNDATION consumed client-side only (two watchpoints per
 * page) until the "narrative-v2 reconciliation" de-scores the full legacy corpus
 * and re-enables the crawler-visible prose. Concrete non-drifting facts (dates, MER
 * years, monetary amounts, enforcement counts) may appear; composite scores, CPI
 * numerals and WGI decimals may not.
 */
import { describe, it, expect } from "vitest";

import { pageCountries } from "./countryView.js";
import { getNarrative, NARRATIVES } from "./countryNarratives.js";
import { isFatfListed, getFatfStatus } from "./fatfStatus.js";
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

/**
 * Of those, the ones with no WGI governance data. Their prose rests on a
 * limited evidence base rather than a full governance profile. (The scoring
 * engine's own handling of these jurisdictions is out of scope for this static
 * content and is asserted by the engine's own tests, not here.)
 */
const LIMITED_EVIDENCE = ["CW", "GI", "IM", "MS", "SX", "TC", "VA"] as const;

/**
 * Patterns that quote a composite risk score, a risk band label, a
 * "score withheld / no composite" claim, or the two composite phrasings that the
 * first pass missed ("scored 6.6 out of 10", "risk score: 6.6"). None of these may
 * appear in the prose: they are engine-derived and would contradict the published
 * number as the engine evolves. The raw CPI numerals and WGI domain decimals that
 * this comment previously called "allowed" are now ALSO banned, but via the
 * separate DRIFTING_NUMERAL_PATTERNS below (they drift with the live data modules,
 * not the scoring engine), so keep the two lists distinct.
 */
const COMPOSITE_SCORE_PATTERNS: RegExp[] = [
  /\b\d(?:\.\d)?\s*\/\s*10\b/, // "4.7/10"
  /scor(?:ed|es|ing)?\s+\d(?:\.\d)?\s+out of 10/i, // "scored 6.6 out of 10" composite form
  /\brisk score:?\s+\d/i, // "risk score: 6.6" / "risk score 6.6" (the bare phrase "risk score" with no number stays allowed)
  /composite (?:risk )?score of \d/i, // "composite score of 4.7"
  /composite score,?\s+band/i, // "composite score, band or..."
  /\brated (?:Low|Moderate|High|Very High)\b/i, // "rated Moderate risk"
  /\b(?:Low|Moderate|High|Very High) (?:risk )?band\b/i, // "Moderate band"
  // Title-case risk-band "rating" only (e.g. "Moderate rating"). Lower-case
  // "low rating" is MONEYVAL effectiveness wording, not a composite band, so
  // the match is deliberately case-sensitive here.
  /\b(?:Low|Moderate|High|Very High) rating\b/,
  /score of \d(?:\.\d)? (?:places|sits|is|reflects|rests)/i, // composite-score sentence stems
  /no composite (?:risk )?score/i, // "no composite risk score is modelled"
  /score is withheld|score-withheld|withholds a (?:composite )?score/i,
];

/**
 * Numeric facts that drift as the LIVE data modules (CPI vintage, WGI governance
 * snapshot) are refreshed. The narrative-v2 reconciliation carried the qualitative
 * MEANING of these figures into the prose while the engine blocks on the page print
 * the live numbers; the prose therefore must quote none of them, or it silently
 * contradicts the on-page module (e.g. prose "CPI score of 75, rank 15 of 179" vs a
 * live 2025 block printing "77/100, rank 10 of 182"). WGI domain risk decimals drift
 * the same way. Dates, MER years, monetary amounts and concrete counts (e.g.
 * "40 FATF Recommendations", "246 enforcement actions") are NOT drifting facts and
 * stay allowed, so these patterns are scoped to the specific CPI / WGI numeral shapes.
 */
const DRIFTING_NUMERAL_PATTERNS: RegExp[] = [
  // ---- CPI numerals (Transparency International CPI is a live, re-versioned module) ----
  /CPI score of \d/i, // "CPI score of 75"
  /CPI of \d/i, // "CPI of 30"
  /\d{1,3}\s*\/\s*100\b/, // "75/100"
  /\d{1,3}\s+out of 100\b/i, // "75 out of 100"
  /rank(?:ed|ing|s)?\s+\d+(?:st|nd|rd|th)?\s+of\s+\d+/i, // "rank 15 of 179" / "ranked 23rd of 179"
  /\bat rank \d+/i, // "at rank 98 of 179"
  /ranking of \d+(?:st|nd|rd|th)?/i, // "a ranking of 120th of 179"
  // ---- WGI governance-domain decimals (World Bank WGI is a live, re-versioned module) ----
  /\bat \d\.\d\b/, // "corruption at 4.2"
  /\brisk (?:rating )?(?:of )?\d\.\d\b/i, // "risk 1.87" / "risk rating of 6.5"
  /\bscor(?:e|es|ed|ing)\s+\d\.\d\b/i, // "scores 1.1"
  /\d\.\d\s*(?:out of 10|\/10)\b/i, // "7.6 out of 10" / "5.2/10"
  /\breaches \d\.\d\b/i, // "reaches 6.3"
  /\(\s*\d\.\d+\s*(?:,|\))/, // "(1.87, weighted 40%)" / "(2.87)" WGI parenthetical
];

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

  it("quotes no composite score, band label or score-withheld claim (score-agnostic)", () => {
    for (const iso of FILLED) {
      const n = getNarrative(iso)!;
      const prose = [
        n.summary,
        ...n.whyItMatters,
        n.analysis,
        n.outlook,
        ...n.keyWatchpoints,
      ].join(" ");
      for (const pattern of COMPOSITE_SCORE_PATTERNS) {
        const hit = prose.match(pattern);
        expect(
          hit,
          `${iso} prose must not quote a composite score/band: matched ${
            hit ? JSON.stringify(hit[0]) : ""
          } via ${pattern}`,
        ).toBeNull();
      }
    }
  });

  it("applies no FATF or sanctions escalator (none of the batch is listed)", () => {
    for (const iso of FILLED) {
      expect(isFatfListed(iso), iso).toBe(false);
      expect(isSanctioned(iso), iso).toBe(false);
    }
  });

  it("acknowledges the limited evidence base where WGI governance data is absent", () => {
    for (const iso of LIMITED_EVIDENCE) {
      const n = getNarrative(iso)!;
      const prose = `${n.summary} ${n.analysis} ${n.outlook}`.toLowerCase();
      // Engine-agnostic honesty: the page must flag the WGI data gap without
      // asserting whether or not a score is published for the jurisdiction.
      expect(
        prose.includes("evidence-limited") ||
          prose.includes("limited evidence base") ||
          prose.includes("governance indicators do not cover") ||
          prose.includes("not available") ||
          prose.includes("not published"),
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

// ---------------------------------------------------------------------------
// Narrative-v2 reconciliation (Wave F1): the guard above proved score-agnosticism
// for the 22 newly authored thin pages. The reconciliation extended that property
// to the ENTIRE corpus (~211 entries) by de-scoring the ~189 legacy entries that
// still quoted v1 composite scores / bands / escalators / global-average
// comparisons / percentiles. That de-scoring is what let scripts/prerender-seo.ts
// re-enable the crawler-visible prose, so this whole-corpus guard is load-bearing:
// if it goes red, stale score claims are once again shipping into SEO HTML.
// ---------------------------------------------------------------------------
describe("narrative-v2 reconciliation: whole-corpus engine-agnosticism", () => {
  const ALL = Object.keys(NARRATIVES);

  const prose = (iso: string) => {
    const n = getNarrative(iso)!;
    return [
      n.summary,
      ...n.whyItMatters,
      n.analysis,
      n.outlook,
      ...n.keyWatchpoints,
    ].join(" ");
  };

  it("quotes no composite score, band label or score-withheld claim in ANY entry", () => {
    for (const iso of ALL) {
      const text = prose(iso);
      for (const pattern of COMPOSITE_SCORE_PATTERNS) {
        const hit = text.match(pattern);
        expect(
          hit,
          `${iso} prose must not quote a composite score/band: matched ${
            hit ? JSON.stringify(hit[0]) : ""
          } via ${pattern}`,
        ).toBeNull();
      }
    }
  });

  it("quotes no drifting CPI numeral or WGI domain decimal in ANY entry", () => {
    // Prose must carry the qualitative MEANING of the CPI / WGI figures, not the
    // numbers themselves: the engine blocks on the same page print the live values,
    // and a frozen numeral in the prose silently contradicts them once the CPI /
    // WGI modules are re-versioned. Concrete non-drifting facts (dates, MER years,
    // monetary amounts, enforcement counts) are unaffected.
    for (const iso of ALL) {
      const text = prose(iso);
      for (const pattern of DRIFTING_NUMERAL_PATTERNS) {
        const hit = text.match(pattern);
        expect(
          hit,
          `${iso} prose must not quote a drifting CPI numeral or WGI decimal: matched ${
            hit ? JSON.stringify(hit[0]) : ""
          } via ${pattern}`,
        ).toBeNull();
      }
    }
  });

  it("uses no v1 escalator arithmetic, numeric governance-base or global-average wording in ANY entry", () => {
    // Targets the NUMERIC products of the v2 engine's internals that would drift
    // as it evolves. WGI domain figures ("corruption at 6.5"), CPI numbers and
    // the bare descriptive phrase "governance base" (meaning the WGI foundation)
    // stay allowed; only the quantified arithmetic is forbidden.
    const V1_ENGINE_PATTERNS: RegExp[] = [
      /\bescalator\b/i, // "1.5-point FATF grey-list escalator" / "no escalator"
      /global average/i, // "above the global average of 5.0"
      /governance base of \d/i, // "a governance base of 6.0"
      /\bgovernancePercentile\b/, // leaked property name
      /\b\d{1,2}(?:st|nd|rd|th) governance percentile\b/i, // "48th governance percentile"
      /governance percentile of \d/i, // "governance percentile of 66"
      /\b\d(?:\.\d)?[- ]point (?:FATF|grey|sanctions|escalator)/i, // "1.5-point FATF..."
    ];
    for (const iso of ALL) {
      const text = prose(iso);
      for (const pattern of V1_ENGINE_PATTERNS) {
        const hit = text.match(pattern);
        expect(
          hit,
          `${iso} prose must not quote v1 engine internals: matched ${
            hit ? JSON.stringify(hit[0]) : ""
          } via ${pattern}`,
        ).toBeNull();
      }
    }
  });

  it("does not assert present-tense FATF listing for any country absent from the FATF lists", () => {
    // Conservative consistency check against getFatfStatus: catch stale
    // present-tense listing claims left over after post-Oct-2025 delistings
    // (Nigeria, South Africa, Burkina Faso, Mozambique) and the June-2026 changes
    // (Algeria, Namibia removed). A country NOT on the FATF lists must not claim
    // it "is on"/"remains on"/"is grey-listed" etc. Past-tense removal statements
    // and explicit negations are allowed, as are EU tax-list references.
    const POSITIVE_FATF_LISTING =
      /\b(?:is (?:currently )?(?:on the|grey[- ]?listed|black[- ]?listed)|remains on the|sits on the|placed on the|currently on the)\b[^.]*\b(?:FATF|grey[- ]?list|black[- ]?list|increased monitoring|call for action)\b/i;
    // Sentence-level negation / past-tense / de-listing / EU-tax-list escape hatch.
    const EXEMPT =
      /\bnot\b|removed|following removal|was on|previously|de-?list|no longer|EU (?:list|Annex|tax)/i;

    for (const iso of ALL) {
      if (isFatfListed(iso)) {
        // Currently listed: it is fine (indeed expected) for the prose to say so.
        expect(getFatfStatus(iso), iso).toBeDefined();
        continue;
      }
      const n = getNarrative(iso)!;
      const sentences = [
        n.summary,
        ...n.whyItMatters,
        n.analysis,
        n.outlook,
        ...n.keyWatchpoints,
      ]
        .join(" ")
        .split(/(?<=[.!?])\s+/);
      for (const sentence of sentences) {
        if (POSITIVE_FATF_LISTING.test(sentence) && !EXEMPT.test(sentence)) {
          throw new Error(
            `${iso} is not FATF-listed but prose asserts a present-tense listing: ${JSON.stringify(
              sentence.trim(),
            )}`,
          );
        }
      }
    }
  });

  it("uses house style across the whole corpus: no em-dashes or en-dashes", () => {
    for (const iso of ALL) {
      const n = getNarrative(iso)!;
      expect(/[—–]/.test(JSON.stringify(n)), iso).toBe(false);
    }
  });
});
