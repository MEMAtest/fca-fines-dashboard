import towerRepairDocument from "../scraper/data/fmanzTowerFalseReview20261029.json" with { type: "json" };
import {
  fmanzBodySha256,
  fmanzNormalizedBodySha256,
  getReviewedFmanzAmountEvents,
  normalizeFmanzAmountIdentity,
  normalizeFmanzAmountSourceUrl,
  FMANZ_GENERIC_AMOUNT_REVIEW_REASON,
} from "../scraper/fmanzAmountAttribution.js";

export interface FmanzTowerFalseReviewRepair {
  version: number;
  regulator: string;
  target: {
    sourceRowId: string;
    publicCaseId: string;
    firm: string;
    date: string;
    amountOriginal: string;
    currency: string;
    sourceUrl: string;
    noticeUrl: string;
  };
  review: {
    status: string;
    reason: string;
    evidenceUrl: string;
    detectedAt: string;
    updatedAt: string;
    reviewedBy: string | null;
    reviewedAt: string | null;
  };
  bodyEvidence: {
    acceptedBodySha256: string;
    currentBodySha256: string;
    normalizedBodySha256: string;
    normalization: string;
  };
  expectedProjection: {
    currentQuality: string;
    currentRequiresReview: boolean;
    currentTrustedAmountGbp: string | null;
    clearedQuality: string;
    clearedAmountOriginal: string;
    clearedAmountGbp: string;
    clearedAmountEur: string;
  };
}

export const FMANZ_TOWER_FALSE_REVIEW_REPAIR = towerRepairDocument as FmanzTowerFalseReviewRepair;
export const FMANZ_TOWER_FALSE_REVIEW_TARGET = "reviewed-fmanz-tower-false-review-v1";

function decimalCents(value: unknown): bigint | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  const match = text.match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  const fractional = match[3] ?? "";
  if (fractional.length > 2 && /[^0]/.test(fractional.slice(2))) return null;
  const cents = BigInt(match[2]!) * 100n + BigInt(fractional.slice(0, 2).padEnd(2, "0") || "0");
  return match[1] === "-" ? -cents : cents;
}

export function exactDecimalEqual(actual: unknown, expected: string | null) {
  if (expected === null) return actual === null || actual === undefined;
  if (actual === null || actual === undefined) return false;
  const actualCents = decimalCents(actual);
  const expectedCents = decimalCents(expected);
  return actualCents !== null && expectedCents !== null && actualCents === expectedCents;
}

export function validateFmanzTowerFalseReviewRepair(contract: FmanzTowerFalseReviewRepair) {
  const target = contract.target;
  const body = contract.bodyEvidence;
  const reviewedEvent = getReviewedFmanzAmountEvents().find((event) =>
    normalizeFmanzAmountIdentity(event.firm) === normalizeFmanzAmountIdentity(target.firm)
    && event.date === target.date
    && event.amount === Number(target.amountOriginal)
    && event.currency === target.currency
    && normalizeFmanzAmountSourceUrl(event.sourceUrl) === normalizeFmanzAmountSourceUrl(target.sourceUrl)
    && normalizeFmanzAmountSourceUrl(event.noticeUrl) === normalizeFmanzAmountSourceUrl(target.noticeUrl)
    && event.bodySha256 === body.acceptedBodySha256
    && event.normalizedBodySha256 === body.normalizedBodySha256,
  );
  if (
    contract.version !== 1
    || contract.regulator !== "FMANZ"
    || target.sourceRowId !== "eae9082c-5786-404a-9324-7f84a0e4d9ac"
    || target.publicCaseId !== "10233696-2ef2-4b12-8f10-80ab4a110316"
    || target.firm !== "Tower Limited"
    || target.date !== "2025-12-09"
    || !exactDecimalEqual(target.amountOriginal, "7000000.00")
    || target.currency !== "NZD"
    || normalizeFmanzAmountSourceUrl(target.sourceUrl) !== "https://www.fma.govt.nz/about-us/enforcement/cases/tower-limited"
    || normalizeFmanzAmountSourceUrl(target.noticeUrl) !== "https://www.fma.govt.nz/about-us/enforcement/cases/tower-limited"
    || contract.review.status !== "required"
    || contract.review.reason !== FMANZ_GENERIC_AMOUNT_REVIEW_REASON
    || contract.review.evidenceUrl !== target.sourceUrl
    || contract.review.detectedAt !== "2026-10-28T05:41:50.054914Z"
    || contract.review.updatedAt !== contract.review.detectedAt
    || contract.review.reviewedBy !== null
    || contract.review.reviewedAt !== null
    || !/^[a-f0-9]{64}$/.test(body.acceptedBodySha256)
    || !/^[a-f0-9]{64}$/.test(body.currentBodySha256)
    || !/^[a-f0-9]{64}$/.test(body.normalizedBodySha256)
    || !reviewedEvent
  ) {
    throw new Error("Tower false-review repair manifest no longer matches the independently reviewed exact event and false-positive review provenance.");
  }
  return true;
}

export interface TowerRawRow {
  id: string;
  regulator: string;
  firm_individual: string;
  date_issued: string | Date;
  amount: unknown;
  currency: string;
  source_url: string;
  final_notice_url: string;
  raw_payload: string | Record<string, unknown>;
}

export function verifyFmanzTowerRawRow(row: TowerRawRow, contract = FMANZ_TOWER_FALSE_REVIEW_REPAIR) {
  const target = contract.target;
  const payload = typeof row.raw_payload === "string" ? JSON.parse(row.raw_payload) as Record<string, unknown> : row.raw_payload;
  const detail = payload.detail && typeof payload.detail === "object" ? payload.detail as Record<string, unknown> : {};
  const body = typeof detail.body === "string" ? detail.body : "";
  const date = row.date_issued instanceof Date ? row.date_issued.toISOString().slice(0, 10) : String(row.date_issued).slice(0, 10);
  if (
    row.id !== target.sourceRowId
    || row.regulator !== "FMANZ"
    || normalizeFmanzAmountIdentity(row.firm_individual) !== normalizeFmanzAmountIdentity(target.firm)
    || date !== target.date
    || !exactDecimalEqual(row.amount, target.amountOriginal)
    || row.currency !== target.currency
    || normalizeFmanzAmountSourceUrl(row.source_url) !== normalizeFmanzAmountSourceUrl(target.sourceUrl)
    || normalizeFmanzAmountSourceUrl(row.final_notice_url) !== normalizeFmanzAmountSourceUrl(target.noticeUrl)
    || detail.title !== target.firm
    || detail.dateIssued !== target.date
    || fmanzBodySha256(body) !== contract.bodyEvidence.currentBodySha256
    || fmanzNormalizedBodySha256(body) !== contract.bodyEvidence.normalizedBodySha256
  ) {
    throw new Error("Tower raw source row differs from the exact reviewed ID, native amount, event, source URLs, or current body digests; refusing repair.");
  }
  return true;
}

export interface TowerReviewRow {
  source_row_id: string;
  review_status: string;
  reason: string;
  evidence_url: string;
  detected_at: string;
  updated_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

export function verifyFmanzTowerRequiredReview(row: TowerReviewRow, contract = FMANZ_TOWER_FALSE_REVIEW_REPAIR) {
  const expected = contract.review;
  if (
    row.source_row_id !== contract.target.sourceRowId
    || row.review_status !== expected.status
    || row.reason !== expected.reason
    || row.evidence_url !== expected.evidenceUrl
    || row.detected_at !== expected.detectedAt
    || row.updated_at !== expected.updatedAt
    || row.reviewed_by !== expected.reviewedBy
    || row.reviewed_at !== expected.reviewedAt
  ) {
    throw new Error("Tower review marker is not the exact generic false-positive row from the audited FMA run; refusing repair.");
  }
  return true;
}

export function verifyFmanzTowerProjection(
  row: Record<string, unknown> | undefined,
  state: "current" | "cleared",
  contract = FMANZ_TOWER_FALSE_REVIEW_REPAIR,
) {
  if (!row) throw new Error("Tower trusted projection row is missing.");
  const target = contract.target;
  const expected = contract.expectedProjection;
  const mismatch: string[] = [];
  const check = (field: string, matches: boolean) => { if (!matches) mismatch.push(field); };
  check("id", String(row.id) === target.sourceRowId);
  check("regulator", String(row.regulator).toUpperCase() === "FMANZ");
  check("public_case_id", row.public_case_id === target.publicCaseId);
  check("firm_individual", normalizeFmanzAmountIdentity(String(row.firm_individual)) === normalizeFmanzAmountIdentity(target.firm));
  check("date_issued", String(row.date_issued).slice(0, 10) === target.date);
  check("amount_original", exactDecimalEqual(row.amount_original, target.amountOriginal));
  check("currency", row.currency === target.currency);
  if (state === "current") {
    check("amount_quality", row.amount_quality === expected.currentQuality);
    check("requires_amount_review", row.requires_amount_review === expected.currentRequiresReview);
    check("trusted_amount_gbp", exactDecimalEqual(row.trusted_amount_gbp, expected.currentTrustedAmountGbp));
    check("amount_review_reason", row.amount_review_reason === FMANZ_GENERIC_AMOUNT_REVIEW_REASON);
  } else {
    check("amount_quality", row.amount_quality === expected.clearedQuality);
    check("requires_amount_review", row.requires_amount_review !== true);
    check("amount_gbp", exactDecimalEqual(row.amount_gbp, expected.clearedAmountGbp));
    check("amount_eur", exactDecimalEqual(row.amount_eur, expected.clearedAmountEur));
    check("trusted_amount_gbp", exactDecimalEqual(row.trusted_amount_gbp, expected.clearedAmountGbp));
    check("trusted_amount_eur", exactDecimalEqual(row.trusted_amount_eur, expected.clearedAmountEur));
  }
  if (mismatch.length) throw new Error(`Tower ${state} projection differs from the exact reviewed baseline in: ${mismatch.join(", ")}.`);
  return true;
}
