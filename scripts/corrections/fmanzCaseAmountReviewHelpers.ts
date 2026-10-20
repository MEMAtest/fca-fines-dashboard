import { createHash } from "node:crypto";

export interface FmanzCaseAmountReviewTarget {
  rawId: string;
  contentHash: string;
  publicCaseId: string;
  firm: string;
  date: string;
  rawAmount: string;
  candidateAmount: string;
  currency: "NZD";
  sourceUrl: string;
  noticeUrl: string;
  evidenceUrl: string;
  reason: string;
}

export interface FmanzCaseAmountReviewContract {
  schemaVersion: number;
  status: string;
  contract: { path: string; sha256: string };
  baseline: {
    path: string;
    sha256: string;
    rawFmanzRows: number;
    rawRowsSha256: string;
    publicFmanzRows: number;
    publicIdsSha256: string;
    fmanzOverrideRows: number;
  };
  candidate: { path: string; sha256: string; beforeGlobalPublicRows: number };
  sourcePreview: { path: string; sha256: string; recordCount: number; recordIdHash: string };
  targetOverrideSnapshot: { path: string; sha256: string; heldRowEvidenceUrlOverrideCount: number; heldRowEvidenceUrlOverridesSha256: string };
  inputs: Array<{ role: string; path: string; sha256: string }>;
  expectedExistingPublicIds: string[];
  expectedNotYetPublicIds: string[];
  expectedExistingPublicRows: Array<{
    id: string; publicCaseId: string; canonicalCaseId: string; firm: string; date: string;
    amount: string; amountGbp: string; currency: string; noticeUrl: string; sourceUrl: string;
  }>;
  heldRows: FmanzCaseAmountReviewTarget[];
}

export type FmanzCaseReviewStoredSource = {
  id: string;
  content_hash: string;
  regulator: string;
  firm_individual: string;
  date_issued: string;
  source_url: string;
  final_notice_url: string | null;
  amount: string | null;
  currency: string;
};

type ReviewRow = {
  source_row_id: string;
  review_status: string;
  reason: string;
  evidence_url: string;
};

type ProjectionSnapshotRow = {
  regulator: string;
  source_row_id: string;
  public_case_id: string;
  row: Record<string, unknown>;
};

const normalizeIdentity = (value: string) =>
  value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();

function normalizeDecimal(value: string | null) {
  if (value === null) return null;
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return value;
  const fraction = (match[3] ?? "").replace(/0+$/, "");
  return `${match[1]}${match[2]}${fraction ? `.${fraction}` : ""}`;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>).sort().map((key) => [
        key,
        stableValue((value as Record<string, unknown>)[key]),
      ]),
    );
  }
  return value;
}

export function sha256StableJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex");
}

export function validateFmanzCaseAmountReviewContract(contract: FmanzCaseAmountReviewContract) {
  const hash = /^[a-f0-9]{64}$/;
  const targets = contract.heldRows;
  const rawIds = new Set(targets.map((row) => row.rawId));
  const publicIds = new Set(targets.map((row) => row.publicCaseId));
  const existing = new Set(contract.expectedExistingPublicIds);
  const absent = new Set(contract.expectedNotYetPublicIds);
  if (
    contract.schemaVersion !== 1
    || contract.status !== "proposed_for_independent_review_not_applied"
    || !hash.test(contract.contract.sha256)
    || !hash.test(contract.baseline.sha256)
    || !hash.test(contract.baseline.rawRowsSha256)
    || !hash.test(contract.baseline.publicIdsSha256)
    || !hash.test(contract.candidate.sha256)
    || !hash.test(contract.sourcePreview.sha256)
    || !hash.test(contract.sourcePreview.recordIdHash)
    || !hash.test(contract.targetOverrideSnapshot.sha256)
    || !hash.test(contract.targetOverrideSnapshot.heldRowEvidenceUrlOverridesSha256)
    || contract.targetOverrideSnapshot.heldRowEvidenceUrlOverrideCount !== 9
    || contract.inputs.length < 7
    || contract.baseline.rawFmanzRows !== 408
    || contract.baseline.publicFmanzRows !== 96
    || contract.baseline.fmanzOverrideRows !== 134
    || contract.sourcePreview.recordCount !== 98
    || contract.candidate.beforeGlobalPublicRows !== 90266
    || targets.length !== 10
    || rawIds.size !== targets.length
    || publicIds.size !== targets.length
    || existing.size !== 8
    || absent.size !== 2
    || contract.expectedExistingPublicRows.length !== 8
    || new Set(contract.expectedExistingPublicRows.map((row) => row.publicCaseId)).size !== 8
    || existing.size + absent.size !== publicIds.size
    || [...existing].some((id) => !publicIds.has(id))
    || [...absent].some((id) => !publicIds.has(id) || existing.has(id))
  ) {
    throw new Error("FMANZ case-amount review contract does not match its pinned ten-row v2 evidence set.");
  }
  if (contract.inputs.some((input) => !input.role || !input.path.startsWith("/Users/") || !hash.test(input.sha256))) {
    throw new Error("FMANZ review contract contains an invalid pinned input artifact reference.");
  }
  for (const row of targets) {
    if (
      !hash.test(row.contentHash)
      || !row.firm
      || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)
      || !row.rawAmount
      || !row.candidateAmount
      || row.currency !== "NZD"
      || !row.sourceUrl.startsWith("https://www.fma.govt.nz/")
      || !row.noticeUrl.startsWith("https://")
      || !row.evidenceUrl.startsWith("https://www.fma.govt.nz/")
      || !row.reason.trim()
    ) {
      throw new Error(`Invalid FMANZ case-amount review target ${row.rawId}.`);
    }
  }
  const amountMismatches = targets.filter((row) => normalizeDecimal(row.rawAmount) !== normalizeDecimal(row.candidateAmount));
  if (amountMismatches.length !== 1 || amountMismatches[0]?.rawId !== "62cbe544-5f28-42f2-a148-0afd6610fe83") {
    throw new Error("FMANZ candidate/raw amount discrepancies differ from the separately reviewed CBL amount mismatch.");
  }
  return true;
}

export function verifyFmanzCaseReviewSourceRows(
  storedRows: FmanzCaseReviewStoredSource[],
  contract: FmanzCaseAmountReviewContract,
) {
  if (storedRows.length !== contract.heldRows.length) {
    throw new Error(`Expected ten exact FMANZ review source rows; found ${storedRows.length}.`);
  }
  const byId = new Map(storedRows.map((row) => [row.id, row]));
  if (byId.size !== storedRows.length) throw new Error("FMANZ review source result contains duplicate raw IDs.");
  for (const expected of contract.heldRows) {
    const row = byId.get(expected.rawId);
    if (!row) throw new Error(`Reviewed FMANZ source row is missing: ${expected.rawId}.`);
    if (
      row.content_hash !== expected.contentHash
      || row.regulator.toUpperCase() !== "FMANZ"
      || normalizeIdentity(row.firm_individual) !== normalizeIdentity(expected.firm)
      || row.date_issued !== expected.date
      || row.source_url !== expected.sourceUrl
      || row.final_notice_url !== expected.noticeUrl
      || normalizeDecimal(row.amount) !== normalizeDecimal(expected.rawAmount)
      || row.currency !== expected.currency
    ) {
      throw new Error(`FMANZ review source row ${expected.rawId} differs from its exact reviewed raw identity and amount.`);
    }
  }
}

export function verifyFmanzCaseReviewRows(
  storedRows: ReviewRow[],
  contract: FmanzCaseAmountReviewContract,
) {
  if (storedRows.length === 0) return "empty" as const;
  if (storedRows.length !== contract.heldRows.length) {
    throw new Error("FMANZ review table has a partial or unexpected target set; refusing to continue.");
  }
  const byId = new Map(storedRows.map((row) => [row.source_row_id, row]));
  if (byId.size !== storedRows.length) throw new Error("FMANZ review table returned duplicate target rows.");
  for (const target of contract.heldRows) {
    const row = byId.get(target.rawId);
    if (!row || row.review_status !== "required" || row.reason !== fmanzCaseAmountReviewReason(target) || row.evidence_url !== target.evidenceUrl) {
      throw new Error(`FMANZ review table target ${target.rawId} differs from the exact proposed required review.`);
    }
  }
  return "already-exact" as const;
}

export function verifyFmanzCaseReviewPublicIds(
  rows: Array<{ public_case_id: string }>,
  contract: FmanzCaseAmountReviewContract,
) {
  const ids = rows.map((row) => row.public_case_id).sort();
  const publicIdHash = createHash("sha256").update(ids.join("\n")).digest("hex");
  if (
    ids.length !== contract.baseline.publicFmanzRows
    || publicIdHash !== contract.baseline.publicIdsSha256
  ) {
    throw new Error("FMANZ public-case ID set differs from the reviewed baseline; refusing review flags.");
  }
  const current = new Set(ids);
  if (
    contract.expectedExistingPublicIds.some((id) => !current.has(id))
    || contract.expectedNotYetPublicIds.some((id) => current.has(id))
  ) {
    throw new Error("The ten-row FMANZ public intersection differs from the reviewed eight-visible/two-not-yet-public set.");
  }
}

export function verifyFmanzCaseReviewPublicRows(
  rows: Array<Record<string, unknown>>,
  contract: FmanzCaseAmountReviewContract,
  alreadyReviewed = false,
) {
  if (rows.length !== contract.expectedExistingPublicRows.length) {
    throw new Error(`Expected eight visible FMANZ held rows; found ${rows.length}.`);
  }
  const byId = new Map(rows.map((row) => [String(row.public_case_id), row]));
  if (byId.size !== rows.length) throw new Error("FMANZ held public rows contain duplicate public IDs.");
  for (const expected of contract.expectedExistingPublicRows) {
    const row = byId.get(expected.publicCaseId);
    if (!row) throw new Error(`Expected existing FMANZ public held row is missing: ${expected.publicCaseId}.`);
    const correct = row.id === expected.id
      && row.canonical_case_id === expected.canonicalCaseId
      && normalizeIdentity(String(row.firm_individual ?? "")) === normalizeIdentity(expected.firm)
      && String(row.date_issued).slice(0, 10) === expected.date
      && normalizeDecimal(row.amount_original === null ? null : String(row.amount_original)) === normalizeDecimal(expected.amount)
      && normalizeDecimal(row.amount_gbp === null ? null : String(row.amount_gbp)) === normalizeDecimal(expected.amountGbp)
      && row.currency === expected.currency
      && row.notice_url === expected.noticeUrl
      && row.source_url === expected.sourceUrl
      && row.amount_quality === (alreadyReviewed ? "aggregate_unallocated" : "derived_explicit")
      && row.requires_amount_review === (alreadyReviewed ? true : null)
      && (alreadyReviewed
        ? row.trusted_amount_gbp === null && row.trusted_amount_eur === null
          && row.amount_review_reason === fmanzCaseAmountReviewReason(contract.heldRows.find((held) => held.publicCaseId === expected.publicCaseId)!)
        : true);
    if (!correct) throw new Error(`FMANZ public row ${expected.publicCaseId} differs from its exact baseline identity or amount fields.`);
  }
}

export function fmanzCaseAmountReviewReason(target: FmanzCaseAmountReviewTarget) {
  return `Source-event review required: ${target.reason}`;
}

export function assertFmanzReviewProjectionPreserved(
  before: ProjectionSnapshotRow[],
  after: ProjectionSnapshotRow[],
  contract: FmanzCaseAmountReviewContract,
) {
  const toMap = (rows: ProjectionSnapshotRow[], side: string) => {
    const map = new Map<string, ProjectionSnapshotRow>();
    for (const row of rows) {
      const key = JSON.stringify([row.regulator, row.source_row_id, row.public_case_id]);
      if (map.has(key)) throw new Error(`FMANZ review public snapshot has a duplicate key on ${side}.`);
      map.set(key, row);
    }
    return map;
  };
  const beforeByKey = toMap(before, "before");
  const afterByKey = toMap(after, "after");
  if (beforeByKey.size !== afterByKey.size) throw new Error("All-regulator public projection row count changed during FMANZ review.");
  const visible = new Map(contract.heldRows.map((target) => [target.publicCaseId, target]));
  for (const [key, old] of beforeByKey) {
    const current = afterByKey.get(key);
    if (!current) throw new Error(`All-regulator public projection row disappeared during FMANZ review: ${key}.`);
    const target = old.regulator.toUpperCase() === "FMANZ" ? visible.get(old.public_case_id) : undefined;
    if (!target) {
      if (!/^[a-f0-9]{64}$/.test(String(old.row.fullRowSha256 ?? ""))
        || !/^[a-f0-9]{64}$/.test(String(current.row.fullRowSha256 ?? ""))) {
        throw new Error(`Non-target public projection row is missing its full-row digest: ${key}.`);
      }
      if (JSON.stringify(stableValue(old.row)) !== JSON.stringify(stableValue(current.row))) {
        throw new Error(`Non-target public projection changed during FMANZ review: ${key}.`);
      }
      continue;
    }
    const expected = { ...old.row };
    expected.amount_quality = "aggregate_unallocated";
    expected.requires_amount_review = true;
    expected.amount_review_reason = fmanzCaseAmountReviewReason(target);
    expected.trusted_amount_gbp = null;
    expected.trusted_amount_eur = null;
    if (JSON.stringify(stableValue(expected)) !== JSON.stringify(stableValue(current.row))) {
      throw new Error(`FMANZ public row ${target.publicCaseId} changed outside the exact trusted-amount review fields.`);
    }
  }
  const afterKeys = new Set(after
    .filter((row) => row.regulator.toUpperCase() === "FMANZ")
    .map((row) => row.public_case_id));
  for (const target of contract.heldRows) {
    if (contract.expectedExistingPublicIds.includes(target.publicCaseId) && !afterKeys.has(target.publicCaseId)) {
      throw new Error(`Reviewed FMANZ public case disappeared after review: ${target.publicCaseId}.`);
    }
    if (contract.expectedNotYetPublicIds.includes(target.publicCaseId) && afterKeys.has(target.publicCaseId)) {
      throw new Error(`FMANZ public case unexpectedly appeared during review-only operation: ${target.publicCaseId}.`);
    }
  }
}

export function verifyFmanzRawCorpus(rows: unknown[], contract: FmanzCaseAmountReviewContract) {
  if (rows.length !== contract.baseline.rawFmanzRows) {
    throw new Error(`FMANZ raw corpus count differs from baseline: expected ${contract.baseline.rawFmanzRows}, found ${rows.length}.`);
  }
  const digest = sha256StableJson(rows);
  if (digest !== contract.baseline.rawRowsSha256) {
    throw new Error("FMANZ raw corpus content digest differs from the reviewed 408-row baseline.");
  }
  return digest;
}

export function assertSameFmanzSnapshot(label: string, before: unknown, after: unknown) {
  if (JSON.stringify(stableValue(before)) !== JSON.stringify(stableValue(after))) {
    throw new Error(`${label} changed during FMANZ case-amount review; transaction must roll back.`);
  }
}
