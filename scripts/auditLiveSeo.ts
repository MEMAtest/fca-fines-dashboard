const baseUrl = (process.argv[2] || "https://regactions.com").replace(/\/$/, "");

type CheckResult = {
  label: string;
  ok: boolean;
  detail?: string;
};

const results: CheckResult[] = [];

function record(label: string, ok: boolean, detail?: string) {
  results.push({ label, ok, detail });
}

async function fetchText(path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  return { response, text };
}

function countMatches(value: string, pattern: RegExp) {
  return (value.match(pattern) || []).length;
}

function rootIsEmpty(html: string) {
  return /<div id="root"><\/div>/.test(html);
}

function canonicalFor(html: string) {
  return html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/)?.[1] || "";
}

function robotsFor(html: string) {
  return html.match(/<meta\s+name="robots"\s+content="([^"]+)"/)?.[1] || "";
}

function xmlLocations(xml: string) {
  return Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g), (match) => match[1]);
}

async function loadSitemapDocuments(rootXml: string) {
  const childUrls = rootXml.includes("<sitemapindex") ? xmlLocations(rootXml) : [];
  if (childUrls.length === 0) {
    return [rootXml];
  }

  return Promise.all(
    childUrls.map(async (url) => {
      const response = await fetch(url, {
        headers: { "user-agent": "RegActionsSeoAudit/1.0" },
      });
      record(`child sitemap ${url} returns 200`, response.status === 200, `status=${response.status}`);
      return response.text();
    }),
  );
}

async function auditHtmlPage(path: string, expectedCanonical: string, requiredText: string) {
  const { response, text } = await fetchText(path, {
    headers: { "user-agent": "RegActionsSeoAudit/1.0" },
  });
  const labelPrefix = `html ${path}`;
  record(`${labelPrefix} returns 200`, response.status === 200, `status=${response.status}`);
  record(`${labelPrefix} has crawler body`, !rootIsEmpty(text), rootIsEmpty(text) ? "empty #root" : undefined);
  record(`${labelPrefix} has h1`, countMatches(text, /<h1\b/gi) >= 1);
  record(`${labelPrefix} has canonical`, canonicalFor(text) === expectedCanonical, canonicalFor(text));
  record(`${labelPrefix} is indexable`, robotsFor(text).includes("index"), robotsFor(text));
  record(`${labelPrefix} has JSON-LD`, countMatches(text, /application\/ld\+json/g) >= 1);
  record(`${labelPrefix} has required text`, text.includes(requiredText), requiredText);
}

async function main() {
  const robots = await fetchText("/robots.txt");
  record("robots.txt returns 200", robots.response.status === 200, `status=${robots.response.status}`);
  record("robots allows blog", robots.text.includes("Allow: /blog"));
  record("robots lists sitemap", robots.text.includes(`${baseUrl}/sitemap.xml`));

  const sitemap = await fetchText("/sitemap.xml");
  record("sitemap returns 200", sitemap.response.status === 200, `status=${sitemap.response.status}`);
  const sitemapDocuments = await loadSitemapDocuments(sitemap.text);
  const sitemapContent = sitemapDocuments.join("\n");
  const urlCount = countMatches(sitemapContent, /<url>/g);
  record("sitemap has at least 100 URLs", urlCount >= 100, `urls=${urlCount}`);
  record("sitemap includes blog", sitemapContent.includes(`${baseUrl}/blog`));
  record(
    "sitemap includes latest July article",
    sitemapContent.includes(`${baseUrl}/blog/wealth-managers-consumer-duty-enforcement`),
  );
  record(
    "sitemap excludes unapproved forensic article",
    !sitemapContent.includes(`${baseUrl}/blog/biggest-fine-h1-2026-forensic`),
  );
  record("sitemap excludes legacy dashboard", !sitemapContent.includes(`${baseUrl}/dashboard`));

  const missing = await fetchText("/fca-fines");
  record("unknown route returns HTTP 404", missing.response.status === 404, `status=${missing.response.status}`);
  record("unknown route is noindex", robotsFor(missing.text).includes("noindex"), robotsFor(missing.text));

  const rss = await fetchText("/rss.xml");
  record("rss returns 200", rss.response.status === 200, `status=${rss.response.status}`);
  record("rss has latest July article", rss.text.includes("wealth-managers-consumer-duty-enforcement"));
  record("rss excludes unapproved forensic article", !rss.text.includes("biggest-fine-h1-2026-forensic"));
  record("rss has at least 30 items", countMatches(rss.text, /<item>/g) >= 30);

  await auditHtmlPage(
    "/",
    `${baseUrl}/`,
    "Global Regulatory Fines &amp; Enforcement Intelligence",
  );
  await auditHtmlPage("/blog", `${baseUrl}/blog`, "Regulatory Insights");
  await auditHtmlPage(
    "/blog/wealth-managers-consumer-duty-enforcement",
    `${baseUrl}/blog/wealth-managers-consumer-duty-enforcement`,
    "Wealth Managers",
  );
  await auditHtmlPage("/regulators/fca", `${baseUrl}/regulators/fca`, "FCA Fines Database");

  const legacy = await fetch(`${baseUrl}/blog/payments-firm-fca-aml-enforcement`, {
    redirect: "follow",
  });
  record(
    "legacy payments slug resolves canonical URL",
    legacy.url === `${baseUrl}/blog/payments-firms-fca-aml-enforcement`,
    legacy.url,
  );

  for (const result of results) {
    const symbol = result.ok ? "PASS" : "FAIL";
    const suffix = result.detail ? ` (${result.detail})` : "";
    console.log(`${symbol} ${result.label}${suffix}`);
  }

  const failures = results.filter((result) => !result.ok);
  if (failures.length > 0) {
    console.error(`\nSEO audit failed: ${failures.length} checks failed.`);
    process.exit(1);
  }

  console.log(`\nSEO audit passed for ${baseUrl}.`);
}

main().catch((error) => {
  console.error("SEO audit failed:", error);
  process.exit(1);
});
