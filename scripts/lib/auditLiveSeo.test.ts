import { describe, expect, it } from "vitest";
import { loadSitemapDocuments, xmlLocations } from "../auditLiveSeo.js";

describe("live SEO sitemap loader", () => {
  it("extracts trimmed locations and decodes XML entities", () => {
    expect(
      xmlLocations(`
        <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <sitemap><loc> https://regactions.com/sitemap-a.xml </loc></sitemap>
          <sitemap><loc>https://regactions.com/sitemap?part=1&amp;format=xml</loc></sitemap>
        </sitemapindex>
      `),
    ).toEqual([
      "https://regactions.com/sitemap-a.xml",
      "https://regactions.com/sitemap?part=1&format=xml",
    ]);
  });

  it("recursively loads nested indexes and returns their URL-set documents", async () => {
    const root = `
      <?xml version="1.0"?>
      <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <sitemap><loc>https://regactions.com/sitemap-primary.xml</loc></sitemap>
        <sitemap><loc>https://regactions.com/sitemap-secondary.xml</loc></sitemap>
      </sitemapindex>
    `;
    const responses = new Map([
      [
        "https://regactions.com/sitemap-primary.xml",
        `<sitemapindex><sitemap><loc>https://regactions.com/sitemap-blog.xml</loc></sitemap></sitemapindex>`,
      ],
      [
        "https://regactions.com/sitemap-secondary.xml",
        `<urlset><url><loc>https://regactions.com/fines</loc></url></urlset>`,
      ],
      [
        "https://regactions.com/sitemap-blog.xml",
        `<urlset><url><loc>https://regactions.com/blog</loc></url></urlset>`,
      ],
    ]);
    const requested: string[] = [];
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);
      requested.push(url);
      const body = responses.get(url);
      if (!body) throw new Error(`Unexpected sitemap request: ${url}`);
      return new Response(body, { status: 200 });
    };

    const documents = await loadSitemapDocuments(root, fetcher);

    expect(requested).toEqual([
      "https://regactions.com/sitemap-primary.xml",
      "https://regactions.com/sitemap-secondary.xml",
      "https://regactions.com/sitemap-blog.xml",
    ]);
    expect(documents).toHaveLength(2);
    expect(documents.join("\n")).toContain("https://regactions.com/fines");
    expect(documents.join("\n")).toContain("https://regactions.com/blog");
  });

  it("deduplicates cyclic child references instead of recursing forever", async () => {
    const responses = new Map([
      ["https://regactions.com/a.xml", `<sitemapindex><sitemap><loc>https://regactions.com/b.xml</loc></sitemap></sitemapindex>`],
      ["https://regactions.com/b.xml", `<sitemapindex><sitemap><loc>https://regactions.com/a.xml</loc></sitemap></sitemapindex>`],
    ]);
    const requested: string[] = [];
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);
      requested.push(url);
      return new Response(responses.get(url), { status: 200 });
    };

    expect(
      await loadSitemapDocuments(
        `<sitemapindex><sitemap><loc>https://regactions.com/a.xml</loc></sitemap></sitemapindex>`,
        fetcher,
      ),
    ).toEqual([]);
    expect(requested).toEqual(["https://regactions.com/a.xml", "https://regactions.com/b.xml"]);
  });
});
