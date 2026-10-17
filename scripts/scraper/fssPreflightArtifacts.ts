export interface FssPreflightReviewRecord {
  contentHash: string;
  firmIndividual: string;
  dateIssued: string;
  amount: number | null;
  amountReviewReason: string | null;
  currency: string;
  finalNoticeUrl: string;
  sourceUrl: string;
  rawPayload: Record<string, unknown>;
}

export interface FssPreflightPreview {
  source: string;
  listedRows: number;
  records: FssPreflightReviewRecord[];
  pdfQuarantine: Array<{ actionId: string; reason: string; pdfUrl: string }>;
}

/** Build a complete review queue and identify the PDF-failure subset separately.
 * A review marker always means the amount remains null; never promote ambiguous
 * PDF extraction or outcome text into a guessed monetary amount.
 */
export function buildFssAmountReviewArtifact(
  preview: FssPreflightPreview,
  generatedAtUtc = new Date().toISOString(),
) {
  const pdfQuarantineByActionId = new Map<string, FssPreflightPreview["pdfQuarantine"][number]>();
  for (const item of preview.pdfQuarantine) {
    if (!item.actionId || pdfQuarantineByActionId.has(item.actionId)) {
      throw new Error(`FSS PDF quarantine action ID is missing or duplicated: ${item.actionId || "<missing>"}`);
    }
    pdfQuarantineByActionId.set(item.actionId, item);
  }

  const reviewRecords = preview.records.filter((record) => record.amountReviewReason !== null);
  const records = reviewRecords.map((record) => {
    const actionId = record.rawPayload.actionId;
    const canonicalId = record.rawPayload.canonicalId;
    if (record.amount !== null) {
      throw new Error(`FSS amount review case ${String(actionId)} has a non-null amount.`);
    }
    if (typeof actionId !== "string" || typeof canonicalId !== "string" || !record.amountReviewReason) {
      throw new Error("FSS amount review case is missing its stable identity or review reason.");
    }
    const pdfFailure = pdfQuarantineByActionId.get(actionId);
    return {
      contentHash: record.contentHash,
      canonicalId,
      actionId,
      entity: record.firmIndividual,
      actionDate: record.dateIssued,
      currency: record.currency,
      amount: record.amount,
      amountDisclosureState: record.rawPayload.amountDisclosureState ?? null,
      reviewReason: record.amountReviewReason,
      pdfQuarantined: Boolean(pdfFailure),
      pdfFailure: pdfFailure?.reason ?? null,
      officialPdfUrl: record.finalNoticeUrl,
      detailUrl: record.sourceUrl,
    };
  });

  const reviewActionIds = new Set(records.map((record) => record.actionId));
  const unmatchedPdfQuarantines = preview.pdfQuarantine.filter((item) => !reviewActionIds.has(item.actionId));
  if (unmatchedPdfQuarantines.length > 0) {
    throw new Error(`FSS PDF quarantine cases are missing from the amount review queue: ${unmatchedPdfQuarantines.map((item) => item.actionId).join(", ")}`);
  }

  const reviewReasonCounts = Object.fromEntries(
    [...new Set(records.map((record) => record.reviewReason))]
      .sort()
      .map((reason) => [reason, records.filter((record) => record.reviewReason === reason).length]),
  );
  return {
    source: preview.source,
    generatedAtUtc,
    listedRows: preview.listedRows,
    reviewRequiredCount: records.length,
    pdfQuarantineCount: preview.pdfQuarantine.length,
    reviewRequiredPdfQuarantineCount: records.filter((record) => record.pdfQuarantined).length,
    reviewReasonCounts,
    records,
    pdfQuarantine: preview.pdfQuarantine.map((item) => ({ ...item })),
  };
}
