/**
 * Prerender-content guard for the crawler-visible country-report HTML.
 *
 * This is the assertion whose absence let the SEO gap in PR #58 go unnoticed:
 * the grounded narrative prose (analysis / outlook / watchpoints) is the country
 * pages' single largest previously-dead SEO asset, but nothing verified that it
 * actually reaches the prerendered HTML. `renderCountryFatfBody` gated the prose
 * out (`analysisHtml = ""`) while the narrative corpus quoted v1 composite
 * scores; the narrative-v2 reconciliation (Wave F1) de-scored the corpus and
 * re-enabled it. These tests confirm the prose is present AND stays engine-
 * agnostic in the emitted HTML.
 *
 * Lives under scripts/country-risk/lib/ because that is the only scripts path
 * covered by the vitest `include` glob (see vitest.config.ts). It imports the
 * real, now-exported `renderCountryFatfBody` from prerender-seo.ts, whose
 * module-level `main()` is now guarded so importing it does not kick off a full
 * build.
 */
import { describe, expect, it } from "vitest";

import { getCountryByIso2 } from "../../../src/data/countries.js";
import { buildCountryView } from "../../../src/data/countryView.js";
import { getNarrative } from "../../../src/data/countryNarratives.js";
import { renderCountryFatfBody, renderPage } from "../../prerender-seo.js";

/**
 * Countries spanning the risk spectrum and data-availability cases: China (large
 * moderate-risk economy), Nigeria (delisted, governance-driven), Gibraltar
 * (evidence-limited, no WGI, cleanly de-listed) and Belize (offshore, CFATF).
 */
const SAMPLE = ["CN", "NG", "GI", "BZ"] as const;

/** The exact HTML-escaping used by scripts/prerender-seo.ts. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Isolate just the narrative section from the full body HTML. The narrative
 * block is emitted as `<h2>{name}: analysis</h2>...` immediately before the
 * "Assessment currency" (`whatChangedHtml`) block, so we slice between the two
 * markers. This keeps the engine-agnostic assertion off the deterministic v2
 * score block and the regional-peer scores, which legitimately print "x/10".
 */
function narrativeSection(html: string, countryName: string): string {
  const start = html.indexOf(`<h2>${escapeHtml(`${countryName}: analysis`)}</h2>`);
  expect(start, `${countryName}: narrative section marker missing`).toBeGreaterThan(
    -1,
  );
  const end = html.indexOf("<h2>Assessment currency</h2>", start);
  return end > start ? html.slice(start, end) : html.slice(start);
}

/**
 * The composite-score / band / escalator patterns that must NOT leak into the
 * crawler-visible narrative HTML. Mirrors thinNarratives.test.ts so the
 * prerendered output is held to the same engine-agnostic bar as the source prose.
 */
const COMPOSITE_SCORE_PATTERNS: RegExp[] = [
  /\b\d(?:\.\d)?\s*\/\s*10\b/,
  /composite (?:risk )?score of \d/i,
  /\brated (?:Low|Moderate|High|Very High)\b/i,
  /\b(?:Low|Moderate|High|Very High) (?:risk )?band\b/i,
  /\bgovernance base of \d/i,
  /\bescalator\b/i,
  /global average/i,
];

describe("prerender country body: crawler-visible narrative prose", () => {
  it("injects country-specific regulatory evidence into the no-JS root", () => {
    const country = getCountryByIso2("CW")!;
    const bodyContent = renderCountryFatfBody(buildCountryView(country));
    const template = '<!doctype html><html><head><title>Template</title><meta name="title" content="Template"><meta name="description" content="Template"><meta name="keywords" content="Template"><link rel="canonical" href="https://regactions.com/"><link rel="alternate" hreflang="x-default" href="https://regactions.com/"><meta property="og:type" content="website"><meta property="og:url" content="https://regactions.com/"><meta property="og:title" content="Template"><meta property="og:description" content="Template"><meta name="twitter:url" content="https://regactions.com/"><meta name="twitter:title" content="Template"><meta name="twitter:description" content="Template"><script type="application/ld+json">{}</script></head><body><div id="root"></div></body></html>';
    const html = renderPage(template, {
      path: "/countries/curacao",
      title: "Curaçao country risk",
      description: "Curaçao country risk evidence",
      keywords: "Curaçao",
      ogType: "website",
      bodyContent,
    } as any);

    expect(html).toContain("Curaçao — Country Risk Report");
    expect(html).toContain("Regulatory ecosystem and enforcement visibility");
    expect(html).toContain("Transparency Index:</strong> not scored");
    expect(html).toContain("Central Bank of Curaçao and Sint Maarten");
    expect(html).toContain("Provisional first-page scan signal");
    expect(html).not.toContain("Global Regulatory Fines");
  });

  it("emits the grounded narrative for each sampled country", () => {
    for (const iso of SAMPLE) {
      const country = getCountryByIso2(iso);
      expect(country, iso).toBeDefined();
      const html = renderCountryFatfBody(buildCountryView(country!));
      const narrative = getNarrative(iso)!;
      expect(narrative, iso).toBeTruthy();

      // The three prose surfaces must all reach the HTML.
      expect(html, `${iso} analysis`).toContain(
        `<h2>${escapeHtml(`${country!.name}: analysis`)}</h2>`,
      );
      expect(html, `${iso} outlook`).toContain("<h3>Outlook</h3>");
      expect(html, `${iso} watchpoints`).toContain("<h3>Key watchpoints</h3>");

      // A distinctive fragment of THIS country's analysis must appear (HTML-
      // escaped), proving the specific prose is wired in rather than a generic
      // placeholder.
      const distinctive = escapeHtml(narrative.analysis.slice(0, 60));
      expect(
        html.includes(distinctive),
        `${iso}: analysis fragment ${JSON.stringify(distinctive)} not found in HTML`,
      ).toBe(true);

      // At least one of the country's key watchpoints must appear (escaped).
      const wp = escapeHtml(narrative.keyWatchpoints[0]);
      expect(html.includes(wp), `${iso}: first watchpoint not found in HTML`).toBe(
        true,
      );
    }
  });

  it("keeps the emitted narrative HTML engine-agnostic (no composite score / band / escalator)", () => {
    for (const iso of SAMPLE) {
      const country = getCountryByIso2(iso)!;
      const html = renderCountryFatfBody(buildCountryView(country));
      const section = narrativeSection(html, country.name);
      for (const pattern of COMPOSITE_SCORE_PATTERNS) {
        const hit = section.match(pattern);
        expect(
          hit,
          `${iso} narrative HTML must not quote a composite score/band/escalator: matched ${
            hit ? JSON.stringify(hit[0]) : ""
          } via ${pattern}`,
        ).toBeNull();
      }
    }
  });

  it("escapes narrative prose: the section contains only the tags we emit", () => {
    // Our narrative section only ever opens <h2>, <h3>, <p>, <ul>, <li> (and
    // their closers). Any other tag would indicate an unescaped corpus char.
    const country = getCountryByIso2("CN")!;
    const html = renderCountryFatfBody(buildCountryView(country));
    const section = narrativeSection(html, country.name);
    const tags = section.match(/<[^>]+>/g) ?? [];
    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) {
      expect(
        /^<\/?(?:h2|h3|p|ul|li)>$/.test(tag),
        `unexpected tag ${tag} in narrative section`,
      ).toBe(true);
    }
  });

  it("uses the v3 sanctions overlay tier in no-JS country copy", () => {
    const country = getCountryByIso2("VE")!;
    const html = renderCountryFatfBody(buildCountryView(country));
    expect(country.name).toBe("Venezuela");
    expect(html).toContain("Sectoral country-level sanctions programme identified");
    expect(html).toContain("legal treatment overlay");
    expect(html).not.toContain("Targeted sanctions exposure");
    expect(html).not.toContain("Comprehensive country sanctions: none identified");
  });

  it("keeps the conditional ICRG pillar in parity with the SPA", () => {
    const assessed = renderCountryFatfBody(buildCountryView(getCountryByIso2("GB")!));
    const venezuela = renderCountryFatfBody(buildCountryView(getCountryByIso2("VE")!));
    const proxy = renderCountryFatfBody(buildCountryView(getCountryByIso2("LY")!));
    const usvi = renderCountryFatfBody(buildCountryView(getCountryByIso2("VI")!));
    const iran = renderCountryFatfBody(buildCountryView(getCountryByIso2("IR")!));
    for (const html of [assessed, venezuela, proxy, usvi]) {
      expect(html).not.toContain("<li>FATF public determination (ICRG substitute):");
    }
    expect(iran).toContain("<li>FATF public determination (ICRG substitute): 9.5/10 — 65% of this score</li>");
  });
});
