/**
 * Review metadata for a controlled revision of an already-published article.
 * This is intentionally separate from the generation/publication approval
 * workflow: a revision is not evidence of a new head-editorial approval.
 */
export interface ArticleRevisionManifest {
  version: 1;
  slug: string;
  revisedAt: string;
  operatorRecord: {
    identity: "root-primary-qa";
    completedAt: string;
    result: "passed";
  };
  previousContentHash: string;
  contentHash: string;
  sourceContractHash: string;
  sourceRecordIds: string[];
  approvalManifestSha256: string;
  checks: Array<{ id: string; passed: true }>;
  sources: Array<{ id: string; regulator: string; url: string; title?: string }>;
  publicationHistory: Array<{
    dateISO: string;
    publishedAt?: string;
    publishedBy?: string;
    liveUrl?: string;
    originalContentHash: string;
    originalArtifactSha256: string;
  }>;
}

/** External, immutable operator authorization consumed by revise-articles. */
export interface ArticleRevisionApprovalManifest {
  version: 1;
  kind: "article-revision-approval";
  approvedAt: string;
  approvalOwner: "root-primary-qa";
  approvalRecord: { path: string; sha256: string };
  sourceBundle: { path: string; sha256: string };
  revisions: Array<{
    slug: string;
    candidatePath: string;
    candidateFileSha256: string;
    candidateContentHash: string;
    parentContentHash: string;
    sourceContractHash: string;
    qaSummary: {
      identity: "root-primary-qa";
      completedAt: string;
      result: "passed";
      candidateContentHash: string;
      sourceContractHash: string;
      checks: Array<{ id: string; passed: true }>;
    };
  }>;
}

export interface ArticleRevisionApprovalRecord {
  identity: "root-primary-qa";
  result: "passed";
  completedAt: string;
  candidateContentHashes: Record<string, string>;
  sourceBundleSha256: string;
  checks: Array<{ id: string; passed: true }>;
}
