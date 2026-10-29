import { fingerprintAsicSourcePassage } from "../scraper/asicAmountAttribution.js";

export interface Asic26252GroupReviewTarget {
  id: string;
  publicCaseId: string;
  contentHash: string;
  firm: string;
}

export interface Asic26252GroupReviewContract {
  version: number;
  target: string;
  regulator: string;
  releaseCode: string;
  date: string;
  noticeUrl: string;
  sourceUrl: string;
  currency: string;
  storedGroupHeadlineAmount: string;
  officialGroupTotal: string;
  officialPerEntityAmount: string;
  currentAmountGbp: string;
  currentAmountEur: string;
  currentAmountQuality: string;
  currentRequiresAmountReview: boolean | null;
  heldAmountQuality: string;
  sourceReviewStatus: string;
  sourceContentHash: string;
  reviewReason: string;
  officialPassage: string;
  officialPassageSha256: string;
  targets: Asic26252GroupReviewTarget[];
}

export const ASIC_26252_OFFICIAL_NOTICE_URL =
  "https://www.asic.gov.au/about-asic/news-centre/find-a-media-release/2026-releases/26-252mr-visy-and-pratt-companies-pay-over-41-million-in-infringement-notices-for-failing-to-lodge-financial-reports-on-time";
export const ASIC_26252_GROUP_REVIEW_TARGET = "asic-26-252mr-exact-21-review-only-v1";

function norm(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-AU");
}

/** Strict static contract guard: exactly the 21 named parties, no inferred siblings. */
export function validateAsic26252GroupReviewContract(contract: Asic26252GroupReviewContract) {
  const ids = new Set(contract.targets.map((target) => target.id));
  const publicIds = new Set(contract.targets.map((target) => target.publicCaseId));
  const contentHashes = new Set(contract.targets.map((target) => target.contentHash));
  const firms = new Set(contract.targets.map((target) => norm(target.firm)));
  const expectedFields = contract.version === 1
    && contract.target === ASIC_26252_GROUP_REVIEW_TARGET
    && contract.regulator === "ASIC"
    && contract.releaseCode === "26-252MR"
    && contract.date === "2026-10-15"
    && contract.noticeUrl === ASIC_26252_OFFICIAL_NOTICE_URL
    && contract.currency === "AUD"
    && contract.storedGroupHeadlineAmount === "4100000.00"
    && contract.officialGroupTotal === "4158000.00"
    && contract.officialPerEntityAmount === "198000.00"
    && contract.currentAmountGbp === "2091000.00"
    && contract.currentAmountEur === "2460000.00"
    && contract.currentAmountQuality === "reported"
    && contract.currentRequiresAmountReview === null
    && contract.heldAmountQuality === "aggregate_unallocated"
    && contract.sourceReviewStatus === "clear"
    && contract.sourceUrl === "https://www.asic.gov.au/online-services/search-asic-registers/infringement-notices-register/"
    && contract.targets.length === 21
    && ids.size === 21 && publicIds.size === 21 && contentHashes.size === 21 && firms.size === 21
    && contract.targets.every((target) =>
      /^[0-9a-f-]{36}$/i.test(target.id)
      && /^[0-9a-f]{32}$/i.test(target.publicCaseId)
      && /^[0-9a-f]{64}$/i.test(target.contentHash)
      && target.firm.trim().length > 0,
    )
    && /^[0-9a-f]{64}$/i.test(contract.sourceContentHash)
    && contract.reviewReason.startsWith("Source-event review required:")
    && fingerprintAsicSourcePassage(contract.officialPassage) === contract.officialPassageSha256;

  if (!expectedFields) {
    throw new Error("ASIC 26-252MR review contract must pin the exact 21-party source group and valid evidence fingerprints.");
  }
  return true;
}

export function validateAsic26252Roster(
  contract: Asic26252GroupReviewContract,
  sourceRoster: string[],
) {
  const actual = new Set(sourceRoster.map(norm));
  const pinned = new Set(contract.targets.map((target) => norm(target.firm)));
  if (sourceRoster.length !== 21 || actual.size !== 21 || pinned.size !== 21
    || actual.size !== pinned.size || [...actual].some((name) => !pinned.has(name))) {
    throw new Error("ASIC 26-252MR roster differs from the exact 21 named official-source firms.");
  }
  return true;
}

export function isExactAsic26252ReviewMarkerSet(
  contract: Asic26252GroupReviewContract,
  reviews: Array<Record<string, unknown>>,
) {
  const targetIds = new Set(contract.targets.map((target) => target.id));
  return reviews.length === 21
    && new Set(reviews.map((review) => String(review.source_row_id))).size === 21
    && reviews.every((review) => targetIds.has(String(review.source_row_id))
      && review.review_status === "required"
      && review.reason === contract.reviewReason
      && review.evidence_url === contract.noticeUrl
      && review.reviewed_by === null
      && review.reviewed_at === null);
}

export function validateAsic26252CurrentRows(
  contract: Asic26252GroupReviewContract,
  rows: Array<Record<string, unknown>>,
  state: "unheld" | "held" = "unheld",
) {
  const byId = new Map(rows.map((row) => [String(row.id), row]));
  if (rows.length !== 21 || byId.size !== 21) {
    throw new Error(`ASIC 26-252MR exact current group must contain 21 distinct physical rows; found ${rows.length}.`);
  }
  for (const target of contract.targets) {
    const row = byId.get(target.id);
    if (!row) throw new Error(`ASIC 26-252MR pinned row ${target.id} is missing.`);
    const mismatches: string[] = [];
    const check = (name: string, matches: boolean) => { if (!matches) mismatches.push(name); };
    check("public_case_id", row.public_case_id === target.publicCaseId);
    check("content_hash", row.content_hash === target.contentHash);
    check("firm_individual", row.firm_individual === target.firm);
    check("regulator", row.regulator === "ASIC");
    check("date_issued", String(row.date_issued).slice(0, 10) === contract.date);
    check("raw_amount", String(row.raw_amount) === contract.storedGroupHeadlineAmount);
    check("raw_amount_gbp", String(row.raw_amount_gbp) === contract.currentAmountGbp);
    check("raw_amount_eur", String(row.raw_amount_eur) === contract.currentAmountEur);
    check("amount_original", String(row.amount_original) === contract.storedGroupHeadlineAmount);
    check("currency", row.currency === contract.currency);
    check("notice_url", row.notice_url === contract.noticeUrl);
    check("source_url", row.source_url === contract.sourceUrl);
    check("amount_gbp", String(row.amount_gbp) === contract.currentAmountGbp);
    check("amount_eur", String(row.amount_eur) === contract.currentAmountEur);
    check("source_review_status", row.source_review_status === contract.sourceReviewStatus);
    check("source_content_hash", row.source_content_hash === contract.sourceContentHash);
    check("source_link_status", row.source_link_status === "verified_detail");
    check("source_official_domain_match", row.source_official_domain_match === true);
    check("canonical_case_id", row.canonical_case_id === target.publicCaseId);
    check("override_url", row.override_url === null);
    if (mismatches.length) {
      throw new Error(`ASIC 26-252MR row ${target.id} no longer matches its exact unheld 4.1m source-event contract: ${mismatches.join(", ")}.`);
    }
    if (state === "unheld") {
      if (row.amount_quality !== contract.currentAmountQuality
        || row.requires_amount_review !== contract.currentRequiresAmountReview
        || row.trusted_amount_gbp !== contract.currentAmountGbp
        || row.trusted_amount_eur !== contract.currentAmountEur
        || row.review_status !== null) {
        throw new Error(`ASIC 26-252MR row ${target.id} is not in the pinned unheld-before state.`);
      }
    } else if (row.amount_quality !== contract.heldAmountQuality
      || row.requires_amount_review !== true
      || row.trusted_amount_gbp !== null
      || row.trusted_amount_eur !== null
      || row.review_status !== "required"
      || row.review_reason !== contract.reviewReason
      || row.review_evidence_url !== contract.noticeUrl) {
      throw new Error(`ASIC 26-252MR row ${target.id} is not in the exact required-review held state.`);
    }
  }
  return true;
}
