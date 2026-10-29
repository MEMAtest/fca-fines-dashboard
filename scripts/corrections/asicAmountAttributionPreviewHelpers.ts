import { createHash } from "node:crypto";

export interface AsicCanonicalCaseIdentityInput {
  regulator: string;
  firmIndividual: string;
  dateIssued: string;
  evidenceUrl: string;
  amountOriginal: string | null;
  currency: string;
  breachType: string;
}

function normalizeEvidenceUrl(value: string) {
  return value.trim().replace(/[?#].*$/, "").replace(/\/+$/, "").toLocaleLowerCase("en-US");
}

/** Mirrors all_regulatory_fines_canonical's canonical_identity md5 for a preview only. */
export function buildAsicCanonicalCaseId(input: AsicCanonicalCaseIdentityInput) {
  const identity = [
    input.regulator.toUpperCase(),
    input.firmIndividual.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " "),
    input.dateIssued,
    normalizeEvidenceUrl(input.evidenceUrl),
    input.amountOriginal ?? "undisclosed",
    input.currency.toUpperCase(),
    input.breachType.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " "),
  ].join("|");
  return createHash("md5").update(identity).digest("hex");
}
