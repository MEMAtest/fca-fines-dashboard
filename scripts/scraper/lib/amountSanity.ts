import type { Sql } from "postgres";
import type { DbReadyRecord } from "./euFineHelpers.js";

/** Below this (GBP) a monetary penalty is probably a parse artefact. Log-only: it
 * never hides a row, because genuine small fines exist and the specific parser
 * fixes already remove the known artefacts (day counts, dates, section numbers). */
export const SMALL_AMOUNT_WARNING_GBP = 50;

export interface AmountReviewFlag {
  contentHash: string;
  reason: string;
}

/**
 * A record needs amount review only when its parser reported an ambiguous
 * magnitude ("R58 793 075 million"). Very large amounts are already withheld by
 * the canonical view (requires_amount_review at GBP 1bn unless a verified
 * override exists), so no second ceiling is applied here.
 */
export function assessAmountSanity(record: Pick<DbReadyRecord, "amountReviewReason">): string | null {
  return record.amountReviewReason || null;
}

export function collectAmountReviewFlags(records: DbReadyRecord[]): AmountReviewFlag[] {
  const flags: AmountReviewFlag[] = [];
  for (const record of records) {
    const reason = assessAmountSanity(record);
    if (reason) flags.push({ contentHash: record.contentHash, reason });
  }
  return flags;
}

/** Records with a tiny positive amount, for run logs only. */
export function collectSmallAmountWarnings(records: DbReadyRecord[]) {
  return records.filter(
    (record) => record.amountGbp !== null && record.amountGbp > 0 && record.amountGbp < SMALL_AMOUNT_WARNING_GBP,
  );
}

/** SQL fragment: the stored row `e` has a verified amount override. Such rows are
 * already corrected by hand and must never be put back into the review queue
 * (a `required` review overrides the verified amount in the canonical view). */
export const HAS_VERIFIED_OVERRIDE_SQL = `EXISTS (
  SELECT 1 FROM public.regulatory_amount_overrides o
   WHERE o.regulator = upper(e.regulator)
     AND o.evidence_url = public.normalise_regulatory_evidence_url(
       COALESCE(NULLIF(e.final_notice_url, ''), NULLIF(e.source_url, ''), '')))`;

/**
 * Queue flagged rows in regulatory_case_amount_reviews (status "required"),
 * which the canonical view turns into requires_amount_review = true so the
 * amount stays off public display. The row itself is never dropped, an already
 * "approved" review is never reopened, and rows with a verified override are
 * skipped.
 */
export async function queueAmountReviews(sql: Sql, records: DbReadyRecord[]) {
  const byHash = new Map(records.map((record) => [record.contentHash, record]));
  const flags = collectAmountReviewFlags(records);
  let queued = 0;
  let skippedVerified = 0;
  for (const flag of flags) {
    const record = byHash.get(flag.contentHash);
    if (!record) continue;
    const rows = await sql.unsafe(
      `INSERT INTO regulatory_case_amount_reviews (source_row_id, review_status, reason, evidence_url)
       SELECT e.id::text, 'required', $2, $3 FROM eu_fines e
        WHERE e.content_hash = $1 AND NOT ${HAS_VERIFIED_OVERRIDE_SQL}
       ON CONFLICT (source_row_id) DO UPDATE SET
         reason = EXCLUDED.reason,
         evidence_url = EXCLUDED.evidence_url,
         updated_at = now()
       WHERE regulatory_case_amount_reviews.review_status = 'required'
       RETURNING source_row_id`,
      [flag.contentHash, flag.reason, record.finalNoticeUrl || record.sourceUrl],
    );
    if (rows.length > 0) queued += 1;
    else skippedVerified += 1;
  }
  return { flagged: flags.length, queued, skippedVerified };
}
