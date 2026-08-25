import crypto from "node:crypto";

export interface EnforcementIdentityInput {
  regulator: string;
  firmIndividual: string;
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
  input: Pick<EnforcementIdentityInput, "regulator" | "firmIndividual" | "noticeUrl" | "sourceUrl">,
) {
  const subject = input.firmIndividual.trim().toLowerCase().replace(/\s+/g, " ");
  return `${input.regulator.trim().toUpperCase()}::${subject}::${canonicalNoticeUrl(input)}`;
}

/** Stable row key used by the existing unique content_hash constraint. */
export function buildEnforcementContentHash(input: EnforcementIdentityInput) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
}
