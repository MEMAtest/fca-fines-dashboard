#!/usr/bin/env npx tsx
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import {
  cleanupReviewImageCandidates,
  generateAiImageCandidates,
  imageCandidatesForReview,
} from "./lib/editorialImages.js";
import { runQualityGate } from "./lib/articleQuality.js";
import {
  EDITORIAL_MODELS,
  EDITORIAL_PROMPT_VERSION,
  runCopyEditorAgent,
  runHeadEditorialAgent,
  runRegulatoryVerifierAgent,
  runVisualEditorAgent,
} from "./lib/editorialAgents.js";
import {
  contentHash,
  getDeterministicEditorialIssues,
  makeAgentReview,
  makeHeadApproval,
  type EditorialDraftArtifact,
} from "./lib/editorialWorkflow.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "..", ".env") });
config({ path: join(__dirname, "..", ".env.local"), override: false });
const slug = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const dryRun = process.argv.includes("--dry-run");

if (!slug) {
  throw new Error("Usage: npx tsx scripts/review-article.ts <slug> [--dry-run]");
}

const draftPath = join(__dirname, "data", "drafts", `${slug}.json`);
if (!existsSync(draftPath)) throw new Error(`Draft not found: ${draftPath}`);

const draft = JSON.parse(readFileSync(draftPath, "utf8")) as EditorialDraftArtifact & {
  qualityReport?: unknown;
};

if (!draft.editorialManifest || !Array.isArray(draft.sourceRecords)) {
  throw new Error("Draft predates Editorial Engine v2 and must be regenerated before review");
}

const initialHash = contentHash(draft);
const initialRegulatoryReview = await runRegulatoryVerifierAgent({
  title: draft.title,
  excerpt: draft.excerpt,
  content: draft.content,
  sources: draft.editorialManifest.sources,
  webSearch: true,
});

const copyReview = await runCopyEditorAgent(draft);
draft.title = copyReview.revisedTitle;
draft.seoTitle = `${copyReview.revisedTitle} | RegActions`;
draft.excerpt = copyReview.revisedExcerpt;
draft.content = copyReview.revisedContent;
draft.readTime = `${Math.ceil(draft.content.split(/\s+/).filter(Boolean).length / 200)} min read`;

const hash = contentHash(draft);
draft.editorialManifest.contentHash = hash;

const regulatoryReview = await runRegulatoryVerifierAgent({
  title: draft.title,
  excerpt: draft.excerpt,
  content: draft.content,
  sources: draft.editorialManifest.sources,
  priorClaims: initialRegulatoryReview.claims,
  webSearch: false,
});
draft.editorialManifest.claims = regulatoryReview.claims;

draft.editorialManifest.images = await generateAiImageCandidates(
  join(__dirname, ".."),
  draft.editorialManifest.images,
);

const visualReview = await runVisualEditorAgent({
  charts: draft.editorialManifest.charts,
  images: draft.editorialManifest.images,
  sourceIds: draft.editorialManifest.sources.map((source) => source.id),
  candidateImages: imageCandidatesForReview(join(__dirname, ".."), draft.editorialManifest.images),
});
draft.editorialManifest.images = draft.editorialManifest.images.map((image) => ({
  ...image,
  approved: visualReview.approvedImageIds.includes(image.id),
}));
const visualApprovalIssues: string[] = [];
for (const image of draft.editorialManifest.images) {
  if (!visualReview.approvedImageIds.includes(image.id)) {
    visualApprovalIssues.push(`Visual Editor did not approve image ${image.id}`);
  }
}
for (const chart of draft.editorialManifest.charts) {
  if (!visualReview.approvedChartIds.includes(chart.id)) {
    visualApprovalIssues.push(`Visual Editor did not approve chart ${chart.id}`);
  }
}

const qualityReport = runQualityGate(draft, draft.sourceRecords);
const deterministicIssues = getDeterministicEditorialIssues({
  article: draft,
  sources: draft.editorialManifest.sources,
  claims: draft.editorialManifest.claims,
  charts: draft.editorialManifest.charts,
  images: draft.editorialManifest.images,
  articleType: draft.articleType,
  records: draft.sourceRecords,
});
if (!initialRegulatoryReview.passed || initialRegulatoryReview.claims.some((claim) => claim.verdict !== "verified")) {
  deterministicIssues.push("Initial Regulatory Verifier review did not fully pass before copy editing");
}
deterministicIssues.push(...visualApprovalIssues);
if (!qualityReport.passed) {
  deterministicIssues.push(
    ...qualityReport.checks.filter((check) => !check.passed).map((check) => `${check.name}: ${check.message}`),
  );
}

const reviews = [
  makeAgentReview({
    role: "regulatory-verifier-agent",
    model: EDITORIAL_MODELS.regulatory,
    promptVersion: EDITORIAL_PROMPT_VERSION,
    passed: initialRegulatoryReview.passed && initialRegulatoryReview.claims.every((claim) => claim.verdict === "verified"),
    issues: initialRegulatoryReview.issues.map((issue) => `Initial review: ${issue}`),
    hash: initialHash,
  }),
  makeAgentReview({
    role: "regulatory-verifier-agent",
    model: EDITORIAL_MODELS.regulatory,
    promptVersion: EDITORIAL_PROMPT_VERSION,
    passed: regulatoryReview.passed && regulatoryReview.claims.every((claim) => claim.verdict === "verified"),
    issues: regulatoryReview.issues.map((issue) => `Post-copy review: ${issue}`),
    hash,
  }),
  makeAgentReview({
    role: "copy-editor-agent",
    model: EDITORIAL_MODELS.copy,
    promptVersion: EDITORIAL_PROMPT_VERSION,
    passed: copyReview.passed,
    issues: copyReview.issues,
    hash,
  }),
  makeAgentReview({
    role: "visual-editor-agent",
    model: EDITORIAL_MODELS.visual,
    promptVersion: EDITORIAL_PROMPT_VERSION,
    passed: visualReview.passed && visualApprovalIssues.length === 0,
    issues: [...visualReview.issues, ...visualApprovalIssues],
    hash,
  }),
];
draft.editorialManifest.reviews = reviews;

const headDecision = await runHeadEditorialAgent({
  article: draft,
  regulatoryReview,
  copyReview,
  visualReview,
  deterministicIssues,
});
const allGatesPass = deterministicIssues.length === 0 && reviews.every((review) => review.passed);
const approved = allGatesPass && headDecision.status === "approved" && headDecision.blockingIssues.length === 0;

draft.editorialManifest.headApproval = makeHeadApproval({
  approved,
  hash,
  model: EDITORIAL_MODELS.head,
  promptVersion: EDITORIAL_PROMPT_VERSION,
  rationale: headDecision.rationale,
});
draft.editorialManifest.reviews.push(makeAgentReview({
  role: "head-editorial-agent",
  model: EDITORIAL_MODELS.head,
  promptVersion: EDITORIAL_PROMPT_VERSION,
  passed: approved,
  issues: [...headDecision.blockingIssues, ...deterministicIssues],
  hash,
}));
draft.editorialManifest.status = approved ? "head_approved" : "blocked";
draft.qualityReport = qualityReport;

if (!dryRun) {
  writeFileSync(draftPath, `${JSON.stringify(draft, null, 2)}\n`, "utf8");
}
if (!approved || dryRun) {
  cleanupReviewImageCandidates(join(__dirname, ".."), draft.editorialManifest.images);
}

console.log(JSON.stringify({
  slug,
  approved,
  dryRun,
  contentHash: hash,
  deterministicIssues,
  reviews: draft.editorialManifest.reviews,
  headApproval: draft.editorialManifest.headApproval,
}, null, 2));

if (!approved) process.exitCode = 2;
