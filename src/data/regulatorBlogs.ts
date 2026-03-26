/**
 * Regulator blog generation.
 *
 * FCA keeps a markdown-first article path so the existing FCA blog content stays intact.
 * Non-FCA regulators now use a structured article model that renders richer sections,
 * source cards, and compliance takeaways in BlogPost.tsx.
 */

import {
  BLOG_REGULATOR_CODES,
  REGULATOR_COVERAGE,
} from "./regulatorCoverage.js";
import type {
  BlogArticleMeta,
  StructuredRegulatorArticle,
  StructuredRegulatorLink,
  StructuredRegulatorMetric,
  StructuredRegulatorSection,
} from "./blogArticles.js";

const PUBLICATION_DATE = "2026-03-21";
const PUBLICATION_DATE_ISO = "2026-03-21T00:00:00.000Z";

type RegulatorProfile = {
  introduction: string;
  scopeSummary: string;
  whyItMatters: string[];
  enforcementThemes: string[];
  automationNotes: string[];
  takeaways: string[];
  crossLinks: StructuredRegulatorLink[];
};

function toCurrencyLabel(code: string, currency: string): string {
  if (code === "ESMA") return `${currency} (multi-jurisdiction)`;
  return currency;
}

function getRegulatorProfile(code: string): RegulatorProfile {
  switch (code) {
    case "BaFin":
      return {
        introduction:
          "BaFin is a broad prudential and conduct supervisor, so its public measures are especially useful when you want to track how Germany treats bank, insurance, and capital markets failures together.",
        scopeSummary:
          "The public record mixes supervision notices, sanctions, and enforcement announcements across multiple financial sectors.",
        whyItMatters: [
          "Large institutions with German operations often face dual scrutiny from prudential and conduct angles.",
          "BaFin is relevant for groups that need to map supervisory pressure across banking, insurance, and securities.",
          "Its sanctions help benchmark how a major EU market handles systemic-risk and governance failures.",
        ],
        enforcementThemes: [
          "Prudential controls and internal governance",
          "Market conduct and investor protection",
          "Weak remediation or delayed supervisory response",
        ],
        automationNotes: [
          "Use the sanctions and measures pages first; they are the most direct public source for structured action data.",
          "Expect a mix of detail pages and index pages rather than a single uniform feed.",
        ],
        takeaways: [
          "BaFin is a strong comparator for cross-border firms with German banking or insurance exposure.",
          "The dataset is clean enough for automation, but the workflow is still more distributed than FCA coverage.",
          "Use it to benchmark prudential and conduct outcomes side by side.",
        ],
        crossLinks: [
          {
            label: "BaFin regulator hub",
            url: "/regulators/bafin",
            description: "Open the live BaFin coverage page.",
          },
          {
            label: "FCA enforcement benchmark",
            url: "/blog/fca-enforcement-trends-2013-2025",
            description: "Compare BaFin patterns with the FCA benchmark.",
          },
          {
            label: "Blog index",
            url: "/blog",
            description: "Browse all published analysis.",
          },
        ],
      };
    case "AMF":
      return {
        introduction:
          "The AMF is the best fit when you want a securities-market sanctions feed with strong retail-investor and market-integrity emphasis.",
        scopeSummary:
          "Its public sanctions and enforcement pages are tightly focused on market abuse, securities conduct, and investor protection.",
        whyItMatters: [
          "Helpful for asset managers, brokers, distributors, and cross-border securities firms.",
          "French market conduct cases often mirror broader EU expectations on disclosure, conflicts, and sales practices.",
          "The AMF is particularly useful where the UK/EU control environment needs an investor-protection benchmark.",
        ],
        enforcementThemes: [
          "Market abuse and disclosure failures",
          "Investment services conduct",
          "Retail-investor harm and transparency gaps",
        ],
        automationNotes: [
          "The sanctions and enforcement section is the main source for structured public actions.",
          "Decision pages and release pages are both useful; keep the source map separate from article content.",
        ],
        takeaways: [
          "AMF is a strong EU securities comparator for firms with French-market activity.",
          "The public record is structured enough to scrape without heavy normalisation.",
          "It pairs well with ESMA and FCA for cross-market analysis.",
        ],
        crossLinks: [
          {
            label: "AMF sanctions hub",
            url: "/regulators/amf",
            description: "Open the live AMF coverage page.",
          },
          {
            label: "FCA enforcement benchmark",
            url: "/blog/fca-enforcement-trends-2013-2025",
            description: "Use the FCA as the main UK benchmark.",
          },
          {
            label: "Blog index",
            url: "/blog",
            description: "Browse all published analysis.",
          },
        ],
      };
    case "CNMV":
      return {
        introduction:
          "The CNMV is the key Spanish securities-market comparator and works well if you want a public sanctions dataset centered on investment services and market conduct.",
        scopeSummary:
          "Its sanctions register is public and directly oriented toward investor protection, disclosure, and regulated market behaviour.",
        whyItMatters: [
          "Relevant for firms operating Spanish branches, funds, brokers, and investment-advice businesses.",
          "Useful as a public benchmark for securities conduct in a major EU market.",
          "The enforcement record is smaller than FCA/BaFin, but still meaningful for regional trend analysis.",
        ],
        enforcementThemes: [
          "Investment services and disclosures",
          "Market conduct and investor protection",
          "Procedural and register-based sanctions",
        ],
        automationNotes: [
          "The sanctions register is the primary source; build a stable parser around the register URLs.",
          "Expect Spanish-language navigation on some pages even when the site supports English metadata.",
        ],
        takeaways: [
          "CNMV is useful if Spain is part of your operating footprint or market watchlist.",
          "The register structure is friendly to scraping once the entry points are fixed.",
          "It adds regional diversity to a UK/EU compliance feed.",
        ],
        crossLinks: [
          {
            label: "CNMV regulator hub",
            url: "/regulators/cnmv",
            description: "Open the live CNMV coverage page.",
          },
          {
            label: "FCA enforcement benchmark",
            url: "/blog/fca-enforcement-trends-2013-2025",
            description: "Compare against the FCA baseline.",
          },
          {
            label: "Blog index",
            url: "/blog",
            description: "Browse all published analysis.",
          },
        ],
      };
    case "CBI":
      return {
        introduction:
          "The Central Bank of Ireland is useful when you need a banking-supervision and conduct view from a major EU financial centre.",
        scopeSummary:
          "Its enforcement output spans published actions, legal notices, and supervisory context, especially where banking and conduct collide.",
        whyItMatters: [
          "Highly relevant for groups using Ireland as an EU hub or servicing Irish clients.",
          "The mix of domestic supervision and ECB-linked banking oversight makes the context especially valuable.",
          "Good for comparing conduct outcomes against prudential expectations in a major international centre.",
        ],
        enforcementThemes: [
          "AML and financial-crime controls",
          "Consumer protection and conduct issues",
          "Governance and control failures in banking operations",
        ],
        automationNotes: [
          "The legal notices and enforcement actions pages should be treated as separate ingestion sources.",
          "Maintain a stable archive of action pages because notices are often updated in batches.",
        ],
        takeaways: [
          "CBI is a strong add if you want EU banking-supervision depth beyond the FCA.",
          "It sits well beside BaFin for broader prudential coverage.",
          "The public record is structured enough for regular monitoring.",
        ],
        crossLinks: [
          {
            label: "CBI regulator hub",
            url: "/regulators/cbi",
            description: "Open the live CBI coverage page.",
          },
          {
            label: "FCA enforcement benchmark",
            url: "/blog/fca-enforcement-trends-2013-2025",
            description: "Compare Ireland with the UK benchmark.",
          },
          {
            label: "Blog index",
            url: "/blog",
            description: "Browse all published analysis.",
          },
        ],
      };
    case "AFM":
      return {
        introduction:
          "AFM gives you a Dutch conduct-supervision view, which is especially useful if you care about transparency, market behaviour, and public sanctions registers.",
        scopeSummary:
          "The public record is centred on conduct enforcement and sanctions rather than prudential supervision.",
        whyItMatters: [
          "Good comparator for asset managers, intermediaries, and market infrastructure firms in the Netherlands.",
          "AFM is useful where conduct supervision is the main point of comparison rather than bank solvency.",
          "Its public register makes it a practical scraping target for EU market-conduct data.",
        ],
        enforcementThemes: [
          "Conduct supervision and transparency",
          "Investor protection",
          "Register-based sanctions and public decisions",
        ],
        automationNotes: [
          "The sanctions register is the main source and is generally easier to automate than narrative news pages.",
          "Keep the live register path separate from the annual report context pages.",
        ],
        takeaways: [
          "AFM is one of the cleanest EU conduct registers to add after the FCA set.",
          "It complements DNB, which is the prudential counterpart in the Netherlands.",
          "The data is small but operationally useful.",
        ],
        crossLinks: [
          {
            label: "AFM regulator hub",
            url: "/regulators/afm",
            description: "Open the live AFM coverage page.",
          },
          {
            label: "FCA enforcement benchmark",
            url: "/blog/fca-enforcement-trends-2013-2025",
            description: "Compare with the UK enforcement baseline.",
          },
          {
            label: "Blog index",
            url: "/blog",
            description: "Browse all published analysis.",
          },
        ],
      };
    case "DNB":
      return {
        introduction:
          "DNB is the Dutch prudential counterpart worth adding when you need a bank- and stability-focused sanctions feed rather than a conduct-only one.",
        scopeSummary:
          "Its public supervision and enforcement pages are aimed at prudential oversight, banking stability, and regulated-sector compliance.",
        whyItMatters: [
          "Important for bank and insurer groups with Dutch operations or group-wide prudential governance.",
          "Useful when a UK/EU compliance team wants to see how prudential failures are handled separately from conduct issues.",
          "Adds the missing Dutch banking lens next to AFM’s conduct coverage.",
        ],
        enforcementThemes: [
          "Prudential requirements and financial stability",
          "Control failures in banking and insurance",
          "Supervisory follow-up and corrective measures",
        ],
        automationNotes: [
          "The enforcement pages are the best source for published actions, with annual reports as context only.",
          "Build in coverage for PDFs or document-style releases if the page layout changes.",
        ],
        takeaways: [
          "DNB is the better Dutch add if your audience is banking-heavy.",
          "It complements AFM and gives you a conduct/prudential split inside one market.",
          "The public pages are structured enough to make automation feasible.",
        ],
        crossLinks: [
          {
            label: "DNB regulator hub",
            url: "/regulators/dnb",
            description: "Open the live DNB coverage page.",
          },
          {
            label: "FCA enforcement benchmark",
            url: "/blog/fca-enforcement-trends-2013-2025",
            description: "Compare with the FCA baseline.",
          },
          {
            label: "Blog index",
            url: "/blog",
            description: "Browse all published analysis.",
          },
        ],
      };
    case "ESMA":
      return {
        introduction:
          "ESMA is useful as a coordination and standards benchmark rather than a pure fines feed, but the public material still matters for EU-wide enforcement context.",
        scopeSummary:
          "Its publications focus on market oversight, coordination, and the EU regulatory framework rather than a single national enforcement stream.",
        whyItMatters: [
          "Best used as an EU-wide reference point for securities-market compliance.",
          "Useful when you need a cross-border overlay on top of national regulator fines.",
          "Helps contextualise what national regulators are doing across the EU.",
        ],
        enforcementThemes: [
          "Cross-border market oversight",
          "Coordination with national authorities",
          "EU technical standards and supervisory convergence",
        ],
        automationNotes: [
          "Treat ESMA as a coordinating regulator: pair its publications with national sanctions feeds.",
          "Open-data or publication pages are more relevant than a classic case-by-case fines register.",
        ],
        takeaways: [
          "ESMA works best as a contextual layer above the national regulator feeds.",
          "Its value is in harmonisation and supervisory convergence rather than case volume.",
          "Keep it in the set if your audience needs EU-level market structure context.",
        ],
        crossLinks: [
          {
            label: "ESMA regulator hub",
            url: "/regulators/esma",
            description: "Open the live ESMA coverage page.",
          },
          {
            label: "FCA enforcement benchmark",
            url: "/blog/fca-enforcement-trends-2013-2025",
            description: "Use the FCA as the UK comparison point.",
          },
          {
            label: "Blog index",
            url: "/blog",
            description: "Browse all published analysis.",
          },
        ],
      };
    default:
      return {
        introduction:
          "This regulator has a public enforcement/sanctions publication trail that is useful for compliance monitoring and cross-border benchmarking.",
        scopeSummary:
          "The public feed is suitable for structured ingestion and compliance analysis.",
        whyItMatters: [
          "Useful for firms with direct market exposure in the jurisdiction.",
          "A helpful benchmark for regional enforcement priorities.",
          "Relevant where the compliance team needs a public sanctions trail rather than internal-only supervision.",
        ],
        enforcementThemes: [
          "Conduct and market integrity",
          "Financial-crime controls",
          "Governance and remediation",
        ],
        automationNotes: [
          "Start with the official enforcement page and build around the most stable public index.",
          "Keep source URLs in a normalised registry for change detection.",
        ],
        takeaways: [
          "The regulator is a valid addition to a broader compliance intelligence feed.",
          "The public data should be scrapeable with moderate normalisation.",
          "Treat the publication page as the source of truth and archive snapshots over time.",
        ],
        crossLinks: [
          {
            label: "Regulator hub",
            url: `/regulators/${code.toLowerCase()}`,
            description: "Open the live regulator coverage page.",
          },
          {
            label: "FCA enforcement benchmark",
            url: "/blog/fca-enforcement-trends-2013-2025",
            description: "Compare against the FCA baseline.",
          },
          {
            label: "Blog index",
            url: "/blog",
            description: "Browse all published analysis.",
          },
        ],
      };
  }
}

function buildStructuredArticle(code: string): StructuredRegulatorArticle {
  const coverage = REGULATOR_COVERAGE[code];
  if (!coverage) throw new Error(`Unknown regulator: ${code}`);

  const profile = getRegulatorProfile(code);
  const metrics: StructuredRegulatorMetric[] = [
    { label: "Period", value: coverage.years },
    { label: "Total actions", value: String(coverage.count) },
    {
      label: "Data quality",
      value: coverage.dataQuality,
      note: coverage.note ?? undefined,
    },
    { label: "Scrape mode", value: coverage.scrapeMode.replace(/_/g, " ") },
    { label: "Priority tier", value: `Tier ${coverage.priorityTier}` },
    {
      label: "Default currency",
      value: toCurrencyLabel(code, coverage.defaultCurrency),
    },
  ];

  const sections: StructuredRegulatorSection[] = [
    {
      heading: "Regulatory scope",
      intro: profile.introduction,
      bullets: [
        profile.scopeSummary,
        `Jurisdiction: ${coverage.country}. Region: ${coverage.region}.`,
        `Public coverage: ${coverage.years} with ${coverage.count} actions tracked.`,
      ],
    },
    {
      heading: "Why it matters for compliance teams",
      intro:
        "This is the practical lens for UK/EU compliance teams that need to benchmark public sanctions activity against their own control environment.",
      bullets: profile.whyItMatters,
    },
    {
      heading: "Public enforcement feed",
      intro:
        "The source shape tells you how easy the regulator will be to automate and how much normalisation work you should expect.",
      bullets: [
        `Source style: ${coverage.scrapeMode.replace(/_/g, " ")}.`,
        `Coverage maturity: ${coverage.coverageStatus}.`,
        coverage.note
          ? `Coverage note: ${coverage.note}`
          : `No coverage note attached to this regulator yet.`,
      ],
    },
    {
      heading: "Common enforcement themes",
      intro:
        "The article is designed to surface the breach patterns most likely to matter in a compliance watchlist.",
      bullets: profile.enforcementThemes,
    },
    {
      heading: "Automation notes",
      intro:
        "Use these cues to plan ingestion, change detection, and downstream normalisation.",
      bullets: profile.automationNotes,
    },
  ];

  return {
    introduction: profile.introduction,
    metrics,
    sections,
    takeaways: profile.takeaways,
    sourceLinks: coverage.officialSources,
    relatedLinks: profile.crossLinks,
  };
}

function buildFallbackMarkdown(
  code: string,
  coverage = REGULATOR_COVERAGE[code],
  structured = buildStructuredArticle(code),
): string {
  const currency = toCurrencyLabel(code, coverage.defaultCurrency);
  const lines: string[] = [
    `## ${coverage.fullName} Fines & Enforcement Guide`,
    "",
    structured.introduction,
    "",
    "### Coverage Summary",
    ...structured.metrics.map(
      (metric) =>
        `- **${metric.label}**: ${metric.value}${metric.note ? ` - ${metric.note}` : ""}`,
    ),
    "",
    "### Key Sections",
  ];

  for (const section of structured.sections) {
    lines.push(`#### ${section.heading}`);
    lines.push(section.intro);
    lines.push(...section.bullets.map((bullet) => `- ${bullet}`));
    lines.push("");
  }

  lines.push(
    "### Official Sources",
    ...structured.sourceLinks.map(
      (link) => `- [${link.label}](${link.url}) - ${link.description}`,
    ),
    "",
    "### Compliance Takeaways",
    ...structured.takeaways.map((item) => `- ${item}`),
    "",
    "### Related Reading",
    ...structured.relatedLinks.map(
      (link) => `- [${link.label}](${link.url}) - ${link.description}`,
    ),
    "",
    `Default currency used in the dashboard: ${currency}.`,
  );

  return lines.join("\n");
}

function buildFcaMarkdown(coverage = REGULATOR_COVERAGE.FCA): string {
  return `
## ${coverage.fullName} Fines & Enforcement Guide

The FCA remains the core benchmark for this dashboard. This guide summarises the public enforcement record, the main breach families, and the practical implications for UK-regulated firms.

### Coverage Summary

- **Period**: ${coverage.years}
- **Total Actions**: ${coverage.count}
- **Data Quality**: ${coverage.dataQuality}
- **Default Currency**: ${coverage.defaultCurrency}
- **Maturity**: ${coverage.maturity}

### What the FCA Enforces Most Hard

1. AML and financial crime controls
2. Market abuse and trading conduct
3. Systems and controls failures
4. Consumer protection and fair treatment
5. Senior manager accountability

### Why the FCA Article Stays in Markdown

The FCA article is intentionally left on the classic markdown path so the existing FCA-focused content, search indexing, and page rendering continue to behave exactly as before.

### Official Sources

- [FCA news and enforcement stories](https://www.fca.org.uk/news/news-stories)
- [FCA annual reports](https://www.fca.org.uk/publications/annual-reports)
- [FCA Handbook](https://www.handbook.fca.org.uk/)

### Practical Takeaways

- Use the FCA guide as the primary UK benchmark.
- Compare non-FCA regulators against FCA patterns where possible.
- Keep monitoring live FCA articles and year pages as the flagship content on the site.
`.trim();
}

function generateRegulatorBlog(code: string): BlogArticleMeta {
  const coverage = REGULATOR_COVERAGE[code];
  if (!coverage) throw new Error(`Unknown regulator: ${code}`);

  const structuredArticle =
    code === "FCA" ? undefined : buildStructuredArticle(code);
  const content =
    code === "FCA"
      ? buildFcaMarkdown(coverage)
      : buildFallbackMarkdown(code, coverage, structuredArticle);
  const readingTime = Math.max(
    Math.ceil(content.split(/\s+/).filter(Boolean).length / 180),
    1,
  );

  return {
    id: `${code.toLowerCase()}-enforcement-guide`,
    slug: `${code.toLowerCase()}-fines-enforcement-guide`,
    title: `${coverage.fullName} (${code}) Fines & Enforcement Guide`,
    seoTitle: `${code} Fines Database | ${coverage.fullName} Enforcement`,
    excerpt: `Complete guide to ${coverage.fullName} (${code}) fines and enforcement. ${coverage.count} actions tracked from ${coverage.years}. Analysis, trends, compliance insights.`,
    content,
    category: "Regulatory Intelligence",
    readTime: `${readingTime} min read`,
    date: PUBLICATION_DATE,
    dateISO: PUBLICATION_DATE_ISO,
    featured: code === "FCA",
    structuredArticle,
    keywords: [
      `${code} fines`,
      coverage.fullName,
      "regulatory enforcement",
      `${code} penalties`,
      coverage.country,
      "financial regulation",
      "compliance database",
      `${code} enforcement`,
    ],
  };
}

export const regulatorBlogs: BlogArticleMeta[] = BLOG_REGULATOR_CODES.map(
  (code) => generateRegulatorBlog(code),
);
