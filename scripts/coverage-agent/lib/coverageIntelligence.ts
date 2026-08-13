import { createHash } from "node:crypto";
import {
  COVERAGE_AGENT_VERSION,
  type ArticleBrief,
  type ArticleReadiness,
  type CurrentStateSnapshot,
  type EnforcementCandidate,
  type ExistingEnforcementRecord,
  type ImportQueueItem,
  type MatchDecision,
  type MatchKind,
  type QaIssue,
  type CoverageReport,
} from "../../../src/types/coverageAgent.js";
import { getRegulatorCoverage } from "../../../src/data/regulatorCoverage.js";

export interface CoverageAgentResult {
  coverageReport: CoverageReport;
  missingRecordImportQueue: ImportQueueItem[];
  qaIssueQueue: QaIssue[];
  articleBriefs: ArticleBrief[];
}

export interface CoverageAgentOptions {
  generatedAt?: string;
  /** Allows deterministic fixture tests without changing the production registry. */
  officialDomainResolver?: (regulator: string) => string[];
}

const EMPTY_TOTALS: Record<MatchKind, number> = {
  exact_duplicate: 0,
  probable_duplicate: 0,
  related_action: 0,
  aggregate_participant_action: 0,
  missing: 0,
  intelligence_only: 0,
};

function normaliseText(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normaliseUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    }
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function hostname(value: string | null | undefined) {
  try {
    return new URL(value ?? "").hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function datesWithin(left: string | null | undefined, right: string | null | undefined, days: number) {
  if (!left || !right) return false;
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  return Number.isFinite(leftTime) && Number.isFinite(rightTime)
    && Math.abs(leftTime - rightTime) <= days * 86_400_000;
}

function amountsEqual(
  left: number | null | undefined,
  leftCurrency: string | null | undefined,
  right: number | null | undefined,
  rightCurrency: string | null | undefined,
) {
  if (left === null || left === undefined || right === null || right === undefined) return false;
  if (String(leftCurrency ?? "").toUpperCase() !== String(rightCurrency ?? "").toUpperCase()) return false;
  const tolerance = Math.max(0.01, Math.max(Math.abs(left), Math.abs(right)) * 0.001);
  return Math.abs(left - right) <= tolerance;
}

function tokenSimilarity(left: string | null | undefined, right: string | null | undefined) {
  const a = new Set(normaliseText(left).split(" ").filter(Boolean));
  const b = new Set(normaliseText(right).split(" ").filter(Boolean));
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  return intersection / new Set([...a, ...b]).size;
}

function candidateOfficial(candidate: EnforcementCandidate, resolver?: CoverageAgentOptions["officialDomainResolver"]) {
  if (candidate.officialSource === true) return true;
  const host = hostname(candidate.sourceUrl);
  if (!host) return false;
  const domains = resolver?.(candidate.regulator) ?? (getRegulatorCoverage(candidate.regulator)?.officialSources ?? [])
    .map((source) => hostname(source.url))
    .filter((value): value is string => Boolean(value));
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function recordUrls(record: ExistingEnforcementRecord) {
  return [normaliseUrl(record.sourceUrl), normaliseUrl(record.noticeUrl)].filter((url): url is string => Boolean(url));
}

function sourceGroup(records: ExistingEnforcementRecord[], candidate: EnforcementCandidate) {
  const url = normaliseUrl(candidate.sourceUrl);
  if (!url) return [];
  return records.filter((record) => record.regulator.toUpperCase() === candidate.regulator.toUpperCase() && recordUrls(record).includes(url));
}

function determineMatch(candidate: EnforcementCandidate, records: ExistingEnforcementRecord[]): MatchDecision {
  if (candidate.candidateKind === "intelligence") {
    return { candidateId: candidate.id, kind: "intelligence_only", confidence: "high", matchedRecordIds: [], reasons: ["Candidate is explicitly non-fine intelligence."] };
  }

  const regulatorRecords = records.filter((record) => record.regulator.toUpperCase() === candidate.regulator.toUpperCase());
  const sourceUrl = normaliseUrl(candidate.sourceUrl);
  const exactHash = candidate.sourceContentHash
    ? regulatorRecords.filter((record) => record.sourceContentHash === candidate.sourceContentHash)
    : [];
  if (exactHash.length) {
    return { candidateId: candidate.id, kind: "exact_duplicate", confidence: "high", matchedRecordIds: exactHash.map((record) => record.id), reasons: ["Official source content hash matches an existing RegActions record."] };
  }

  const sameSource = sourceGroup(regulatorRecords, candidate);
  const entity = normaliseText(candidate.entity);
  const sameSourceEntity = sameSource.filter((record) => entity && normaliseText(record.entity) === entity);
  if (sameSourceEntity.length) {
    return { candidateId: candidate.id, kind: "exact_duplicate", confidence: "high", matchedRecordIds: sameSourceEntity.map((record) => record.id), reasons: ["Official source URL and entity match an existing record."] };
  }

  const aggregateIdMatches = candidate.aggregateAction?.actionId
    ? regulatorRecords.filter((record) => record.aggregateActionId === candidate.aggregateAction?.actionId)
    : [];
  const sameSourceEntities = new Set(sameSource.map((record) => normaliseText(record.entity)).filter(Boolean));
  if (aggregateIdMatches.length || (sameSource.length > 1 && sameSourceEntities.size > 1)) {
    const recordsToReport = aggregateIdMatches.length ? aggregateIdMatches : sameSource;
    return {
      candidateId: candidate.id,
      kind: "aggregate_participant_action",
      confidence: "high",
      matchedRecordIds: recordsToReport.map((record) => record.id),
      reasons: ["A shared official action is associated with multiple participants; do not attribute an aggregate amount to each participant without evidence."],
    };
  }

  const exactFields = regulatorRecords.filter((record) =>
    entity && normaliseText(record.entity) === entity
      && datesWithin(candidate.issuedDate, record.issuedDate, 1)
      && amountsEqual(candidate.amount, candidate.currency, record.amount, record.currency),
  );
  if (exactFields.length) {
    return { candidateId: candidate.id, kind: "probable_duplicate", confidence: "high", matchedRecordIds: exactFields.map((record) => record.id), reasons: ["Regulator, entity, issue date and amount match; source evidence differs or is missing."] };
  }

  const related = regulatorRecords.filter((record) => {
    const entitySimilarity = tokenSimilarity(candidate.entity, record.entity);
    const summarySimilarity = tokenSimilarity(candidate.summary, record.summary);
    return datesWithin(candidate.issuedDate, record.issuedDate, 120)
      && (entitySimilarity >= 0.9 || (entitySimilarity >= 0.7 && summarySimilarity >= 0.35));
  });
  if (related.length) {
    return { candidateId: candidate.id, kind: "related_action", confidence: "medium", matchedRecordIds: related.map((record) => record.id), reasons: ["Same regulator and closely related entity/action details. This may be a press release, notice or follow-up rather than a duplicate."] };
  }

  return { candidateId: candidate.id, kind: "missing", confidence: "high", matchedRecordIds: [], reasons: [sourceUrl ? "No conservative match found in existing RegActions records." : "No valid source URL is available for matching."] };
}

function qaId(code: QaIssue["code"], stableParts: string[]) {
  return `${code}:${createHash("sha256").update(stableParts.join("|")).digest("hex").slice(0, 12)}`;
}

function malformedTitle(title: string | null | undefined) {
  const compact = String(title ?? "").trim();
  return !compact || compact.length < 12 || /(?:[-–—]\s*\d{1,2}|\(\s*[^)]*)$/.test(compact) || /\.\.\.$/.test(compact);
}

function candidateIssues(
  candidate: EnforcementCandidate,
  decision: MatchDecision,
  records: ExistingEnforcementRecord[],
  resolver?: CoverageAgentOptions["officialDomainResolver"],
) {
  const issues: QaIssue[] = [];
  const add = (severity: QaIssue["severity"], code: QaIssue["code"], message: string, recordIds?: string[]) => issues.push({
    id: qaId(code, [candidate.id, ...(recordIds ?? [])]), severity, code, message, candidateId: candidate.id, recordIds,
  });
  if (!candidate.sourceUrl) add("error", "missing_source", "Candidate has no official source URL.");
  else if (!candidateOfficial(candidate, resolver)) add("error", "unofficial_source", "Candidate source is outside the configured official regulator domains.");
  if (candidate.candidateKind === "enforcement" && !candidate.entity) add("error", "missing_entity", "Enforcement candidate has no named firm or individual.");
  if (candidate.candidateKind === "enforcement" && !candidate.issuedDate) add("error", "missing_date", "Enforcement candidate has no issued date.");
  if (candidate.contentType === "penalty" && (candidate.amount === null || candidate.amount === undefined)) add("warning", "missing_amount", "Penalty candidate has no verified monetary amount; it must not be described as a fine amount.");
  if (malformedTitle(candidate.title)) add("warning", "malformed_title", "Candidate title appears truncated or malformed and should not be promoted as metadata.");
  const amountReviewRecords = records.filter((record) => decision.matchedRecordIds.includes(record.id) && record.requiresAmountReview);
  if (amountReviewRecords.length) add("error", "amount_requires_review", "Matched record has an unresolved amount-quality review.", amountReviewRecords.map((record) => record.id));
  return issues;
}

function recordIssues(records: ExistingEnforcementRecord[]) {
  const issues: QaIssue[] = [];
  const duplicateGroups = new Map<string, ExistingEnforcementRecord[]>();
  const aggregateGroups = new Map<string, ExistingEnforcementRecord[]>();
  for (const record of records) {
    const source = normaliseUrl(record.sourceUrl) ?? normaliseUrl(record.noticeUrl);
    if (!source) continue;
    const amount = record.amount === null || record.amount === undefined ? "unknown" : String(record.amount);
    const regulator = record.regulator.toUpperCase();
    const entity = normaliseText(record.entity);
    // A regulator's generic listing URL can legitimately host more than one
    // action for an entity. Treat a repeat as a duplicate only when the date
    // and amount also agree, or when the trusted source content hash agrees.
    const duplicateKey = record.sourceContentHash
      ? `${regulator}|hash:${record.sourceContentHash}|${entity}`
      : `${regulator}|url:${source}|${entity}|${record.issuedDate ?? "unknown"}|${amount}|${String(record.currency ?? "").toUpperCase()}`;
    duplicateGroups.set(duplicateKey, [...(duplicateGroups.get(duplicateKey) ?? []), record]);
    // Repeated money is only evidence of an aggregate allocation within one
    // action. A date and (where present) a regulator action ID prevent the
    // check conflating separate actions that happen to share an amount.
    const aggregateKey = record.aggregateActionId
      ? `${regulator}|action:${record.aggregateActionId}|${amount}|${String(record.currency ?? "").toUpperCase()}`
      : `${regulator}|url:${source}|${record.issuedDate ?? "unknown"}|${amount}|${String(record.currency ?? "").toUpperCase()}`;
    aggregateGroups.set(aggregateKey, [...(aggregateGroups.get(aggregateKey) ?? []), record]);
  }
  for (const group of duplicateGroups.values()) {
    if (group.length < 2) continue;
    issues.push({ id: qaId("duplicate_source_record", group.map((record) => record.id)), severity: "error", code: "duplicate_source_record", message: "Multiple records share regulator, entity and official source URL.", recordIds: group.map((record) => record.id) });
  }
  for (const group of aggregateGroups.values()) {
    const entities = new Set(group.map((record) => normaliseText(record.entity)).filter(Boolean));
    if (group.length < 2 || entities.size < 2) continue;
    issues.push({ id: qaId("aggregate_amount_repeated", group.map((record) => record.id)), severity: "warning", code: "aggregate_amount_repeated", message: "The same official source amount appears across multiple participants. Confirm whether it is aggregate before attributing it to each participant.", recordIds: group.map((record) => record.id) });
  }
  return issues;
}

function currentStateIssues(snapshot: CurrentStateSnapshot | undefined) {
  const issues: QaIssue[] = [];
  if (!snapshot) return issues;
  for (const entry of snapshot.urls ?? []) {
    if ((entry.status ?? 200) >= 400) issues.push({ id: qaId("broken_url", [entry.url]), severity: "error", code: "broken_url", message: `Current-state URL returned HTTP ${entry.status}.`, url: entry.url });
    if (entry.title && malformedTitle(entry.title)) issues.push({ id: qaId("malformed_title", [entry.url]), severity: "warning", code: "malformed_title", message: "Current-state page title appears truncated or malformed.", url: entry.url });
    const host = hostname(entry.url);
    if (entry.indexed && host && host !== "regactions.com" && host.endsWith("memaconsultants.com")) issues.push({ id: qaId("legacy_domain_indexed", [entry.url]), severity: "warning", code: "legacy_domain_indexed", message: "An indexed legacy domain URL requires canonicalisation/delisting review.", url: entry.url });
  }
  for (const hub of snapshot.regulatorHubs ?? []) {
    if (!hub.coverageEnd || !hub.latestRecordDate) continue;
    if (Date.parse(hub.latestRecordDate) > Date.parse(`${hub.coverageEnd}-12-31`)) issues.push({ id: qaId("stale_hub_metadata", [hub.regulator, hub.coverageEnd, hub.latestRecordDate]), severity: "warning", code: "stale_hub_metadata", message: `${hub.regulator} hub coverage metadata ends at ${hub.coverageEnd}, before its latest record ${hub.latestRecordDate}.` });
  }
  return issues;
}

function briefFor(candidate: EnforcementCandidate, decision: MatchDecision, issues: QaIssue[]): ArticleBrief {
  const errors = issues.filter((issue) => issue.severity === "error");
  const hasAggregateRisk = decision.kind === "aggregate_participant_action";
  const hasUnverifiedPenaltyAmount = candidate.contentType === "penalty"
    && (candidate.amount === null || candidate.amount === undefined || !candidate.currency);
  const readiness: ArticleReadiness = candidate.candidateKind === "intelligence"
    ? "intelligence_only"
    : decision.kind === "missing"
      ? "import_or_create_first"
      : errors.length || hasAggregateRisk || hasUnverifiedPenaltyAmount || decision.kind === "probable_duplicate"
        ? "ready_after_qa_fix"
        : "ready_to_publish";
  const sourceName = candidate.entity || `${candidate.regulator} enforcement action`;
  const summary = candidate.summary?.trim() || candidate.title;
  return {
    candidateId: candidate.id,
    readiness,
    title: candidate.title,
    sourceUrl: candidate.sourceUrl,
    linkedRecordIds: decision.matchedRecordIds,
    cause: `Official ${candidate.regulator} material identifies ${sourceName} in connection with ${summary}.`,
    failure: candidate.summary?.trim() || "State only the documented regulatory failure; do not infer conduct beyond the official source.",
    outcome: candidate.amount !== null && candidate.amount !== undefined
      ? `The official source records ${candidate.currency ?? "the stated currency"} ${candidate.amount.toLocaleString("en-GB")}; confirm whether this is entity-specific or aggregate before publication.`
      : "The outcome is documented without asserting an unverified monetary amount.",
    lesson: "Explain the control, reporting, governance or conduct lesson evidenced by the official action, without turning the benchmark into an accept/reject recommendation.",
    blockers: [...decision.reasons, ...issues.map((issue) => issue.message)],
  };
}

export function runCoverageIntelligenceAgent(
  candidates: EnforcementCandidate[],
  existingRecords: ExistingEnforcementRecord[],
  currentState?: CurrentStateSnapshot,
  options: CoverageAgentOptions = {},
): CoverageAgentResult {
  const decisions = candidates.map((candidate) => determineMatch(candidate, existingRecords));
  const decisionById = new Map(decisions.map((decision) => [decision.candidateId, decision]));
  const candidateQa = candidates.flatMap((candidate) => candidateIssues(candidate, decisionById.get(candidate.id)!, existingRecords, options.officialDomainResolver));
  const qaIssueQueue = [...currentStateIssues(currentState), ...recordIssues(existingRecords), ...candidateQa]
    .sort((left, right) => left.severity.localeCompare(right.severity) || left.id.localeCompare(right.id));
  const issuesByCandidate = new Map<string, QaIssue[]>();
  for (const issue of candidateQa) issuesByCandidate.set(issue.candidateId!, [...(issuesByCandidate.get(issue.candidateId!) ?? []), issue]);
  const articleBriefs = candidates.map((candidate) => briefFor(candidate, decisionById.get(candidate.id)!, issuesByCandidate.get(candidate.id) ?? []));
  const missingRecordImportQueue = candidates
    .filter((candidate) => decisionById.get(candidate.id)?.kind === "missing")
    .map((candidate): ImportQueueItem => ({ candidateId: candidate.id, regulator: candidate.regulator, sourceUrl: candidate.sourceUrl, entity: candidate.entity ?? null, issuedDate: candidate.issuedDate ?? null, amount: candidate.amount ?? null, currency: candidate.currency ?? null, reason: "No conservative match found in existing RegActions records.", requiresHumanReview: true }));
  const totals = { ...EMPTY_TOTALS };
  for (const decision of decisions) totals[decision.kind] += 1;
  return {
    coverageReport: {
      version: COVERAGE_AGENT_VERSION,
      generatedAt: options.generatedAt ?? new Date().toISOString(),
      mode: "report_only",
      currentState: { checkedUrls: currentState?.urls?.length ?? 0, regulatorHubsChecked: currentState?.regulatorHubs?.length ?? 0, issuesFound: qaIssueQueue.filter((issue) => !issue.candidateId && !issue.recordIds?.length).length },
      totals,
      decisions,
    },
    missingRecordImportQueue,
    qaIssueQueue,
    articleBriefs,
  };
}
