/**
 * Developer API documentation — single source of truth for the /developers page.
 *
 * NO React/JSX imports: consumed by both the React page (`src/pages/Developers.tsx`)
 * and the pure-TS prerender script (`scripts/prerender-seo.ts`), so the crawlable
 * static HTML and the hydrated SPA can't drift.
 *
 * Field lists were read from the live keyless responses of each endpoint on
 * regactions.com (all CORS-open, no API key) and document what is actually returned.
 */

export interface ApiField {
  name: string;
  type: string;
  description: string;
}

export interface ApiEndpoint {
  method: "GET";
  path: string;
  title: string;
  summary: string;
  example: string;
  fields: ApiField[];
}

export const API_BASE = "https://regactions.com";

export const DEVELOPERS_ATTRIBUTION_TEXT = "Data: RegActions — regactions.com";
export const DEVELOPERS_ATTRIBUTION_HTML =
  '<a href="https://regactions.com">Data: RegActions — regactions.com</a>';
export const DEVELOPERS_LICENCE_NAME = "CC BY-NC 4.0";
export const DEVELOPERS_LICENCE_URL =
  "https://creativecommons.org/licenses/by-nc/4.0/";

// Embeddable country risk badge. The badge endpoint returns an SVG that can be
// dropped into any page with a plain <img> tag; the attribution link next to it
// satisfies the CC BY-NC credit requirement.
export const BADGE_EMBED_HTML = `<a href="https://regactions.com/countries" title="AML country risk rating by RegActions">
  <img src="https://regactions.com/api/badge/GB.svg" alt="United Kingdom AML risk rating by RegActions" height="20" />
</a>`;

export const DEVELOPER_ENDPOINTS: ApiEndpoint[] = [
  {
    method: "GET",
    path: "/api/country-risk/list",
    title: "Country risk list",
    summary:
      "Every scored jurisdiction with the v2 composite result and the provenance of each source (FATF lists, FATF assessments, World Bank WGI, sanctions regimes, Transparency International CPI). Cached for 5 minutes.",
    example: "curl https://regactions.com/api/country-risk/list",
    fields: [
      { name: "methodologyVersion", type: "string", description: "Scoring methodology version (e.g. \"2.0.0\")." },
      { name: "calculatedAt", type: "string (ISO 8601)", description: "When the response was computed (deterministic at request time)." },
      { name: "count", type: "number", description: "Number of jurisdictions in results." },
      { name: "sources[]", type: "object[]", description: "Per-source provenance: id, name, sourceUrl, scored, cadence, state, effectiveAt, retrievedAt, sha256, note." },
      { name: "results[].country", type: "object", description: "Country identity: iso2, iso3, name, region, subregion, unMember, aliases[]." },
      { name: "results[].result", type: "object", description: "Composite result: score, band, status, confidence, per-pillar scores (aml/governance/sanctions), floors, limitingReasons, arithmetic." },
    ],
  },
  {
    method: "GET",
    path: "/api/country-risk/{iso2}",
    title: "Country risk detail",
    summary:
      "The full v2 result for a single jurisdiction by ISO 3166-1 alpha-2 code, including the pillar breakdown, band adjustments, change vs the previous methodology, and the evidence behind each pillar. Cached for 5 minutes.",
    example: "curl https://regactions.com/api/country-risk/GB",
    fields: [
      { name: "country", type: "object", description: "Country identity (iso2, iso3, name, region, subregion, unMember, aliases[])." },
      { name: "result.score", type: "number | null", description: "Composite 0-10 risk score (higher = higher risk); null when withheld." },
      { name: "result.band", type: "string", description: "Risk band: low | moderate | high | very-high." },
      { name: "result.status", type: "string", description: "rated | provisional (provisional when a pillar is unavailable)." },
      { name: "result.confidence", type: "string", description: "Confidence level for the score." },
      { name: "result.pillars", type: "object", description: "aml, governance and sanctions pillars with score, weight, coverageStatus and explanation." },
      { name: "result.limitingReasons", type: "string[]", description: "Human-readable reasons the score is provisional or capped." },
      { name: "previous", type: "object", description: "Prior methodology (v1) score and band for comparison." },
      { name: "change", type: "object", description: "Points delta and the drivers behind it." },
      { name: "evidence", type: "object", description: "Per-pillar evidence (FATF assessment, WGI dimensions, sanctions coverage)." },
    ],
  },
  {
    method: "GET",
    path: "/api/badge/{iso2}",
    title: "Country risk badge (SVG)",
    summary:
      "An embeddable SVG badge showing a jurisdiction's AML risk band and 0-10 score, coloured by band. Withheld jurisdictions render a \"Not rated\" variant and unknown codes return a 404 badge. Returns image/svg+xml and is edge-cached for a day. Embed it with a plain <img> tag; a `.svg` suffix on the code is accepted and ignored.",
    example: "curl https://regactions.com/api/badge/GB.svg",
    fields: [
      { name: "(response body)", type: "image/svg+xml", description: "A self-contained SVG badge, e.g. \"United Kingdom AML risk: Low (1.9/10)\", sized to its text." },
      { name: "iso2 (path)", type: "string", description: "ISO 3166-1 alpha-2 code, case-insensitive; an optional \".svg\" suffix is stripped." },
      { name: "Content-Type", type: "header", description: "image/svg+xml; charset=utf-8." },
      { name: "Cache-Control", type: "header", description: "public, s-maxage=86400 for rated/withheld badges; shorter for 404 badges." },
    ],
  },
  {
    method: "GET",
    path: "/api/unified/search",
    title: "Enforcement search",
    summary:
      "Search the global enforcement dataset across 45+ regulators. Supports query and filter params: q, regulator, country, year, month, minAmount, maxAmount, breachCategory, sector, currency, firmName, limit, offset.",
    example: "curl 'https://regactions.com/api/unified/search?q=aml&limit=5'",
    fields: [
      { name: "results[].id", type: "string (uuid)", description: "Stable record id." },
      { name: "results[].regulator", type: "string", description: "Regulator code (e.g. FCA, CMVM)." },
      { name: "results[].regulator_full_name", type: "string", description: "Full regulator name." },
      { name: "results[].country_code", type: "string", description: "ISO 3166-1 alpha-2 country of the regulator." },
      { name: "results[].firm_individual", type: "string", description: "Sanctioned firm or individual." },
      { name: "results[].amount_gbp", type: "number | null", description: "Penalty in GBP (null when not disclosed / not applicable)." },
      { name: "results[].currency", type: "string", description: "Original penalty currency." },
      { name: "results[].date_issued", type: "string (ISO 8601)", description: "Date the action was issued." },
      { name: "results[].breach_categories", type: "string[]", description: "Normalised breach category tags (e.g. AML, DISCLOSURE)." },
      { name: "results[].source_url", type: "string", description: "Link to the official regulator notice." },
      { name: "pagination", type: "object", description: "total, limit, offset, hasMore, pages, currentPage." },
      { name: "filters", type: "object", description: "Echo of the filters applied to this response." },
    ],
  },
];
