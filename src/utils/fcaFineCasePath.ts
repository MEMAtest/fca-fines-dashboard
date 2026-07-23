export interface FcaFineCasePathInput {
  year: number;
  firm: string;
  caseId: string;
}

export interface FcaFineCaseRecordPathInput {
  regulator?: string | null;
  year_issued?: number | null;
  firm_individual?: string | null;
  canonical_case_id?: string | null;
  canonical_case_path?: string | null;
  id?: string | null;
  fine_reference?: string | null;
  amount?: number | null;
  requires_amount_review?: boolean | null;
}

const FCA_FINE_PUBLIC_CASE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Browser-safe firm segment used by both public case links and the server-side
 * prerender inventory. The public case id keeps the full route unique, so the
 * firm segment can remain human-readable without an implementation hash.
 */
export function normaliseFcaFineFirmSlug(firm: string): string {
  const slug = String(firm ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "firm";
}

export function buildFcaFineCasePath({
  year,
  firm,
  caseId,
}: FcaFineCasePathInput): string {
  const safeYear = Number.isInteger(year) ? String(year) : "unknown-year";
  const safeCaseId = encodeURIComponent(String(caseId ?? "").trim() || "unknown-case");
  return `/fca-fines/${safeYear}/${normaliseFcaFineFirmSlug(firm)}/${safeCaseId}`;
}

/** Return the public case route for a qualifying FCA monetary record. */
export function getFcaFineCasePath(
  record: FcaFineCaseRecordPathInput,
): string | null {
  const authoritativePath = record.canonical_case_path?.trim() || "";
  if (
    /^\/fca-fines\/\d{4}\/[a-z0-9-]+\/[0-9a-f-]{36}$/i.test(
      authoritativePath,
    )
  ) {
    return authoritativePath;
  }
  const caseId = record.canonical_case_id?.trim() || "";
  const year = Number(record.year_issued);
  const amount = Number(record.amount);
  if (
    String(record.regulator || "").toUpperCase() !== "FCA" ||
    !Number.isInteger(year) ||
    !record.firm_individual?.trim() ||
    !FCA_FINE_PUBLIC_CASE_ID.test(caseId) ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    record.requires_amount_review
  ) {
    return null;
  }
  return buildFcaFineCasePath({
    year,
    firm: record.firm_individual,
    caseId: caseId.toLowerCase(),
  });
}
