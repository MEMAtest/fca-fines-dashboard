#!/usr/bin/env npx tsx
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import {
  cleanupReviewImageCandidates,
  generateAiImageCandidates,
  imageCandidatesForReview,
} from "./lib/editorialImages.js";
import { getArticleQualityWordRange, runQualityGate } from "./lib/articleQuality.js";
import {
  EDITORIAL_MODELS,
  EDITORIAL_PROMPT_VERSION,
  normaliseEditorialExcerpt,
  repairArticleFromRegulatoryReview,
  runCopyEditorAgent,
  runHeadEditorialAgent,
  runRegulatoryVerifierAgent,
  runVisualEditorAgent,
} from "./lib/editorialAgents.js";
import {
  applyVisualReviewApprovals,
  contentHash,
  getDeterministicEditorialIssues,
  makeAgentReview,
  makeHeadApproval,
  normaliseToHouseStyle,
  type EditorialDraftArtifact,
} from "./lib/editorialWorkflow.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "..", ".env") });
config({ path: join(__dirname, "..", ".env.local"), override: false });
const draftPathArgument = process.argv.find((arg) => arg.startsWith("--draft-path="))?.split("=").slice(1).join("=");
const requestedSlug = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const dryRun = process.argv.includes("--dry-run");
const textOnly = process.argv.includes("--text-only");
const noWebSearch = process.argv.includes("--no-web-search");

if (!requestedSlug && !draftPathArgument) {
  throw new Error("Usage: npx tsx scripts/review-article.ts <slug> [--dry-run] [--text-only] [--no-web-search] [--draft-path=/absolute/draft.json]");
}

const draftPath = draftPathArgument
  ? resolve(draftPathArgument)
  : join(__dirname, "data", "drafts", `${requestedSlug}.json`);
if (!existsSync(draftPath)) throw new Error(`Draft not found: ${draftPath}`);

const draft = JSON.parse(readFileSync(draftPath, "utf8")) as EditorialDraftArtifact & {
  qualityReport?: unknown;
};
const slug = draft.slug || requestedSlug || "unknown-draft";
const articleWordRange = getArticleQualityWordRange(draft.articleType);

if (!draft.editorialManifest || !Array.isArray(draft.sourceRecords)) {
  throw new Error("Draft predates Editorial Engine v2 and must be regenerated before review");
}
draft.title = normaliseToHouseStyle(draft.title);
draft.excerpt = normaliseEditorialExcerpt(normaliseToHouseStyle(draft.excerpt));
draft.content = normaliseToHouseStyle(draft.content);
draft.keywords = draft.keywords.map(normaliseToHouseStyle);

const initialHash = contentHash(draft);
const preCopyQuality = runQualityGate(draft, draft.sourceRecords, articleWordRange);
const preCopyRequiredIssues = preCopyQuality.checks
  .filter((check) => check.weight === "required" && !check.passed)
  .map((check) => `${check.name}: ${check.message}`);
if (preCopyRequiredIssues.length > 0) {
  draft.editorialManifest.status = "blocked";
  draft.editorialManifest.reviews.push(makeAgentReview({
    role: "regulatory-verifier-agent",
    model: EDITORIAL_MODELS.regulatoryInitial,
    promptVersion: EDITORIAL_PROMPT_VERSION,
    passed: false,
    issues: preCopyRequiredIssues,
    hash: initialHash,
  }));
  draft.editorialManifest.headApproval = makeHeadApproval({
    approved: false,
    hash: initialHash,
    model: EDITORIAL_MODELS.head,
    promptVersion: EDITORIAL_PROMPT_VERSION,
    rationale: `Pre-copy deterministic evidence gates failed: ${preCopyRequiredIssues.join("; ")}`,
  });
  if (!dryRun) writeFileSync(draftPath, `${JSON.stringify(draft, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ slug, approved: false, stage: "pre-copy-quality", issues: preCopyRequiredIssues }, null, 2));
  process.exit(2);
}

console.log(`[review:${slug}] stage=initial-regulatory start`);
let initialRegulatoryReview = await runRegulatoryVerifierAgent({
  title: draft.title,
  excerpt: draft.excerpt,
  content: draft.content,
  sources: draft.editorialManifest.sources,
  webSearch: !noWebSearch,
  stage: "initial",
});
console.log(`[review:${slug}] stage=initial-regulatory complete passed=${initialRegulatoryReview.passed} claims=${initialRegulatoryReview.claims.length}`);

const MAX_EVIDENCE_REPAIRS = 2;
for (let attempt = 1; attempt <= MAX_EVIDENCE_REPAIRS; attempt++) {
  const fullyVerified = initialRegulatoryReview.passed
    && initialRegulatoryReview.claims.every((claim) => claim.verdict === "verified");
  if (fullyVerified) break;
  console.log(`[review:${slug}] stage=evidence-repair attempt=${attempt} start`);
  const beforeHash = contentHash(draft);
  const repaired = await repairArticleFromRegulatoryReview({
    article: draft,
    review: initialRegulatoryReview,
    records: draft.sourceRecords,
    outline: draft.editorialManifest.outline,
    minimumWords: articleWordRange.minimumWords,
  });
  if (repaired.affectedSections.length === 0) break;
  draft.title = repaired.article.title;
  draft.seoTitle = `${repaired.article.title} | RegActions`;
  draft.excerpt = repaired.article.excerpt;
  draft.keywords = repaired.article.keywords;
  draft.content = repaired.article.content;
  draft.title = normaliseToHouseStyle(draft.title);
  draft.excerpt = normaliseToHouseStyle(draft.excerpt);
  draft.content = normaliseToHouseStyle(draft.content);
  draft.keywords = draft.keywords.map(normaliseToHouseStyle);
  draft.readTime = `${Math.ceil(draft.content.split(/\s+/).filter(Boolean).length / 200)} min read`;
  const afterHash = contentHash(draft);
  draft.editorialManifest.contentHash = afterHash;
  draft.editorialManifest.repairHistory ||= [];
  draft.editorialManifest.repairHistory.push({
    completedAt: new Date().toISOString(),
    model: EDITORIAL_MODELS.copy,
    issues: [
      ...initialRegulatoryReview.issues,
      ...initialRegulatoryReview.claims
        .filter((claim) => claim.verdict !== "verified")
        .map((claim) => `${claim.verdict}: ${claim.text}`),
    ],
    affectedSections: repaired.affectedSections,
    beforeHash,
    afterHash,
  });
  initialRegulatoryReview = await runRegulatoryVerifierAgent({
    title: draft.title,
    excerpt: draft.excerpt,
    content: draft.content,
    sources: draft.editorialManifest.sources,
    priorClaims: initialRegulatoryReview.claims,
    webSearch: false,
    stage: "initial",
  });
  console.log(`[review:${slug}] stage=evidence-repair attempt=${attempt} complete passed=${initialRegulatoryReview.passed}`);
}

const preCopyVerified = initialRegulatoryReview.passed
  && initialRegulatoryReview.claims.every((claim) => claim.verdict === "verified");
if (!preCopyVerified) {
  const hash = contentHash(draft);
  const issues = [
    ...initialRegulatoryReview.issues,
    ...initialRegulatoryReview.claims
      .filter((claim) => claim.verdict !== "verified")
      .map((claim) => `${claim.verdict}: ${claim.text}`),
  ];
  draft.editorialManifest.status = "blocked";
  draft.editorialManifest.claims = initialRegulatoryReview.claims;
  draft.editorialManifest.reviews.push(makeAgentReview({
    role: "regulatory-verifier-agent",
    model: EDITORIAL_MODELS.regulatoryInitial,
    promptVersion: EDITORIAL_PROMPT_VERSION,
    passed: false,
    issues,
    hash,
  }));
  draft.editorialManifest.headApproval = makeHeadApproval({
    approved: false,
    hash,
    model: EDITORIAL_MODELS.head,
    promptVersion: EDITORIAL_PROMPT_VERSION,
    rationale: `Evidence repair exhausted without full verification: ${issues.slice(0, 3).join("; ")}`,
  });
  if (!dryRun) writeFileSync(draftPath, `${JSON.stringify(draft, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ slug, approved: false, stage: "evidence-repair", issues, repairHistory: draft.editorialManifest.repairHistory }, null, 2));
  process.exit(2);
}

const preCopyHash = contentHash(draft);
console.log(`[review:${slug}] stage=copy-editor start`);
const preCopySnapshot = {
  title: draft.title,
  seoTitle: draft.seoTitle,
  excerpt: draft.excerpt,
  content: draft.content,
  readTime: draft.readTime,
};
const protectedEntityNames = [...new Set(draft.sourceRecords.map((record) => record.firm_individual).filter(Boolean))];
const applyCopyReview = (review: { revisedTitle: string; revisedExcerpt: string; revisedContent: string }) => {
  draft.title = normaliseToHouseStyle(review.revisedTitle);
  draft.excerpt = normaliseToHouseStyle(review.revisedExcerpt);
  draft.content = normaliseToHouseStyle(review.revisedContent);
  draft.seoTitle = `${draft.title} | RegActions`;
  draft.readTime = `${Math.ceil(draft.content.split(/\s+/).filter(Boolean).length / 200)} min read`;
};
let copyReview = await runCopyEditorAgent({
  ...draft,
  protectedEntityNames,
});
console.log(`[review:${slug}] stage=copy-editor complete passed=${copyReview.passed}`);
if (copyReview.passed) {
  applyCopyReview(copyReview);
  const copySafetyReport = runQualityGate(draft, draft.sourceRecords, articleWordRange);
  if (!copySafetyReport.passed) {
    const safetyIssues = copySafetyReport.checks
      .filter((check) => !check.passed)
      .map((check) => `Copy safety gate: ${check.name}: ${check.message}`);
    Object.assign(draft, preCopySnapshot);
    console.log(`[review:${slug}] stage=copy-editor safety-retry start`);
    copyReview = await runCopyEditorAgent({
      ...draft,
      protectedEntityNames,
      mandatoryCorrections: safetyIssues,
    });
    console.log(`[review:${slug}] stage=copy-editor safety-retry complete passed=${copyReview.passed}`);
    if (copyReview.passed) {
      applyCopyReview(copyReview);
      const retrySafetyReport = runQualityGate(draft, draft.sourceRecords, articleWordRange);
      if (!retrySafetyReport.passed) {
        const retryIssues = retrySafetyReport.checks
          .filter((check) => !check.passed)
          .map((check) => `Copy safety gate after retry: ${check.name}: ${check.message}`);
        Object.assign(draft, preCopySnapshot);
        const restoredSafetyReport = runQualityGate(draft, draft.sourceRecords, articleWordRange);
        if (restoredSafetyReport.passed) {
          copyReview = {
            passed: true,
            issues: [],
            revisedTitle: draft.title,
            revisedExcerpt: draft.excerpt,
            revisedContent: draft.content,
          };
          console.log(`[review:${slug}] stage=copy-editor fallback=verified-original reason=${retryIssues.join("; ")}`);
        } else {
          copyReview = {
            ...copyReview,
            passed: false,
            issues: retryIssues,
          };
        }
      }
    }
  }
}
if (!copyReview.passed) Object.assign(draft, preCopySnapshot);

const hash = contentHash(draft);
draft.editorialManifest.contentHash = hash;

let regulatoryReview = initialRegulatoryReview;
if (copyReview.passed) {
  console.log(`[review:${slug}] stage=post-copy-regulatory start`);
  regulatoryReview = await runRegulatoryVerifierAgent({
    title: draft.title,
    excerpt: draft.excerpt,
    content: draft.content,
    sources: draft.editorialManifest.sources,
    priorClaims: initialRegulatoryReview.claims,
    webSearch: false,
    stage: "post-copy",
  });
  console.log(`[review:${slug}] stage=post-copy-regulatory complete passed=${regulatoryReview.passed} claims=${regulatoryReview.claims.length}`);
} else {
  console.log(`[review:${slug}] stage=post-copy-regulatory skipped reason=copy-rejected`);
}
draft.editorialManifest.claims = regulatoryReview.claims;

if (textOnly) {
  const textQualityReport = runQualityGate(draft, draft.sourceRecords, articleWordRange);
  const textDeterministicIssues = getDeterministicEditorialIssues({
    article: draft,
    sources: draft.editorialManifest.sources,
    claims: draft.editorialManifest.claims,
    charts: draft.editorialManifest.charts,
    images: draft.editorialManifest.images,
    articleType: draft.articleType,
    records: draft.sourceRecords,
    requireImageApproval: false,
  });
  const initialPassed = initialRegulatoryReview.passed
    && initialRegulatoryReview.claims.every((claim) => claim.verdict === "verified");
  const postCopyPassed = regulatoryReview.passed
    && regulatoryReview.claims.every((claim) => claim.verdict === "verified");
  const textApproved = initialPassed
    && copyReview.passed
    && postCopyPassed
    && textQualityReport.passed
    && textDeterministicIssues.length === 0;
  draft.editorialManifest.reviews = [
    makeAgentReview({
      role: "regulatory-verifier-agent",
      model: EDITORIAL_MODELS.regulatoryInitial,
      promptVersion: EDITORIAL_PROMPT_VERSION,
      passed: initialPassed,
      issues: initialRegulatoryReview.issues.map((issue) => `Initial review: ${issue}`),
      hash: preCopyHash,
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
      role: "regulatory-verifier-agent",
      model: EDITORIAL_MODELS.regulatoryFinal,
      promptVersion: EDITORIAL_PROMPT_VERSION,
      passed: postCopyPassed,
      issues: regulatoryReview.issues.map((issue) => `Post-copy review: ${issue}`),
      hash,
    }),
  ];
  draft.editorialManifest.status = textApproved ? "quality_passed" : "blocked";
  draft.qualityReport = textQualityReport;
  if (!dryRun) writeFileSync(draftPath, `${JSON.stringify(draft, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    slug,
    textApproved,
    dryRun,
    qualityScore: textQualityReport.score,
    deterministicIssues: textDeterministicIssues,
    repairs: draft.editorialManifest.repairHistory || [],
    reviews: draft.editorialManifest.reviews,
  }, null, 2));
  process.exit(textApproved ? 0 : 2);
}

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
draft.editorialManifest.images = applyVisualReviewApprovals(
  draft.editorialManifest.images,
  visualReview.approvedImageIds,
);
const visualApprovalIssues: string[] = [];
for (const image of draft.editorialManifest.images) {
  if (!image.approved) {
    visualApprovalIssues.push(`Visual Editor did not approve image ${image.id}`);
  }
}
for (const chart of draft.editorialManifest.charts) {
  if (!visualReview.approvedChartIds.includes(chart.id)) {
    visualApprovalIssues.push(`Visual Editor did not approve chart ${chart.id}`);
  }
}

const qualityReport = runQualityGate(draft, draft.sourceRecords, articleWordRange);
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
    model: EDITORIAL_MODELS.regulatoryInitial,
    promptVersion: EDITORIAL_PROMPT_VERSION,
    passed: initialRegulatoryReview.passed && initialRegulatoryReview.claims.every((claim) => claim.verdict === "verified"),
    issues: initialRegulatoryReview.issues.map((issue) => `Initial review: ${issue}`),
    hash: preCopyHash,
  }),
  makeAgentReview({
    role: "regulatory-verifier-agent",
    model: EDITORIAL_MODELS.regulatoryFinal,
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
