import crypto from "node:crypto";

export interface EnforcementIdentityInput {
  regulator: string;
  firmIndividual: string;
  /** Name as the stored row was first keyed (legacy extractor). When a name is corrected
   * for display, identity keeps using this so the stored row updates in place. */
  identityFirm?: string;
  /** firm_category as first keyed; only needed when a row is re-labelled (unnamed party). */
  identityFirmCategory?: string | null;
  amount: number | null;
  currency: string;
  dateIssued: string;
  noticeUrl: string;
  sourceUrl?: string;
}

export function normaliseEnforcementParty(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * Durable entity-aware identity for a published action. The subject is part
 * of the key, so two subjects named in one official document remain distinct.
 */
export function buildEnforcementIdentityKey(input: Pick<EnforcementIdentityInput, "noticeUrl" | "firmIndividual">) {
  return `${input.noticeUrl}::${normaliseEnforcementParty(input.firmIndividual)}`;
}

function canonicalNoticeUrl(input: Pick<EnforcementIdentityInput, "noticeUrl" | "sourceUrl">) {
  const value = input.noticeUrl || input.sourceUrl || "";
  return value.trim().toLowerCase().replace(/\/+$/, "");
}

/** Stable source identity: the same subject/document updates in place even if its amount/date is corrected. */
export function buildEnforcementSourceIdentityKey(
  input: Pick<EnforcementIdentityInput, "regulator" | "firmIndividual" | "identityFirm" | "noticeUrl" | "sourceUrl">,
) {
  const subject = (input.identityFirm ?? input.firmIndividual).trim().toLowerCase().replace(/\s+/g, " ");
  return `${input.regulator.trim().toUpperCase()}::${subject}::${canonicalNoticeUrl(input)}`;
}

/** Stable row key used by the existing unique content_hash constraint. */
export function buildEnforcementContentHash(input: EnforcementIdentityInput) {
  // identityFirm / identityFirmCategory are never hashed themselves: they only stand in
  // for firmIndividual / firmCategory, so a record without them hashes exactly as before
  // and a corrected-name record keeps the hash it was stored under.
  const { identityFirm, identityFirmCategory, ...rest } = input;
  const hashed: Record<string, unknown> = { ...rest };
  if (identityFirm !== undefined) hashed.firmIndividual = identityFirm;
  if (identityFirmCategory !== undefined && "firmCategory" in hashed) hashed.firmCategory = identityFirmCategory;
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(hashed))
    .digest("hex");
}
