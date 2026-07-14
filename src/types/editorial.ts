export type EditorialWorkflowStatus =
  | "idea"
  | "researching"
  | "evidence_verified"
  | "drafted"
  | "quality_passed"
  | "head_approved"
  | "scheduled"
  | "published"
  | "blocked";

export type EvidenceVerdict = "verified" | "ambiguous" | "unsupported";

export interface SourceEvidence {
  id: string;
  url: string;
  title: string;
  publisher: string;
  sourceType:
    | "official_notice"
    | "official_register"
    | "legislation"
    | "company_filing"
    | "secondary_context";
  retrievedAt: string;
  official: boolean;
  excerpt: string;
}

export interface EvidenceClaim {
  id: string;
  text: string;
  kind:
    | "action_type"
    | "amount"
    | "date"
    | "finding"
    | "entity"
    | "context"
    | "analysis";
  sourceIds: string[];
  recordIds: string[];
  verdict: EvidenceVerdict;
  verifier: "regulatory-verifier-agent" | "deterministic-source-gate";
  notes?: string;
}

export type ChartType = "bar" | "line" | "composed" | "timeline" | "matrix";

export interface ChartSeriesSpec {
  key: string;
  label: string;
  format: "count" | "currency_gbp" | "percentage" | "text";
  colour: string;
}

export interface ChartSpec {
  id: string;
  type: ChartType;
  title: string;
  purpose: string;
  xKey: string;
  series: ChartSeriesSpec[];
  data: Array<Record<string, string | number | null>>;
  sourceRecordIds: string[];
  reportingPeriod: { start: string; end: string };
  currencyBasis?: string;
  caption: string;
  altText: string;
  sourceNote: string;
  staticPath?: string;
}

export type ImagePurpose = "hero" | "open_graph" | "social_square" | "social_portrait" | "inline_illustration";

export interface ImageSpec {
  id: string;
  purpose: ImagePurpose;
  width: number;
  height: number;
  altText: string;
  caption?: string;
  prompt?: string;
  outputPath: string;
  generatedBy: "satori" | "openrouter-image" | "approved-asset";
  factual: boolean;
  sourceIds: string[];
  approved: boolean;
  reviewAssetPath?: string;
  assetHash?: string;
}

export interface AgentReview {
  role:
    | "regulatory-verifier-agent"
    | "copy-editor-agent"
    | "visual-editor-agent"
    | "head-editorial-agent";
  model: string;
  promptVersion: string;
  completedAt: string;
  passed: boolean;
  issues: string[];
  contentHash: string;
}

export interface HeadEditorialApproval {
  status: "approved" | "rejected";
  reviewer: "head-editorial-agent";
  approvedAt?: string;
  contentHash: string;
  model: string;
  promptVersion: string;
  rationale: string;
}

export type EditorialSectionKey =
  | "overview"
  | "actions"
  | "analysis"
  | "implications"
  | "takeaways"
  | "data";

export interface EditorialOutlineSection {
  key: EditorialSectionKey;
  heading: string;
  angle: string;
  targetWords: number;
  sourceRecordIds: string[];
}

export interface EditorialOutline {
  title: string;
  excerpt: string;
  keywords: string[];
  sections: EditorialOutlineSection[];
}

export interface EditorialRepairAttempt {
  completedAt: string;
  model: string;
  issues: string[];
  affectedSections: EditorialSectionKey[];
  beforeHash: string;
  afterHash: string;
}

export interface EditorialManifest {
  version: 1;
  status: EditorialWorkflowStatus;
  contentHash: string;
  generatedAt: string;
  generationModel: string;
  promptVersion: string;
  sources: SourceEvidence[];
  claims: EvidenceClaim[];
  charts: ChartSpec[];
  images: ImageSpec[];
  reviews: AgentReview[];
  outline?: EditorialOutline;
  repairHistory?: EditorialRepairAttempt[];
  headApproval?: HeadEditorialApproval;
}

export interface PublicationManifest {
  version: 1;
  slug: string;
  contentHash: string;
  approvedBy: "head-editorial-agent";
  approvedAt: string;
  publishedBy: "publisher-agent";
  publishedAt: string;
  commitSha?: string;
  deploymentId?: string;
  liveUrl?: string;
}
