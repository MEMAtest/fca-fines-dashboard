import { describe, expect, it } from "vitest";

import {
  generateSitemapDocuments,
  generateSitemapUrlset,
  sitemapLastmod,
  sitemapSectionForPath,
} from "../../scripts/prerender-seo.js";

function page(path: string, overrides: Record<string, unknown> = {}) {
  return {
    path,
    title: path,
    description: `${path} description`,
    keywords: path,
    ogType: "website",
    ...overrides,
  } as any;
}

describe("prerender sitemap policy", () => {
  it("segments URLs into diagnostic sitemap sections", () => {
    expect(sitemapSectionForPath("/regulators/fca")).toBe("regulators");
    expect(sitemapSectionForPath("/fca-fines/2026/example-bank/case-1")).toBe("fca-fines");
    expect(sitemapSectionForPath("/topics/fca-fines-2026")).toBe("editorial");
    expect(sitemapSectionForPath("/blog/fca-fines-database-how-to-search")).toBe("editorial");
    expect(sitemapSectionForPath("/countries/united-kingdom")).toBe("country-risk");
    expect(sitemapSectionForPath("/firms/example-bank-123456")).toBe("entities");
    expect(sitemapSectionForPath("/fines")).toBe("core");
  });

  it("publishes the dedicated FCA fines sitemap only when an indexable case exists", () => {
    const empty = generateSitemapDocuments([
      page("/"),
      page("/fca-fines/2026/thin-firm/case-1", {
        noindex: true,
        includeInSitemap: false,
      }),
    ]);
    expect(empty.has("sitemap-fca-fines.xml")).toBe(false);
    expect(empty.get("sitemap.xml")).not.toContain("sitemap-fca-fines.xml");

    const populated = generateSitemapDocuments([
      page("/"),
      page("/fca-fines/2026/example-bank/case-2", {
        dateModified: "2026-07-20",
      }),
      page("/fca-fines/2026/thin-firm/case-1", {
        noindex: true,
        includeInSitemap: false,
      }),
    ]);
    expect(populated.get("sitemap.xml")).toContain("sitemap-fca-fines.xml");
    expect(populated.get("sitemap-fca-fines.xml")).toContain(
      "https://regactions.com/fca-fines/2026/example-bank/case-2",
    );
    expect(populated.get("sitemap-fca-fines.xml")).not.toContain("thin-firm");
  });

  it("keeps noindex and explicitly deferred pages out of every sitemap", () => {
    const documents = generateSitemapDocuments([
      page("/"),
      page("/regulators/fca", { dateModified: "2026-07-16" }),
      page("/firms/thin-firm-123456", {
        noindex: true,
        includeInSitemap: false,
      }),
      page("/countries/compare/a-vs-b", { includeInSitemap: false }),
    ]);

    expect(documents.get("sitemap.xml")).toContain("sitemap-core.xml");
    expect(documents.get("sitemap.xml")).toContain("sitemap-regulators.xml");
    expect(documents.get("sitemap-regulators.xml")).toContain(
      "https://regactions.com/regulators/fca",
    );

    const allXml = [...documents.values()].join("\n");
    expect(allXml).not.toContain("thin-firm-123456");
    expect(allXml).not.toContain("a-vs-b");
  });

  it("emits only verified full-date lastmod values", () => {
    const xml = generateSitemapUrlset([
      page("/regulators/fca", { dateModified: "2026-07-16" }),
      page("/regulators/bafin", { dateModified: "2026" }),
      page("/about"),
    ]);

    expect(xml).toContain("<lastmod>2026-07-16</lastmod>");
    expect(xml).not.toContain("<lastmod>2026</lastmod>");
    expect(xml).not.toContain("<priority>");
    expect(xml).not.toContain("<changefreq>");
    expect(sitemapLastmod(page("/undated"))).toBeNull();
  });
});
