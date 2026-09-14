import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { readSitemapSubmissionConfig } from "./searchConsoleSitemapSubmission.js";
import {
  getSitemap,
  submitSitemap,
  sitemapCollectionUrl,
  sitemapUrl,
} from "./searchConsoleSitemap.js";

describe("Search Console sitemap submission", () => {
  it("URL-encodes both the configured property and feed path", () => {
    expect(sitemapCollectionUrl("sc-domain:regactions.com")).toBe(
      "https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Aregactions.com/sitemaps",
    );
    expect(sitemapUrl("https://example.com/", "https://regactions.com/sitemap.xml")).toBe(
      "https://www.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fexample.com%2F/sitemaps/https%3A%2F%2Fregactions.com%2Fsitemap.xml",
    );
  });

  it("submits with PUT and verifies with an authenticated GET", async () => {
    const requests: Array<[string, RequestInit | undefined]> = [];
    const fetcher: typeof fetch = async (input, init) => {
      requests.push([String(input), init]);
      if (requests.length === 1) return new Response(null, { status: 204 });
      return new Response(
        JSON.stringify({ path: "https://regactions.com/sitemap.xml", isPending: false }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    await submitSitemap("token-value", "sc-domain:regactions.com", "https://regactions.com/sitemap.xml", fetcher);
    const result = await getSitemap(
      "token-value",
      "sc-domain:regactions.com",
      "https://regactions.com/sitemap.xml",
      fetcher,
    );

    expect(result).toMatchObject({ path: "https://regactions.com/sitemap.xml", isPending: false });
    expect(requests).toHaveLength(2);
    expect(requests[0][0]).toBe(sitemapUrl("sc-domain:regactions.com", "https://regactions.com/sitemap.xml"));
    expect(requests[0][1]).toMatchObject({
      method: "PUT",
      headers: { authorization: "Bearer token-value" },
    });
    expect(requests[1][1]).toMatchObject({
      method: "GET",
      headers: { authorization: "Bearer token-value" },
    });
  });

  it("fails closed on non-success submission and verification responses", async () => {
    const response = async () => new Response(null, { status: 403 });
    await expect(
      submitSitemap("token", "property", "https://regactions.com/sitemap.xml", response),
    ).rejects.toThrow("submission failed (403)");
    await expect(
      getSitemap("token", "property", "https://regactions.com/sitemap.xml", response),
    ).rejects.toThrow("verification failed (403)");
  });

  it.each([
    ["SC_PROPERTY", { SITEMAP_URL: "https://regactions.com/sitemap.xml", SC_CREDENTIALS_JSON: '{"client_email":"bot@example.com","private_key":"key"}' }],
    ["SITEMAP_URL", { SC_PROPERTY: "sc-domain:regactions.com", SC_CREDENTIALS_JSON: '{"client_email":"bot@example.com","private_key":"key"}' }],
    ["SC_CREDENTIALS_JSON", { SC_PROPERTY: "sc-domain:regactions.com", SITEMAP_URL: "https://regactions.com/sitemap.xml" }],
  ])("fails closed when %s is missing", (_missing, env) => {
    expect(() => readSitemapSubmissionConfig(env)).toThrow(/required/);
  });

  it("keeps sitemap submission manual-only and credential-backed", () => {
    const workflow = readFileSync(
      ".github/workflows/submit-search-console-sitemap.yml",
      "utf8",
    );
    expect(workflow).toContain("workflow_dispatch: {}");
    expect(workflow).not.toContain("schedule:");
    expect(workflow).toContain("SC_PROPERTY: ${{ secrets.SC_PROPERTY }}");
    expect(workflow).toContain("SC_CREDENTIALS_JSON: ${{ secrets.SC_CREDENTIALS_JSON }}");
    expect(workflow).toContain("SITEMAP_URL: https://regactions.com/sitemap.xml");
    expect(workflow).not.toContain("echo $SC_CREDENTIALS_JSON");
  });
});
