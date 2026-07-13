import { describe, expect, test } from "vitest";
import {
  assertPublishableDraft,
  applyVisualReviewApprovals,
  buildChartSpecs,
  buildDefaultImageSpecs,
  buildDeterministicClaims,
  buildInitialEditorialManifest,
  buildSourceEvidence,
  contentHash,
  getHouseStyleIssues,
  isVerifiedPenaltyAmount,
  isOfficialRegulatorySource,
  makeAgentReview,
  makeHeadApproval,
  normaliseToHouseStyle,
  type EditorialDraftArtifact,
  type EditorialEvidenceRecord,
} from "../../scripts/lib/editorialWorkflow.js";
import {
  EDITORIAL_MODELS,
  claimUsesOnlyArticleAmounts,
  claimMakesNoAmountButSourceConfirmsPenalty,
  headEditorialArticlePayload,
  normaliseVerifierClaimIdentity,
  quotedObjectionAppearsInSources,
  structuredDateSupportsClaim,
  verifierClaimsContainUnknownSources,
} from "../../scripts/lib/editorialAgents.js";

const verifiedRecord: EditorialEvidenceRecord = {
  id: "record-1",
  regulator: "FCA",
  firm_individual: "Example Bank plc",
  amount: 2_500_000,
  currency: "GBP",
  amount_gbp: 2_500_000,
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
  test("ignores verifier-only amounts that the article never claimed", () => {
    expect(claimUsesOnlyArticleAmounts(
      "The FMA imposed a €375,000 fine.",
      "The FMA imposed a non-quantified sanction.",
    )).toBe(false);
    expect(claimUsesOnlyArticleAmounts(
      "The FMA imposed a EUR 375,000 fine.",
      "The article records an FMA fine of €375K.",
    )).toBe(true);
  });

  test("normalises decimal-comma magnitude amounts before evidence checks", () => {
    expect(normaliseToHouseStyle("The FCA imposed a GBP 44,0 million fine.")).toBe(
      "The FCA imposed a GBP 44.0 million fine.",
    );
    expect(normaliseToHouseStyle("The regulator imposed EUR 1,5 billion.")).toBe(
      "The regulator imposed EUR 1.5 billion.",
    );
    expect(normaliseToHouseStyle("The action resulted in an unverified settlement.")).toBe(
      "The action resulted in a settlement whose monetary amount was not verified against the source record.",
    );
  });

  test("normalises verifier record prefixes and explicit enforcement findings", () => {
    const sourceId = "source:record-1";
    const claim = normaliseVerifierClaimIdentity({
      id: "claim-1",
      text: "The FCA fined Example Bank plc for AML control failings.",
      kind: "finding",
      sourceIds: [sourceId],
      recordIds: ["record:record-1"],
      verdict: "verified",
      verifier: "regulatory-verifier-agent",
      notes: "The official notice confirms the action.",
    }, new Map([[sourceId, {
      id: sourceId,
      url: "https://www.fca.org.uk/news/press-releases/example",
      title: "FCA action concerning Example Bank plc",
      publisher: "FCA",
      sourceType: "official_notice",
      retrievedAt: "2026-07-13T00:00:00.000Z",
      official: true,
      excerpt: "The FCA imposed a financial penalty.",
    }]]));

    expect(claim.kind).toBe("action_type");
    expect(claim.recordIds).toEqual(["record-1"]);
  });

  test("fails closed on missing or truncated verifier source IDs", () => {
    const sources = new Map([["source:record-1", {
      id: "source:record-1",
      url: "https://www.fca.org.uk/news/press-releases/example",
      title: "Example",
      publisher: "FCA",
      sourceType: "official_notice" as const,
      retrievedAt: "2026-07-13T00:00:00.000Z",
      official: true,
      excerpt: "Official evidence.",
    }]]);
    const baseClaim = {
      id: "claim-1",
      text: "The FCA fined Example Bank plc.",
      kind: "action_type" as const,
      recordIds: ["record-1"],
      verdict: "verified" as const,
      verifier: "regulatory-verifier-agent" as const,
      notes: "Verified.",
    };
    expect(verifierClaimsContainUnknownSources([{ ...baseClaim, sourceIds: ["source:record-1"] }], sources)).toBe(false);
    expect(verifierClaimsContainUnknownSources([{ ...baseClaim, sourceIds: ["source:rec"] }], sources)).toBe(true);
    expect(verifierClaimsContainUnknownSources([{ ...baseClaim, sourceIds: [] }], sources)).toBe(true);
  });

  test("preserves deterministic Satori approval while requiring explicit AI-image approval", () => {
    const images = buildDefaultImageSpecs("example-analysis", "thematic", "Example analysis");
    const aiImage = images.find((image) => image.generatedBy === "openrouter-image")!;
    const withoutAiApproval = applyVisualReviewApprovals(images, []);
    expect(withoutAiApproval.filter((image) => image.generatedBy === "satori").every((image) => image.approved)).toBe(true);
    expect(withoutAiApproval.find((image) => image.id === aiImage.id)?.approved).toBe(false);

    const withAiApproval = applyVisualReviewApprovals(images, [aiImage.id]);
    expect(withAiApproval.find((image) => image.id === aiImage.id)?.approved).toBe(true);
  });

  test("limits the head-editor payload to final article copy", () => {
    const payload = headEditorialArticlePayload({
      title: "Example final article",
      excerpt: "A sufficiently detailed final excerpt for the head editor to assess without receiving internal audit state or pre-copy content hashes.",
      keywords: ["FCA", "enforcement", "governance", "controls", "boards"],
      content: "## Overview\n\nFinal article copy.",
      editorialManifest: { reviews: [{ contentHash: "pre-copy-hash" }] },
    } as never);
    expect(payload).toEqual({
      title: "Example final article",
      excerpt: "A sufficiently detailed final excerpt for the head editor to assess without receiving internal audit state or pre-copy content hashes.",
      keywords: ["FCA", "enforcement", "governance", "controls", "boards"],
      content: "## Overview\n\nFinal article copy.",
    });
    expect(JSON.stringify(payload)).not.toContain("pre-copy-hash");
  });

  test("uses separate conservative and final OpenRouter verifier defaults", () => {
    const previous = {
      provider: process.env.EDITORIAL_PROVIDER,
      legacy: process.env.EDITORIAL_REGULATORY_MODEL,
      initial: process.env.EDITORIAL_INITIAL_REGULATORY_MODEL,
      final: process.env.EDITORIAL_FINAL_REGULATORY_MODEL,
    };
    process.env.EDITORIAL_PROVIDER = "openrouter";
    delete process.env.EDITORIAL_REGULATORY_MODEL;
    delete process.env.EDITORIAL_INITIAL_REGULATORY_MODEL;
    delete process.env.EDITORIAL_FINAL_REGULATORY_MODEL;
    expect(EDITORIAL_MODELS.regulatoryInitial).toBe("mistralai/mistral-small-3.2-24b-instruct");
    expect(EDITORIAL_MODELS.regulatoryFinal).toBe("openai/gpt-4.1-mini");
    for (const [key, value] of Object.entries(previous)) {
      const envKey = key === "provider"
        ? "EDITORIAL_PROVIDER"
        : key === "legacy"
          ? "EDITORIAL_REGULATORY_MODEL"
          : key === "initial"
            ? "EDITORIAL_INITIAL_REGULATORY_MODEL"
            : "EDITORIAL_FINAL_REGULATORY_MODEL";
      if (value === undefined) delete process.env[envKey];
      else process.env[envKey] = value;
    }
  });

  test("does not reject an unquantified penalty merely because its amount is absent", () => {
    const source = {
      ...buildSourceEvidence([verifiedRecord])[0]!,
      excerpt: "Official evidence record date: 2026-07-01. Evidence summary: The regulator imposed a financial penalty for AML contraventions.",
    };
    const sources = new Map([[source.id, source]]);
    expect(claimMakesNoAmountButSourceConfirmsPenalty({
      text: "The regulator imposed a financial penalty for AML contraventions.",
      notes: "The official notice does not specify the amount of the financial penalty.",
      sourceIds: [source.id],
    }, sources)).toBe(true);
    expect(claimMakesNoAmountButSourceConfirmsPenalty({
      text: "The regulator imposed a USD 1 million financial penalty.",
      notes: "The official notice does not specify the amount of the financial penalty.",
      sourceIds: [source.id],
    }, sources)).toBe(false);
  });

  test("uses the structured official date when a verifier invents a conflicting year", () => {
    const source = buildSourceEvidence([verifiedRecord])[0]!;
    expect(structuredDateSupportsClaim({
      text: "In July 2026, the FCA fined Example Bank plc.",
      notes: "The article date July 2026 contradicts the source, which indicates the action was in 2024.",
      sourceIds: [source.id],
    }, new Map([[source.id, source]]))).toBe(true);
    expect(structuredDateSupportsClaim({
      text: "In June 2026, the FCA fined Example Bank plc.",
      notes: "The article date June 2026 contradicts the source date.",
      sourceIds: [source.id],
    }, new Map([[source.id, source]]))).toBe(false);
    expect(structuredDateSupportsClaim({
      text: "In July 2026, the FCA fined Example Bank plc.",
      notes: "The claim that the fine was in July 2026 is not directly supported because the source only provides the official evidence record date.",
      sourceIds: [source.id],
    }, new Map([[source.id, source]]))).toBe(true);
  });

  test("recognises disputed wording that is present verbatim in the structured source", () => {
    const source = {
      ...buildSourceEvidence([verifiedRecord])[0]!,
      excerpt: "Official evidence record date: 2026-07-01. Evidence summary: We imposed a cancellation in the consumer credit sector.",
    };
    expect(quotedObjectionAppearsInSources({
      notes: "The source confirms cancellation but does not explicitly state 'in the consumer credit sector'.",
      sourceIds: [source.id],
    }, new Map([[source.id, source]]))).toBe(true);
  });

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

  test("does not promote unverified figures into claims or review excerpts", () => {
    const unverified = {
      ...verifiedRecord,
      amount_verified: false,
      summary: "A regulator release referred to a $500 million estimate and AED 10 million, not a verified penalty.",
    };
    const claims = buildDeterministicClaims([unverified]);
    expect(claims.filter((claim) => claim.kind === "amount")).toHaveLength(0);
    const excerpt = buildSourceEvidence([unverified])[0]?.excerpt;
    expect(excerpt).not.toContain("$500 million");
    expect(excerpt).not.toContain("AED 10 million");
    expect(excerpt).toContain(`Official evidence record date: ${unverified.date_issued}`);
    expect(buildSourceEvidence([verifiedRecord])[0]?.excerpt).toContain(
      `Verified penalty amount: ${verifiedRecord.currency} ${verifiedRecord.amount}`,
    );
  });

  test("builds charts only from source-verified penalty records", () => {
    const charts = buildChartSpecs("verified-penalties", "comparison", [
      verifiedRecord,
      { ...verifiedRecord, id: "record-2", firm_individual: "Second Bank plc", amount: 1_500_000, amount_gbp: 1_500_000 },
      { ...verifiedRecord, id: "record-3", firm_individual: "Examined Bank plc", amount: 99_000_000, amount_gbp: 99_000_000, amount_verified: false },
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
    expect(thematic.some((image) => image.generatedBy === "openrouter-image" && image.purpose === "inline_illustration")).toBe(true);
  });

  test("hard-fails em dashes and non-UK spelling", () => {
    const issues = getHouseStyleIssues({
      title: "An enforcement update",
      excerpt: "A regulator focused on organizational behavior.",
      content: "The board should analyze the evidence — then prioritize remediation and scrutinize unauthorised programmes.",
    });
    expect(issues).toContain("Em dash detected");
    expect(issues.some((issue) => issue.startsWith("Non-UK spelling detected"))).toBe(true);
  });

  test("rejects hype language in editorial metadata", () => {
    const issues = getHouseStyleIssues({
      title: "A global enforcement crackdown",
      excerpt: "A sufficiently detailed description of recent enforcement activity and the evidence available to senior regulatory and compliance professionals.",
      content: "## Evidence\n\nThe official actions establish the factual position.",
    });
    expect(issues).toContain("Prohibited phrase detected: crackdown");
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
