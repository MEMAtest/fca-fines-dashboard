import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import {
  buildArticleEvidenceContract,
  getArticleEvidenceContractIssues,
} from "./articleEvidenceContract.js";
import type { ArticleEvidenceContract } from "../../src/types/editorial.js";
import type { EnforcementRecord } from "./articleData.js";
import {
  contentHash,
  isOfficialRegulatorySource,
} from "./editorialWorkflow.js";
import {
  getArticleQualityWordRange,
  runQualityGate,
} from "./articleQuality.js";
import type {
  ArticleRevisionApprovalManifest,
  ArticleRevisionApprovalRecord,
  ArticleRevisionManifest,
} from "../../src/types/articleRevision.js";

export const ARTICLE_REVISION_SLUGS = [
  "aml-kyc-enforcement-trends",
  "cyber-operational-resilience-enforcement",
  "regulatory-roundup-october-2026",
] as const;

export const REQUIRED_REVISION_CHECKS = [
  "word_count",
  "section_structure",
  "takeaway_structure",
  "data_accuracy",
  "amount_accuracy",
  "no_truncation",
  "no_duplicates",
  "no_hallucinated_firms",
  "no_internal_record_ids",
  "title_quality",
  "house_style",
  "data_usage",
  "specificity",
  "keyword_count",
  "editorial_tone",
  "readability",
  "article_evidence_contract",
  "grounded_cyber_topic",
] as const;

const CANDIDATE_ROOT = "scripts/data/revisions/2026-10-21";

export interface RevisionCandidate {
  slug: string;
  title: string;
  seoTitle: string;
  excerpt: string;
  content: string;
  dateISO: string;
  updatedAt: string;
  articleType: "evidence-brief";
  keywords: string[];
  sourceRecordIds: string[];
}

export interface RevisionSourceBundle {
  version: 1;
  articles: Array<{
    slug: string;
    parentArtifactSha256: string;
    sourceRecords: EnforcementRecord[];
    sourceChecks: Array<{
      recordId: string;
      url: string;
      checkedAt: string;
      verifiedFields: string[];
      notes: string;
    }>;
  }>;
}

export interface RevisionPlanItem {
  slug: string;
  parentContentHash: string;
  candidateContentHash: string;
  sourceContractHash: string;
  candidate: RevisionCandidate;
  sourceRecords: EnforcementRecord[];
  revisionManifest: ArticleRevisionManifest;
}

export interface RevisionOutputFile {
  path: string;
  baselineSha256: string;
  outputSha256: string;
  contents: string;
}

export interface RevisionPlan {
  approvalManifestSha256: string;
  inputSourceSha256: string;
  outputSourceSha256: string;
  outputSource: string;
  outputFiles: RevisionOutputFile[];
  items: RevisionPlanItem[];
}

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function stableJsonHash(value: unknown): string {
  return sha256(JSON.stringify(value));
}

function fail(message: string): never {
  throw new Error(`Reviewed article revision rejected: ${message}`);
}

function readUtf8(path: string): string {
  return readFileSync(path, "utf8");
}

function getArray(source: string, name: string) {
  const file = ts.createSourceFile("blogArticles.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (declaration.name.getText(file) === name && declaration.initializer && ts.isArrayLiteralExpression(declaration.initializer)) {
        return { file, array: declaration.initializer };
      }
    }
  }
  fail(`could not find ${name} array`);
}

function propertyName(property: ts.ObjectLiteralElementLike, file: ts.SourceFile): string | undefined {
  if (!ts.isPropertyAssignment(property)) return undefined;
  return property.name.getText(file).replace(/^['"]|['"]$/g, "");
}

function objectString(object: ts.ObjectLiteralExpression, name: string, file: ts.SourceFile): string | undefined {
  const property = object.properties.find((candidate) => propertyName(candidate, file) === name);
  if (!property || !ts.isPropertyAssignment(property)) return undefined;
  return ts.isStringLiteralLike(property.initializer) ? property.initializer.text : undefined;
}

function objectBySlug(source: string, slug: string) {
  const { file, array } = getArray(source, "baseBlogArticles");
  const matches = array.elements.filter((element) =>
    ts.isObjectLiteralExpression(element) && objectString(element, "slug", file) === slug,
  );
  if (matches.length !== 1 || !ts.isObjectLiteralExpression(matches[0])) {
    fail(`expected one base article for ${slug}, found ${matches.length}`);
  }
  return { file, object: matches[0] as ts.ObjectLiteralExpression };
}

function jsonFromObject(object: ts.ObjectLiteralExpression, file: ts.SourceFile): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const name = propertyName(property, file);
    if (!name) continue;
    const initializer = property.initializer;
    if (ts.isStringLiteralLike(initializer)) result[name] = initializer.text;
    else if (name === "keywords" && ts.isArrayLiteralExpression(initializer)) {
      result[name] = initializer.elements.map((item) => ts.isStringLiteralLike(item) ? item.text : undefined);
    } else result[name] = undefined;
  }
  return result;
}

export function readArticleMetaFromSource(source: string, slug: string): Record<string, unknown> {
  const { file, object } = objectBySlug(source, slug);
  return jsonFromObject(object, file);
}

export function contentHashFromMeta(article: Record<string, unknown>): string {
  return contentHash({
    title: String(article.title || ""),
    excerpt: String(article.excerpt || ""),
    keywords: Array.isArray(article.keywords) ? article.keywords.map(String) : [],
    content: String(article.content || ""),
  });
}

function validateDigest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) fail(`${label} must be a lowercase SHA-256 digest`);
}

function validateBundleShape(bundle: RevisionSourceBundle) {
  if (bundle?.version !== 1 || !Array.isArray(bundle.articles)) fail("unsupported source-bundle shape");
  const slugs = bundle.articles.map((article) => article.slug);
  if (new Set(slugs).size !== slugs.length) fail("source bundle has duplicate article entries");
  if (slugs.length !== ARTICLE_REVISION_SLUGS.length || ARTICLE_REVISION_SLUGS.some((slug) => !slugs.includes(slug))) {
    fail("source bundle must contain exactly the three allowlisted revision slugs");
  }
}

function validateApprovalShape(approval: ArticleRevisionApprovalManifest) {
  if (approval?.version !== 1 || approval.kind !== "article-revision-approval") fail("approval manifest version/kind is invalid");
  if (approval.approvalOwner !== "root-primary-qa" || !approval.approvalRecord?.path) fail("primary QA authorization is missing");
  if (!approval.sourceBundle?.path) fail("source bundle reference is missing");
  if (!Array.isArray(approval.revisions)) fail("revision list is missing");
  const slugs = approval.revisions.map((revision) => revision.slug);
  if (new Set(slugs).size !== slugs.length || slugs.length !== ARTICLE_REVISION_SLUGS.length || ARTICLE_REVISION_SLUGS.some((slug) => !slugs.includes(slug))) {
    fail("approval must bind each allowlisted slug exactly once");
  }
}

function assertSameIds(expected: string[], actual: string[], label: string) {
  const left = [...expected].sort();
  const right = [...actual].sort();
  if (left.length !== right.length || left.some((id, index) => id !== right[index])) fail(`${label} record IDs do not match`);
}

function formatHumanDate(dateISO: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${dateISO}T12:00:00.000Z`));
}

function validateOneRevision(args: {
  root: string;
  approval: ArticleRevisionApprovalManifest;
  sourceBundle: RevisionSourceBundle;
  approvalManifestSha256: string;
  candidateFile: string;
  source: string;
  slug: typeof ARTICLE_REVISION_SLUGS[number];
}) {
  const { root, approval, sourceBundle, approvalManifestSha256, candidateFile, source, slug } = args;
  const approvalEntry = approval.revisions.find((revision) => revision.slug === slug)!;
  const relativeCandidatePath = `${CANDIDATE_ROOT}/${slug}.json`;
  if (approvalEntry.candidatePath !== relativeCandidatePath) fail(`${slug} candidate path is not allowlisted`);

  const candidateText = readUtf8(candidateFile);
  const candidateRaw = JSON.parse(candidateText) as RevisionCandidate & { candidateStatus?: string };
  if (candidateRaw.slug !== slug) fail(`${slug} candidate slug does not match file name`);
  const candidate = candidateRaw as RevisionCandidate;
  if (candidate.updatedAt !== "2026-10-21") fail(`${slug} must carry the 21 October 2026 updatedAt date`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate.dateISO)) fail(`${slug} publication date is invalid`);
  if (candidate.articleType !== "evidence-brief" || !candidate.title || !candidate.seoTitle || !candidate.excerpt || !candidate.content || !Array.isArray(candidate.keywords) || !Array.isArray(candidate.sourceRecordIds)) fail(`${slug} candidate is incomplete`);
  if (new Set(candidate.sourceRecordIds).size !== candidate.sourceRecordIds.length) fail(`${slug} candidate contains duplicate source record IDs`);

  const candidateFileSha256 = sha256(candidateText);
  if (candidateFileSha256 !== approvalEntry.candidateFileSha256) fail(`${slug} candidate file hash changed after QA`);
  const { file, object } = objectBySlug(source, slug);
  const published = jsonFromObject(object, file);
  const parentContentHash = contentHashFromMeta(published);
  if (approvalEntry.parentContentHash !== parentContentHash) fail(`${slug} published parent content hash is stale`);
  if (candidate.dateISO !== published.dateISO) fail(`${slug} publication date/dateISO must remain unchanged`);
  const bundleArticle = sourceBundle.articles.find((item) => item.slug === slug)!;
  const originalArtifactPath = resolve(root, "scripts/data/published", `${slug}.json`);
  const originalArtifactText = readUtf8(originalArtifactPath);
  if (sha256(originalArtifactText) !== bundleArticle.parentArtifactSha256) fail(`${slug} original published artifact hash is stale`);
  const originalArtifact = JSON.parse(originalArtifactText) as Record<string, unknown>;
  if (contentHashFromMeta(originalArtifact) !== parentContentHash) fail(`${slug} original artifact and live parent content differ`);
  if (originalArtifact.slug !== slug || originalArtifact.dateISO !== published.dateISO || originalArtifact.date !== published.date) fail(`${slug} original publication identity/date differs from the current live parent`);
  const keywords = candidate.keywords;
  const revisedArticle = { title: candidate.title, excerpt: candidate.excerpt, content: candidate.content, keywords };
  const candidateContentHash = contentHash(revisedArticle);
  if (candidateContentHash !== approvalEntry.candidateContentHash || approvalEntry.qaSummary?.candidateContentHash !== candidateContentHash) {
    fail(`${slug} candidate content hash is not bound to QA`);
  }

  if (!/^[a-f0-9]{64}$/.test(bundleArticle.parentArtifactSha256)) fail(`${slug} source bundle original-artifact hash is malformed`);
  const records = bundleArticle.sourceRecords;
  if (!Array.isArray(records) || records.length === 0) fail(`${slug} has no source records`);
  if (new Set(records.map((record) => record.id)).size !== records.length) fail(`${slug} source bundle contains duplicate record IDs`);
  if (records.some((record) => typeof record.id !== "string" || !record.id || !record.regulator || !record.date_issued)) fail(`${slug} source record is malformed`);
  assertSameIds(candidate.sourceRecordIds, records.map((record) => record.id), `${slug} candidate/source bundle`);
  const contract: ArticleEvidenceContract = buildArticleEvidenceContract(records);
  const sourceContractHash = stableJsonHash(contract);
  if (approvalEntry.sourceContractHash !== sourceContractHash || approvalEntry.qaSummary.sourceContractHash !== sourceContractHash) {
    fail(`${slug} source contract hash is stale`);
  }
  const contractIssues = getArticleEvidenceContractIssues(`${candidate.title}\n${candidate.excerpt}\n${candidate.content}`, records, contract);
  if (contractIssues.length > 0) fail(`${slug} evidence contract failed: ${contractIssues.join("; ")}`);

  const sourceChecks = bundleArticle.sourceChecks;
  if (!Array.isArray(sourceChecks) || sourceChecks.length === 0) fail(`${slug} has no checked official sources`);
  assertSameIds(records.map((record) => record.id), [...new Set(sourceChecks.map((check) => check.recordId))], `${slug} source-check coverage`);
  for (const check of sourceChecks) {
    const record = records.find((item) => item.id === check.recordId);
    if (!record || !isOfficialRegulatorySource(check.url) || !check.url || !Array.isArray(check.verifiedFields) || !check.verifiedFields.length || !check.notes || !Number.isFinite(Date.parse(check.checkedAt))) {
      fail(`${slug} contains an invalid or non-official source check`);
    }
    const knownUrls = [record.source_url, record.notice_url].filter(Boolean);
    if (!knownUrls.includes(check.url)) fail(`${slug} checked URL does not match its selected record`);
  }

  const range = getArticleQualityWordRange("evidence-brief");
  const quality = runQualityGate(revisedArticle, records, range, contract);
  const actualChecks = quality.checks.map(({ id, passed }) => ({ id, passed }));
  if (!quality.passed || quality.checks.some((check) => !check.passed)) fail(`${slug} deterministic quality gate failed`);
  const signedChecks = approvalEntry.qaSummary.checks;
  if (!Array.isArray(signedChecks) || signedChecks.length !== actualChecks.length) fail(`${slug} QA summary is missing deterministic checks`);
  for (const check of actualChecks) {
    if (signedChecks.find((candidate) => candidate.id === check.id)?.passed !== true) fail(`${slug} approval omitted or failed check ${check.id}`);
  }
  for (const id of REQUIRED_REVISION_CHECKS) {
    if (!actualChecks.some((check) => check.id === id && check.passed)) fail(`${slug} mandatory quality check failed or is unavailable: ${id}`);
  }
  if (approvalEntry.qaSummary.identity !== "root-primary-qa" || approvalEntry.qaSummary.result !== "passed" || !Number.isFinite(Date.parse(approvalEntry.qaSummary.completedAt))) {
    fail(`${slug} primary QA record is invalid`);
  }
  if (approvalEntry.qaSummary.completedAt.slice(0, 10) !== candidate.updatedAt) fail(`${slug} QA date and article update date differ`);

  const officialSources = [...new Map(sourceChecks.map((check) => {
    const record = records.find((item) => item.id === check.recordId)!;
    return [check.url, { id: record.id, regulator: record.regulator, url: check.url, title: `${record.regulator} official notice` }];
  })).values()];
  const revisionManifest: ArticleRevisionManifest = {
    version: 1,
    slug,
    revisedAt: approvalEntry.qaSummary.completedAt,
    operatorRecord: {
      identity: "root-primary-qa",
      completedAt: approvalEntry.qaSummary.completedAt,
      result: "passed",
    },
    previousContentHash: parentContentHash,
    contentHash: candidateContentHash,
    sourceContractHash,
    sourceRecordIds: records.map((record) => record.id).sort(),
    approvalManifestSha256,
    checks: actualChecks.filter((check) => check.passed).map((check) => ({ id: check.id, passed: true as const })),
    sources: officialSources,
    publicationHistory: [{
      dateISO: String(published.dateISO),
      publishedAt: typeof originalArtifact.publicationManifest === "object" && originalArtifact.publicationManifest
        ? String((originalArtifact.publicationManifest as Record<string, unknown>).publishedAt || "") || undefined
        : undefined,
      publishedBy: typeof originalArtifact.publicationManifest === "object" && originalArtifact.publicationManifest
        ? String((originalArtifact.publicationManifest as Record<string, unknown>).publishedBy || "") || undefined
        : undefined,
      liveUrl: typeof originalArtifact.publicationManifest === "object" && originalArtifact.publicationManifest
        ? String((originalArtifact.publicationManifest as Record<string, unknown>).liveUrl || "") || undefined
        : undefined,
      originalContentHash: parentContentHash,
      originalArtifactSha256: bundleArticle.parentArtifactSha256,
    }],
  };

  return {
    slug,
    candidate,
    keywords,
    originalArtifact,
    originalArtifactPath,
    originalArtifactSha256: bundleArticle.parentArtifactSha256,
    parentContentHash,
    candidateContentHash,
    sourceContractHash,
    records,
    revisionManifest,
  };
}

function printableProperty(name: string, value: unknown): string {
  return `${name}: ${JSON.stringify(value)}`;
}

export function replaceReviewedArticleSourceEntry(
  source: string,
  slug: string,
  values: Record<string, unknown>,
  remove: Set<string>,
) {
  const { file, object } = objectBySlug(source, slug);
  const properties = new Map<string, string>();
  for (const property of object.properties) {
    const name = propertyName(property, file);
    if (!name) fail(`${slug} entry contains a non-property member`);
    if (remove.has(name)) continue;
    if (Object.prototype.hasOwnProperty.call(values, name)) continue;
    properties.set(name, source.slice(property.getStart(file), property.getEnd()));
  }
  for (const [name, value] of Object.entries(values)) properties.set(name, printableProperty(name, value));
  const indent = source.slice(0, object.getStart(file)).match(/(?:^|\n)([ \t]*)[^\n]*$/)?.[1] ?? "";
  const replacement = `\n${[...properties.values()].map((property) => `${indent}  ${property}`).join(",\n")}\n${indent}`;
  const braces = source.slice(object.getStart(file), object.getEnd());
  const bodyStart = object.getStart(file) + braces.indexOf("{") + 1;
  const bodyEnd = object.getEnd() - 1;
  return source.slice(0, bodyStart) + replacement + source.slice(bodyEnd);
}

export function buildReviewedArticleRevisionPlan(args: {
  root: string;
  blogArticlesPath: string;
  approvalManifestPath: string;
}): RevisionPlan {
  const { root, blogArticlesPath, approvalManifestPath } = args;
  const source = readUtf8(blogArticlesPath);
  const approvalText = readUtf8(approvalManifestPath);
  const approval = JSON.parse(approvalText) as ArticleRevisionApprovalManifest;
  validateApprovalShape(approval);

  const approvalRecordPath = resolve(root, approval.approvalRecord.path);
  const approvalRecordBytes = readFileSync(approvalRecordPath);
  const approvalRecordHash = sha256(approvalRecordBytes);
  if (approvalRecordHash !== approval.approvalRecord.sha256) fail("external QA approval record hash mismatch");
  const approvalRecord = JSON.parse(approvalRecordBytes.toString("utf8")) as ArticleRevisionApprovalRecord;
  const sourceBundlePath = resolve(root, approval.sourceBundle.path);
  const sourceBundleText = readUtf8(sourceBundlePath);
  const sourceBundleSha256 = sha256(sourceBundleText);
  if (sourceBundleSha256 !== approval.sourceBundle.sha256) fail("source bundle hash mismatch");
  if (approvalRecord.identity !== "root-primary-qa" || approvalRecord.result !== "passed" || !Number.isFinite(Date.parse(approvalRecord.completedAt))) {
    fail("external QA approval record has invalid primary identity or outcome");
  }
  if (approval.approvedAt !== approvalRecord.completedAt || approvalRecord.sourceBundleSha256 !== sourceBundleSha256) {
    fail("external QA approval record does not bind the approved source bundle and completion time");
  }
  const sourceBundle = JSON.parse(sourceBundleText) as RevisionSourceBundle;
  validateBundleShape(sourceBundle);

  const approvalManifestSha256 = sha256(approvalText);
  if (Object.keys(approvalRecord.candidateContentHashes || {}).length !== ARTICLE_REVISION_SLUGS.length) fail("external QA record must bind exactly three candidate hashes");
  for (const revision of approval.revisions) {
    if (approvalRecord.candidateContentHashes[revision.slug] !== revision.candidateContentHash) fail(`${revision.slug} candidate hash is not bound by the external QA record`);
  }
  const approvalCheckIds = new Set((approvalRecord.checks || []).filter((check) => check.passed === true).map((check) => check.id));
  for (const checkId of REQUIRED_REVISION_CHECKS) {
    if (!approvalCheckIds.has(checkId)) fail(`external QA record omits or fails mandatory check ${checkId}`);
  }
  const planItems: RevisionPlanItem[] = [];
  let outputSource = source;
  for (const slug of ARTICLE_REVISION_SLUGS) {
    const candidatePath = resolve(root, CANDIDATE_ROOT, `${slug}.json`);
    const validated = validateOneRevision({
      root,
      approval,
      sourceBundle,
      approvalManifestSha256,
      candidateFile: candidatePath,
      source: outputSource,
      slug,
    });
    const values = {
      title: validated.candidate.title,
      seoTitle: validated.candidate.seoTitle,
      excerpt: validated.candidate.excerpt,
      content: validated.candidate.content,
      keywords: validated.candidate.keywords,
      readTime: `${Math.ceil(validated.candidate.content.split(/\s+/).filter(Boolean).length / 200)} min read`,
      articleType: "evidence-brief",
      updatedAt: validated.candidate.updatedAt,
      dateModified: validated.revisionManifest.revisedAt,
      revisionManifest: validated.revisionManifest,
    };
    outputSource = replaceReviewedArticleSourceEntry(
      outputSource,
      slug,
      values,
      new Set(["editorialManifest", "publicationManifest", "generatedAt"]),
    );
    const revisedPublishedArtifact: Record<string, unknown> = { ...validated.originalArtifact };
    for (const staleKey of ["editorialManifest", "publicationManifest", "qualityReport", "reviewNotes", "candidateStatus", "generatedAt"]) {
      delete revisedPublishedArtifact[staleKey];
    }
    Object.assign(revisedPublishedArtifact, {
      title: validated.candidate.title,
      seoTitle: validated.candidate.seoTitle,
      excerpt: validated.candidate.excerpt,
      content: validated.candidate.content,
      keywords: validated.candidate.keywords,
      readTime: values.readTime,
      articleType: "evidence-brief",
      updatedAt: validated.candidate.updatedAt,
      dateModified: validated.revisionManifest.revisedAt,
      revisionManifest: validated.revisionManifest,
      sourceRecordIds: validated.candidate.sourceRecordIds,
      sourceRecords: validated.records,
      status: "published",
    });
    const publishedOutput = `${JSON.stringify(revisedPublishedArtifact, null, 2)}\n`;
    const parsedPublishedOutput = JSON.parse(publishedOutput) as Record<string, unknown>;
    if (contentHashFromMeta(parsedPublishedOutput) !== validated.candidateContentHash) fail(`${slug} published artifact content/keyword hash mismatch`);
    if (parsedPublishedOutput.dateISO !== validated.originalArtifact.dateISO || parsedPublishedOutput.date !== validated.originalArtifact.date || parsedPublishedOutput.slug !== slug) {
      fail(`${slug} published artifact changed original slug/date identity`);
    }
    planItems.push({
      slug,
      parentContentHash: validated.parentContentHash,
      candidateContentHash: validated.candidateContentHash,
      sourceContractHash: validated.sourceContractHash,
      candidate: validated.candidate,
      sourceRecords: validated.records,
      revisionManifest: validated.revisionManifest,
    });
  }

  for (const item of planItems) {
    const { file, object } = objectBySlug(outputSource, item.slug);
    const materialized = jsonFromObject(object, file);
    if (contentHashFromMeta(materialized) !== item.candidateContentHash) fail(`${item.slug} materialized content/keyword hash mismatch`);
    if (materialized.dateISO !== item.revisionManifest.publicationHistory[0].dateISO) fail(`${item.slug} materialization changed publication dateISO`);
  }

  const inputArticleTexts = new Map<string, string>();
  const outputArticleTexts = new Map<string, string>();
  const initialArray = getArray(source, "baseBlogArticles");
  const outputArray = getArray(outputSource, "baseBlogArticles");
  for (const element of initialArray.array.elements) {
    if (ts.isObjectLiteralExpression(element)) {
      const slug = objectString(element, "slug", initialArray.file);
      if (slug) inputArticleTexts.set(slug, source.slice(element.getStart(initialArray.file), element.getEnd()));
    }
  }
  for (const element of outputArray.array.elements) {
    if (ts.isObjectLiteralExpression(element)) {
      const slug = objectString(element, "slug", outputArray.file);
      if (slug) outputArticleTexts.set(slug, outputSource.slice(element.getStart(outputArray.file), element.getEnd()));
    }
  }
  for (const [slug, oldText] of inputArticleTexts) {
    if ((ARTICLE_REVISION_SLUGS as readonly string[]).includes(slug)) continue;
    if (outputArticleTexts.get(slug) !== oldText) fail(`non-target article changed during materialization: ${slug}`);
  }
  const inputSourceSha256 = sha256(source);
  const outputFiles: RevisionOutputFile[] = [
    {
      path: blogArticlesPath,
      baselineSha256: inputSourceSha256,
      outputSha256: sha256(outputSource),
      contents: outputSource,
    },
  ];
  for (const item of planItems) {
    const path = resolve(root, "scripts/data/published", `${item.slug}.json`);
    const originalBytes = readFileSync(path);
    if (sha256(originalBytes) !== item.revisionManifest.publicationHistory[0].originalArtifactSha256) {
      fail(`${item.slug} original published artifact changed while the revision plan was being built`);
    }
    const originalArtifact = JSON.parse(originalBytes.toString("utf8")) as Record<string, unknown>;
    const updatedArtifact = {
      ...originalArtifact,
      title: item.candidate.title,
      seoTitle: item.candidate.seoTitle,
      excerpt: item.candidate.excerpt,
      content: item.candidate.content,
      keywords: item.candidate.keywords,
      readTime: `${Math.ceil(item.candidate.content.split(/\s+/).filter(Boolean).length / 200)} min read`,
      articleType: "evidence-brief",
      updatedAt: item.candidate.updatedAt,
      dateModified: item.revisionManifest.revisedAt,
      revisionManifest: item.revisionManifest,
      sourceRecordIds: item.candidate.sourceRecordIds,
      sourceRecords: item.sourceRecords,
      status: "published",
    } as Record<string, unknown>;
    for (const staleKey of ["editorialManifest", "publicationManifest", "qualityReport", "reviewNotes", "candidateStatus", "generatedAt"]) delete updatedArtifact[staleKey];
    const contents = `${JSON.stringify(updatedArtifact, null, 2)}\n`;
    if (contentHashFromMeta(JSON.parse(contents) as Record<string, unknown>) !== item.candidateContentHash) fail(`${item.slug} output JSON round-trip hash mismatch`);
    outputFiles.push({ path, baselineSha256: sha256(originalBytes), outputSha256: sha256(contents), contents });
  }
  return {
    approvalManifestSha256,
    inputSourceSha256,
    outputSourceSha256: sha256(outputSource),
    outputSource,
    outputFiles,
    items: planItems,
  };
}
