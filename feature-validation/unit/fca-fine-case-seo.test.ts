import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildFcaFineCasePageMeta,
  evaluateFcaFineCaseIndexability,
  renderPage,
  type FcaMonetaryCaseSeoRecord,
} from "../../scripts/prerender-seo.js";

const representativeCase: FcaMonetaryCaseSeoRecord = {
  caseId: "fca-2026-example-001",
  year: 2026,
  firm: "Example Bank plc",
  dateIssued: "2026-07-15",
  amount: 12_500_000,
  breach: "Systems and controls",
  summary:
    "The RegActions evidence record describes a monetary penalty and retains the FCA case source for direct verification.",
  sourceUrl: "https://www.fca.org.uk/news/press-releases/example-bank-fined",
  sourceStatus: "verified_detail",
  sourceCheckedAt: "2026-07-20T08:15:00.000Z",
  requiresAmountReview: false,
};

describe("FCA fine case prerender policy", () => {
  it("indexes a substantive, source-grounded monetary case", () => {
    expect(evaluateFcaFineCaseIndexability(representativeCase)).toEqual({
      indexable: true,
      reasons: [],
    });
    const meta = buildFcaFineCasePageMeta(representativeCase);
    expect(meta.path).toBe(
      "/fca-fines/2026/example-bank-plc/fca-2026-example-001",
    );
    expect(meta.noindex).toBe(false);
    expect(meta.includeInSitemap).toBe(true);
    expect(meta.dateModified).toBe("2026-07-20");
  });

  it("prerenders weak or unsafe records but keeps them out of search", () => {
    const weak = {
      ...representativeCase,
      caseId: "x",
      firm: "Unknown",
      amount: 0,
      summary: "",
      breach: "AML",
      sourceUrl: "https://example.com/not-an-fca-source",
      sourceStatus: "missing",
    };
    const result = evaluateFcaFineCaseIndexability(weak);
    expect(result.indexable).toBe(false);
    expect(result.reasons).toEqual(expect.arrayContaining([
      "unsafe_entity",
      "unsafe_case_id",
      "untrusted_amount",
      "missing_official_source",
      "case_source_not_specific",
      "thin_case_context",
    ]));
    const meta = buildFcaFineCasePageMeta(weak);
    expect(meta.noindex).toBe(true);
    expect(meta.includeInSitemap).toBe(false);
    expect(meta.bodyContent).toContain("excluded from search indexing");
  });

  it("renders unique canonical, breadcrumb, facts, schema and crawlable links", () => {
    const template = readFileSync(join(process.cwd(), "index.html"), "utf8");
    const meta = buildFcaFineCasePageMeta(representativeCase);
    const html = renderPage(template, meta);

    expect(html).toContain("<title>Example Bank plc FCA Fine: £12,500,000 (2026) | RegActions</title>");
    expect(html).toContain(
      '<link rel="canonical" href="https://regactions.com/fca-fines/2026/example-bank-plc/fca-2026-example-001" />',
    );
    expect(html).not.toContain('name="robots" content="noindex, follow"');
    expect(html).toContain("Example Bank plc FCA fine");
    expect(html).toContain("RegActions breach classification");
    expect(html).toContain('href="https://www.fca.org.uk/news/press-releases/example-bank-fined"');
    expect(html).toContain('href="/regulators/fca"');
    expect(html).toContain('href="/fines/actions?regulator=FCA&amp;year=2026"');
    expect(html).toContain('"@type":"Thing"');
    expect(html).toContain('"name":"FCA fines"');
  });
});
