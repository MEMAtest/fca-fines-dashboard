/**
 * Public, report-only contracts for the RegActions Coverage and Content
 * Intelligence Agent.  These types deliberately describe recommendations,
 * never database mutations or publishing actions.
 */

export const COVERAGE_AGENT_VERSION = "coverage-agent-v1";

export type CandidateKind = "enforcement" | "intelligence";
export type ContentType = "penalty" | "notice" | "press_release" | "warning" | "investigation" | "other";
export type MatchKind =
  | "exact_duplicate"
  | "probable_duplicate"
  | "related_action"
  | "aggregate_participant_action"
  | "missing"
  | "intelligence_only";
export type ArticleReadiness =
  | "ready_to_publish"
  | "ready_after_qa_fix"
  | "import_or_create_first"
  | "intelligence_only";
export type QaSeverity = "info" | "warning" | "error";

export interface AggregateAction {
  /** Stable regulator action/reference identifier where the official source provides one. */
  actionId?: string;
  /** Total action amount. It is not automatically attributed to each participant. */
  totalAmount?: number;
  currency?: string;
  participantCount?: number;
}

export interface EnforcementCandidate {
  id: string;
  regulator: string;
  sourceUrl: string;
  sourceContentHash?: string | null;
  title: string;
  entity?: string | null;
  issuedDate?: string | null;
  amount?: number | null;
  currency?: string | null;
  summary?: string | null;
  candidateKind: CandidateKind;
  contentType: ContentType;
  aggregateAction?: AggregateAction | null;
  /** Optional verified override for pre-approved offline fixtures/imports. */
  officialSource?: boolean;
}

export interface ExistingEnforcementRecord {
  id: string;
  regulator: string;
  entity: string;
  sourceUrl?: string | null;
  noticeUrl?: string | null;
  sourceContentHash?: string | null;
  issuedDate?: string | null;
  amount?: number | null;
  currency?: string | null;
  summary?: string | null;
  publicCaseId?: string | null;
  requiresAmountReview?: boolean;
  amountQuality?: string | null;
  aggregateActionId?: string | null;
}

export interface CurrentStateUrl {
  url: string;
  status?: number | null;
  title?: string | null;
  indexed?: boolean;
  kind?: "methodology" | "blog" | "hub" | "legacy" | "other";
}

export interface RegulatorHubState {
  regulator: string;
  coverageEnd?: string | null;
  latestRecordDate?: string | null;
}

export interface CurrentStateSnapshot {
  capturedAt?: string;
  urls?: CurrentStateUrl[];
  regulatorHubs?: RegulatorHubState[];
  notes?: string[];
}

export interface QaIssue {
  id: string;
  severity: QaSeverity;
  code:
    | "unofficial_source"
    | "missing_source"
    | "missing_entity"
    | "missing_date"
    | "missing_amount"
    | "amount_requires_review"
    | "duplicate_source_record"
    | "aggregate_amount_repeated"
    | "broken_url"
    | "malformed_title"
    | "stale_hub_metadata"
    | "legacy_domain_indexed";
  message: string;
  candidateId?: string;
  recordIds?: string[];
  url?: string;
}

export interface MatchDecision {
  candidateId: string;
  kind: MatchKind;
  confidence: "high" | "medium" | "low";
  matchedRecordIds: string[];
  reasons: string[];
}

export interface ImportQueueItem {
  candidateId: string;
  regulator: string;
  sourceUrl: string;
  entity: string | null;
  issuedDate: string | null;
  amount: number | null;
  currency: string | null;
  reason: string;
  requiresHumanReview: true;
}

export interface ArticleBrief {
  candidateId: string;
  readiness: ArticleReadiness;
  title: string;
  sourceUrl: string;
  linkedRecordIds: string[];
  cause: string;
  failure: string;
  outcome: string;
  lesson: string;
  blockers: string[];
}

export interface CoverageReport {
  version: typeof COVERAGE_AGENT_VERSION;
  generatedAt: string;
  mode: "report_only";
  currentState: {
    checkedUrls: number;
    regulatorHubsChecked: number;
    issuesFound: number;
  };
  totals: Record<MatchKind, number>;
  decisions: MatchDecision[];
}

/** JSON Schema fragments exposed with generated artifacts for downstream tooling. */
export const coverageAgentSchemas = {
  enforcementCandidate: {
    type: "object",
    required: ["id", "regulator", "sourceUrl", "title", "candidateKind", "contentType"],
    additionalProperties: false,
    properties: {
      id: { type: "string", minLength: 1 },
      regulator: { type: "string", minLength: 1 },
      sourceUrl: { type: "string", format: "uri" },
      title: { type: "string", minLength: 1 },
      candidateKind: { enum: ["enforcement", "intelligence"] },
      contentType: { enum: ["penalty", "notice", "press_release", "warning", "investigation", "other"] },
    },
  },
  coverageReport: {
    type: "object",
    required: ["version", "generatedAt", "mode", "currentState", "totals", "decisions"],
    properties: {
      version: { const: COVERAGE_AGENT_VERSION },
      mode: { const: "report_only" },
    },
  },
} as const;
