import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  ARTICLE_REVISION_SLUGS,
  REQUIRED_REVISION_CHECKS,
  buildReviewedArticleRevisionPlan,
  contentHashFromMeta,
  readArticleMetaFromSource,
  replaceReviewedArticleSourceEntry,
  sha256,
  stableJsonHash,
} from "./articleRevisionPublisher.js";
import { buildArticleEvidenceContract } from "./articleEvidenceContract.js";
import { contentHash } from "./editorialWorkflow.js";

vi.mock("./articleQuality.js", () => ({
  getArticleQualityWordRange: () => ({ minimumWords: 500, maximumWords: 1000 }),
  runQualityGate: () => {
    const checks = ["word_count", "section_structure", "takeaway_structure", "data_accuracy", "amount_accuracy", "no_truncation", "no_duplicates", "no_hallucinated_firms", "no_internal_record_ids", "title_quality", "house_style", "data_usage", "specificity", "keyword_count", "editorial_tone", "readability", "article_evidence_contract", "grounded_cyber_topic"];
    return {
      passed: true,
      score: 100,
      requiredPassed: checks.length,
      requiredTotal: checks.length,
      softPassed: 0,
      softTotal: 0,
      checks: checks.map((id) => ({ id, passed: true, weight: "required", name: id, message: "test gate" })),
    };
  },
}));

let temporaryRoots: string[] = [];
afterEach(() => {
  for (const root of temporaryRoots) rmSync(root, { recursive: true, force: true });
  temporaryRoots = [];
});

const completedAt = "2026-10-21T15:00:00.000Z";

function makeRecord(id: string) {
  return {
    id,
    regulator: "FCA",
    firm_individual: "Northstar Ltd",
    amount: 0,
    currency: "GBP",
    amount_gbp: 0,
    date_issued: "2026-10-01",
    breach_type: "AML reporting failures",
    summary: "The FCA notice describes the record and its procedural status.",
    notice_url: "https://www.fca.org.uk/news/press-releases/sample-notice",
    source_url: "https://www.fca.org.uk/news/press-releases/sample-notice",
    amount_verified: false,
  };
}

function setupFixture() {
  const root = mkdtempSync(join(tmpdir(), "article-revision-plan-"));
  temporaryRoots.push(root);
  const directories = [
    "src/data",
    "scripts/data/published",
    "scripts/data/revisions/2026-10-21",
    "storage-audit",
  ];
  for (const directory of directories) mkdirSync(join(root, directory), { recursive: true });

  const revisions = [] as Array<Record<string, unknown>>;
  const sourceArticles: Array<Record<string, unknown>> = [];
  const sourceBundle: Record<string, unknown>[] = [];
  const candidateFiles = new Map<string, string>();
  const oldPublishedFiles = new Map<string, string>();

  for (const slug of ARTICLE_REVISION_SLUGS) {
    const recordIds = [`${slug}-record-1`, `${slug}-record-2`];
    const records = recordIds.map(makeRecord);
    const oldPublishedArtifact = {
      id: slug,
      slug,
      title: `Old title for ${slug}`,
      seoTitle: `Old SEO title for ${slug}`,
      excerpt: `Old excerpt for ${slug}.`,
      content: `Old body for ${slug}.`,
      category: "Enforcement",
      readTime: "1 min read",
      date: "5 October 2026",
      dateISO: "2026-10-05",
      keywords: ["old keyword", "compliance"],
      articleType: "thematic",
      status: "published",
      generatedBy: "ai",
      generatedAt: "2026-10-05T09:00:00.000Z",
      qualityReport: { passed: true, contentHash: "stale" },
      editorialManifest: { status: "published", headApproval: { reviewer: "old" } },
      publicationManifest: {
        version: 1,
        slug,
        contentHash: "old-hash",
        approvedBy: "head-editorial-agent",
        approvedAt: "2026-10-05T09:00:00.000Z",
        publishedBy: "publisher-agent",
        publishedAt: "2026-10-05T09:01:00.000Z",
        liveUrl: `https://regactions.com/blog/${slug}`,
      },
      sourceRecords: records,
    };
    const oldArtifactText = `${JSON.stringify(oldPublishedArtifact, null, 2)}\n`;
    const oldArtifactPath = join(root, "scripts/data/published", `${slug}.json`);
    writeFileSync(oldArtifactPath, oldArtifactText);
    oldPublishedFiles.set(slug, oldArtifactText);

    const candidate = {
      candidateStatus: "pending-root-QA",
      slug,
      title: `Reviewed title for ${slug}`,
      seoTitle: `Reviewed SEO title for ${slug}`,
      excerpt: `This reviewed excerpt describes the scope and evidence limits for ${slug} in a clear, complete sentence.`,
      content: `Reviewed body for ${slug}.`,
      dateISO: oldPublishedArtifact.dateISO,
      updatedAt: "2026-10-21",
      articleType: "evidence-brief",
      keywords: ["regulatory enforcement", "official notices", "compliance review", "source evidence", "supervisory action"],
      sourceRecordIds: recordIds,
    };
    const candidateText = `${JSON.stringify(candidate, null, 2)}\n`;
    const candidatePath = join(root, "scripts/data/revisions/2026-10-21", `${slug}.json`);
    writeFileSync(candidatePath, candidateText);
    candidateFiles.set(slug, candidateText);

    const parentContentHash = contentHashFromMeta(oldPublishedArtifact);
    const candidateContentHash = contentHash({
      title: candidate.title,
      excerpt: candidate.excerpt,
      keywords: candidate.keywords,
      content: candidate.content,
    });
    const contract = buildArticleEvidenceContract(records);
    const sourceContractHash = stableJsonHash(contract);
    sourceBundle.push({
      slug,
      parentArtifactSha256: sha256(oldArtifactText),
      sourceRecords: records,
      sourceChecks: records.map((record) => ({
        recordId: record.id,
        url: record.source_url,
        checkedAt: completedAt,
        verifiedFields: ["regulator", "firm_individual", "date_issued", "breach_type", "summary"],
        notes: "Checked official source for this test fixture.",
      })),
    });
    revisions.push({
      slug,
      candidatePath: `scripts/data/revisions/2026-10-21/${slug}.json`,
      candidateFileSha256: sha256(candidateText),
      candidateContentHash,
      parentContentHash,
      sourceContractHash,
      qaSummary: {
        identity: "root-primary-qa",
        completedAt,
        result: "passed",
        candidateContentHash,
        sourceContractHash,
        checks: REQUIRED_REVISION_CHECKS.map((id) => ({ id, passed: true })),
      },
    });
    sourceArticles.push(oldPublishedArtifact);
  }

  const bundleText = `${JSON.stringify({ version: 1, articles: sourceBundle }, null, 2)}\n`;
  const bundlePath = join(root, "storage-audit/source-bundle.json");
  writeFileSync(bundlePath, bundleText);
  const approvalRecord = {
    identity: "root-primary-qa",
    result: "passed",
    completedAt,
    candidateContentHashes: Object.fromEntries(revisions.map((revision) => [String(revision.slug), revision.candidateContentHash])),
    sourceBundleSha256: sha256(bundleText),
    checks: REQUIRED_REVISION_CHECKS.map((id) => ({ id, passed: true })),
  };
  const approvalRecordText = `${JSON.stringify(approvalRecord, null, 2)}\n`;
  const approvalRecordPath = join(root, "storage-audit/qa-record.json");
  writeFileSync(approvalRecordPath, approvalRecordText);
  const approval = {
    version: 1,
    kind: "article-revision-approval",
    approvedAt: completedAt,
    approvalOwner: "root-primary-qa",
    approvalRecord: { path: "storage-audit/qa-record.json", sha256: sha256(approvalRecordText) },
    sourceBundle: { path: "storage-audit/source-bundle.json", sha256: sha256(bundleText) },
    revisions,
  };
  const approvalText = `${JSON.stringify(approval, null, 2)}\n`;
  const approvalPath = join(root, "storage-audit/approval.json");
  writeFileSync(approvalPath, approvalText);

  const blogArticlesText = `const baseBlogArticles: BlogArticleMeta[] = [\n${sourceArticles.map((article) => `  ${JSON.stringify(article, null, 2).replaceAll("\n", "\n  ")}`).join(",\n")}\n];\n`;
  const blogArticlesPath = join(root, "src/data/blogArticles.ts");
  writeFileSync(blogArticlesPath, blogArticlesText);
  const originalInputs = new Map<string, string>([
    [blogArticlesPath, blogArticlesText],
    ...ARTICLE_REVISION_SLUGS.map((slug) => [join(root, "scripts/data/published", `${slug}.json`), oldPublishedFiles.get(slug)!] as [string, string]),
    ...ARTICLE_REVISION_SLUGS.map((slug) => [join(root, "scripts/data/revisions/2026-10-21", `${slug}.json`), candidateFiles.get(slug)!] as [string, string]),
    [bundlePath, bundleText],
  ]);

  return {
    root,
    approval,
    approvalRecord,
    approvalRecordPath,
    approvalPath,
    bundle: { version: 1, articles: sourceBundle },
    bundlePath,
    blogArticlesPath,
    originalInputs,
    candidateFiles,
  };
}

function writeJson(path: string, value: unknown) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function saveApproval(fixture: ReturnType<typeof setupFixture>) {
  writeJson(fixture.approvalPath, fixture.approval);
}

function rebindSourceBundle(fixture: ReturnType<typeof setupFixture>) {
  const bundleText = `${JSON.stringify(fixture.bundle, null, 2)}\n`;
  writeFileSync(fixture.bundlePath, bundleText);
  fixture.approval.sourceBundle = { path: "storage-audit/source-bundle.json", sha256: sha256(bundleText) };
  fixture.approvalRecord.sourceBundleSha256 = sha256(bundleText);
  writeJson(fixture.approvalRecordPath, fixture.approvalRecord);
  fixture.approval.approvalRecord = {
    path: "storage-audit/qa-record.json",
    sha256: sha256(readFileSync(fixture.approvalRecordPath)),
  };
  saveApproval(fixture);
}

function plan(fixture: ReturnType<typeof setupFixture>) {
  return buildReviewedArticleRevisionPlan({
    root: fixture.root,
    blogArticlesPath: fixture.blogArticlesPath,
    approvalManifestPath: fixture.approvalPath,
  });
}

describe("controlled article revision publisher", () => {
  it("keeps the revision allowlist and deterministic required checks explicit", () => {
    expect(ARTICLE_REVISION_SLUGS).toEqual([
      "aml-kyc-enforcement-trends",
      "cyber-operational-resilience-enforcement",
      "regulatory-roundup-october-2026",
    ]);
    expect(REQUIRED_REVISION_CHECKS).toContain("article_evidence_contract");
    expect(REQUIRED_REVISION_CHECKS).toContain("grounded_cyber_topic");
    expect(new Set(REQUIRED_REVISION_CHECKS).size).toBe(REQUIRED_REVISION_CHECKS.length);
  });

  it("uses byte-stable SHA-256 bindings", () => {
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(stableJsonHash({ version: 1, recordIds: ["a"] })).toBe(sha256('{"version":1,"recordIds":["a"]}'));
  });

  it("keeps unrelated source entries byte-identical and round-trips candidate content/keyword hashes", () => {
    const unrelated = `  { id: "keep", slug: "keep", title: "Untouched", content: "same" }`;
    const source = `const baseBlogArticles: BlogArticleMeta[] = [\n${unrelated},\n  { id: "target", slug: "aml-kyc-enforcement-trends", title: "Old", seoTitle: "Old SEO", excerpt: "Old excerpt", content: "Old body", date: "1 January 2020", dateISO: "2020-01-01", keywords: ["old"], editorialManifest: { status: "head_approved" }, publicationManifest: { approvedBy: "head-editorial-agent" } },\n];\n`;
    const values = { title: "Revised title", excerpt: "Revised excerpt", content: "Revised body", keywords: ["new evidence"], dateModified: "2026-10-21T12:00:00.000Z", revisionManifest: { version: 1 } };
    const result = replaceReviewedArticleSourceEntry(source, "aml-kyc-enforcement-trends", values, new Set(["editorialManifest", "publicationManifest"]));

    expect(result).toContain(unrelated);
    expect(result).toContain('title: "Revised title"');
    expect(result).toContain('keywords: ["new evidence"]');
    expect(result).not.toContain("editorialManifest");
    expect(result).not.toContain("publicationManifest");
    expect(contentHashFromMeta(readArticleMetaFromSource(result, "aml-kyc-enforcement-trends"))).toBe(contentHashFromMeta(values));
  });

  it("creates a complete four-file dry-run plan without changing any inputs", () => {
    const fixture = setupFixture();
    const planResult = plan(fixture);
    expect(planResult.items).toHaveLength(3);
    expect(planResult.outputFiles).toHaveLength(4);
    expect(planResult.outputFiles.map((file) => file.path)).toContain(fixture.blogArticlesPath);
    for (const [path, original] of fixture.originalInputs) expect(readFileSync(path, "utf8")).toBe(original);
    for (const file of planResult.outputFiles.filter((entry) => entry.path.includes("scripts/data/published/"))) {
      const output = JSON.parse(file.contents);
      expect(output.candidateStatus).toBeUndefined();
      expect(output.editorialManifest).toBeUndefined();
      expect(output.publicationManifest).toBeUndefined();
      expect(output.qualityReport).toBeUndefined();
      expect(output.updatedAt).toBe("2026-10-21");
      expect(output.dateModified).toBe(completedAt);
      expect(output.revisionManifest.publicationHistory[0].publishedAt).toBe("2026-10-05T09:01:00.000Z");
      expect(contentHashFromMeta(output)).toBe(output.revisionManifest.contentHash);
    }
  });

  it.each([
    ["stale parent hash", (fixture: ReturnType<typeof setupFixture>) => { fixture.approval.revisions[0].parentContentHash = "0".repeat(64); saveApproval(fixture); }],
    ["stale candidate digest", (fixture: ReturnType<typeof setupFixture>) => {
      const path = join(fixture.root, "scripts/data/revisions/2026-10-21", `${ARTICLE_REVISION_SLUGS[0]}.json`);
      writeFileSync(path, `${readFileSync(path, "utf8")} `);
    }],
    ["stale bundle digest", (fixture: ReturnType<typeof setupFixture>) => { writeFileSync(fixture.bundlePath, `${readFileSync(fixture.bundlePath, "utf8")} `); }],
    ["omitted per-article check", (fixture: ReturnType<typeof setupFixture>) => {
      (fixture.approval.revisions[0].qaSummary as { checks: unknown[] }).checks.pop();
      saveApproval(fixture);
    }],
    ["failed primary QA", (fixture: ReturnType<typeof setupFixture>) => {
      (fixture.approval.revisions[0].qaSummary as { result: string }).result = "failed";
      saveApproval(fixture);
    }],
    ["missing selected source check", (fixture: ReturnType<typeof setupFixture>) => {
      (fixture.bundle.articles[0].sourceChecks as unknown[]).pop();
      rebindSourceBundle(fixture);
    }],
  ])("fails closed on %s without writing", (_case, mutate) => {
    const fixture = setupFixture();
    mutate(fixture);
    expect(() => plan(fixture)).toThrow(/revision rejected/);
    for (const [path, original] of fixture.originalInputs) {
      if (path.endsWith("/approval.json") || path.endsWith("/source-bundle.json") || path.endsWith("/qa-record.json")) continue;
      if (path.includes("scripts/data/revisions")) continue;
      if (path.includes("scripts/data/published")) expect(readFileSync(path, "utf8")).toBe(original);
    }
  });

  it("fails closed when a target is absent or duplicated", () => {
    const missing = "const baseBlogArticles: BlogArticleMeta[] = [];";
    expect(() => replaceReviewedArticleSourceEntry(missing, ARTICLE_REVISION_SLUGS[0], {}, new Set()))
      .toThrow(/expected one base article/);
    const duplicate = `const baseBlogArticles: BlogArticleMeta[] = [{ slug: "${ARTICLE_REVISION_SLUGS[0]}" }, { slug: "${ARTICLE_REVISION_SLUGS[0]}" }];`;
    expect(() => replaceReviewedArticleSourceEntry(duplicate, ARTICLE_REVISION_SLUGS[0], {}, new Set()))
      .toThrow(/expected one base article/);
  });
});
