/**
 * Country-vs-country comparison view model — the single shared builder behind
 * BOTH the React compare page (`CountryCompare.tsx`) and the prerendered HTML
 * (`renderCompareBody` in `scripts/prerender-seo.ts`). Same pattern as
 * `buildCountryView`: the data and copy (bands, verdict line, FATF/sanctions
 * posture, WGI/CPI, framework signals) are computed here once so the
 * crawler-visible page and the user-facing page cannot drift.
 *
 * NO React/JSX imports here — consumed by the pure-TS prerender script too.
 *
 * Zero new data: everything is derived from the existing per-country modules via
 * `buildCountryView`, plus the licence-clean framework-signal modules already in
 * the tree (EU tax list, Egmont, FATF mutual-evaluation links, BO registers).
 */

import {
  COUNTRIES,
  countrySlug,
  getCountryBySlug,
  type Country,
} from "./countries.js";
import {
  buildCountryView,
  type CountryView,
} from "./countryView.js";
import { bandLabel, type RiskBand as ScoreBand } from "./countryRiskScore.js";
import { isEuTaxListed } from "./euTaxList.js";
import { getEgmontMember } from "./egmontMembership.js";
import { getFatfAssessmentLink } from "./fatfAssessmentLinks.js";
import { getBoRegister, boRegisterSignal } from "./boRegisters.js";
import { pageCountries } from "./countryView.js";

// ---------------------------------------------------------------------------
// Slug + canonicalisation
// ---------------------------------------------------------------------------

/**
 * Canonical compare slug for a pair: the two country slugs joined "a-vs-b",
 * ordered ALPHABETICALLY by slug so "uk-vs-us" and "us-vs-uk" both canonicalise
 * to the same page (avoids duplicate content across 22k ordered pairs).
 */
export function comparePairSlug(a: Country, b: Country): string {
  const sa = countrySlug(a);
  const sb = countrySlug(b);
  return sa <= sb ? `${sa}-vs-${sb}` : `${sb}-vs-${sa}`;
}

/** The full canonical path for a compare pair. */
export function comparePath(a: Country, b: Country): string {
  return `/countries/compare/${comparePairSlug(a, b)}`;
}

export interface ParsedComparePair {
  a: Country;
  b: Country;
  /** The canonical (alphabetical) slug for this pair. */
  canonicalSlug: string;
  /** True if the requested slug was already in canonical order. */
  isCanonical: boolean;
}

/**
 * Parse a "a-vs-b" compare slug into its two countries. Returns undefined if the
 * slug is malformed, references an unknown country, or is a country-vs-itself.
 * The result always carries the canonical (alphabetical) slug so callers can
 * redirect b-vs-a → a-vs-b.
 */
export function parseComparePair(slug: string): ParsedComparePair | undefined {
  if (!slug) return undefined;
  const lower = slug.toLowerCase();
  const idx = lower.indexOf("-vs-");
  if (idx <= 0) return undefined;
  const firstSlug = lower.slice(0, idx);
  const secondSlug = lower.slice(idx + 4);
  if (!firstSlug || !secondSlug || firstSlug === secondSlug) return undefined;
  const first = getCountryBySlug(firstSlug);
  const second = getCountryBySlug(secondSlug);
  if (!first || !second) return undefined;
  if (first.iso2 === second.iso2) return undefined;
  const canonicalSlug = comparePairSlug(first, second);
  return {
    a: first,
    b: second,
    canonicalSlug,
    isCanonical: `${firstSlug}-vs-${secondSlug}` === canonicalSlug,
  };
}

// ---------------------------------------------------------------------------
// Comparison view model
// ---------------------------------------------------------------------------

/** A comparable metric shown as a row (one value per country). */
export interface CompareRow {
  label: string;
  a: string;
  b: string;
  /**
   * Which side reads as higher-risk on this row: "a", "b", "equal" (tie or
   * both benign) or "na" (not comparable). Drives the row emphasis, never the
   * headline verdict on its own.
   */
  higherRisk: "a" | "b" | "equal" | "na";
}

export interface CompareSide {
  country: Country;
  flag: string;
  slug: string;
  /** Composite score 0–10, or null when withheld (insufficient WGI). */
  score: number | null;
  band: ScoreBand | null;
  bandLabel: string;
  scoreWithheld: boolean;
  fatfStatus: string;
  sanctionsSignal: string;
  cpi: string;
  view: CountryView;
}

export interface CompareView {
  a: CompareSide;
  b: CompareSide;
  /** Side-by-side comparison rows (score, FATF, sanctions, WGI, CPI, framework). */
  rows: CompareRow[];
  /** One deterministic verdict sentence ("X currently carries the higher..."). */
  verdict: string;
  /** Canonical path for this pair (alphabetical order). */
  canonicalPath: string;
  /** Title + meta description for the page/SEO. */
  title: string;
  metaDescription: string;
}

/** Risk order for bands (higher index = higher risk). Null (withheld) sorts lowest-known-last via a separate flag. */
const BAND_ORDER: Record<ScoreBand, number> = {
  low: 0,
  moderate: 1,
  high: 2,
  "very-high": 3,
};

function buildSide(country: Country): CompareSide {
  const view = buildCountryView(country);
  const score = view.riskScore.hasGovernance ? view.riskScore.score : null;
  const band = view.riskScore.hasGovernance ? view.riskScore.band : null;
  return {
    country,
    flag: view.flag,
    slug: countrySlug(country),
    score,
    band,
    bandLabel: band ? bandLabel(band) : "Insufficient data",
    scoreWithheld: score === null,
    fatfStatus: view.statusHeading,
    sanctionsSignal: sanctionsSignalFor(view),
    cpi: view.cpi
      ? `${view.cpi.score}/100 (rank #${view.cpi.rank})`
      : "No score",
    view,
  };
}

/** Sanctions signal string, honouring the site-wide pending-review caveat. */
export function sanctionsSignalFor(view: CountryView): string {
  if (!view.sanctionsCoverageComplete) {
    return "Classification review pending";
  }
  if (view.hasComprehensiveSanctions) return "Comprehensive country programme";
  if (view.sanctionsTier) {
    const t = view.sanctionsTier;
    return `${t.charAt(0).toUpperCase()}${t.slice(1)} exposure`;
  }
  return "No listed programme identified";
}

/** WGI rule-of-law risk (0–10) for a side, or null. */
function ruleOfLawRisk(view: CountryView): number | null {
  return view.breakdown.domains.find((d) => d.key === "ruleOfLaw")?.risk ?? null;
}

/**
 * Compare two 0–10 risk values (higher = worse). Returns which side is higher.
 * `null` values are treated as not-comparable ("na") to stay honest about
 * withheld evidence rather than implying a low value.
 */
function compareRisk(a: number | null, b: number | null): CompareRow["higherRisk"] {
  if (a === null || b === null) return "na";
  if (Math.abs(a - b) < 0.05) return "equal";
  return a > b ? "a" : "b";
}

/** FATF listing → an ordinal severity for the row emphasis (not scored). */
function fatfSeverity(view: CountryView): number {
  if (!view.fatf) return 0;
  return view.fatf.listing === "call-for-action" ? 2 : 1;
}

/** Sanctions tier → an ordinal severity for the row emphasis (0 if none/pending). */
function sanctionsSeverity(view: CountryView): number {
  if (!view.sanctionsCoverageComplete) return 0;
  if (!view.sanctionsTier) return 0;
  return { comprehensive: 3, sectoral: 2, targeted: 1 }[view.sanctionsTier];
}

export function buildCompareView(a: Country, b: Country): CompareView {
  const sideA = buildSide(a);
  const sideB = buildSide(b);
  const va = sideA.view;
  const vb = sideB.view;

  const rows: CompareRow[] = [];

  // 1. Composite score / band.
  rows.push({
    label: "RegActions risk score",
    a: sideA.score === null ? "Withheld" : `${sideA.score.toFixed(1)}/10 (${sideA.bandLabel})`,
    b: sideB.score === null ? "Withheld" : `${sideB.score.toFixed(1)}/10 (${sideB.bandLabel})`,
    higherRisk: compareRisk(sideA.score, sideB.score),
  });

  // 2. FATF status.
  rows.push({
    label: "FATF status",
    a: sideA.fatfStatus,
    b: sideB.fatfStatus,
    higherRisk:
      fatfSeverity(va) === fatfSeverity(vb)
        ? "equal"
        : fatfSeverity(va) > fatfSeverity(vb)
          ? "a"
          : "b",
  });

  // 3. Sanctions posture (carries the pending-review caveat wording).
  rows.push({
    label: "Sanctions posture",
    a: sideA.sanctionsSignal,
    b: sideB.sanctionsSignal,
    higherRisk:
      !va.sanctionsCoverageComplete || !vb.sanctionsCoverageComplete
        ? "na"
        : sanctionsSeverity(va) === sanctionsSeverity(vb)
          ? "equal"
          : sanctionsSeverity(va) > sanctionsSeverity(vb)
            ? "a"
            : "b",
  });

  // 4. WGI institutional domains (rule of law) — higher risk value = worse.
  const rlA = ruleOfLawRisk(va);
  const rlB = ruleOfLawRisk(vb);
  rows.push({
    label: "Rule of law (WGI risk)",
    a: rlA === null ? "No data" : `${rlA.toFixed(1)}/10`,
    b: rlB === null ? "No data" : `${rlB.toFixed(1)}/10`,
    higherRisk: compareRisk(rlA, rlB),
  });

  // 5. Corruption Perceptions Index (higher SCORE = cleaner = lower risk).
  const cpiA = va.cpi?.score ?? null;
  const cpiB = vb.cpi?.score ?? null;
  rows.push({
    label: "Corruption (CPI)",
    a: sideA.cpi,
    b: sideB.cpi,
    // Invert: a HIGHER CPI score means LOWER risk, so the higher-risk side is
    // the one with the LOWER score.
    higherRisk:
      cpiA === null || cpiB === null
        ? "na"
        : Math.abs(cpiA - cpiB) < 0.5
          ? "equal"
          : cpiA < cpiB
            ? "a"
            : "b",
  });

  // 6. EU tax blacklist (Annex I) — a listed jurisdiction reads higher-risk.
  const euA = isEuTaxListed(a.iso2);
  const euB = isEuTaxListed(b.iso2);
  rows.push({
    label: "EU tax list (Annex I)",
    a: euA ? "Listed" : "Not listed",
    b: euB ? "Listed" : "Not listed",
    higherRisk: euA === euB ? "equal" : euA ? "a" : "b",
  });

  // 7. Egmont FIU membership — a member reads lower-risk (stronger AML plumbing).
  const egA = !!getEgmontMember(a.iso2);
  const egB = !!getEgmontMember(b.iso2);
  rows.push({
    label: "Egmont FIU member",
    a: egA ? "Yes" : "No",
    b: egB ? "Yes" : "No",
    higherRisk: egA === egB ? "equal" : egA ? "b" : "a",
  });

  // 8. FATF mutual-evaluation year (facts only, no scoring — never sets higherRisk).
  const meA = getFatfAssessmentLink(a.iso2);
  const meB = getFatfAssessmentLink(b.iso2);
  rows.push({
    label: "Last FATF mutual evaluation",
    a: meA ? String(meA.year) : "Not assessed",
    b: meB ? String(meB.year) : "Not assessed",
    higherRisk: "na",
  });

  // 9. Beneficial-ownership register (public reads lower-risk; facts only for emphasis).
  const boA = getBoRegister(a.iso2);
  const boB = getBoRegister(b.iso2);
  rows.push({
    label: "BO register",
    a: boA ? boRegisterSignal(a.iso2) : "None identified",
    b: boB ? boRegisterSignal(b.iso2) : "None identified",
    higherRisk: boEmphasis(boA?.status, boB?.status),
  });

  const verdict = buildVerdict(sideA, sideB);
  const canonicalPath = comparePath(a, b);
  const title = `${a.name} vs ${b.name}: Country Risk Compared | RegActions`;
  const metaDescription = compareMetaDescription(sideA, sideB);

  return { a: sideA, b: sideB, rows, verdict, canonicalPath, title, metaDescription };
}

/** BO-register emphasis: public < restricted < none, higher tier reads higher-risk. */
function boEmphasis(
  a: "live-public" | "live-restricted" | undefined,
  b: "live-public" | "live-restricted" | undefined,
): CompareRow["higherRisk"] {
  const rank = (s: typeof a): number =>
    s === "live-public" ? 0 : s === "live-restricted" ? 1 : 2;
  const ra = rank(a);
  const rb = rank(b);
  if (ra === rb) return "equal";
  return ra > rb ? "a" : "b";
}

/**
 * Deterministic one-sentence verdict. The primary signal is the composite score
 * (the site's headline metric). When one or both scores are withheld, we fall
 * back to an honest comparison based on the sharpest available discriminator
 * (FATF listing severity, then sanctions severity), never inventing a number.
 */
export function buildVerdict(a: CompareSide, b: CompareSide): string {
  const va = a.view;
  const vb = b.view;

  // Both scored → compare the headline composite.
  if (a.score !== null && b.score !== null) {
    if (Math.abs(a.score - b.score) < 0.1) {
      return `${a.country.name} and ${b.country.name} currently carry a similar assessed risk (${a.score.toFixed(1)} vs ${b.score.toFixed(1)} on the RegActions 0-10 scale), so differentiate on the specific drivers below.`;
    }
    const [hi, lo] = a.score > b.score ? [a, b] : [b, a];
    const driver = topDriver(hi.view, lo.view);
    return `${hi.country.name} currently carries the higher assessed risk (${hi.score!.toFixed(1)} vs ${lo.score!.toFixed(1)} on the RegActions 0-10 scale)${driver ? `, driven by ${driver}` : ""}.`;
  }

  // One scored, one withheld.
  if (a.score !== null && b.score === null) {
    return `${a.country.name} carries a published RegActions risk score of ${a.score.toFixed(1)}/10, while ${b.country.name}'s headline score is withheld for insufficient governance evidence, so the two are not directly rank-comparable on the composite.`;
  }
  if (b.score !== null && a.score === null) {
    return `${b.country.name} carries a published RegActions risk score of ${b.score.toFixed(1)}/10, while ${a.country.name}'s headline score is withheld for insufficient governance evidence, so the two are not directly rank-comparable on the composite.`;
  }

  // Neither scored → fall back to the sharpest categorical discriminator.
  const fa = fatfSeverity(va);
  const fb = fatfSeverity(vb);
  if (fa !== fb) {
    const hi = fa > fb ? a : b;
    return `Both countries have their composite score withheld for insufficient governance evidence; on FATF listing status, ${hi.country.name} currently reads as the higher-risk jurisdiction.`;
  }
  return `Both countries have their composite score withheld for insufficient governance evidence, so compare them on the specific FATF, sanctions and governance signals below rather than a single number.`;
}

/**
 * The single strongest reason the higher-risk side outranks the other, in plain
 * words. Deterministic: checks sanctions, then FATF, then CPI gap, then WGI.
 */
function topDriver(hi: CountryView, lo: CountryView): string | undefined {
  if (sanctionsSeverity(hi) > sanctionsSeverity(lo) && sanctionsSeverity(hi) > 0) {
    return "its heavier sanctions exposure";
  }
  if (fatfSeverity(hi) > fatfSeverity(lo)) {
    return hi.fatf?.listing === "call-for-action"
      ? "its FATF call-for-action (black list) status"
      : "its FATF increased-monitoring (grey list) status";
  }
  const cpiHi = hi.cpi?.score;
  const cpiLo = lo.cpi?.score;
  if (cpiHi !== undefined && cpiLo !== undefined && cpiLo - cpiHi >= 8) {
    return "weaker corruption-control scores";
  }
  const rlHi = ruleOfLawRisk(hi);
  const rlLo = ruleOfLawRisk(lo);
  if (rlHi !== null && rlLo !== null && rlHi - rlLo >= 0.5) {
    return "weaker rule-of-law and institutional governance";
  }
  return "weaker governance indicators overall";
}

function compareMetaDescription(a: CompareSide, b: CompareSide): string {
  const sa = a.score === null ? "withheld" : `${a.score.toFixed(1)}/10`;
  const sb = b.score === null ? "withheld" : `${b.score.toFixed(1)}/10`;
  return `Compare ${a.country.name} vs ${b.country.name} on AML/CFT country risk: RegActions score (${sa} vs ${sb}), FATF status, sanctions posture, WGI governance and CPI, side by side with cited sources.`;
}

// ---------------------------------------------------------------------------
// Curated comparator selection + the prerendered set
// ---------------------------------------------------------------------------

/**
 * The ~20 highest-intent "anchor" countries for compare pages. These are the
 * jurisdictions with the most compliance/KYC search intent (major economies,
 * financial centres and frequently-screened higher-risk states). Deterministic,
 * documented list — the React route still handles ANY valid pair client-side;
 * only pairs anchored here are prerendered/sitemapped.
 */
export const COMPARE_ANCHOR_ISO2: string[] = [
  "US", // United States
  "GB", // United Kingdom
  "DE", // Germany
  "FR", // France
  "CH", // Switzerland
  "AE", // United Arab Emirates
  "SG", // Singapore
  "HK", // Hong Kong
  "CN", // China
  "IN", // India
  "RU", // Russia
  "TR", // Turkey
  "ZA", // South Africa
  "NG", // Nigeria
  "BR", // Brazil
  "MX", // Mexico
  "MT", // Malta
  "KY", // Cayman Islands
  "PA", // Panama
  "LU", // Luxembourg
];

/** Comparators per anchor in the prerendered set (drives the curated page count). */
export const COMPARATORS_PER_ANCHOR = 10;

/**
 * Pick the top-N deterministic comparators for an anchor country: realistic,
 * high-intent opposite sides of a "vs" query. The comparator POOL is the other
 * anchor countries PLUS same-region profiled page countries (so regional peers
 * people actually compare — e.g. "Kenya vs Nigeria" — are included, not just the
 * 20 anchors). The selection rule (documented, deterministic):
 *
 *   1. Prefer OTHER anchor countries in the SAME region (headline regional peers,
 *      e.g. Singapore vs Hong Kong).
 *   2. Then same-region profiled peers (Africa/Americas/etc. neighbours).
 *   3. Then anchor countries in the SAME risk band (similar-band comparators
 *      globally, e.g. Cayman vs Panama).
 *   4. Then the nearest anchors by ascending composite-score DISTANCE.
 *
 * Ties break by ISO2 for stability. The anchor itself is always excluded.
 */
export function compareComparators(anchorIso2: string, limit = COMPARATORS_PER_ANCHOR): Country[] {
  const anchor = COUNTRIES.find((c) => c.iso2 === anchorIso2);
  if (!anchor) return [];
  const anchorView = buildCountryView(anchor);
  const anchorScore = anchorView.riskScore.hasGovernance ? anchorView.riskScore.score : null;
  const anchorBand = anchorView.riskScore.hasGovernance ? anchorView.riskScore.band : null;

  const anchorSet = new Set(COMPARE_ANCHOR_ISO2);
  // Pool: other anchors + same-region profiled page countries.
  const pool = new Map<string, Country>();
  for (const iso2 of COMPARE_ANCHOR_ISO2) {
    if (iso2 === anchorIso2) continue;
    const c = COUNTRIES.find((x) => x.iso2 === iso2);
    if (c) pool.set(iso2, c);
  }
  for (const c of pageCountries()) {
    if (c.iso2 === anchorIso2) continue;
    if (c.region === anchor.region) pool.set(c.iso2, c);
  }

  const scored = [...pool.values()].map((c) => {
    const v = buildCountryView(c);
    const s = v.riskScore.hasGovernance ? v.riskScore.score : null;
    const band = v.riskScore.hasGovernance ? v.riskScore.band : null;
    const isAnchor = anchorSet.has(c.iso2);
    const sameRegion = c.region === anchor.region;
    const sameBand = band !== null && anchorBand !== null && band === anchorBand;
    const scoreDist =
      s !== null && anchorScore !== null ? Math.abs(s - anchorScore) : Number.POSITIVE_INFINITY;
    // Tier (lower sorts first): 0 = anchor same-region, 1 = other same-region,
    // 2 = anchor same-band, 3 = nearest-score anchor, 4 = rest.
    const tier = sameRegion && isAnchor ? 0 : sameRegion ? 1 : isAnchor && sameBand ? 2 : isAnchor ? 3 : 4;
    return { country: c, tier, scoreDist };
  });

  scored.sort((x, y) => {
    if (x.tier !== y.tier) return x.tier - y.tier;
    if (x.scoreDist !== y.scoreDist) return x.scoreDist - y.scoreDist;
    return x.country.iso2.localeCompare(y.country.iso2);
  });

  return scored.slice(0, limit).map((s) => s.country);
}

/**
 * The full curated set of compare pairs to prerender + sitemap. Each anchor
 * country paired with its top comparators; de-duplicated by canonical
 * (alphabetical) slug so a-vs-b and b-vs-a collapse to one page. Deterministic.
 */
export function curatedComparePairs(comparatorsPerAnchor = COMPARATORS_PER_ANCHOR): { a: Country; b: Country; slug: string }[] {
  const seen = new Set<string>();
  const out: { a: Country; b: Country; slug: string }[] = [];
  for (const anchorIso2 of COMPARE_ANCHOR_ISO2) {
    const anchor = COUNTRIES.find((c) => c.iso2 === anchorIso2);
    if (!anchor) continue;
    for (const other of compareComparators(anchorIso2, comparatorsPerAnchor)) {
      const slug = comparePairSlug(anchor, other);
      if (seen.has(slug)) continue;
      seen.add(slug);
      // Emit in canonical (alphabetical) order so the page matches its URL.
      const [a, b] = countrySlug(anchor) <= countrySlug(other) ? [anchor, other] : [other, anchor];
      out.push({ a, b, slug });
    }
  }
  return out;
}

/**
 * Cross-link suggestions FROM a compare page: a few other curated pages that
 * share a country with this pair, for internal linking. Deterministic, capped.
 */
export function relatedComparePairs(
  a: Country,
  b: Country,
  limit = 6,
): { a: Country; b: Country; slug: string; label: string }[] {
  const thisSlug = comparePairSlug(a, b);
  const wantIso2 = new Set([a.iso2, b.iso2]);
  const out: { a: Country; b: Country; slug: string; label: string }[] = [];
  const seen = new Set<string>([thisSlug]);
  for (const pair of curatedComparePairs()) {
    if (seen.has(pair.slug)) continue;
    if (pair.a.iso2 === a.iso2 || pair.b.iso2 === a.iso2 || pair.a.iso2 === b.iso2 || pair.b.iso2 === b.iso2) {
      // shares at least one country with this pair
      if (wantIso2.has(pair.a.iso2) || wantIso2.has(pair.b.iso2)) {
        seen.add(pair.slug);
        out.push({ ...pair, label: `${pair.a.name} vs ${pair.b.name}` });
        if (out.length >= limit) break;
      }
    }
  }
  return out;
}

/** The comparators shown as "Compare →" links on a single country's page. */
export function compareLinksForCountry(
  country: Country,
  limit = 5,
): { other: Country; slug: string }[] {
  // Regional peers with a score, nearest-risk first — the same people compare.
  const anchorView = buildCountryView(country);
  const anchorScore = anchorView.riskScore.hasGovernance ? anchorView.riskScore.score : null;
  const peers = pageCountries()
    .filter((c) => c.region === country.region && c.iso2 !== country.iso2)
    .map((c) => {
      const v = buildCountryView(c);
      const s = v.riskScore.hasGovernance ? v.riskScore.score : null;
      const dist =
        s !== null && anchorScore !== null ? Math.abs(s - anchorScore) : Number.POSITIVE_INFINITY;
      return { country: c, score: s, dist };
    })
    .sort((x, y) => {
      if (x.dist !== y.dist) return x.dist - y.dist;
      return x.country.name.localeCompare(y.country.name);
    })
    .slice(0, limit);
  return peers.map((p) => ({ other: p.country, slug: comparePairSlug(country, p.country) }));
}
