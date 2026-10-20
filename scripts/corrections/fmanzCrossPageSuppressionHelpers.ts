export type FmanzIdentityReview =
  | "aligned"
  | "listing_detail_mismatch_requires_review"
  | "stored_detail_mismatch_requires_review";

export interface FmanzIdentityEvidence {
  listingTitle: string;
  detailTitle: string;
  storedFirm: string;
}

export function normalizeFmanzIdentity(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("en-NZ");
}

/** Advisory classification only: differing official labels always require human review. */
export function classifyFmanzIdentity(evidence: FmanzIdentityEvidence): FmanzIdentityReview {
  const listing = normalizeFmanzIdentity(evidence.listingTitle);
  const detail = normalizeFmanzIdentity(evidence.detailTitle);
  const stored = normalizeFmanzIdentity(evidence.storedFirm);

  if (listing === detail && detail === stored) return "aligned";
  if (stored !== detail) return "stored_detail_mismatch_requires_review";
  return "listing_detail_mismatch_requires_review";
}

export interface FmanzStoredRow {
  id: string;
  content_hash: string;
  regulator: string;
  firm_individual: string;
  date_issued: string;
  source_url: string | null;
  final_notice_url: string | null;
  raw_payload: unknown;
}

export interface FmanzReviewedSuppression {
  id: string;
  contentHash: string;
  firmIndividual: string;
  dateIssued: string;
  sourceUrl: string;
  finalNoticeUrl: string | null;
  listingTitle: string;
  detailTitle: string;
  publicCaseId: string | null;
  evidenceUrl: string;
  reviewEvidenceSha256: string;
  reason: string;
  reviewDisposition: "confirmed_cross_page_contamination";
}

function rawIdentity(rawPayload: unknown): { listingTitle: string; detailTitle: string } {
  if (!rawPayload || typeof rawPayload !== "object") {
    throw new Error("FMANZ suppression preflight found missing raw payload.");
  }
  const payload = rawPayload as { entry?: { title?: unknown }; detail?: { title?: unknown } };
  const listingTitle = typeof payload.entry?.title === "string" ? payload.entry.title : "";
  const detailTitle = typeof payload.detail?.title === "string" ? payload.detail.title : "";
  if (!listingTitle.trim() || !detailTitle.trim()) {
    throw new Error("FMANZ suppression preflight requires both stored listing and detail titles.");
  }
  return { listingTitle, detailTitle };
}

export function validateFmanzSuppressionManifest(items: FmanzReviewedSuppression[]): void {
  const ids = items.map((item) => item.id);
  if (!items.length || new Set(ids).size !== items.length) {
    throw new Error("FMANZ suppression manifest must contain non-empty unique reviewed row IDs.");
  }
  for (const item of items) {
    if (
      !/^[0-9a-f-]{36}$/i.test(item.id) ||
      !/^[0-9a-f]{64}$/i.test(item.contentHash) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(item.dateIssued) ||
      !item.firmIndividual.trim() ||
      !item.sourceUrl.startsWith("https://www.fma.govt.nz/") ||
      (item.finalNoticeUrl !== null && !item.finalNoticeUrl.startsWith("https://")) ||
      !item.listingTitle.trim() ||
      !item.detailTitle.trim() ||
      (item.publicCaseId !== null && !item.publicCaseId.trim()) ||
      !item.evidenceUrl.startsWith("https://www.fma.govt.nz/") ||
      !/^[0-9a-f]{64}$/i.test(item.reviewEvidenceSha256) ||
      !item.reason.trim() ||
      item.reviewDisposition !== "confirmed_cross_page_contamination" ||
      normalizeFmanzIdentity(item.listingTitle) === normalizeFmanzIdentity(item.detailTitle)
    ) {
      throw new Error(`Malformed or unconfirmed FMANZ suppression entry: ${item.id}`);
    }
  }
}

/** Validate exact source-row identity; raw rows remain in eu_fines after suppression. */
export function verifyFmanzSuppressionRows(
  rows: FmanzStoredRow[],
  items: FmanzReviewedSuppression[],
): void {
  const byId = new Map(rows.map((row) => [row.id, row]));
  if (rows.length !== items.length) {
    throw new Error(`FMANZ suppression preflight expected ${items.length} rows, found ${rows.length}.`);
  }
  for (const item of items) {
    const row = byId.get(item.id);
    if (!row) throw new Error(`FMANZ suppression preflight missing stored row ${item.id}.`);
    const raw = rawIdentity(row.raw_payload);
    const disposition = classifyFmanzIdentity({
      listingTitle: raw.listingTitle,
      detailTitle: raw.detailTitle,
      storedFirm: row.firm_individual,
    });
    if (
      row.regulator.toUpperCase() !== "FMANZ" ||
      row.content_hash !== item.contentHash ||
      row.firm_individual !== item.firmIndividual ||
      row.date_issued !== item.dateIssued ||
      row.source_url !== item.sourceUrl ||
      row.final_notice_url !== item.finalNoticeUrl ||
      normalizeFmanzIdentity(raw.listingTitle) !== normalizeFmanzIdentity(item.listingTitle) ||
      normalizeFmanzIdentity(raw.detailTitle) !== normalizeFmanzIdentity(item.detailTitle) ||
      disposition !== "listing_detail_mismatch_requires_review"
    ) {
      throw new Error(`FMANZ suppression preflight identity mismatch for ${item.id}; exact reviewed cross-page evidence no longer matches.`);
    }
  }
}

export function reconcileFmanzPublicCaseIds(
  before: string[],
  after: string[],
  expectedRemoved: string[],
): void {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  const expectedSet = new Set(expectedRemoved);
  if (beforeSet.size !== before.length || afterSet.size !== after.length || expectedSet.size !== expectedRemoved.length) {
    throw new Error("FMANZ public-ID reconciliation received duplicate IDs.");
  }
  const removed = before.filter((id) => !afterSet.has(id));
  const added = after.filter((id) => !beforeSet.has(id));
  if (added.length || removed.length !== expectedSet.size || removed.some((id) => !expectedSet.has(id))) {
    throw new Error(`FMANZ public-ID reconciliation drift: expected only ${expectedSet.size} reviewed removals, observed ${removed.length} removals and ${added.length} additions.`);
  }
}
