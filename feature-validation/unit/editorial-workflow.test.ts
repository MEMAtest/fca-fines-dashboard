import { describe, expect, test } from "vitest";
import {
  assertPublishableDraft,
  buildChartSpecs,
  buildDefaultImageSpecs,
  buildInitialEditorialManifest,
  contentHash,
  getHouseStyleIssues,
  isVerifiedPenaltyAmount,
  isOfficialRegulatorySource,
  makeAgentReview,
  makeHeadApproval,
  type EditorialDraftArtifact,
  type EditorialEvidenceRecord,
} from "../../scripts/lib/editorialWorkflow.js";

const verifiedRecord: EditorialEvidenceRecord = {
  id: "record-1",
  regulator: "FCA",
  firm_individual: "Example Bank plc",
  amount: 2_500_000,
  currency: "GBP",
  date_issued: "2026-07-01",
  breach_type: "Financial penalty for AML control failings",
  summary: "The FCA fined Example Bank plc £2.5 million for AML control failings.",
  notice_url: "https://www.fca.org.uk/news/press-releases/example",
  source_url: "https://www.fca.org.uk/news/press-releases/example",
  amount_verified: true,
};

function approvedDraft(): EditorialDraftArtifact {
  const article = {
    title: "What the Example Bank Penalty Means for Boards",
    excerpt: "The FCA action shows why boards need reliable evidence that financial crime controls work as intended, not simply proof that policies exist.",
    keywords: ["FCA", "AML", "boards", "controls", "enforcement"],
    content: "## Board significance\n\nThe FCA fined Example Bank plc after identifying AML control failings. The official notice is the primary evidence for this analysis.",
  };
  const manifest = buildInitialEditorialManifest({
    slug: "example-bank-penalty",
    article,
    articleType: "thematic",
    records: [verifiedRecord],
    generationModel: "test-model",
    promptVersion: "test-prompt",
  });
  const hash = contentHash(article);
  manifest.images = manifest.images.map((image) => ({ ...image, approved: true }));
  manifest.reviews = [
    makeAgentReview({ role: "regulatory-verifier-agent", model: "test-model", promptVersion: "test-prompt", passed: true, issues: [], hash }),
    makeAgentReview({ role: "copy-editor-agent", model: "test-model", promptVersion: "test-prompt", passed: true, issues: [], hash }),
    makeAgentReview({ role: "visual-editor-agent", model: "test-model", promptVersion: "test-prompt", passed: true, issues: [], hash }),
  ];
  manifest.headApproval = makeHeadApproval({
    approved: true,
    hash,
    model: "test-model",
    promptVersion: "test-prompt",
    rationale: "All evidence and editorial gates passed.",
  });
  manifest.status = "head_approved";
  return {
    ...article,
    id: "ai-example-bank-penalty",
    slug: "example-bank-penalty",
    seoTitle: `${article.title} | RegActions`,
    category: "Case Analysis",
    readTime: "5 min read",
    date: "10 July 2026",
    dateISO: "2026-07-10",
    status: "draft",
    generatedBy: "ai",
    generatedAt: "2026-07-10T00:00:00.000Z",
    articleType: "thematic",
    sourceRecords: [verifiedRecord],
    editorialManifest: manifest,
  };
}

describe("Editorial Engine evidence and publishing gates", () => {
  test("does not treat the DekaBank accounting figure as a penalty", () => {
    expect(isVerifiedPenaltyAmount({
      ...verifiedRecord,
      regulator: "BaFin",
      firm_individual: "DekaBank Deutsche Girozentrale",
      amount: 478_000_000,
      breach_type: "Financial Reporting Examination",
      summary: "BaFin opened an examination concerning a €478 million tax receivable in the 2024 accounts.",
    })).toBe(false);
  });

  test("accepts an amount described explicitly as a financial penalty", () => {
    expect(isVerifiedPenaltyAmount({ ...verifiedRecord })).toBe(true);
  });

  test("requires an official regulator domain before an amount can be verified", () => {
    expect(isOfficialRegulatorySource("https://www.fca.org.uk/news/press-releases/example")).toBe(true);
    expect(isOfficialRegulatorySource("https://example-news.test/fca-story")).toBe(false);
    expect(isVerifiedPenaltyAmount({
      ...verifiedRecord,
      notice_url: "https://example-news.test/fca-story",
      source_url: "https://example-news.test/fca-story",
    })).toBe(false);
  });

  test("builds charts only from source-verified penalty records", () => {
    const charts = buildChartSpecs("verified-penalties", "comparison", [
      verifiedRecord,
      { ...verifiedRecord, id: "record-2", firm_individual: "Second Bank plc", amount: 1_500_000 },
      { ...verifiedRecord, id: "record-3", firm_individual: "Examined Bank plc", amount: 99_000_000, amount_verified: false },
    ]);
    expect(charts).toHaveLength(1);
    expect(charts[0]?.sourceRecordIds).toEqual(["record-1", "record-2"]);
    expect(charts[0]?.data).toHaveLength(2);
  });

  test("uses official action counts when a required chart has no verified penalties", () => {
    const charts = buildChartSpecs("non-monetary-month", "monthly", [
      { ...verifiedRecord, id: "record-a", amount: 0, amount_verified: false, breach_type: "Permission cancellation" },
      { ...verifiedRecord, id: "record-b", amount: 0, amount_verified: false, breach_type: "Public censure" },
      { ...verifiedRecord, id: "record-c", amount: 0, amount_verified: false, breach_type: "Public censure" },
    ]);
    expect(charts).toHaveLength(1);
    expect(charts[0]?.series[0]?.format).toBe("count");
    expect(charts[0]?.sourceRecordIds).toEqual(["record-b", "record-c", "record-a"]);
  });

  test("uses branded covers for every article and AI illustration selectively", () => {
    expect(buildDefaultImageSpecs("monthly-example", "monthly").map((image) => image.purpose)).toEqual([
      "hero",
      "open_graph",
      "social_square",
      "social_portrait",
    ]);
    const thematic = buildDefaultImageSpecs("thematic-example", "thematic");
    expect(thematic.some((image) => image.generatedBy === "gpt-image-2" && image.purpose === "inline_illustration")).toBe(true);
  });

  test("hard-fails em dashes and non-UK spelling", () => {
    const issues = getHouseStyleIssues({
      title: "An enforcement update",
      excerpt: "A regulator focused on organizational behavior.",
      content: "The board should analyze the evidence — then prioritize remediation.",
    });
    expect(issues).toContain("Em dash detected");
    expect(issues.some((issue) => issue.startsWith("Non-UK spelling detected"))).toBe(true);
  });

  test("publishes only when all independent reviews approve the current hash", () => {
    expect(assertPublishableDraft(approvedDraft()).hash).toHaveLength(64);
  });

  test("rejects a stale approval after copy changes", () => {
    const draft = approvedDraft();
    draft.content += " A later change invalidates the approval.";
    expect(() => assertPublishableDraft(draft)).toThrow(/hash is stale|does not match/);
  });

  test("requires verified charts for data-led article types", () => {
    const draft = approvedDraft();
    draft.articleType = "monthly";
    expect(() => assertPublishableDraft(draft)).toThrow(/requires at least one verified chart/);
  });
});
