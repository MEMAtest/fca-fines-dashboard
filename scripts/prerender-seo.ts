/**
 * Post-build SEO pre-rendering script.
 *
 * After `vite build`, this script:
 * 1. Reads dist/index.html as a template
 * 2. Generates an index.html for key routes with correct <head> meta
 * 3. Generates dist/sitemap.xml for crawlers
 * 4. Generates dist/rss.xml for feed readers
 *
 * Vercel serves static files before rewrites, so pre-rendered files are
 * served directly to crawlers with correct meta tags.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");
const DIST = join(ROOT, "dist");

const BASE_URL = "https://regactions.com";
const SITE_NAME = "RegActions";
const OG_IMAGE = `${BASE_URL}/og-image.png`;
const RSS_URL = `${BASE_URL}/rss.xml`;
const CHANGES_RSS_URL = `${BASE_URL}/changes.xml`;
const GOOGLE_SITE_VERIFICATION =
  process.env.VITE_GOOGLE_SITE_VERIFICATION?.trim() || "";
const BING_SITE_VERIFICATION =
  process.env.VITE_BING_SITE_VERIFICATION?.trim() || "";

// ---------------------------------------------------------------------------
// Import article data (pure TS, no JSX)
// ---------------------------------------------------------------------------

// We can't import .ts directly (no bundler), so we require the compiled output.
// However since the project uses "type": "module" and ts-node/esm, the import
// resolves the .ts source directly.
import {
  getPublishedBlogArticles,
  getPublishedYearlyArticles,
} from "../src/data/blogArticles.js";
import {
  faqItems,
  getFaqsForArticle,
  getFaqsForYearlyArticle,
  getHomepageFaqs,
  generateFaqSchema,
} from "../src/data/faqData.js";

const blogArticles = getPublishedBlogArticles();
const yearlyArticles = getPublishedYearlyArticles();
import {
  REGULATOR_COVERAGE,
  PUBLIC_REGULATOR_CODES,
} from "../src/data/regulatorCoverage.js";
import { topicClusters } from "../src/data/topicClusters.js";
import {
  getCountryByIso2,
  countrySlug,
  type Country,
} from "../src/data/countries.js";
import { ENFORCEMENT_COVERED_ISO2 } from "../src/data/countryEnforcement.js";
import {
  buildCountryView,
  buildCountryIndex,
  pageCountries,
  formatDate,
  formatCount,
  fatfChangeText,
  type CountryView,
} from "../src/data/countryView.js";
import { sanctionsTierLabel, SANCTIONS_REVIEWED } from "../src/data/sanctionsStatus.js";
import { SANCTIONS_APPROVED_SNAPSHOT } from "../src/data/sanctionsApprovedData.js";
import { isEuTaxListed } from "../src/data/euTaxList.js";
import { getEgmontMember } from "../src/data/egmontMembership.js";
import { getFatfAssessmentLink } from "../src/data/fatfAssessmentLinks.js";
import { getBoRegister, boRegisterSignal } from "../src/data/boRegisters.js";
import {
  buildCountryChanges,
  changesByDate,
  CHANGE_KIND_LABELS,
  type ChangeEvent,
} from "../src/data/countryChanges.js";
import {
  buildCompareView,
  curatedComparePairs,
  relatedComparePairs,
  type CompareView,
} from "../src/data/countryCompare.js";
import { getNarrative } from "../src/data/countryNarratives.js";
import {
  bandLabel,
} from "../src/data/countryRiskScore.js";
import {
  buildCountryRiskPublicExplanation,
  COUNTRY_RISK_PILLAR_LABELS,
} from "../src/data/countryRiskPresentation.js";
import {
  GOVERNANCE_SOURCE,
  GOVERNANCE_VINTAGE,
  GOVERNANCE_LICENCE,
} from "../src/data/governanceData.js";
import { CPI_SOURCE, CPI_LICENCE, CPI_YEAR, CPI_TOTAL } from "../src/data/cpiData.js";
import {
  FATF_STATUS,
  fatfLabel,
  FATF_LAST_PLENARY,
  FATF_NEXT_PLENARY,
  FATF_SOURCE_URL,
  FATF_RECENT_CHANGES,
  fatfChangesByCycle,
  type FatfStatus,
} from "../src/data/fatfStatus.js";
import {
  buildCountryFaqs,
  generateCountryFaqSchema,
  type CountryFaq,
} from "../src/data/countryFaq.js";
import {
  BADGE_EMBED_HTML,
  DEVELOPER_ENDPOINTS,
  DEVELOPERS_ATTRIBUTION_HTML,
  DEVELOPERS_ATTRIBUTION_TEXT,
  DEVELOPERS_LICENCE_NAME,
  DEVELOPERS_LICENCE_URL,
} from "../src/data/developersApiDocs.js";
// Type-only import (erased at build) — the value-level `getRegulatorTopFines` is
// imported lazily/best-effort at runtime so a DB-less build still succeeds.
import type { RegulatorTopFine } from "../server/services/hubs.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function clampISODate(value: string, maxValue: string): string {
  // Both should be YYYY-MM-DD. Lexicographic compare is OK.
  if (!value) return maxValue;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return maxValue;
  return value > maxValue ? maxValue : value;
}

function toRfc2822(valueISO: string, fallbackISO: string): string {
  const safe = clampISODate(valueISO, fallbackISO);
  const date = new Date(`${safe}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return new Date(`${fallbackISO}T00:00:00.000Z`).toUTCString();
  }
  return date.toUTCString();
}

function humanize(label: string) {
  return label
    .replace(/_/g, " ")
    .replace(/[-]+/g, " ")
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/**
 * Normalise a partial date (YYYY, YYYY-MM or YYYY-MM-DD) to a full YYYY-MM-DD.
 * Missing month/day default to the last day available, so a "2024" vintage doesn't
 * mask a later fine-grained date when we take the max across sources.
 */
function normalizeToFullDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (/^\d{4}-\d{2}$/.test(value)) {
    const [y, m] = value.split("-").map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return `${value}-${String(lastDay).padStart(2, "0")}`;
  }
  if (/^\d{4}$/.test(value)) return `${value}-12-31`;
  return "";
}

/** Latest (max) of a set of partial dates, normalised to YYYY-MM-DD; empty ones ignored. */
function latestDate(...values: string[]): string {
  const full = values.map(normalizeToFullDate).filter(Boolean).sort();
  return full.length ? full[full.length - 1] : "";
}

/**
 * Real per-country-page freshness date: the latest data-change date across the
 * signals a country page actually shows — FATF plenary, sanctions review month,
 * WGI governance vintage and CPI vintage. Never fabricated, never the build date.
 */
// Clamped to today: month-precision vintages normalise to month-END (so a
// "2026-07" review doesn't lose to an earlier full date), which can land in
// the future mid-month — and Google ignores future lastmod/dateModified.
const COUNTRY_PAGE_DATE = clampISODate(
  latestDate(FATF_LAST_PLENARY, SANCTIONS_REVIEWED, GOVERNANCE_VINTAGE, CPI_YEAR),
  todayISO(),
);

interface PageMeta {
  path: string; // e.g. '/blog/fca-fines-2025-complete-list'
  title: string;
  description: string;
  keywords: string;
  ogType: string; // 'website' | 'article'
  datePublished?: string;
  dateModified?: string;
  articleSection?: string;
  jsonLd?: object;
  extraJsonLd?: object[]; // Additional JSON-LD blocks (e.g. FAQPage alongside Article)
  breadcrumbLabel?: string; // Short name for last breadcrumb item (defaults to humanized slug)
  bodyContent?: string; // Pre-rendered HTML body for SSG (injected into #root)
  ogImage?: string; // Custom OG image URL
  noindex?: boolean; // Emit robots noindex (used by the 404 shell)
  rssAlternates?: Array<{ title: string; href: string }>; // Extra RSS feed alternates
}

// ---------------------------------------------------------------------------
// Markdown → HTML renderer (pure regex, mirrors BlogPost.tsx renderMarkdownContent)
// ---------------------------------------------------------------------------

function renderMarkdownToHtml(content: string): string {
  const html = content
    .replace(/(\|.+\|\n)+/g, (tableBlock) => {
      const rows = tableBlock.trim().split("\n");
      let html = "<table><thead>";
      let inBody = false;
      rows.forEach((row) => {
        if (/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(row)) {
          html += "</thead><tbody>";
          inBody = true;
          return;
        }
        const cells = row
          .split("|")
          .filter(Boolean)
          .map((cell) => cell.trim());
        const cellTag = !inBody ? "th" : "td";
        html += `<tr>${cells.map((cell) => `<${cellTag}>${cell}</${cellTag}>`).join("")}</tr>`;
      });
      html += inBody ? "</tbody></table>" : "</thead></table>";
      return html;
    })
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/^\- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>");

  return html
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      if (/^<(h2|h3|table|ul|ol|div|section)\b/i.test(block)) return block;
      return `<p>${block.replace(/\n/g, "<br />")}</p>`;
    })
    .join("");
}

function wrapArticleShell(title: string, renderedContent: string): string {
  return `<div class="blog-page"><div class="blog-post-container"><article class="blog-article-modal"><h1 class="blog-post-title">${escapeHtml(title)}</h1><div class="blog-article-content">${renderedContent}</div></article></div></div>`;
}

function renderStaticPageBody(
  title: string,
  intro: string,
  sections: Array<{ heading: string; body: string }>,
): string {
  const sectionHtml = sections
    .map(
      (section) =>
        `<section><h2>${escapeHtml(section.heading)}</h2><p>${escapeHtml(section.body)}</p></section>`,
    )
    .join("");
  return `<div class="blog-page"><div class="blog-post-container"><article class="blog-article-modal"><h1 class="blog-post-title">${escapeHtml(title)}</h1><div class="blog-article-content"><p>${escapeHtml(intro)}</p>${sectionHtml}</div></article></div></div>`;
}

function renderHubBody(
  title: string,
  description: string,
  metrics: Array<{ label: string; value: string }>,
  ctaPath = "/regulators",
): string {
  const metricsHtml = metrics
    .map(
      (metric) =>
        `<li><strong>${escapeHtml(metric.label)}:</strong> ${escapeHtml(metric.value)}</li>`,
    )
    .join("");
  return `<div class="blog-page"><div class="blog-post-container"><article class="blog-article-modal"><h1 class="blog-post-title">${escapeHtml(title)}</h1><div class="blog-article-content"><p>${escapeHtml(description)}</p><h2>Coverage Snapshot</h2><ul>${metricsHtml}</ul><h2>Use This Data</h2><p>Open the live RegActions workspace to filter the source records, inspect related firms, compare breach themes, and export the evidence for compliance or board reporting.</p><p><a href="${ctaPath}">Open live enforcement data</a></p></div></article></div></div>`;
}

// ---------------------------------------------------------------------------
// Shared site footer (internal-linking overhaul — fixes the orphan problem).
// Emitted into the SSG shell of EVERY page so crawlers reach the country and
// regulator clusters that the homepage otherwise never links to. Mirrors the
// React <SiteFooter> in src/components/SiteFooter.tsx (same links, same order).
// ---------------------------------------------------------------------------

/**
 * Top-traffic-likely country risk reports linked from every page footer.
 * ISO2 codes are resolved to real slugs at build time; any code that fails to
 * resolve is silently dropped (keeps the footer honest — no dead links).
 */
const FOOTER_COUNTRY_ISO2 = [
  "US", "GB", "CN", "RU", "IN", "BR", "DE", "FR", "JP", "SG",
  "AE", "CH", "NG", "ZA", "MX", "TR", "SA", "HK", "IE", "KY",
] as const;

function footerCountryLinks(): Array<{ name: string; slug: string }> {
  return FOOTER_COUNTRY_ISO2.map((iso2) => {
    const country = getCountryByIso2(iso2);
    return country ? { name: country.name, slug: countrySlug(country) } : null;
  }).filter((entry): entry is { name: string; slug: string } => Boolean(entry));
}

/**
 * Shared crawlable footer. Plain <a> links only (no scripts/images) so page
 * weight barely moves. Rendered once and reused across all pages.
 */
function renderSiteFooter(): string {
  const exploreLinks: Array<[string, string]> = [
    ["Country risk reports", "/countries"],
    ["Regulator data hub", "/regulators"],
    ["Enforcement topics", "/topics"],
    ["FATF grey list", "/countries/fatf-grey-list"],
    ["Country risk changes", "/countries/changes"],
    ["Scoring methodology", "/countries/methodology"],
    ["Free data API", "/developers"],
  ];
  const exploreHtml = exploreLinks
    .map(([label, href]) => `<li><a href="${href}">${escapeHtml(label)}</a></li>`)
    .join("");
  const countryHtml = footerCountryLinks()
    .map(
      (c) =>
        `<li><a href="/countries/${c.slug}">${escapeHtml(c.name)}</a></li>`,
    )
    .join("");
  return `<footer class="site-footer" aria-label="Site links"><div class="site-footer__inner"><nav class="site-footer__col" aria-label="Explore RegActions"><h2 class="site-footer__heading">Explore RegActions</h2><ul>${exploreHtml}</ul></nav><nav class="site-footer__col site-footer__col--wide" aria-label="Popular country risk reports"><h2 class="site-footer__heading">Popular country risk reports</h2><ul class="site-footer__countries">${countryHtml}</ul></nav></div></footer>`;
}

const SITE_FOOTER_HTML = renderSiteFooter();

/** Per-currency formatter cache for the regulator fines table. */
const currencyFormatters = new Map<string, Intl.NumberFormat>();
function formatMoney(amount: number, currency: string): string {
  const code = (currency || "GBP").toUpperCase();
  let fmt = currencyFormatters.get(code);
  if (!fmt) {
    try {
      fmt = new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: code,
        maximumFractionDigits: 0,
      });
    } catch {
      // Unknown/blank ISO currency code — fall back to a plain number.
      fmt = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
    }
    currencyFormatters.set(code, fmt);
  }
  return fmt.format(amount);
}

/**
 * Static, crawlable top-N enforcement-actions table for a regulator hub. This
 * is the item-12 fix: the live fines list is client-only, so the served hub HTML
 * is otherwise ~660 chars. `fines` is fetched best-effort at build time; when the
 * DB is unreachable the caller passes [] and this returns "" (graceful fallback
 * to the existing DB-less hub body).
 */
function renderRegulatorFinesTable(
  fines: RegulatorTopFine[],
  currency: string,
): string {
  if (fines.length === 0) return "";
  const rows = fines
    .map((f) => {
      const firm = escapeHtml(f.firm || "Undisclosed");
      const date = escapeHtml(f.dateIssued ? formatDate(f.dateIssued) : "—");
      const amount = escapeHtml(
        f.amount > 0 ? formatMoney(f.amount, f.currency || currency) : "—",
      );
      const breach = escapeHtml(f.breach || "Not categorised");
      const source =
        f.sourceUrl && /^https?:\/\//i.test(f.sourceUrl)
          ? `<a href="${escapeHtml(f.sourceUrl)}" rel="noopener">Notice</a>`
          : "—";
      return `<tr><td>${firm}</td><td>${date}</td><td>${amount}</td><td>${breach}</td><td>${source}</td></tr>`;
    })
    .join("");
  return `<h2>Largest enforcement actions</h2><table class="hub-fines-table"><thead><tr><th>Firm or individual</th><th>Date</th><th>Amount</th><th>Breach category</th><th>Source</th></tr></thead><tbody>${rows}</tbody></table><p>Amounts are normalised to GBP for comparison.</p>`;
}

/**
 * Regulator hub SSG body = base hub body + a country cross-link + a static
 * top-N fines table (when data is available at build time). Keeps the shared
 * renderHubBody untouched for the breach/year/sector/firm hubs.
 */
function renderRegulatorHubBody(
  title: string,
  description: string,
  metrics: Array<{ label: string; value: string }>,
  path: string,
  code: string,
  fines: RegulatorTopFine[],
  currency: string,
): string {
  const base = renderHubBody(title, description, metrics, path);
  const countryLink = regulatorCountryLinkHtml(code);
  const finesTable = renderRegulatorFinesTable(fines, currency);
  // Splice the extra crawlable content in just before the closing wrappers so it
  // sits inside .blog-article-content alongside the coverage snapshot.
  const closing = "</div></article></div></div>";
  const injected = `${countryLink}${finesTable}`;
  if (!injected) return base;
  return base.endsWith(closing)
    ? `${base.slice(0, -closing.length)}${injected}${closing}`
    : `${base}${injected}`;
}

/**
 * Cross-link a regulator hub to its own country's risk report. Cheap and
 * accurate: the regulator's country comes from REGULATOR_COVERAGE, resolved to
 * a real country slug. Returns "" if we can't map it (no dead links).
 */
function regulatorCountryLinkHtml(code: string): string {
  const coverage = REGULATOR_COVERAGE[code];
  if (!coverage?.countryCode) return "";
  const country = getCountryByIso2(coverage.countryCode);
  if (!country) return "";
  return `<p class="hub-country-link"><a href="/countries/${countrySlug(
    country,
  )}">Country risk report: ${escapeHtml(country.name)} →</a></p>`;
}

/**
 * Related-links block for a prerendered blog article. We do NOT retro-edit the
 * article body; we only append a small block where a cheap article↔regulator
 * mapping exists (the per-regulator guides, slug `<code>-fines-enforcement-guide`,
 * generated in regulatorBlogs.ts). Links to the regulator hub + its country page.
 * Returns "" when no mapping is available, so most articles are unchanged.
 */
function regulatorCodeForBlogSlug(slug: string): string | null {
  const match = /^([a-z0-9]+)-fines-enforcement-guide$/.exec(slug);
  if (!match) return null;
  const upper = match[1].toUpperCase();
  // Match case-insensitively against real coverage codes (e.g. "BaFin").
  const code = Object.keys(REGULATOR_COVERAGE).find(
    (c) => c.toUpperCase() === upper,
  );
  return code ?? null;
}

function renderBlogRelatedLinks(slug: string): string {
  const code = regulatorCodeForBlogSlug(slug);
  if (!code) return "";
  const coverage = REGULATOR_COVERAGE[code];
  if (!coverage) return "";
  const items: string[] = [
    `<li><a href="/regulators/${code.toLowerCase()}">${escapeHtml(
      `${coverage.fullName} (${code}) enforcement data`,
    )}</a></li>`,
  ];
  const country = coverage.countryCode
    ? getCountryByIso2(coverage.countryCode)
    : undefined;
  if (country) {
    items.push(
      `<li><a href="/countries/${countrySlug(country)}">${escapeHtml(
        `${country.name} country risk report`,
      )}</a></li>`,
    );
  }
  return `<section class="blog-related"><h2>Related on RegActions</h2><ul>${items.join(
    "",
  )}</ul></section>`;
}

/**
 * Visible FAQ block for a country page. The answer text here is byte-identical to
 * the FAQPage JSON-LD (both come from `buildCountryFaqs`), satisfying Google's
 * requirement that the marked-up answer match the on-page answer.
 */
function renderCountryFaqBlock(faqs: CountryFaq[]): string {
  if (faqs.length === 0) return "";
  const items = faqs
    .map(
      (faq) =>
        `<div class="country-faq__item"><h3>${escapeHtml(faq.question)}</h3><p>${escapeHtml(faq.answer)}</p></div>`,
    )
    .join("");
  return `<section class="country-faq"><h2>FAQ</h2>${items}</section>`;
}

/**
 * Crawlable body for a single country's risk report. Driven by the SAME
 * `CountryView` the React page uses (`src/data/countryView.ts`), so the
 * prerendered HTML and the SPA can't drift apart in copy/logic.
 */
function renderCountryFatfBody(view: CountryView): string {
  const { country, statusHeading, statusDetail, history, enforcement, sanctions, sanctionsTier, riskV2, breakdown, globalAverage, cpi, decision, enforcementAssessed, hasComprehensiveSanctions, hasTargetedSanctions, sanctionsCoverageComplete, regulatory, regionalPeers, attribution } = view;
  const scoreAvailable = riskV2.score !== null && riskV2.band !== null;
  const publicExplanation = buildCountryRiskPublicExplanation(riskV2);
  const title = `${country.name} — Country Risk Report`;
  const pillarLis = Object.entries(riskV2.pillars)
    .map(([name, pillar]) => `<li>${escapeHtml(`${COUNTRY_RISK_PILLAR_LABELS[name as keyof typeof COUNTRY_RISK_PILLAR_LABELS]}: ${pillar.score === null ? "information unavailable" : `${pillar.score.toFixed(1)}/10`} — ${Math.round(pillar.appliedWeight * 100)}% of this score`)}</li>`)
    .join("");
  const floorLis = publicExplanation.floorMessages.map((message) => `<li>${escapeHtml(message)}</li>`).join("");
  const missingLis = publicExplanation.missingInformation.map((message) => `<li>${escapeHtml(message)}</li>`).join("");
  const scoreHtml = scoreAvailable
    ? `<h2>Country Risk Score: ${escapeHtml(
        `${riskV2.score!.toFixed(1)}/10 (${bandLabel(riskV2.band!)})`,
      )}</h2><p>${escapeHtml(
        `Higher score means higher country risk (global average ${globalAverage.toFixed(1)}). ${publicExplanation.statusLabel}. ${publicExplanation.confidenceLabel}. Enforcement activity and CPI are shown for context but do not change the score.`,
      )}</p><p>${escapeHtml(publicExplanation.statusExplanation)}</p><h3>How this score was calculated</h3><ul>${pillarLis}${missingLis}${floorLis}</ul>${publicExplanation.sanctionsZeroExplanation ? `<p>${escapeHtml(publicExplanation.sanctionsZeroExplanation)}</p>` : ""}<details><summary>Show the exact calculation</summary><p>${escapeHtml(riskV2.arithmetic)}</p></details>`
    : `<h2>Country Risk Score: not published</h2><p>${escapeHtml(
        publicExplanation.statusExplanation,
      )}</p><h3>Information available</h3><ul>${pillarLis}${missingLis}<li>Headline score: not published</li></ul>`;
  const glanceHtml = `<h2>At a glance</h2><ul><li>${escapeHtml(
    `FATF status: ${statusHeading} (one indicator only; it does not set the overall country risk rating by itself)`,
  )}</li><li>${escapeHtml(
    sanctionsCoverageComplete
      ? `Comprehensive country sanctions: ${hasComprehensiveSanctions ? "in place" : "none identified"}. Targeted sanctions exposure: ${hasComprehensiveSanctions || hasTargetedSanctions ? "programmes in place, screen applicable lists" : "possible, screen applicable persons, entities and sectors"}`
      : "Geographic sanctions evidence: incomplete; absence is not inferred and applicable lists must still be screened.",
  )}</li><li>${escapeHtml(riskV2.pillars.governance.score === null ? "Government effectiveness and rule of law: information unavailable" : `Government effectiveness and rule of law: ${riskV2.pillars.governance.score.toFixed(1)}/10`)}</li><li>${escapeHtml(
    cpi
      ? `Corruption (CPI ${CPI_YEAR}): ${cpi.score}/100, rank #${cpi.rank} of ${CPI_TOTAL}`
      : "Corruption (CPI): no score",
  )}</li><li>${escapeHtml(
    enforcementAssessed
      ? `Enforcement: ${formatCount(enforcement!.trackedActions)} actions from ${enforcement!.regulatorCount} regulator${enforcement!.regulatorCount === 1 ? "" : "s"}`
      : "Enforcement data: not yet assessed (no RegActions coverage)",
  )}</li></ul>`;
  const treatmentHtml = `<h2>Recommended treatment</h2><p>${escapeHtml(decision.treatment)}</p>`;
  const decisionHtml = `<h2>Principal risk drivers</h2><ul>${decision.riskDrivers
    .map((d) => `<li>${escapeHtml(d)}</li>`)
    .join("")}</ul><h2>Mitigating factors</h2><ul>${decision.mitigatingFactors
    .map((d) => `<li>${escapeHtml(d)}</li>`)
    .join("")}</ul><h2>Business impact</h2><ul>${decision.businessImpact
    .map((r) => `<li>${escapeHtml(`${r.activity} (${r.level}): ${r.implication}`)}</li>`)
    .join("")}</ul><h2>Recommended controls</h2><ul>${decision.recommendedControls
    .map((c) => `<li>${escapeHtml(c)}</li>`)
    .join("")}</ul><h2>Enhanced due diligence triggers</h2><ul>${decision.eddTriggers
    .map((t) => `<li>${escapeHtml(t)}</li>`)
    .join("")}</ul>`;
  const whatChangedHtml = `<h2>Assessment currency</h2><ul>${decision.whatChanged
    .map((w) => `<li>${escapeHtml(`${w.label}: ${w.value} (as of ${w.asOf})`)}</li>`)
    .join("")}</ul>`;
  // Attributed indicators: per-imposer sanctions Yes/No + WGI institutional sub-scores.
  const sanctionsAttributionHtml = sanctionsCoverageComplete
    ? `<ul>${attribution.sanctions.imposers
        .map((r) => `<li>${escapeHtml(`${r.imposer}: ${r.active ? `Yes (${r.tierLabel})` : "No"}`)}</li>`)
        .join("")}</ul><p>No means the complete UN, UK, EU and US review found no direct country-level programme. People or organisations may still appear on sanctions lists.</p>`
    : `<p>International sanctions information is incomplete. Missing information is not treated as zero.</p>`;
  const attrHtml = `<h2>Source details</h2><h3>International sanctions by issuing body</h3>${sanctionsAttributionHtml}<h3>Government effectiveness and rule of law (World Bank ${escapeHtml(
    attribution.governance.vintage,
  )}, percentile)</h3><ul>${attribution.governance.subScores
    .map(
      (s) =>
        `<li>${escapeHtml(
          `${s.label}: ${s.percentile === null ? "no data" : `${s.percentile}/100`}`,
        )}</li>`,
    )
    .join("")}</ul>`;
  // Historical prose narratives contain v1 scores. The v2 page uses the
  // deterministic decision and exact arithmetic above instead of publishing
  // stale score claims into crawler-visible HTML.
  const analysisHtml = "";
  const sanctionsHtml =
    sanctionsCoverageComplete && sanctions && sanctionsTier
      ? `<h2>Sanctions: ${escapeHtml(sanctionsTierLabel(sanctionsTier))}</h2><ul>${sanctions.programs
          .map(
            (prog) =>
              `<li>${escapeHtml(prog.imposer)} — ${escapeHtml(sanctionsTierLabel(prog.tier).toLowerCase())}: ${escapeHtml(
                prog.program,
              )} (<a href="${escapeHtml(prog.sourceUrl)}" rel="noopener">source</a>)</li>`,
          )
          .join("")}</ul>`
      : "";
  const historyHtml =
    history.length > 0
      ? `<h2>FATF status history</h2><ul>${history
          .map(
            (h) =>
              `<li>${escapeHtml(formatDate(h.date))}: ${escapeHtml(fatfChangeText(h))}</li>`,
          )
          .join("")}</ul>`
      : "";
  const enforcementHtml = enforcement
    ? `<h2>Enforcement activity</h2><p>${escapeHtml(
        `RegActions tracks ${formatCount(enforcement.trackedActions)} enforcement actions from ${enforcement.regulatorCount} ${
          enforcement.regulatorCount === 1 ? "regulator" : "regulators"
        } in ${country.name}.`,
      )}</p><ul>${enforcement.regulators
        .map(
          (r) =>
            `<li><a href="${escapeHtml(r.overviewPath)}"><strong>${escapeHtml(r.code)}</strong> — ${escapeHtml(
              r.fullName,
            )}</a> (${escapeHtml(formatCount(r.count))} actions, ${escapeHtml(r.years)})</li>`,
        )
        .join("")}</ul><p>The composite RegActions Country Risk Score does not use enforcement volume.</p>`
    : "";
  // Regulators & legal framework: FATF-network membership + national regulators
  // + deterministic framework signals (mirrors the React module).
  const fatfNetworkLine = regulatory.fatfMember
    ? regulatory.suspended
      ? "FATF member (membership suspended)"
      : "FATF member"
    : regulatory.fsrbs.length > 0
      ? `FATF network via ${regulatory.fsrbs.map((f) => f.code).join(" · ")}`
      : "Outside the FATF regional network";
  const fsrbListHtml =
    regulatory.fsrbs.length > 0
      ? `<ul>${regulatory.fsrbs
          .map(
            (f) =>
              `<li><a href="${escapeHtml(f.url)}" rel="noopener">${escapeHtml(
                f.fullName,
              )}</a></li>`,
          )
          .join("")}</ul>`
      : "";
  const regulatorsHtml =
    regulatory.regulators.length > 0
      ? `<ul>${regulatory.regulators
          .map(
            (r) =>
              `<li><a href="${escapeHtml(r.overviewPath)}"><strong>${escapeHtml(
                r.code,
              )}</strong> — ${escapeHtml(r.fullName)}</a> (${escapeHtml(
                formatCount(r.count),
              )} actions, ${escapeHtml(r.years)})</li>`,
          )
          .join("")}</ul>`
      : `<p>Regulator profiles not yet available on RegActions.</p>`;
  const ruleOfLawDomain = breakdown.domains.find((d) => d.key === "ruleOfLaw");
  const euTaxLi = isEuTaxListed(country.iso2)
    ? `<li>${escapeHtml("EU tax list: Listed (Annex I)")}</li>`
    : "";
  // Beneficial-ownership register availability (Open Ownership, CC BY 4.0) —
  // one line where the source confirms a live register. Mirrors CountryHub.tsx.
  const boLi = getBoRegister(country.iso2)
    ? `<li>${escapeHtml(`BO register: ${boRegisterSignal(country.iso2)}`)}</li>`
    : "";
  const frameworkSignalsHtml = `<ul><li>${escapeHtml(
    `FATF listing: ${statusHeading}`,
  )}</li><li>${escapeHtml(
    `International sanctions: ${
      !sanctionsCoverageComplete
        ? "official-source evidence incomplete"
        : hasComprehensiveSanctions
        ? "comprehensive country programme"
        : sanctionsTier
          ? `${sanctionsTierLabel(sanctionsTier).toLowerCase()} exposure`
          : "no listed programme identified"
    }`,
  )}</li>${euTaxLi}${boLi}<li>${escapeHtml(
    cpi
      ? `Corruption (CPI ${CPI_YEAR}): ${cpi.score}/100, rank #${cpi.rank} of ${CPI_TOTAL}`
      : "Corruption (CPI): no score",
  )}</li><li>${escapeHtml(
    ruleOfLawDomain && ruleOfLawDomain.risk !== null
      ? `Rule of law (WGI): ${ruleOfLawDomain.risk.toFixed(1)}/10 risk`
      : "Rule of law (WGI): no data",
  )}</li></ul>`;
  const egmont = getEgmontMember(country.iso2);
  const fiuHtml = `<p>${escapeHtml(
    egmont
      ? `FIU: Egmont Group member${egmont.fiu ? ` (${egmont.fiu})` : ""}${egmont.suspended ? " · suspended since Oct 2023" : ""}`
      : "FIU: Not an Egmont Group member",
  )}</p>`;
  // FATF mutual-evaluation date + public report link (dates from fatfAssessmentData.ts,
  // link to the FATF country page; no licensed ratings). Mirrors CountryHub.tsx.
  const meLink = getFatfAssessmentLink(country.iso2);
  const meHtml = meLink
    ? `<p>${escapeHtml(`Last mutual evaluation: ${meLink.year}`)} · <a href="${escapeHtml(
        meLink.reportUrl,
      )}" rel="noopener">${escapeHtml("report")}</a></p>`
    : "";
  const regulatoryHtml = `<h2>Regulators and legal framework</h2><h3>FATF network</h3><p>${escapeHtml(
    fatfNetworkLine,
  )}.</p>${fsrbListHtml}${meHtml}<h3>National regulators</h3>${regulatorsHtml}${fiuHtml}<h3>Framework signals</h3>${frameworkSignalsHtml}`;
  // Sector exposure: which sectors carry elevated financial-crime risk, derived
  // from the same sourced modules as the React card (mirrors CountryHub.tsx).
  const sectorHtml = `<h2>Sector exposure</h2><ul>${view.sectorExposure
    .map(
      (s) =>
        `<li><strong>${escapeHtml(s.sector)}</strong> (${escapeHtml(
          s.level,
        )}): ${escapeHtml(s.rationale)}</li>`,
    )
    .join(
      "",
    )}</ul><p>Derived from sanctions tier, FATF listing, World Bank WGI governance and CPI; no per-sector dataset is asserted.</p>`;
  const peersHtml =
    regionalPeers.length > 0
      ? `<h2>Regional peer scores</h2><ul>${regionalPeers
          .map(
            (p) =>
              `<li><a href="/countries/${countrySlug(p.country)}">${escapeHtml(
                p.country.name,
              )}</a>: ${escapeHtml(
                p.score === null || p.band === null
                  ? "score withheld (insufficient data)"
                  : `${p.score.toFixed(1)}/10 (${bandLabel(p.band)})`,
              )}</li>`,
          )
          .join("")}</ul>`
      : "";
  const introHtml = `<p>${escapeHtml(
    `${country.name} (${country.region} • ${country.subregion}). Risk report as of the ${formatDate(FATF_LAST_PLENARY)} FATF plenary.`,
  )}</p><p><strong>${escapeHtml(`${decision.verdictHeadline}.`)}</strong> ${escapeHtml(decision.verdictParagraph)}</p>`;
  const sourcesHtml = `<p><a href="${escapeHtml(
    FATF_SOURCE_URL,
  )}" rel="noopener">Source: FATF black &amp; grey lists</a> · ${escapeHtml(
    `World Bank WGI (${GOVERNANCE_LICENCE})`,
  )} · <a href="${escapeHtml(CPI_SOURCE)}" rel="noopener">${escapeHtml(
    `TI CPI (${CPI_LICENCE}, display only)`,
  )}</a></p>`;
  // Visible FAQ block — answers MUST match the FAQPage JSON-LD verbatim (Google
  // requirement). Both derive from buildCountryFaqs(view), so they cannot drift.
  const faqHtml = renderCountryFaqBlock(buildCountryFaqs(view));
  return `<div class="blog-page"><div class="blog-post-container"><article class="blog-article-modal"><h1 class="blog-post-title">${escapeHtml(
    title,
  )}</h1><div class="blog-article-content">${introHtml}${treatmentHtml}${glanceHtml}${scoreHtml}${decisionHtml}<h2>FATF status: ${escapeHtml(
    statusHeading,
  )}</h2><p>${escapeHtml(
    statusDetail,
  )}</p>${sanctionsHtml}${attrHtml}${historyHtml}${enforcementHtml}${regulatoryHtml}${sectorHtml}${analysisHtml}${whatChangedHtml}${peersHtml}${faqHtml}${sourcesHtml}</div></article></div></div>`;
}

/**
 * Crawlable body for a country-vs-country compare page. Renders the SAME data +
 * copy the React compare page shows (from the shared `buildCompareView`), so the
 * prerendered HTML and the hydrated page cannot drift. Zero new data.
 */
function renderCompareBody(view: CompareView): string {
  const { a, b } = view;
  const title = `${a.country.name} vs ${b.country.name}: country risk compared`;
  const headA = `${a.flag} ${escapeHtml(a.country.name)} (${
    a.score === null ? "score withheld" : `${a.score.toFixed(1)}/10, ${escapeHtml(a.bandLabel)}`
  })`;
  const headB = `${b.flag} ${escapeHtml(b.country.name)} (${
    b.score === null ? "score withheld" : `${b.score.toFixed(1)}/10, ${escapeHtml(b.bandLabel)}`
  })`;
  const rowsHtml = view.rows
    .map(
      (r) =>
        `<tr><th scope="row">${escapeHtml(r.label)}</th><td>${escapeHtml(
          r.a,
        )}</td><td>${escapeHtml(r.b)}</td></tr>`,
    )
    .join("");
  const tableHtml = `<table><thead><tr><th>Indicator</th><th>${escapeHtml(
    a.country.name,
  )}</th><th>${escapeHtml(b.country.name)}</th></tr></thead><tbody>${rowsHtml}</tbody></table>`;
  const caveatHtml =
    !a.view.sanctionsCoverageComplete || !b.view.sanctionsCoverageComplete
      ? `<p>${escapeHtml(
          "Sanctions classification is under independent review for at least one of these jurisdictions. Absence of a programme is not inferred; firms must still screen the applicable UN, UK, EU and US lists.",
        )}</p>`
      : "";
  const meA = getFatfAssessmentLink(a.country.iso2);
  const meB = getFatfAssessmentLink(b.country.iso2);
  const meHtml =
    meA || meB
      ? `<h2>FATF mutual evaluations</h2><ul>${
          meA
            ? `<li>${escapeHtml(`${a.country.name}: last mutual evaluation ${meA.year}`)} · <a href="${escapeHtml(
                meA.reportUrl,
              )}" rel="noopener">report</a></li>`
            : ""
        }${
          meB
            ? `<li>${escapeHtml(`${b.country.name}: last mutual evaluation ${meB.year}`)} · <a href="${escapeHtml(
                meB.reportUrl,
              )}" rel="noopener">report</a></li>`
            : ""
        }</ul>`
      : "";
  const reportsHtml = `<h2>Full country reports</h2><ul><li><a href="/countries/${a.slug}">Full ${escapeHtml(
    a.country.name,
  )} risk report</a></li><li><a href="/countries/${b.slug}">Full ${escapeHtml(
    b.country.name,
  )} risk report</a></li></ul>`;
  const related = relatedComparePairs(a.country, b.country, 6);
  const relatedHtml =
    related.length > 0
      ? `<h2>Related comparisons</h2><ul>${related
          .map(
            (r) =>
              `<li><a href="/countries/compare/${r.slug}">${escapeHtml(r.label)}</a></li>`,
          )
          .join("")}</ul>`
      : "";
  const sourcesHtml = `<p>${escapeHtml(
    "Scores combine World Bank WGI governance, FATF listing status and sanctions exposure; CPI and enforcement volume are shown but not scored.",
  )} <a href="/countries/methodology">${escapeHtml("Scoring methodology")}</a>.</p>`;
  return `<div class="blog-page"><div class="blog-post-container"><article class="blog-article-modal"><h1 class="blog-post-title">${escapeHtml(
    title,
  )}</h1><div class="blog-article-content"><p><strong>${escapeHtml(
    view.verdict,
  )}</strong></p><p>${headA} vs ${headB}.</p><h2>Side by side</h2>${tableHtml}${caveatHtml}${meHtml}${reportsHtml}${relatedHtml}${sourcesHtml}</div></article></div></div>`;
}

/** Crawlable body for the /countries index (FATF grey + black lists). */
function renderCountriesIndexBody(): string {
  const rows = (listing: FatfStatus["listing"]) =>
    FATF_STATUS.filter((s) => s.listing === listing)
      .map((s) => ({ s, c: getCountryByIso2(s.iso2) }))
      .filter((x): x is { s: FatfStatus; c: Country } => Boolean(x.c))
      .sort((a, b) => a.c.name.localeCompare(b.c.name))
      .map(
        ({ c }) =>
          `<li><a href="/countries/${countrySlug(c)}">${escapeHtml(c.name)}</a> — ${escapeHtml(c.region)}</li>`,
      )
      .join("");
  const greyCount = FATF_STATUS.filter((s) => s.listing === "increased-monitoring").length;
  const nameOf = (iso2: string) => getCountryByIso2(iso2)?.name ?? iso2;
  const added = FATF_RECENT_CHANGES.filter((c) => c.change === "added")
    .map((c) => getCountryByIso2(c.iso2)?.name)
    .filter(Boolean)
    .join(", ");
  const removed = FATF_RECENT_CHANGES.filter((c) => c.change === "removed")
    .map((c) => getCountryByIso2(c.iso2)?.name)
    .filter(Boolean)
    .join(", ");
  // "As of" trust line — mirrors the React tracker header.
  const asOfHtml = `<p><strong>${greyCount}</strong> ${escapeHtml(
    `jurisdictions under increased monitoring · as of ${formatDate(FATF_LAST_PLENARY)} · next FATF plenary ${formatDate(FATF_NEXT_PLENARY)}`,
  )}</p>`;
  // Multi-cycle plenary change-log — mirrors the React tracker change-log.
  const changeLogHtml = `<h2>Plenary change-log</h2><ul>${fatfChangesByCycle()
    .map((cy) => {
      const addedNames = cy.added.map((c) => nameOf(c.iso2)).join(", ");
      const removedNames = cy.removed.map((c) => nameOf(c.iso2)).join(", ");
      const parts = [
        addedNames ? `added ${addedNames}` : "",
        removedNames ? `removed ${removedNames}` : "",
      ]
        .filter(Boolean)
        .join("; ");
      return `<li>${escapeHtml(`${cy.label} (${formatDate(cy.date)}): ${parts}.`)}</li>`;
    })
    .join("")}</ul>`;
  // Dataset JSON-LD for the grey/black list (Google Dataset Search).
  // Emitted here in the grey-list body only; the sibling owns the @graph/other
  // schema functions. dateModified = plenary date; distribution → public API.
  const datasetLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: `FATF Grey List & Black List ${FATF_LAST_PLENARY.slice(0, 4)}`,
    description:
      "FATF jurisdictions under increased monitoring (grey list) and subject to a call for action (black list), with recent plenary additions and removals.",
    url: `${BASE_URL}/countries/fatf-grey-list`,
    keywords: [
      "FATF grey list",
      "FATF black list",
      "jurisdictions under increased monitoring",
      "AML high-risk countries",
      "FATF call for action",
    ],
    creator: { "@type": "Organization", name: SITE_NAME, url: BASE_URL },
    dateModified: FATF_LAST_PLENARY,
    isBasedOn: FATF_SOURCE_URL,
    distribution: [
      {
        "@type": "DataDownload",
        encodingFormat: "application/json",
        contentUrl: `${BASE_URL}/api/country-risk/list`,
      },
    ],
  };
  const datasetScript = `<script type="application/ld+json">${JSON.stringify(datasetLd)}</script>`;
  return `<div class="blog-page"><div class="blog-post-container"><article class="blog-article-modal"><h1 class="blog-post-title">FATF Grey List &amp; Black List ${FATF_LAST_PLENARY.slice(
    0,
    4,
  )}</h1><div class="blog-article-content"><p>${escapeHtml(
    `FATF jurisdictions under increased monitoring (grey list) and subject to a call for action (black list), current as of the ${formatDate(FATF_LAST_PLENARY)} plenary.`,
  )}</p>${asOfHtml}${added ? `<p><strong>Added:</strong> ${escapeHtml(added)}</p>` : ""}${
    removed ? `<p><strong>Removed:</strong> ${escapeHtml(removed)}</p>` : ""
  }<h2>Black list — Call for Action</h2><ul>${rows("call-for-action")}</ul><h2>Grey list — Increased Monitoring</h2><ul>${rows(
    "increased-monitoring",
  )}</ul>${changeLogHtml}<p><a href="${escapeHtml(FATF_SOURCE_URL)}" rel="noopener">Source: FATF black &amp; grey lists</a></p></div></article>${datasetScript}</div></div>`;
}

/** Crawlable body for the GLOBAL /countries index — every scored country, ranked. */
function renderGlobalIndexBody(): string {
  const index = buildCountryIndex();
  const counts = { "very-high": 0, high: 0, moderate: 0, low: 0 };
  for (const e of index) if (e.band) counts[e.band] += 1;
  const complete = index.filter((entry) => entry.status === "complete").length;
  const provisional = index.filter((entry) => entry.status === "provisional").length;
  const insufficient = index.filter((entry) => entry.status === "insufficient-data").length;
  const bandName = { "very-high": "Very high", high: "High", moderate: "Moderate", low: "Low" };
  const rowsHtml = index
    .map(
      (e, i) =>
        `<tr><td>${e.score === null ? "—" : i + 1}</td><td><a href="/countries/${countrySlug(e.country)}">${escapeHtml(
          e.country.name,
        )}</a></td><td>${e.score === null ? "Withheld" : e.score.toFixed(1)}</td><td>${e.band ? escapeHtml(bandName[e.band]) : "Insufficient data"}</td><td>${escapeHtml(
          e.country.region,
        )}</td><td>${e.fatf ? escapeHtml(fatfLabel(e.fatf.listing)) : "—"}</td><td>${
          SANCTIONS_APPROVED_SNAPSHOT.coverageComplete
            ? (e.sanctionsTier ? escapeHtml(sanctionsTierLabel(e.sanctionsTier)) : "No direct country restrictions")
            : "Information incomplete"
        }</td></tr>`,
    )
    .join("");
  return `<div class="blog-page"><div class="blog-post-container"><article class="blog-article-modal"><h1 class="blog-post-title">Global Country Risk Ratings</h1><div class="blog-article-content"><p>${escapeHtml(
    `Compare financial-crime and country risk across ${index.length} jurisdictions. Full information is available for ${complete}; ${provisional} have some information missing; ${insufficient} do not have enough information for a score. Missing information is never treated as zero risk. Enforcement activity and CPI are shown for context but do not change the score.`,
  )}</p><p>${escapeHtml(
    `Very high: ${counts["very-high"]} · High: ${counts.high} · Moderate: ${counts.moderate} · Low: ${counts.low} · Insufficient data: ${insufficient}.`,
  )} <a href="/countries/fatf-grey-list">See the FATF grey list &amp; black list</a>.</p><table><thead><tr><th>#</th><th>Country</th><th>Risk score</th><th>Risk</th><th>Region</th><th>FATF</th><th>International sanctions</th></tr></thead><tbody>${rowsHtml}</tbody></table></div></article></div></div>`;
}

/** Crawlable methodology page — mirrors CountryMethodology.tsx. */
function renderMethodologyBody(): string {
  return renderMethodologyV2Body();
}

function renderMethodologyV2Body(): string {
  return `<div class="blog-page"><div class="blog-post-container"><article class="blog-article-modal"><h1 class="blog-post-title">Country Risk Score</h1><div class="blog-article-content"><p>The score compares the underlying financial-crime risk of countries on a 0-10 scale. A higher number means higher risk. It is a country comparison, not a decision about an individual person or business.</p><h2>What the score considers</h2><ul><li>Financial crime controls (50%): FATF assessments of effectiveness and international standards.</li><li>Government effectiveness and rule of law (30%): six World Bank measures covering institutions, regulation, stability, accountability and corruption control.</li><li>International sanctions (20%): the reach of active country-level UN, UK, EU and US sanctions.</li></ul><h2>When information is missing</h2><p>Missing information is never treated as zero risk. If one of the three parts is unavailable, the remaining parts are rebalanced and the country cannot be labelled Low risk. Fewer than two parts means no headline score is published.</p><h2>How sanctions information is checked</h2><p>A sanctions score of zero is possible only after the complete UN, UK, EU and US country-level catalogues have been checked. People or organisations may still appear on sanctions lists. Unexpected source changes or unclear evidence stop scoring until the information is complete.</p><h2>When the score has a minimum</h2><p>FATF grey list 6.0; FATF call for action 9.0; sector-wide sanctions 6.0; comprehensive sanctions 8.0. Targeted sanctions remain visible but do not set a minimum.</p><h2>Separate context</h2><p>Transparency International CPI and RegActions enforcement activity are displayed but do not change the score.</p></div></article></div></div>`;
}

/**
 * Crawlable body for /countries/changes — mirrors CountryChanges.tsx. Renders
 * the SAME derived events (from buildCountryChanges) grouped by date, so the
 * prerendered HTML and the React page cannot drift.
 */
function renderChangesBody(events: ChangeEvent[]): string {
  const groups = changesByDate(events);
  const groupsHtml = groups
    .map((group) => {
      const itemsHtml = group.events
        .map((event) => {
          const label = escapeHtml(CHANGE_KIND_LABELS[event.kind]);
          const isExternal = /^https?:\/\//i.test(event.href);
          const link = isExternal
            ? `<a href="${escapeHtml(event.href)}" rel="noopener">${escapeHtml(event.title)}</a>`
            : `<a href="${escapeHtml(event.href)}">${escapeHtml(event.title)}</a>`;
          return `<li><strong>${label}:</strong> ${link}. ${escapeHtml(event.detail)}</li>`;
        })
        .join("");
      return `<h3>${escapeHtml(formatDate(group.date))}</h3><ul>${itemsHtml}</ul>`;
    })
    .join("");
  const intro = `<p>${escapeHtml(
    "A dated record of every change RegActions already tracks across country risk: FATF plenary additions and removals, sanctions-evidence snapshot promotions, EU tax list updates, framework-data reviews, and composite score moves once a trend accrues. Every entry is derived from a cited source.",
  )}</p><p><a href="/changes.xml" rel="noopener">Subscribe to the country-risk changes RSS feed</a>.</p>`;
  const outro = `<p><a href="/countries/fatf-grey-list">FATF grey &amp; black list</a> · <a href="/countries">All country risk reports</a> · <a href="/countries/methodology">Scoring methodology</a></p>`;
  return `<div class="blog-page"><div class="blog-post-container"><article class="blog-article-modal"><h1 class="blog-post-title">What changed in country risk</h1><div class="blog-article-content">${intro}${groupsHtml}${outro}</div></article></div></div>`;
}

function renderTopicClusterBody(slug: string): string {
  const cluster = topicClusters.find((item) => item.slug === slug);
  if (!cluster) return "";
  const articles = cluster.primaryArticles
    .map(
      (article) =>
        `<li><a href="/blog/${article.slug}">${escapeHtml(article.title)}</a> — ${escapeHtml(article.role)}</li>`,
    )
    .join("");
  const evidence = cluster.evidenceFocus
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
  const questions = cluster.boardQuestions
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
  const links = [...cluster.supportingLinks, ...cluster.nextActions]
    .map(
      (link) =>
        `<li><a href="${link.href}">${escapeHtml(link.label)}</a> — ${escapeHtml(link.description)}</li>`,
    )
    .join("");

  return `<div class="blog-page"><div class="blog-post-container"><article class="blog-article-modal"><h1 class="blog-post-title">${escapeHtml(cluster.title)}</h1><div class="blog-article-content"><p>${escapeHtml(cluster.summary)}</p><h2>Core Articles</h2><ul>${articles}</ul><h2>Evidence Focus</h2><ul>${evidence}</ul><h2>Board Questions</h2><ul>${questions}</ul><h2>Search, Data and Advisory Paths</h2><ul>${links}</ul></div></article></div></div>`;
}

function renderTopicsLandingBody(): string {
  const clusterLinks = topicClusters
    .map(
      (cluster) =>
        `<li><a href="/topics/${cluster.slug}">${escapeHtml(cluster.title)}</a> — ${escapeHtml(cluster.description)}</li>`,
    )
    .join("");
  return `<div class="blog-page"><div class="blog-post-container"><article class="blog-article-modal"><h1 class="blog-post-title">Explore Enforcement Topics</h1><div class="blog-article-content"><p>Browse RegActions editorial clusters for FCA fines, AML, Consumer Duty, market abuse, and board reporting, then move into breach, year, sector, and firm data hubs.</p><h2>Editorial Topic Clusters</h2><ul>${clusterLinks}</ul><h2>Data Hubs</h2><ul><li><a href="/breaches">Breach categories</a></li><li><a href="/years">Fines by year</a></li><li><a href="/sectors">Fines by sector</a></li><li><a href="/firms">Top firms and individuals</a></li></ul></div></article></div></div>`;
}

/** Crawlable body for the /developers API docs page — mirrors Developers.tsx. */
function renderDevelopersBody(): string {
  const termsHtml = `<h2>Access and terms</h2><ul><li><strong>Keyless.</strong> No registration, token or API key is required.</li><li><strong>CORS-open.</strong> Every endpoint returns Access-Control-Allow-Origin: *, so browser clients can call it directly.</li><li><strong>Update cadence.</strong> Responses are computed deterministically at request time and edge-cached for about five minutes. Underlying data changes when its source does: FATF lists per plenary (three times a year), sanctions on review, World Bank WGI annually, and enforcement records as new official notices are published.</li><li><strong>Licence and attribution.</strong> Data is provided under <a href="${escapeHtml(
    DEVELOPERS_LICENCE_URL,
  )}" rel="noopener">${escapeHtml(
    DEVELOPERS_LICENCE_NAME,
  )}</a>. Non-commercial reuse is permitted with a visible, clickable credit link back to RegActions.</li></ul>`;
  const attributionHtml = `<h2>Required attribution</h2><p>Show this visible link wherever you display the data:</p><p><a href="https://regactions.com">${escapeHtml(
    DEVELOPERS_ATTRIBUTION_TEXT,
  )}</a></p><p>Copy-paste HTML:</p><pre><code>${escapeHtml(
    DEVELOPERS_ATTRIBUTION_HTML,
  )}</code></pre>`;
  const endpointsHtml = DEVELOPER_ENDPOINTS.map((endpoint) => {
    const rows = endpoint.fields
      .map(
        (f) =>
          `<tr><td><code>${escapeHtml(f.name)}</code></td><td>${escapeHtml(
            f.type,
          )}</td><td>${escapeHtml(f.description)}</td></tr>`,
      )
      .join("");
    return `<section><h2><code>${escapeHtml(endpoint.method)} ${escapeHtml(
      endpoint.path,
    )}</code></h2><p>${escapeHtml(
      endpoint.summary,
    )}</p><h3>Example</h3><pre><code>${escapeHtml(
      endpoint.example,
    )}</code></pre><h3>Response fields</h3><table><thead><tr><th>Field</th><th>Type</th><th>Description</th></tr></thead><tbody>${rows}</tbody></table></section>`;
  }).join("");
  const intro = `<p>RegActions exposes read-only endpoints for country AML risk ratings and global enforcement data, plus an embeddable SVG risk badge. They are free to use, need no API key, and are CORS-open, so you can call them directly from the browser or a server.</p>`;
  const badgeHtml = `<section><h2>Embed a country risk badge</h2><p>The badge endpoint returns a small SVG you can drop into any page with a plain &lt;img&gt; tag. It shows the jurisdiction's AML risk band and 0-10 score, coloured by band, and reads its number from the same scoring path as the country report. Withheld jurisdictions render an honest "Not rated" badge, and unknown codes return a 404 badge. Swap GB for any ISO 3166-1 alpha-2 code; the .svg suffix is optional.</p><h3>Live preview</h3><p><a href="https://regactions.com/countries" title="AML country risk rating by RegActions"><img src="/api/badge/GB.svg" alt="United Kingdom AML risk rating by RegActions" height="20" /></a> <a href="https://regactions.com/countries" title="AML country risk rating by RegActions"><img src="/api/badge/IR.svg" alt="Iran AML risk rating by RegActions" height="20" /></a></p><h3>Copy-paste embed</h3><p>Keep the surrounding link: it is the visible, clickable credit the licence requires.</p><pre><code>${escapeHtml(
    BADGE_EMBED_HTML,
  )}</code></pre></section>`;
  const feedsHtml = `<h2>Feeds</h2><ul><li><a href="/rss.xml" rel="noopener">Regulatory insights RSS</a> — new analysis and enforcement articles.</li><li><a href="/changes.xml" rel="noopener">Country-risk changes RSS</a> — dated FATF, sanctions, EU tax list and score changes. See the <a href="/countries/changes">changes page</a>.</li></ul>`;
  const outro = `${feedsHtml}<h2>Questions</h2><p>For volume, commercial licensing, or a data question, contact <a href="mailto:contact@memaconsultants.com">contact@memaconsultants.com</a>. See also the <a href="/countries">country risk hub</a> and the <a href="/regulators">regulator data hub</a>.</p>`;
  return `<div class="blog-page"><div class="blog-post-container"><article class="blog-article-modal"><h1 class="blog-post-title">Free RegActions data APIs</h1><div class="blog-article-content">${intro}${termsHtml}${attributionHtml}${endpointsHtml}${badgeHtml}${outro}</div></article></div></div>`;
}

/**
 * Crawlable "Not Found" body for the prerendered 404 shell. Mirrors the React
 * <NotFound> page. Emitted with a noindex robots meta (see main()) so Google
 * treats unknown URLs as soft-404s at minimum, and — where Vercel routing lets a
 * request fall through to dist/404.html — as a true HTTP 404.
 */
function renderNotFoundBody(): string {
  const countryHtml = footerCountryLinks()
    .slice(0, 8)
    .map((c) => `<li><a href="/countries/${c.slug}">${escapeHtml(c.name)}</a></li>`)
    .join("");
  return `<div class="blog-page"><div class="blog-post-container"><article class="blog-article-modal"><h1 class="blog-post-title">Page not found</h1><div class="blog-article-content"><p>The page you requested does not exist, or the country or regulator code in the URL is invalid.</p><h2>Popular destinations</h2><ul><li><a href="/">RegActions home</a></li><li><a href="/countries">Country risk reports</a></li><li><a href="/regulators">Regulator data hub</a></li><li><a href="/topics">Enforcement topics</a></li></ul><h2>Popular country risk reports</h2><ul>${countryHtml}</ul></div></article></div></div>`;
}

function renderHomepageBody(): string {
  const latestArticles = [...blogArticles]
    .sort((a, b) => b.dateISO.localeCompare(a.dateISO))
    .slice(0, 5);
  const articleLinks = latestArticles
    .map(
      (article) =>
        `<li><a href="/blog/${article.slug}">${escapeHtml(article.title)}</a></li>`,
    )
    .join("");

  return `<div class="blog-page"><div class="blog-post-container"><article class="blog-article-modal"><h1 class="blog-post-title">Global Regulatory Fines & Enforcement Intelligence</h1><div class="blog-article-content"><p>RegActions tracks enforcement actions, penalties, breach categories, firms, and regulator activity across 45+ global financial regulators.</p><h2>What RegActions Covers</h2><ul><li><strong>Regulators:</strong> 45+ global financial regulators across the UK, Europe, North America, APAC, the Middle East, Africa, and offshore markets.</li><li><strong>Dataset:</strong> searchable enforcement actions, monetary penalties, breach themes, dates, sectors, and source links.</li><li><strong>Use cases:</strong> compliance monitoring, board packs, regulator benchmarking, control reviews, and trend analysis.</li></ul><h2>Start With The Data</h2><p><a href="/regulators">Open the regulator data hub</a>, <a href="/search">search enforcement actions</a>, <a href="/board-pack">create a board pack</a>, or use the <a href="/developers">free data API</a>.</p><h2>Latest Insights</h2><ul>${articleLinks}</ul><h2>Frequently Asked Questions</h2><p>RegActions combines official-source enforcement monitoring with practical analysis so compliance teams can understand what changed, why it matters, and what action to take next.</p></div></article></div></div>`;
}

function renderBlogListingBody(): string {
  const sortedArticles = [...blogArticles].sort((a, b) =>
    b.dateISO.localeCompare(a.dateISO),
  );
  const lead = sortedArticles[0];
  const articlesHtml = sortedArticles
    .slice(0, 16)
    .map(
      (article) =>
        `<article><h2><a href="/blog/${article.slug}">${escapeHtml(article.title)}</a></h2><p>${escapeHtml(article.excerpt)}</p><p><time datetime="${article.dateISO}">${escapeHtml(article.date)}</time> · ${escapeHtml(article.category)} · ${escapeHtml(article.readTime)}</p></article>`,
    )
    .join("");
  const categoryLinks = [
    ["FCA fines 2026", "/topics/fca-fines-2026"],
    ["AML enforcement", "/topics/aml-enforcement"],
    ["Consumer Duty", "/topics/consumer-duty-enforcement"],
    ["Market abuse", "/topics/market-abuse-enforcement"],
    ["Board reporting", "/board-pack"],
    ["MEMA compliance support", "https://memaconsultants.com"],
  ]
    .map(([label, href]) => `<li><a href="${href}">${label}</a></li>`)
    .join("");

  return `<div class="blog-page insights-page"><div class="blog-post-container"><article class="blog-article-modal"><h1 class="blog-post-title">Regulatory Insights</h1><div class="blog-article-content"><p>Expert analysis of significant regulatory penalties, enforcement trends, and compliance intelligence across global financial regulators.</p><h2>Latest Regulatory Enforcement Insight</h2><p><a href="/blog/${lead.slug}">${escapeHtml(lead.title)}</a> — ${escapeHtml(lead.excerpt)}</p><h2>Browse Recent Analysis</h2>${articlesHtml}<h2>Explore Enforcement Themes</h2><p>Use these crawlable topic pathways to move from insight into regulator hubs, board workflows, and advisory support.</p><ul>${categoryLinks}</ul><h2>Use The Intelligence</h2><p>Move from analysis to evidence: <a href="/regulators">open regulator hubs</a>, <a href="/search">search enforcement records</a>, or <a href="/board-pack">build a board pack</a>.</p></div></article></div></div>`;
}

// HowTo schema for database guide
const HOWTO_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: "How to Search the Global Regulatory Fines Database",
  description:
    "Step-by-step guide to searching and filtering enforcement actions from 45+ global financial regulators using RegActions.",
  step: [
    {
      "@type": "HowToStep",
      position: 1,
      name: "Navigate to Data Hub",
      text: "Open the RegActions regulator intelligence hub at regactions.com/regulators to access the complete database of regulatory fines and enforcement actions from global financial regulators.",
      url: `${BASE_URL}/regulators`,
    },
    {
      "@type": "HowToStep",
      position: 2,
      name: "Search by Firm",
      text: "Use the search bar to find fines by firm or individual name. Type a company name to filter results instantly across all regulators.",
    },
    {
      "@type": "HowToStep",
      position: 3,
      name: "Filter by Year",
      text: "Select a specific year from the year dropdown to view all regulatory fines issued in that period, from 2013 to the current year.",
    },
    {
      "@type": "HowToStep",
      position: 4,
      name: "Filter by Breach Category",
      text: "Choose a breach category such as AML, Market Abuse, or Consumer Protection to see fines grouped by the type of regulatory failure.",
    },
    {
      "@type": "HowToStep",
      position: 5,
      name: "Filter by Amount",
      text: "Use the advanced filters to set a minimum and maximum fine amount, helping you identify the largest or smallest penalties.",
    },
    {
      "@type": "HowToStep",
      position: 6,
      name: "Export Data",
      text: "Click the export button to download the filtered results as a CSV file for further analysis in Excel or other tools.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Per-page @graph generation (BreadcrumbList, Dataset, WebPage, SearchAction)
// ---------------------------------------------------------------------------

function generateBreadcrumbItems(
  path: string,
): Array<{ name: string; item: string }> {
  const crumbs = [{ name: "Home", item: `${BASE_URL}/` }];
  if (path === "/") return crumbs;

  const segments = path.split("/").filter(Boolean);
  let current = "";
  for (const seg of segments) {
    current += `/${seg}`;
    let name = seg;
    if (seg === "dashboard") name = "Data";
    else if (seg === "board-pack") name = "Board Pack";
    else if (seg === "blog") name = "Insights";
    else if (seg === "topics") name = "Topics";
    else if (seg === "breaches") name = "Breach Categories";
    else if (seg === "years") name = "Years";
    else if (seg === "sectors") name = "Sectors";
    else if (seg === "firms") name = "Firms";
    else if (seg === "faq") name = "FAQ";
    else if (seg === "guide") name = "Guide";
    else if (seg === "sitemap") name = "Sitemap";
    else name = humanize(seg);
    crumbs.push({ name, item: `${BASE_URL}${current}` });
  }
  return crumbs;
}

// Pages that describe or provide access to the dataset get Dataset schema
const DATASET_PAGES = new Set([
  "/",
  "/regulators",
  "/search",
  "/topics",
  "/breaches",
  "/years",
  "/sectors",
  "/firms",
]);

function generatePageGraph(meta: PageMeta): object {
  const crumbs = generateBreadcrumbItems(meta.path);

  // Override last crumb name with breadcrumbLabel if provided (uses actual title instead of slug)
  if (meta.breadcrumbLabel && crumbs.length > 1) {
    crumbs[crumbs.length - 1].name = meta.breadcrumbLabel;
  }

  const pageUrl = meta.path === "/" ? BASE_URL : `${BASE_URL}${meta.path}`;
  const today = todayISO();

  const graph: object[] = [
    {
      "@type": "Organization",
      "@id": `${BASE_URL}/#organization`,
      name: "RegActions",
      url: BASE_URL,
      logo: { "@type": "ImageObject", url: `${BASE_URL}/regactions-mark.png` },
      description:
        "Global regulatory enforcement intelligence from 45+ financial regulators worldwide",
      // Only profiles that actually exist: RegActions is built by MEMA Consultants
      // (linked site-wide) and its code org is on GitHub. No LinkedIn/X profile exists.
      sameAs: ["https://memaconsultants.com", "https://github.com/MEMAtest"],
    },
    {
      "@type": "WebSite",
      "@id": `${BASE_URL}/#website`,
      url: `${BASE_URL}/`,
      name: SITE_NAME,
      description:
        "Regulatory fines and enforcement intelligence from 45+ global financial regulators including FCA, BaFin, AMF, SEC, and more",
      publisher: { "@id": `${BASE_URL}/#organization` },
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${BASE_URL}/search?q={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
      inLanguage: "en-GB",
    },
    {
      "@type": "WebPage",
      "@id": `${pageUrl}/#webpage`,
      url: pageUrl,
      name: meta.title,
      isPartOf: { "@id": `${BASE_URL}/#website` },
      about: { "@id": `${BASE_URL}/#organization` },
      description: meta.description,
      breadcrumb: { "@id": `${pageUrl}/#breadcrumb` },
      inLanguage: "en-GB",
      dateModified: meta.dateModified || today,
      potentialAction: [{ "@type": "ReadAction", target: [pageUrl] }],
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${pageUrl}/#breadcrumb`,
      itemListElement: crumbs.map((c, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: c.name,
        item: c.item,
      })),
    },
  ];

  // Only include Dataset schema on pages that describe or provide access to the data
  if (DATASET_PAGES.has(meta.path)) {
    graph.push({
      "@type": "Dataset",
      name: "RegActions Regulatory Fines Database",
      description:
        "Comprehensive database of regulatory fines and enforcement actions from 45+ global financial regulators. Includes penalty amounts, breach categories, and firm details.",
      url: `${BASE_URL}/regulators`,
      keywords: [
        "regulatory fines",
        "BaFin fines",
        "SEC fines",
        "AMF fines",
        "FCA fines",
        "global financial regulators",
        "financial enforcement",
        "cross-border enforcement",
        "regulatory compliance",
      ],
      creator: { "@id": `${BASE_URL}/#organization` },
      temporalCoverage: "2013/..",
      spatialCoverage: [
        { "@type": "Place", name: "Europe" },
        { "@type": "Place", name: "North America" },
        { "@type": "Place", name: "Asia Pacific" },
        { "@type": "Place", name: "Middle East" },
        { "@type": "Place", name: "Caribbean" },
        { "@type": "Place", name: "Africa" },
      ],
      license: "https://creativecommons.org/licenses/by-nc/4.0/",
      isAccessibleForFree: true,
      dateModified: today,
      variableMeasured: [
        { "@type": "PropertyValue", name: "Fine Amount", unitText: "GBP" },
        { "@type": "PropertyValue", name: "Date Issued" },
        { "@type": "PropertyValue", name: "Breach Category" },
        { "@type": "PropertyValue", name: "Firm Name" },
        { "@type": "PropertyValue", name: "Sector" },
        { "@type": "PropertyValue", name: "Final Notice Reference" },
      ],
    });
  }

  return { "@context": "https://schema.org", "@graph": graph };
}

// ---------------------------------------------------------------------------
// Build page metadata
// ---------------------------------------------------------------------------

async function buildPageMetas(): Promise<PageMeta[]> {
  const pages: PageMeta[] = [];

  // 1. Homepage (with FAQPage schema for top questions)
  const homepageFaqs = getHomepageFaqs();
  pages.push({
    path: "/",
    title:
      "RegActions | Global Regulatory Fines & Enforcement Intelligence",
    description:
      "Track fines from 45+ global financial regulators including BaFin, SEC, FCA, AMF, and more. Analyze £5B+ in enforcement actions from 2013-2026 with interactive charts, breach categories, and compliance insights.",
    keywords:
      "regulatory fines, financial regulator fines, enforcement actions, BaFin fines, SEC fines, FCA fines, AMF fines, CNMV fines, global fines database, multi-regulator tracker, financial compliance",
    ogType: "website",
    bodyContent: renderHomepageBody(),
    extraJsonLd:
      homepageFaqs.length > 0 ? [generateFaqSchema(homepageFaqs)] : [],
  });

  // 2. Regulator data hub (with DataFeed schema)
  pages.push({
    path: "/regulators",
    title: "RegActions Data Hub | Global Regulatory Fines Analytics",
    description:
      "Interactive multi-regulator data hub. Search enforcement actions from 45+ global financial regulators by firm, year, amount, breach category, and regulator.",
    keywords:
      "regulatory fines data hub, global enforcement tracker, multi-regulator search, BaFin fines, SEC fines, FCA fines, regulatory analytics",
    ogType: "website",
    bodyContent: renderStaticPageBody(
      "RegActions Data Hub",
      "Browse live and pipeline regulator coverage, open dedicated regulator hubs, and move from high-level enforcement intelligence into searchable records.",
      [
        {
          heading: "What You Can Search",
          body: "RegActions brings together enforcement actions, penalties, breach categories, dates, sectors, and firm names across global financial regulators.",
        },
        {
          heading: "How Compliance Teams Use It",
          body: "Use the hub to benchmark enforcement intensity, identify recurring control failures, prepare board challenge points, and find official source material.",
        },
        {
          heading: "Next Actions",
          body: "Open a regulator hub, search the enforcement database, subscribe to the digest, or create a board pack from the evidence.",
        },
      ],
    ),
    extraJsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "DataFeed",
        name: "RegActions Live Enforcement Feed",
        description:
          "Real-time feed of regulatory fines and enforcement actions from 45+ global financial regulators, updated as new penalties are published.",
        url: `${BASE_URL}/regulators`,
        dateModified: todayISO(),
        potentialAction: [
          {
            "@type": "SearchAction",
            name: "Search Global Regulatory Fines",
            target: {
              "@type": "EntryPoint",
              urlTemplate: `${BASE_URL}/search?q={query}`,
            },
            "query-input": "required name=query",
          },
          {
            "@type": "FilterAction",
            name: "Filter by Year",
            target: {
              "@type": "EntryPoint",
              urlTemplate: `${BASE_URL}/search?year={year}`,
            },
          },
          {
            "@type": "DownloadAction",
            name: "Export Regulatory Fines CSV",
            target: {
              "@type": "EntryPoint",
              urlTemplate: `${BASE_URL}/search`,
            },
          },
        ],
      },
    ],
  });

  pages.push({
    path: "/board-pack",
    title: "Board Pack | Board and Risk Committee Enforcement Advisory",
    description:
      "Generate a RegActions board pack with exposure scoring, peer-case evidence, board challenge points, and appendix-ready controls detail.",
    keywords:
      "board pack, board advisory pack, enforcement exposure, board intelligence, compliance committee pack, peer enforcement analysis",
    ogType: "website",
    bodyContent: renderStaticPageBody(
      "Board Pack",
      "Create committee-ready enforcement intelligence from regulator evidence, peer cases, and control questions.",
      [
        {
          heading: "Board-Level Enforcement Context",
          body: "The board pack workflow converts regulator actions into exposure themes, peer examples, board challenge questions, and appendix-ready control prompts.",
        },
        {
          heading: "Advisory Escalation",
          body: "Where the evidence points to a live governance or remediation issue, users can escalate the pack into a tailored MEMA Consultants advisory conversation.",
        },
      ],
    ),
  });

  for (const workspace of [
    { path: "/fines", title: "Fines Command Centre", description: "Explore regulatory fines, recent actions, enforcement trends and source-linked evidence across the RegActions public dataset." },
    { path: "/fines/actions", title: "Enforcement Actions", description: "Review public enforcement actions by firm, regulator, theme, sector and date with links to official evidence." },
    { path: "/fines/analytics", title: "Fines Analytics", description: "Analyse regulatory fines over time, compare breach themes and inspect the actions behind each chart mark." },
    { path: "/fines/compare", title: "Regulatory Fines Comparison", description: "Compare up to three years and five regulators or enforcement themes in a guided public workspace." },
  ]) {
    pages.push({
      path: workspace.path,
      title: `${workspace.title} | RegActions`,
      description: workspace.description,
      keywords: "regulatory fines, enforcement actions, fines analytics, regulator comparison, official enforcement evidence",
      ogType: "website",
      bodyContent: renderStaticPageBody(
        workspace.title,
        workspace.description,
        [
          { heading: "Evidence-first analysis", body: "Open the actions behind every chart, table and comparison, then follow the available links to official regulator evidence." },
          { heading: "Public working views", body: "Filters and guided comparisons are available without an account. Saved views remain on the user's device." },
        ],
      ),
    });
  }

  pages.push({
    path: "/privacy",
    title: "Privacy Notice | RegActions",
    description: "How RegActions and MEMA Consultants use personal information, including Board Pack download details.",
    keywords: "RegActions privacy, Board Pack privacy, MEMA Consultants",
    ogType: "website",
    bodyContent: renderStaticPageBody(
      "Privacy Notice",
      "How RegActions and MEMA Consultants use and protect personal information.",
      [{ heading: "Board Pack downloads", body: "Board Pack request details are used to provide the requested service, protect it from abuse and record consent choices." }],
    ),
  });

  // Developer API docs — free/keyless/CORS-open endpoints, fields, attribution.
  pages.push({
    path: "/developers",
    title: "Developer API | Free Country-Risk & Enforcement Data | RegActions",
    description:
      "Free, keyless, CORS-open RegActions APIs: country AML risk ratings, per-country risk detail, and global enforcement search. Fields, curl examples, cadence and attribution terms.",
    keywords:
      "RegActions API, country risk API, AML risk API, enforcement data API, free financial regulator API, CORS open API",
    ogType: "website",
    breadcrumbLabel: "Developers",
    bodyContent: renderDevelopersBody(),
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      headline: "Free RegActions data APIs",
      description:
        "Documentation for the free, keyless, CORS-open RegActions country-risk and enforcement search APIs, including response fields, curl examples, update cadence and attribution terms.",
      url: `${BASE_URL}/developers`,
      author: { "@id": `${BASE_URL}/#organization` },
      publisher: { "@id": `${BASE_URL}/#organization` },
      license: DEVELOPERS_LICENCE_URL,
    },
    extraJsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "WebAPI",
        name: "RegActions Country Risk & Enforcement API",
        description:
          "Free, keyless, CORS-open JSON API for country AML risk ratings and global regulatory enforcement search.",
        documentation: `${BASE_URL}/developers`,
        termsOfService: DEVELOPERS_LICENCE_URL,
        provider: { "@id": `${BASE_URL}/#organization` },
        isAccessibleForFree: true,
        endpointDescription: DEVELOPER_ENDPOINTS.map((e) => ({
          "@type": "EntryPoint",
          urlTemplate: `${BASE_URL}${e.path}`,
          httpMethod: e.method,
          description: e.summary,
        })),
      },
    ],
  });

  pages.push({
    path: "/search",
    title: "Enforcement Search | Search Enforcement Actions by Firm, Regulator, and Theme",
    description:
      "Search enforcement actions by firm, regulator, jurisdiction, and theme across the live regulatory coverage set.",
    keywords:
      "enforcement search, regulator fines search, enforcement actions search, compliance enforcement database",
    ogType: "website",
    bodyContent: renderStaticPageBody(
      "Enforcement Search",
      "Search regulatory enforcement actions by firm, individual, regulator, jurisdiction, breach type, theme, amount, and date.",
      [
        {
          heading: "Search By Firm Or Theme",
          body: "Use search to move from a specific firm, case, or issue into the underlying enforcement record and the connected regulator context.",
        },
        {
          heading: "Turn Search Into Monitoring",
          body: "High-intent searches can become digest subscriptions, firm watchlist entries, or board-pack evidence sets.",
        },
      ],
    ),
  });

  pages.push({
    path: "/features",
    title: "RegActions Features | Search, Alerts, Exports and Board Packs",
    description:
      "Explore RegActions features for enforcement search, regulator monitoring, smart alerts, data export, and board-pack intelligence.",
    keywords:
      "RegActions features, enforcement alerts, regulatory fines export, board pack intelligence, compliance monitoring tools",
    ogType: "website",
    bodyContent: renderStaticPageBody(
      "RegActions Features",
      "RegActions combines searchable enforcement data, regulator coverage, smart alerts, exports, and board-pack workflows for compliance users.",
      [
        {
          heading: "Search And Monitor",
          body: "Search across global regulator records and use alerts or digest subscriptions to keep watch on new enforcement signals.",
        },
        {
          heading: "Report And Escalate",
          body: "Export data, create board packs, and use enforcement evidence to support governance and remediation conversations.",
        },
      ],
    ),
  });

  pages.push({
    path: "/roadmap",
    title: "RegActions Roadmap | Regulator Coverage and Product Direction",
    description:
      "See the RegActions roadmap for regulator coverage expansion, alert precision, board-pack persistence, exports, API surfaces, and embedded intelligence.",
    keywords:
      "RegActions roadmap, regulator coverage roadmap, enforcement intelligence roadmap, compliance data product roadmap",
    ogType: "website",
    bodyContent: renderStaticPageBody(
      "RegActions Roadmap",
      "The roadmap shows how RegActions is expanding regulator coverage and product workflows for enforcement monitoring, exports, and advisory use cases.",
      [
        {
          heading: "Coverage Expansion",
          body: "The coverage roadmap separates live regulators from validated pipeline sources so users can understand current depth and planned expansion.",
        },
        {
          heading: "Product Direction",
          body: "Near-term work prioritises alert precision, board-pack persistence, branded export quality, and reusable API or embedded surfaces.",
        },
      ],
    ),
  });

  pages.push({
    path: "/intelligence",
    title: "RegActions Intelligence | Enforcement Briefing Workbench",
    description:
      "Build enforcement briefings and compliance intelligence from regulator actions, precedent cases, watchlist themes, and board-level risk questions.",
    keywords:
      "enforcement intelligence, regulatory briefing, compliance intelligence workbench, regulator precedent analysis",
    ogType: "website",
    bodyContent: renderStaticPageBody(
      "RegActions Intelligence",
      "Use RegActions intelligence workflows to turn enforcement data into briefings, precedent analysis, and practical compliance questions.",
      [
        {
          heading: "Briefings From Evidence",
          body: "The intelligence workspace supports regulator, theme, and firm-led analysis grounded in the enforcement data layer.",
        },
        {
          heading: "Compliance Use Cases",
          body: "Use it to prepare internal briefings, identify relevant precedents, and frame board or committee questions from official enforcement evidence.",
        },
      ],
    ),
  });

  pages.push({
    path: "/uk-enforcement",
    title: "UK Enforcement | Financial and Adjacent Regulatory Penalties",
    description:
      "Search UK financial, sanctions, data, competition, audit, and pensions enforcement actions from official regulator sources.",
    keywords:
      "UK enforcement, PRA fines, PSR fines, OFSI penalties, ICO monetary penalties, CMA fines, FRC sanctions, pensions regulator penalties",
    ogType: "website",
    bodyContent: renderStaticPageBody(
      "UK Enforcement",
      "Search UK financial and adjacent regulator enforcement across FCA, PRA, PSR, OFSI, ICO, CMA, FRC, and pensions sources.",
      [
        {
          heading: "Focused UK View",
          body: "The UK workspace keeps financial, sanctions, competition, data protection, audit, and pensions enforcement in one focused search surface.",
        },
        {
          heading: "Official-Source Monitoring",
          body: "Records link back to source notices where available and can be filtered by regulator, domain, year, and firm or issue.",
        },
      ],
    ),
  });

  pages.push({
    path: "/about",
    title: "About RegActions | Regulatory Enforcement Intelligence",
    description:
      "RegActions is a regulatory enforcement intelligence platform built by MEMA Consultants to help compliance teams monitor fines, enforcement themes, and board-level regulatory risk.",
    keywords:
      "RegActions, MEMA Consultants, regulatory enforcement intelligence, FCA fines database, compliance monitoring",
    ogType: "website",
    bodyContent: renderStaticPageBody(
      "About RegActions",
      "RegActions is a regulatory enforcement intelligence platform built by MEMA Consultants for compliance, risk, governance, and advisory users.",
      [
        {
          heading: "Built For Compliance Work",
          body: "The platform helps users search official enforcement evidence, monitor recurring themes, compare regulator activity, and prepare board-ready analysis.",
        },
        {
          heading: "MEMA Consultants",
          body: "MEMA Consultants builds and uses RegActions as an advisory evidence layer for interpreting enforcement signals and prioritising remediation.",
        },
      ],
    ),
  });

  // 3. Topics (hub landing)
  pages.push({
    path: "/topics",
    title: "RegActions Topics | Breaches, Years, Sectors & Firm Pages",
    description:
      "Browse enforcement topic clusters, breach types, years, sectors, and firm pages. Explore hub pages and jump into the interactive dashboard for deeper analysis.",
    keywords:
      "RegActions topics, enforcement topic clusters, regulatory fines by breach, regulatory fines by year, enforcement actions by firm, regulatory fines by sector",
    ogType: "website",
    bodyContent: renderTopicsLandingBody(),
  });

  topicClusters.forEach((cluster) => {
    pages.push({
      path: `/topics/${cluster.slug}`,
      title: cluster.seoTitle,
      description: cluster.description,
      keywords: cluster.keywords,
      ogType: "website",
      bodyContent: renderTopicClusterBody(cluster.slug),
      extraJsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: cluster.title,
          description: cluster.description,
          url: `${BASE_URL}/topics/${cluster.slug}`,
          mainEntity: {
            "@type": "ItemList",
            itemListElement: cluster.primaryArticles.map((article, index) => ({
              "@type": "ListItem",
              position: index + 1,
              url: `${BASE_URL}/blog/${article.slug}`,
              name: article.title,
            })),
          },
        },
      ],
    });
  });

  // 4. Hub list pages
  pages.push({
    path: "/breaches",
    title: "Enforcement Actions by Breach Type | Market Abuse, AML, Principles and More",
    description:
      "Browse regulatory enforcement actions by breach category. See which breach types drive the most penalties and jump into the dashboard with filters applied.",
    keywords:
      "regulatory fines by breach, market abuse enforcement, AML fines, regulatory principles fines, breach category fines",
    ogType: "website",
  });
  pages.push({
    path: "/years",
    title: "Enforcement Actions by Year | 2013-2026 Annual Summaries",
    description:
      "Browse regulatory enforcement actions by year. Compare enforcement totals and jump into the dashboard for each year’s full list of actions.",
    keywords:
      "regulatory fines by year, enforcement actions 2026, enforcement actions 2025, financial enforcement by year",
    ogType: "website",
  });
  pages.push({
    path: "/sectors",
    title: "Regulatory Fines by Sector | Banks, Insurance, Individuals and More",
    description:
      "Browse regulatory fines by firm category (sector). View which sectors receive the most penalties and jump into filtered dashboard views.",
    keywords:
      "regulatory fines by sector, bank enforcement penalties, insurance enforcement penalties, individual enforcement penalties",
    ogType: "website",
  });
  pages.push({
    path: "/firms",
    title:
      "Top Penalty Recipients | Firms and Individuals With the Largest Penalties (2013-2026)",
    description:
      "Browse the biggest regulatory penalty recipients across 2013-2026. Open an entity page to see totals, largest penalties, and full enforcement history.",
    keywords:
      "top regulatory fines firms, biggest enforcement penalty recipients, fines by firm, fines by individual, largest regulatory penalties",
    ogType: "website",
  });

  // 4b. Regulator Hub Pages
  //
  // Best-effort: fetch each regulator's top-20 enforcement actions at build time
  // so the served hub HTML carries a static, crawlable fines table (item 12 —
  // the live list is client-only, leaving the hub at ~660 chars otherwise).
  // On a DB-less build (no DATABASE_URL etc.) this whole block is skipped and the
  // map stays empty, so hubs fall back to the existing coverage-snapshot body.
  const regulatorTopFines = new Map<string, RegulatorTopFine[]>();
  try {
    const { getRegulatorTopFines } = await import("../server/services/hubs.js");
    const results = await Promise.all(
      PUBLIC_REGULATOR_CODES.map(async (code) => {
        try {
          return [code, await getRegulatorTopFines(code, 20)] as const;
        } catch {
          return [code, [] as RegulatorTopFine[]] as const;
        }
      }),
    );
    for (const [code, fines] of results) regulatorTopFines.set(code, fines);
    const withData = results.filter(([, f]) => f.length > 0).length;
    console.log(
      `  Regulator hubs: fetched top fines for ${withData}/${PUBLIC_REGULATOR_CODES.length} regulators.`,
    );
  } catch (error) {
    console.warn(
      "WARN: DB unreachable for regulator hub fines tables; hubs fall back to coverage-snapshot bodies:",
      error instanceof Error ? error.message : String(error),
    );
  }

  PUBLIC_REGULATOR_CODES.forEach((code) => {
    const coverage = REGULATOR_COVERAGE[code];
    const path = `/regulators/${code.toLowerCase()}`;
    const title = `${code} Fines Database | ${coverage.fullName} Enforcement Actions`;
    const description = `Track all ${coverage.fullName} (${code}) fines and enforcement actions. ${coverage.count} penalties from ${coverage.years}. Complete database with stats, trends, and analysis.`;
    const keywords = `${code} fines, ${coverage.fullName}, regulatory enforcement, financial penalties, ${coverage.country}, compliance data, ${code} enforcement`;

    pages.push({
      path,
      title,
      description,
      keywords,
      ogType: "website",
      // Breadcrumb: use the regulator code ("FCA"), not humanize("fca") -> "Fca".
      breadcrumbLabel: code,
      ogImage: `${BASE_URL}/og/${code.toLowerCase()}-hub.png`,
      bodyContent: renderRegulatorHubBody(
        title,
        description,
        [
          { label: "Regulator", value: coverage.fullName },
          { label: "Jurisdiction", value: coverage.country },
          { label: "Tracked period", value: coverage.years },
          { label: "Tracked actions", value: String(coverage.count) },
          { label: "Default currency", value: coverage.defaultCurrency },
        ],
        path,
        code,
        regulatorTopFines.get(code) ?? [],
        // fca_fines.amount is normalised to GBP house-wide (the interactive view
        // says "Normalised to GBP for comparison") — never label it with the
        // regulator's native currency.
        "GBP",
      ),
      extraJsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "Dataset",
          name: `${code} Fines Database`,
          description: `${coverage.fullName} enforcement actions and financial penalties from ${coverage.years}`,
          url: `${BASE_URL}${path}`,
          keywords: [
            `${code} fines`,
            coverage.fullName,
            "regulatory enforcement",
            "financial penalties",
            coverage.country,
            "compliance database",
          ],
          temporalCoverage: coverage.years,
          spatialCoverage: {
            "@type": "Place",
            name: coverage.country,
          },
          creator: {
            "@type": "Organization",
            name: SITE_NAME,
            url: "https://regactions.com",
          },
          variableMeasured: [
            {
              "@type": "PropertyValue",
              name: "Fine Amount",
              unitText: "GBP", // table amounts are GBP-normalised; native currency varies
            },
            { "@type": "PropertyValue", name: "Enforcement Date" },
            { "@type": "PropertyValue", name: "Breach Category" },
            { "@type": "PropertyValue", name: "Firm/Individual Name" },
          ],
        },
      ],
    });
  });

  // 4c. Country Risk Reports — global index + per-country pages.
  const fatfYear = FATF_LAST_PLENARY.slice(0, 4);
  const globalIndexCount = pageCountries().length;
  const globalIndexRated = buildCountryIndex().filter((entry) => entry.score !== null).length;
  const globalIndexComplete = buildCountryIndex().filter((entry) => entry.status === "complete").length;
  const globalIndexProvisional = buildCountryIndex().filter((entry) => entry.status === "provisional").length;
  const globalIndexInsufficient = buildCountryIndex().filter((entry) => entry.status === "insufficient-data").length;
  pages.push({
    path: "/countries",
    title: `Global Country Risk Ratings ${fatfYear} | RegActions`,
    description: `Country-risk methodology v2 for ${globalIndexCount} jurisdictions: ${globalIndexComplete} complete, ${globalIndexProvisional} provisional and ${globalIndexInsufficient} insufficient-data results.`,
    keywords: `country risk ratings, country risk score, AML country risk, FATF status by country, sanctions by country, high-risk countries`,
    ogType: "website",
    dateModified: COUNTRY_PAGE_DATE,
    rssAlternates: [{ title: "RegActions country-risk changes", href: CHANGES_RSS_URL }],
    bodyContent: renderGlobalIndexBody(),
    breadcrumbLabel: "Countries",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `Global Country Risk Ratings ${fatfYear}`,
      description: `${globalIndexRated} methodology v2 scores across ${globalIndexCount} covered jurisdictions; ${globalIndexProvisional} are explicitly provisional and ${globalIndexInsufficient} are withheld rather than treated as zero risk.`,
      url: `${BASE_URL}/countries`,
      isPartOf: { "@type": "WebSite", name: SITE_NAME, url: "https://regactions.com" },
    },
    extraJsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "Dataset",
        name: "RegActions Country AML Risk Ratings",
        description: `Country-level AML/financial-crime risk ratings for ${globalIndexCount} jurisdictions, combining FATF assessment ratings, six World Bank WGI dimensions and classified geographic sanctions exposure. ${globalIndexComplete} are complete, ${globalIndexProvisional} provisional and ${globalIndexInsufficient} insufficient-data. Transparency International CPI is context only.`,
        url: `${BASE_URL}/countries`,
        keywords: [
          "country risk ratings",
          "AML country risk",
          "FATF grey list",
          "sanctions by country",
          "governance indicators",
          "corruption perceptions index",
        ],
        creator: { "@id": `${BASE_URL}/#organization` },
        variableMeasured: [
          { "@type": "PropertyValue", name: "FATF status" },
          { "@type": "PropertyValue", name: "World Bank WGI governance base" },
          { "@type": "PropertyValue", name: "Sanctions exposure" },
          { "@type": "PropertyValue", name: "Corruption Perceptions Index" },
          { "@type": "PropertyValue", name: "Composite risk band" },
        ],
        temporalCoverage: `2013/${COUNTRY_PAGE_DATE}`,
        spatialCoverage: { "@type": "Place", name: "Global" },
        license: "https://creativecommons.org/licenses/by-nc/4.0/",
        isAccessibleForFree: true,
        dateModified: COUNTRY_PAGE_DATE,
        distribution: [
          {
            "@type": "DataDownload",
            encodingFormat: "application/json",
            contentUrl: `${BASE_URL}/api/country-risk/list`,
          },
        ],
      },
    ],
  });
  pages.push({
    path: "/countries/fatf-grey-list",
    title: `FATF Grey List ${fatfYear} | Countries Under Increased Monitoring`,
    description: `The FATF grey list ${fatfYear}: all jurisdictions under increased monitoring, plus the black list, current as of the ${FATF_LAST_PLENARY} plenary with recent additions and removals.`,
    keywords: `FATF grey list ${fatfYear}, FATF grey list countries, increased monitoring, FATF black list, AML high-risk countries`,
    ogType: "website",
    bodyContent: renderCountriesIndexBody(),
    breadcrumbLabel: "FATF Grey List",
    rssAlternates: [{ title: "RegActions country-risk changes", href: CHANGES_RSS_URL }],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `FATF Grey List & Black List ${fatfYear}`,
      description: `FATF jurisdictions under increased monitoring (grey list) and subject to a call for action (black list), current as of the ${FATF_LAST_PLENARY} plenary.`,
      url: `${BASE_URL}/countries/fatf-grey-list`,
      isPartOf: { "@type": "WebSite", name: SITE_NAME, url: "https://regactions.com" },
    },
  });
  const countryChangeEvents = buildCountryChanges();
  const changesLastmod = clampISODate(
    countryChangeEvents[0]?.date ?? COUNTRY_PAGE_DATE,
    todayISO(),
  );
  pages.push({
    path: "/countries/changes",
    title: "Country Risk Changes | What Changed in AML Country Risk",
    description:
      "A dated record of every change RegActions tracks in country risk: FATF plenary additions and removals, sanctions snapshot promotions, EU tax list updates and score moves. RSS available.",
    keywords:
      "country risk changes, FATF changes, sanctions updates, EU tax list changes, AML country risk updates, what changed",
    ogType: "website",
    dateModified: changesLastmod,
    bodyContent: renderChangesBody(countryChangeEvents),
    breadcrumbLabel: "Changes",
    rssAlternates: [{ title: "RegActions country-risk changes", href: CHANGES_RSS_URL }],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "What changed in country risk",
      description:
        "Dated country-risk changes derived from FATF plenaries, sanctions snapshots, the EU tax list and framework-data reviews.",
      url: `${BASE_URL}/countries/changes`,
      isPartOf: { "@type": "WebSite", name: SITE_NAME, url: "https://regactions.com" },
    },
  });
  pages.push({
    path: "/countries/methodology",
    title: "Country Risk Score Methodology | RegActions",
    description:
      "RegActions Country Risk Score v2 methodology, including pillar weights, regulatory floors, missing-data rules, provenance and confidence.",
    keywords:
      "country risk score methodology, AML country risk methodology, FATF sanctions WGI composite, how country risk is calculated",
    ogType: "article",
    bodyContent: renderMethodologyBody(),
    breadcrumbLabel: "Methodology",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "How the RegActions Country Risk Score is calculated",
      description:
        "Production methodology v2 for the deterministic RegActions Country Risk Score.",
      url: `${BASE_URL}/countries/methodology`,
      author: { "@type": "Organization", name: SITE_NAME, url: "https://regactions.com" },
      publisher: { "@type": "Organization", name: SITE_NAME },
    },
  });
  pages.push({
    path: "/countries/methodology/v2",
    title: "Trusted Country Risk Score v2 Methodology | RegActions",
    description: "The deterministic RegActions country-risk v2 methodology, evidence rules, source assurance, confidence and regulatory floors.",
    keywords: "country risk methodology v2, FATF assessment ratings, WGI governance, sanctions risk",
    ogType: "article",
    bodyContent: renderMethodologyV2Body(),
    breadcrumbLabel: "Methodology v2",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "Trusted Country Risk Score v2 methodology",
      description: "Deterministic and explainable country-risk methodology v2 in production.",
      url: `${BASE_URL}/countries/methodology/v2`,
      author: { "@type": "Organization", name: SITE_NAME, url: "https://regactions.com" },
      publisher: { "@type": "Organization", name: SITE_NAME },
    },
  });
  // Every country with a risk signal (governance / FATF / sanctions / enforcement)
  // gets a page — the near-complete world, not just the FATF-listed few.
  const countryPageIso2 = pageCountries().map((c) => c.iso2);
  for (const iso2 of countryPageIso2) {
    const country = getCountryByIso2(iso2);
    if (!country) continue;
    const view = buildCountryView(country);
    const { fatf: status, enforcement } = view;
    const slug = countrySlug(country);
    const path = `/countries/${slug}`;
    const listLabel = status ? fatfLabel(status.listing) : "";
    const sanctionsClassificationPublished = view.sanctionsCoverageComplete && Boolean(view.sanctions);
    const sanctionsLabel = view.sanctionsTier
      ? sanctionsTierLabel(view.sanctionsTier).toLowerCase()
      : "";
    const title = status
      ? `${country.name} FATF Status ${fatfYear} | Country Risk Report`
      : sanctionsClassificationPublished
        ? `${country.name} Sanctions & Country Risk | Is ${country.name} Sanctioned?`
        : `${country.name} Financial Enforcement & Regulators | Country Risk`;
    const description = status
      ? `Is ${country.name} on the FATF grey list? ${country.name} is on the FATF ${listLabel.toLowerCase()} as of the ${FATF_LAST_PLENARY} plenary. AML/CFT country risk profile with sanctions, enforcement activity and cited sources.`
      : sanctionsClassificationPublished
        ? `Is ${country.name} sanctioned? ${country.name} is subject to ${sanctionsLabel} sanctions programmes. Country risk profile: sanctions posture, FATF status, enforcement activity and cited sources.`
        : `${country.name} financial regulators, enforcement activity and AML/CFT risk.${
            enforcement
              ? ` RegActions tracks ${formatCount(enforcement.trackedActions)} actions from ${enforcement.regulatorCount} regulators.`
              : ""
          } Country risk profile with cited sources.`;
    const keywords = status
      ? `${country.name} FATF, ${country.name} grey list, ${country.name} AML risk, is ${country.name} high risk, ${country.name} country risk`
      : sanctionsClassificationPublished
        ? `${country.name} sanctions, is ${country.name} sanctioned, ${country.name} OFAC, ${country.name} embargo, ${country.name} country risk`
        : `${country.name} enforcement, ${country.name} financial regulators, ${country.name} fines, ${country.name} AML risk, ${country.name} country risk`;
    const datasetDesc =
      [
        status ? `FATF ${listLabel} status` : "FATF listing status",
        sanctionsClassificationPublished ? `${sanctionsLabel || "no direct"} sanctions programmes` : "sanctions evidence incomplete",
        enforcement
          ? `${formatCount(enforcement.trackedActions)} tracked enforcement actions`
          : "",
      ]
        .filter(Boolean)
        .join(", ") + ` for ${country.name}.`;
    pages.push({
      path,
      title,
      description,
      keywords,
      ogType: "website",
      dateModified: COUNTRY_PAGE_DATE,
      bodyContent: renderCountryFatfBody(view),
      breadcrumbLabel: country.name,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Country",
        name: country.name,
        url: `${BASE_URL}${path}`,
        identifier: country.iso2,
      },
      extraJsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "Dataset",
          name: `${country.name} country risk data`,
          description: datasetDesc,
          url: `${BASE_URL}${path}`,
          keywords: [`${country.name} FATF`, "AML country risk", `${country.name} enforcement`],
          dateModified: COUNTRY_PAGE_DATE,
          // Full coverage window: FATF listing history (2013+) through the latest signal.
          temporalCoverage: `2013/${COUNTRY_PAGE_DATE}`,
          spatialCoverage: { "@type": "Place", name: country.name },
          creator: { "@id": `${BASE_URL}/#organization` },
          license: "https://creativecommons.org/licenses/by-nc/4.0/",
          isAccessibleForFree: true,
          variableMeasured: [
            { "@type": "PropertyValue", name: "FATF listing status" },
            { "@type": "PropertyValue", name: "Sanctions exposure" },
            { "@type": "PropertyValue", name: "World Bank WGI governance base" },
            { "@type": "PropertyValue", name: "Corruption Perceptions Index" },
            { "@type": "PropertyValue", name: "Composite risk band" },
          ],
          distribution: [
            {
              "@type": "DataDownload",
              encodingFormat: "application/json",
              contentUrl: `${BASE_URL}/api/country-risk/${country.iso2}`,
            },
          ],
          isBasedOn: FATF_SOURCE_URL,
        },
        generateCountryFaqSchema(buildCountryFaqs(view)),
      ],
    });
  }

  // 4b. Curated country-vs-country compare pages. The React route handles ANY
  // valid pair client-side; only this curated high-intent set (~20 anchors x
  // top comparators, de-duplicated by canonical slug) is prerendered/sitemapped.
  for (const pair of curatedComparePairs()) {
    const compareView = buildCompareView(pair.a, pair.b);
    const path = compareView.canonicalPath;
    const keywords = `${pair.a.name} vs ${pair.b.name}, ${pair.a.name} ${pair.b.name} country risk, ${pair.a.name} vs ${pair.b.name} AML, compare country risk, ${pair.a.name} ${pair.b.name} FATF`;
    pages.push({
      path,
      title: compareView.title,
      description: compareView.metaDescription,
      keywords,
      ogType: "website",
      dateModified: COUNTRY_PAGE_DATE,
      bodyContent: renderCompareBody(compareView),
      breadcrumbLabel: `${pair.a.name} vs ${pair.b.name}`,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: compareView.title,
        description: compareView.metaDescription,
        url: `${BASE_URL}${path}`,
        dateModified: COUNTRY_PAGE_DATE,
        about: [
          { "@type": "Country", name: pair.a.name, identifier: pair.a.iso2 },
          { "@type": "Country", name: pair.b.name, identifier: pair.b.iso2 },
        ],
        isPartOf: { "@id": `${BASE_URL}/#website` },
      },
      extraJsonLd: [
        generateCountryFaqSchema([
          {
            question: `Is ${pair.a.name} higher risk than ${pair.b.name}?`,
            answer: compareView.verdict,
          },
        ]),
      ],
    });
  }

  // 5. Blog listing (with ItemList schema for carousel/list rich results)
  const allBlogItems = [
    ...blogArticles.filter((a) => a.featured),
    ...blogArticles.filter((a) => !a.featured),
    ...yearlyArticles,
  ];
  pages.push({
    path: "/blog",
    title:
      "RegActions Blog | Regulatory Enforcement Analysis & Insights",
    description:
      "Expert analysis of regulator fines, biggest penalties, enforcement trends, and compliance guidance across global financial regulators.",
    keywords:
      "RegActions blog, regulatory fines analysis, enforcement insights, biggest regulatory fines, AML fines, compliance guide",
    ogType: "website",
    bodyContent: renderBlogListingBody(),
    extraJsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "ItemList",
        itemListElement: allBlogItems.map((article, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: `${BASE_URL}/blog/${article.slug}`,
        })),
      },
    ],
  });

  // 5b. Sitemap page
  pages.push({
    path: "/sitemap",
    title: "Sitemap | RegActions",
    description:
      "Complete sitemap of RegActions. Browse all pages including the interactive dashboard, blog articles, annual reviews, and hub pages.",
    keywords: "RegActions sitemap, regulatory enforcement pages, regulatory fines navigation",
    ogType: "website",
  });

  // 5c. Pillar page: Complete Guide to FCA Enforcement
  pages.push({
    path: "/guide/fca-enforcement",
    title:
      "Complete Guide to FCA Enforcement & Fines | From Investigation to Penalty",
    description:
      "Comprehensive guide covering how the FCA enforces financial regulation, how fines are calculated, the biggest penalties of all time, enforcement by year, sector, and breach type.",
    keywords:
      "FCA enforcement guide, FCA fines guide, FCA fines explained, how FCA fines work, FCA enforcement process, FCA penalties guide",
    ogType: "article",
    datePublished: "2026-02-01",
    dateModified: todayISO(),
    articleSection: "Guide",
    breadcrumbLabel: "Complete Guide to FCA Enforcement",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline:
        "Complete Guide to FCA Enforcement & Fines | From Investigation to Penalty",
      description:
        "Comprehensive guide covering how the FCA enforces financial regulation, how fines are calculated, the biggest penalties of all time, enforcement by year, sector, and breach type.",
      datePublished: "2026-02-01",
      dateModified: todayISO(),
      author: {
        "@type": "Organization",
        name: SITE_NAME,
        url: "https://regactions.com",
        description:
          "Regulatory enforcement intelligence platform",
      },
      publisher: {
        "@type": "Organization",
        name: SITE_NAME,
        logo: { "@type": "ImageObject", url: `${BASE_URL}/regactions-mark.png` },
      },
      mainEntityOfPage: {
        "@type": "WebPage",
        "@id": `${BASE_URL}/guide/fca-enforcement`,
      },
      keywords:
        "FCA enforcement guide, FCA fines guide, FCA fines explained, how FCA fines work, FCA enforcement process",
      articleSection: "Guide",
      image: {
        "@type": "ImageObject",
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        caption:
          "RegActions - Global Regulatory Fines & Enforcement Intelligence",
      },
    },
  });

  // 5d. FAQ page (with full FAQPage schema)
  pages.push({
    path: "/faq",
    title:
      "Regulatory Fines FAQ | Global Financial Enforcement | RegActions",
    description:
      "Answers to common questions about regulatory fines from 45+ global financial regulators including FCA, BaFin, SEC, ASIC, and MAS. Compare enforcement trends.",
    keywords:
      "regulatory fines FAQ, global enforcement questions, FCA fines, BaFin fines, SEC enforcement, ASIC fines, MAS penalties, ESMA regulation, FINRA, CNMV, AMF, financial regulator comparison, AML enforcement, biggest regulatory fines, RegActions",
    ogType: "website",
    jsonLd: generateFaqSchema(faqItems),
  });

  // 6. Blog articles (Article schema + FAQPage schema where mapped + SSG body + OG images)
  for (const article of blogArticles) {
    const articleFaqs = getFaqsForArticle(article.slug);
    const articleOgImage = `${BASE_URL}/og/${article.slug}.png`;
    // Append a small related-links block (regulator hub + its country page) where
    // a cheap article↔regulator mapping exists. Body copy itself is untouched.
    const relatedLinks = renderBlogRelatedLinks(article.slug);
    const renderedBody = wrapArticleShell(
      article.title,
      `${renderMarkdownToHtml(article.content)}${relatedLinks}`,
    );
    const extraLd: object[] = [];
    if (articleFaqs.length > 0) extraLd.push(generateFaqSchema(articleFaqs));
    // HowTo schema for database guide
    if (article.id === "fca-fines-database-guide") extraLd.push(HOWTO_SCHEMA);
    pages.push({
      path: `/blog/${article.slug}`,
      title: article.seoTitle,
      description: article.excerpt,
      keywords: article.keywords.join(", "),
      ogType: "article",
      datePublished: article.dateISO,
      dateModified: article.dateISO,
      articleSection: article.category,
      breadcrumbLabel: article.title,
      bodyContent: renderedBody,
      ogImage: articleOgImage,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: article.seoTitle,
        description: article.excerpt,
        datePublished: article.dateISO,
        dateModified: article.dateISO,
        author: {
          "@type": "Organization",
          name: SITE_NAME,
          url: "https://regactions.com",
          description:
            "Regulatory enforcement intelligence platform",
        },
        publisher: {
          "@type": "Organization",
          name: SITE_NAME,
          logo: { "@type": "ImageObject", url: `${BASE_URL}/regactions-mark.png` },
        },
        mainEntityOfPage: {
          "@type": "WebPage",
          "@id": `${BASE_URL}/blog/${article.slug}`,
        },
        keywords: article.keywords.join(", "),
        articleSection: article.category,
        image: {
          "@type": "ImageObject",
          url: articleOgImage,
          width: 1200,
          height: 630,
          caption:
            "RegActions - Global Regulatory Fines & Enforcement Intelligence",
        },
      },
      extraJsonLd: extraLd,
    });
  }

  // 7. Yearly review articles (AnalysisNewsArticle schema + FAQPage schema + SSG body + OG images)
  const buildDate = todayISO();
  for (const article of yearlyArticles) {
    const yearlyFaqs = getFaqsForYearlyArticle(article.year);
    const yearEnd = `${article.year}-12-31`;
    const clampedDateModified = clampISODate(yearEnd, buildDate);
    const yearlyOgImage = `${BASE_URL}/og/${article.slug}.png`;

    // Build SSG body for yearly articles from structured sections
    const yearlyBodyParts = [
      `<h2>Executive Summary</h2>${article.executiveSummary
        .split("\n\n")
        .map((p) => `<p>${p}</p>`)
        .join("")}`,
      `<h2>Regulatory Context</h2>${article.regulatoryContext
        .split("\n\n")
        .map((p) => `<p>${p}</p>`)
        .join("")}`,
      `<h2>Key Enforcement Themes</h2><ul>${article.keyEnforcementThemes.map((t) => `<li>${t}</li>`).join("")}</ul>`,
      `<h2>Professional Insight</h2>${article.professionalInsight
        .split("\n\n")
        .map((p) => `<p>${p}</p>`)
        .join("")}`,
      `<h2>Looking Ahead</h2>${article.lookingAhead
        .split("\n\n")
        .map((p) => `<p>${p}</p>`)
        .join("")}`,
    ].join("");
    const yearlyBody = wrapArticleShell(article.title, yearlyBodyParts);

    pages.push({
      path: `/blog/${article.slug}`,
      title: article.seoTitle,
      description: article.excerpt,
      keywords: article.keywords.join(", "),
      ogType: "article",
      datePublished: article.dateISO,
      dateModified: clampedDateModified,
      articleSection: "Annual Analysis",
      breadcrumbLabel: article.title,
      bodyContent: yearlyBody,
      ogImage: yearlyOgImage,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "AnalysisNewsArticle",
        headline: article.seoTitle,
        description: article.excerpt,
        datePublished: article.dateISO,
        dateModified: clampedDateModified,
        author: {
          "@type": "Organization",
          name: SITE_NAME,
          url: "https://regactions.com",
          description:
            "Regulatory enforcement intelligence platform",
        },
        publisher: {
          "@type": "Organization",
          name: SITE_NAME,
          logo: { "@type": "ImageObject", url: `${BASE_URL}/regactions-mark.png` },
        },
        mainEntityOfPage: {
          "@type": "WebPage",
          "@id": `${BASE_URL}/blog/${article.slug}`,
        },
        keywords: article.keywords.join(", "),
        articleSection: "Annual Analysis",
        image: {
          "@type": "ImageObject",
          url: yearlyOgImage,
          width: 1200,
          height: 630,
          caption:
            "RegActions - Global Regulatory Fines & Enforcement Intelligence",
        },
      },
      extraJsonLd: yearlyFaqs.length > 0 ? [generateFaqSchema(yearlyFaqs)] : [],
    });
  }

  // 8. DB-backed hub detail pages (best-effort; skip if env not available in build)
  try {
    const { listBreachCategories, listYears, listSectors, listTopFirms } =
      await import("../server/services/hubs.js");
    const [categories, years, sectors, firms] = await Promise.all([
      listBreachCategories(),
      listYears(),
      listSectors(),
      listTopFirms(120),
    ]);

    categories.slice(0, 30).forEach((cat: any) => {
      const title = `${humanize(cat.name)} Enforcement Actions | ${cat.fineCount} actions totalling ${gbp.format(cat.totalAmount)}`;
      const description = `Explore regulatory enforcement actions tagged ${humanize(cat.name)}. ${cat.fineCount} actions totalling ${gbp.format(cat.totalAmount)} across 2013-2026.`;
      pages.push({
        path: `/breaches/${cat.slug}`,
        title,
        description,
        keywords: `${humanize(cat.name)} regulatory fines, ${humanize(cat.name)} enforcement, fines by breach`,
        ogType: "website",
        bodyContent: renderHubBody(
          title,
          description,
          [
            { label: "Breach category", value: humanize(cat.name) },
            { label: "Tracked actions", value: String(cat.fineCount) },
            { label: "Total amount", value: gbp.format(cat.totalAmount) },
          ],
          `/breaches/${cat.slug}`,
        ),
      });
    });

    years.slice(0, 25).forEach((y: any) => {
      const title = `Enforcement Actions ${y.year} | ${y.fineCount} actions totalling ${gbp.format(y.totalAmount)}`;
      const description = `Explore regulatory fines issued in ${y.year}. ${y.fineCount} actions totalling ${gbp.format(y.totalAmount)}.`;
      pages.push({
        path: `/years/${y.year}`,
        title,
        description,
        keywords: `regulatory fines ${y.year}, regulatory penalties ${y.year}, enforcement ${y.year}`,
        ogType: "website",
        bodyContent: renderHubBody(
          title,
          description,
          [
            { label: "Year", value: String(y.year) },
            { label: "Tracked actions", value: String(y.fineCount) },
            { label: "Total amount", value: gbp.format(y.totalAmount) },
          ],
          `/years/${y.year}`,
        ),
      });
    });

    sectors.slice(0, 30).forEach((s: any) => {
      const title = `Regulatory Fines for ${s.name} | ${s.fineCount} actions totalling ${gbp.format(s.totalAmount)}`;
      const description = `Explore regulatory enforcement actions for ${s.name}. ${s.fineCount} actions totalling ${gbp.format(s.totalAmount)} across 2013-2026.`;
      pages.push({
        path: `/sectors/${s.slug}`,
        title,
        description,
        keywords: `regulatory fines ${s.name}, regulatory penalties ${s.name}, fines by sector`,
        ogType: "website",
        bodyContent: renderHubBody(
          title,
          description,
          [
            { label: "Sector", value: s.name },
            { label: "Tracked actions", value: String(s.fineCount) },
            { label: "Total amount", value: gbp.format(s.totalAmount) },
          ],
          `/sectors/${s.slug}`,
        ),
      });
    });

    firms.slice(0, 120).forEach((f: any) => {
      const title = `${f.name} Enforcement History | ${f.fineCount} actions totalling ${gbp.format(f.totalAmount)}`;
      const description = `Explore regulatory enforcement actions for ${f.name}. ${f.fineCount} actions totalling ${gbp.format(f.totalAmount)} across 2013-2026.`;
      pages.push({
        path: `/firms/${f.slug}`,
        title,
        description,
        keywords: `regulatory fines ${f.name}, penalties ${f.name}, regulatory enforcement ${f.name}`,
        ogType: "website",
        bodyContent: renderHubBody(
          title,
          description,
          [
            { label: "Entity", value: f.name },
            { label: "Tracked actions", value: String(f.fineCount) },
            { label: "Total amount", value: gbp.format(f.totalAmount) },
          ],
          `/firms/${f.slug}`,
        ),
      });
    });
  } catch (error) {
    console.warn(
      "WARN: Skipping DB-backed hub pages in pre-render step:",
      error instanceof Error ? error.message : String(error),
    );
  }

  return pages;
}

// ---------------------------------------------------------------------------
// Replace <head> content in the HTML template
// ---------------------------------------------------------------------------

function renderPage(template: string, meta: PageMeta): string {
  const fullUrl = `${BASE_URL}${meta.path}`;
  const canonicalPath = meta.path === "/" ? "/" : meta.path;
  const canonicalUrl = `${BASE_URL}${canonicalPath}`;

  let html = template;

  // Replace <title>
  html = html.replace(
    /<title>[\s\S]*?<\/title>/,
    `<title>${escapeHtml(meta.title)}</title>`,
  );

  // Replace meta[name="title"]
  html = html.replace(
    /<meta\s+name="title"\s+content="[^"]*"\s*\/?>/,
    `<meta name="title" content="${escapeHtml(meta.title)}" />`,
  );

  // Replace meta[name="description"] — use [^>]* to avoid catastrophic backtracking
  html = html.replace(
    /<meta\s+name="description"[^>]*\/>/,
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
  );

  // Replace meta[name="keywords"]
  html = html.replace(
    /<meta\s+name="keywords"[^>]*\/>/,
    `<meta name="keywords" content="${escapeHtml(meta.keywords)}" />`,
  );

  // Replace canonical
  html = html.replace(
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/,
    `<link rel="canonical" href="${canonicalUrl}" />`,
  );

  // Robots noindex for the 404 shell — an unknown URL must never be indexable.
  if (meta.noindex) {
    html = html.replace(
      /<meta\s+name="robots"\s+content="[^"]*"\s*\/?>/,
      `<meta name="robots" content="noindex, follow" />`,
    );
  }

  // Single self-referencing hreflang alternate (en/en-gb/en-us trio removed as
  // redundant; the site is single-locale). Only the x-default alternate remains.
  html = html.replace(
    /<link\s+rel="alternate"\s+hreflang="x-default"\s+href="[^"]*"\s*\/?>/,
    `<link rel="alternate" hreflang="x-default" href="${canonicalUrl}" />`,
  );

  // Extra RSS feed alternates (e.g. the country-risk changes feed on the
  // countries pages). Injected before </head>; the base template already
  // carries the site-wide /rss.xml alternate for every page.
  if (meta.rssAlternates?.length) {
    const alternateTags = meta.rssAlternates
      .map(
        (feed) =>
          `<link rel="alternate" type="application/rss+xml" title="${escapeHtml(
            feed.title,
          )}" href="${escapeHtml(feed.href)}" />`,
      )
      .join("");
    html = html.replace(/<\/head>/, `${alternateTags}</head>`);
  }

  // Replace OG tags
  html = html.replace(
    /<meta\s+property="og:type"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:type" content="${meta.ogType}" />`,
  );
  html = html.replace(
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:url" content="${fullUrl}" />`,
  );
  html = html.replace(
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
  );
  html = html.replace(
    /<meta\s+property="og:description"[^>]*\/>/,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
  );

  // Replace Twitter tags
  html = html.replace(
    /<meta\s+name="twitter:url"\s+content="[^"]*"\s*\/?>/,
    `<meta name="twitter:url" content="${fullUrl}" />`,
  );
  html = html.replace(
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/,
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
  );
  html = html.replace(
    /<meta\s+name="twitter:description"[^>]*\/>/,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
  );

  // Replace OG image and Twitter image when custom ogImage is set
  if (meta.ogImage) {
    html = html.replace(
      /<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/,
      `<meta property="og:image" content="${meta.ogImage}" />`,
    );
    html = html.replace(
      /<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/,
      `<meta name="twitter:image" content="${meta.ogImage}" />`,
    );
  }

  // Inject SSG body content into <div id="root"> (React hydrates over it).
  // The shared site footer is appended to EVERY page (even pages without a
  // bodyContent) so crawlers always reach the country/regulator clusters — this
  // is the core internal-linking fix for the orphan problem.
  const rootInner = `${meta.bodyContent ?? ""}${SITE_FOOTER_HTML}`;
  html = html.replace('<div id="root"></div>', `<div id="root">${rootInner}</div>`);

  // Replace the static @graph with per-page version (correct BreadcrumbList, WebPage, Dataset)
  const pageGraph = generatePageGraph(meta);
  html = html.replace(
    /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
    `<script type="application/ld+json">\n    ${JSON.stringify(pageGraph)}\n    </script>`,
  );

  // Inject JSON-LD and article meta before </head>
  const headInjections: string[] = [];

  if (meta.ogType === "article") {
    // Article meta tags
    if (meta.datePublished)
      headInjections.push(
        `<meta property="article:published_time" content="${meta.datePublished}" />`,
      );
    if (meta.dateModified)
      headInjections.push(
        `<meta property="article:modified_time" content="${meta.dateModified}" />`,
      );
    if (meta.articleSection)
      headInjections.push(
        `<meta property="article:section" content="${escapeHtml(meta.articleSection)}" />`,
      );
  }

  if (GOOGLE_SITE_VERIFICATION) {
    headInjections.push(
      `<meta name="google-site-verification" content="${escapeHtml(GOOGLE_SITE_VERIFICATION)}" />`,
    );
  }

  if (BING_SITE_VERIFICATION) {
    headInjections.push(
      `<meta name="msvalidate.01" content="${escapeHtml(BING_SITE_VERIFICATION)}" />`,
    );
  }

  // Primary JSON-LD (Article schema or FAQPage for /faq)
  if (meta.jsonLd) {
    headInjections.push(
      `<script type="application/ld+json">\n    ${JSON.stringify(meta.jsonLd)}\n    </script>`,
    );
  }

  // Extra JSON-LD blocks (e.g. FAQPage alongside Article)
  if (meta.extraJsonLd?.length) {
    for (const ld of meta.extraJsonLd) {
      headInjections.push(
        `<script type="application/ld+json">\n    ${JSON.stringify(ld)}\n    </script>`,
      );
    }
  }

  if (headInjections.length > 0) {
    html = html.replace(
      "</head>",
      `    ${headInjections.join("\n    ")}\n  </head>`,
    );
  }

  return html;
}

// ---------------------------------------------------------------------------
// Generate sitemap.xml
// ---------------------------------------------------------------------------

/**
 * Regulator-hub lastmod from the regulator's own latest enforcement year (real,
 * per-regulator). Returns a year-only date (valid W3C Datetime) rather than
 * fabricating a specific day; null if the code is unknown (omit lastmod).
 */
function regulatorHubLastmod(path: string): string | null {
  const code = path.replace("/regulators/", "").split("/")[0]?.toUpperCase();
  if (!code) return null;
  const coverage = REGULATOR_COVERAGE[code];
  if (!coverage || !coverage.latestYear) return null;
  return String(coverage.latestYear);
}

function generateSitemap(pages: PageMeta[]): string {
  const buildDate = todayISO();
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ];

  for (const page of pages) {
    const fullUrl = `${BASE_URL}${page.path}`;

    // Real freshness: prefer a page's actual data-change date. `null` means "omit
    // lastmod" — honest for pages with no cheap real date (better than faking one).
    let lastmod: string | null = buildDate;
    let changefreq = "monthly";
    let priority = "0.75";

    if (page.path === "/") {
      priority = "1.0";
      changefreq = "daily";
    } else if (page.path === "/regulators") {
      priority = "0.95";
      changefreq = "daily";
    } else if (page.path === "/search") {
      priority = "0.9";
      changefreq = "daily";
    } else if (page.path === "/topics") {
      priority = "0.9";
      changefreq = "weekly";
    } else if (page.path.startsWith("/topics/")) {
      priority = "0.88";
      changefreq = "weekly";
    } else if (page.path === "/fines" || page.path.startsWith("/fines/")) {
      priority = "0.9";
      changefreq = "daily";
    } else if (["/board-pack", "/features", "/uk-enforcement", "/intelligence"].includes(page.path)) {
      priority = "0.85";
      changefreq = "weekly";
    } else if (
      page.path === "/breaches" ||
      page.path === "/years" ||
      page.path === "/sectors" ||
      page.path === "/firms"
    ) {
      priority = "0.85";
      changefreq = "weekly";
    } else if (page.path.startsWith("/regulators/")) {
      // Regulator hub pages — lastmod from the regulator's own latest enforcement
      // year (real, per-regulator). We only know year granularity, so we emit a
      // year-only lastmod rather than fabricate a specific day.
      priority = "0.85";
      changefreq = "weekly";
      lastmod = regulatorHubLastmod(page.path);
    } else if (page.path === "/blog") {
      priority = "0.9";
      changefreq = "weekly";
    } else if (page.path === "/faq") {
      priority = "0.9";
      changefreq = "monthly";
    } else if (page.path === "/sitemap") {
      priority = "0.5";
      changefreq = "monthly";
    } else if (page.path === "/guide/fca-enforcement") {
      priority = "0.9";
      changefreq = "weekly";
    } else if (page.path === "/developers") {
      priority = "0.7";
      changefreq = "monthly";
      lastmod = page.dateModified ?? buildDate;
    } else if (page.path === "/countries" || page.path.startsWith("/countries/")) {
      // Country index + per-country pages: real per-page max data-change date
      // (FATF plenary / sanctions review / WGI / CPI vintage). Pages without a
      // computed date (e.g. methodology) fall back to the build date.
      priority = page.path === "/countries" ? "0.9" : "0.8";
      changefreq = "monthly";
      lastmod = page.dateModified ?? buildDate;
    } else if (page.datePublished) {
      // Blog articles use their publish date
      lastmod = clampISODate(
        page.dateModified || page.datePublished,
        buildDate,
      );

      // Featured / recent articles get higher priority
      const isFeatured = blogArticles.some(
        (a) => `/blog/${a.slug}` === page.path && a.featured,
      );
      if (isFeatured) {
        priority = "0.9";
        changefreq = "weekly";
      } else if (page.path.includes("annual-review")) {
        // Yearly reviews: recent years get higher priority
        const yearMatch = page.path.match(/(\d{4})-annual-review/);
        const year = yearMatch ? parseInt(yearMatch[1]) : 0;
        priority = year >= 2023 ? "0.85" : "0.75";
        changefreq = year >= 2024 ? "weekly" : "monthly";
      } else {
        priority = "0.8";
      }
    } else if (
      page.path.startsWith("/breaches/") ||
      page.path.startsWith("/sectors/")
    ) {
      priority = "0.75";
      changefreq = "monthly";
    } else if (
      page.path.startsWith("/years/") ||
      page.path.startsWith("/firms/")
    ) {
      priority = "0.75";
      changefreq = "monthly";
    }

    lines.push("  <url>");
    lines.push(`    <loc>${fullUrl}</loc>`);
    if (lastmod) lines.push(`    <lastmod>${lastmod}</lastmod>`);
    lines.push(`    <changefreq>${changefreq}</changefreq>`);
    lines.push(`    <priority>${priority}</priority>`);
    lines.push("  </url>");
  }

  lines.push("</urlset>");
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Generate rss.xml
// ---------------------------------------------------------------------------

function generateRss(): string {
  const buildDate = todayISO();
  const items = [
    ...blogArticles.map((a) => ({
      title: a.seoTitle,
      link: `${BASE_URL}/blog/${a.slug}`,
      guid: `${BASE_URL}/blog/${a.slug}`,
      description: a.excerpt,
      pubDate: toRfc2822(a.dateISO, buildDate),
      category: a.category,
    })),
    ...yearlyArticles.map((a) => ({
      title: a.seoTitle,
      link: `${BASE_URL}/blog/${a.slug}`,
      guid: `${BASE_URL}/blog/${a.slug}`,
      description: a.excerpt,
      pubDate: toRfc2822(a.dateISO, buildDate),
      category: "Annual Analysis",
    })),
  ].sort(
    (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime(),
  );

  const rssItems = items
    .slice(0, 60)
    .map((item) => {
      return [
        "    <item>",
        `      <title>${escapeHtml(item.title)}</title>`,
        `      <link>${item.link}</link>`,
        `      <guid isPermaLink="true">${item.guid}</guid>`,
        `      <pubDate>${item.pubDate}</pubDate>`,
        item.category
          ? `      <category>${escapeHtml(item.category)}</category>`
          : "",
        `      <description>${escapeHtml(item.description)}</description>`,
        "    </item>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escapeHtml(SITE_NAME)} Insights</title>`,
    `    <link>${BASE_URL}/blog</link>`,
    `    <description>${escapeHtml("Expert analysis of FCA enforcement actions, fines, and compliance insights.")}</description>`,
    `    <language>en-gb</language>`,
    `    <lastBuildDate>${toRfc2822(buildDate, buildDate)}</lastBuildDate>`,
    `    <atom:link href="${RSS_URL}" rel="self" type="application/rss+xml" />`,
    rssItems,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}

/**
 * Generate changes.xml — the country-risk changes feed. Same generator pattern
 * as generateRss: the latest ~50 derived change events, newest-first. Each
 * event links to the country page or the cited source; the GUID is stable
 * (date + kind + iso) so a re-emitted event is not re-notified.
 */
function generateChangesRss(): string {
  const buildDate = todayISO();
  const events = buildCountryChanges().slice(0, 50);
  const items = events
    .map((event) => {
      const link = /^https?:\/\//i.test(event.href)
        ? event.href
        : `${BASE_URL}${event.href}`;
      const guid = `${BASE_URL}/countries/changes#${event.date}-${event.kind}-${event.iso2 ?? "global"}`;
      return [
        "    <item>",
        `      <title>${escapeHtml(event.title)}</title>`,
        `      <link>${escapeHtml(link)}</link>`,
        `      <guid isPermaLink="false">${escapeHtml(guid)}</guid>`,
        `      <pubDate>${toRfc2822(event.date, buildDate)}</pubDate>`,
        `      <category>${escapeHtml(CHANGE_KIND_LABELS[event.kind])}</category>`,
        `      <description>${escapeHtml(event.detail)}</description>`,
        "    </item>",
      ].join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escapeHtml(SITE_NAME)} Country Risk Changes</title>`,
    `    <link>${BASE_URL}/countries/changes</link>`,
    `    <description>${escapeHtml("Dated changes in country risk: FATF plenary additions and removals, sanctions snapshot promotions, EU tax list updates and score moves.")}</description>`,
    `    <language>en-gb</language>`,
    `    <lastBuildDate>${toRfc2822(buildDate, buildDate)}</lastBuildDate>`,
    `    <atom:link href="${CHANGES_RSS_URL}" rel="self" type="application/rss+xml" />`,
    items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const templatePath = join(DIST, "index.html");
  if (!existsSync(templatePath)) {
    console.error("ERROR: dist/index.html not found. Run `vite build` first.");
    process.exit(1);
  }

  const template = readFileSync(templatePath, "utf-8");
  const pages = await buildPageMetas();

  console.log(`Pre-rendering ${pages.length} pages...`);

  let created = 0;
  for (const page of pages) {
    const html = renderPage(template, page);

    // Determine output path
    let outPath: string;
    if (page.path === "/") {
      // Homepage — already dist/index.html, overwrite with correct meta
      outPath = join(DIST, "index.html");
    } else {
      // e.g. /blog/some-slug → dist/blog/some-slug/index.html
      outPath = join(DIST, page.path.slice(1), "index.html");
    }

    const outDir = dirname(outPath);
    if (!existsSync(outDir)) {
      mkdirSync(outDir, { recursive: true });
    }

    writeFileSync(outPath, html, "utf-8");
    created++;
  }

  console.log(`  Created ${created} HTML files.`);

  // 404 shell — a real, noindex "Not Found" page. Written to BOTH dist/404.html
  // (Vercel's convention for the not-found response) and dist/404/index.html (so
  // a direct visit to /404 renders the same content the React catch-all shows).
  // vercel.json routes unmatched non-API paths here with a 404 status; see the
  // PR notes for the routing rationale.
  const notFoundMeta: PageMeta = {
    path: "/404",
    title: "Page Not Found | RegActions",
    description:
      "The page you were looking for could not be found on RegActions. Browse country risk reports, regulator data, and enforcement topics instead.",
    keywords: "page not found, RegActions",
    ogType: "website",
    breadcrumbLabel: "Not found",
    bodyContent: renderNotFoundBody(),
    noindex: true,
  };
  const notFoundHtml = renderPage(template, notFoundMeta);
  writeFileSync(join(DIST, "404.html"), notFoundHtml, "utf-8");
  const notFoundDir = join(DIST, "404");
  if (!existsSync(notFoundDir)) mkdirSync(notFoundDir, { recursive: true });
  writeFileSync(join(notFoundDir, "index.html"), notFoundHtml, "utf-8");
  console.log("  Created 404.html (noindex not-found shell).");

  // Generate sitemap
  const sitemap = generateSitemap(pages);
  const sitemapPath = join(DIST, "sitemap.xml");
  writeFileSync(sitemapPath, sitemap, "utf-8");
  console.log(`  Generated sitemap.xml with ${pages.length} URLs.`);

  // Generate RSS feed
  const rss = generateRss();
  const rssPath = join(DIST, "rss.xml");
  writeFileSync(rssPath, rss, "utf-8");
  console.log(`  Generated rss.xml.`);

  // Generate the country-risk changes feed
  const changesRss = generateChangesRss();
  writeFileSync(join(DIST, "changes.xml"), changesRss, "utf-8");
  console.log(`  Generated changes.xml.`);

  console.log("Done!");
}

main().catch((error) => {
  console.error("Pre-render failed:", error);
  process.exit(1);
});
