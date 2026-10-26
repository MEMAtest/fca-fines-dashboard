import { createHash } from "node:crypto";
import type { ControlEvidenceCandidate } from "../../server/services/controlEvidence.js";
import type { CaseOutcome } from "./batch.js";

export type ReviewManifest = {
  schemaVersion: 1;
  dbTarget: { host: string; database: string };
  generatedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  sourceSnapshot?: {
    path: string;
    metadataPath: string;
    sourceUrl: string;
    finalUrl: string;
    contentType: string;
    contentHash: string;
    fetchedAt: string;
    byteLength: number;
  };
  outcomes?: CaseOutcome[];
  rows: Array<Omit<ControlEvidenceCandidate, "review_status"> & { review_status: "candidate" | "approved" | "rejected" }>;
};

export const REVIEWED_EVIDENCE_UPSERT_SQL = `
  INSERT INTO public.enforcement_control_evidence AS existing (
    public_case_id, control_code, taxonomy_version, source_url, content_hash,
    passage, locator, respondent, attribution_method, fetched_at, review_status
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
  -- Taxonomy is part of identity: a re-reviewed v5 finding must coexist with
  -- its v4 decision instead of overwriting it. Older apply scripts using the
  -- unversioned conflict target fail closed after the versioned migration.
  ON CONFLICT (public_case_id, control_code, taxonomy_version, source_url, content_hash, locator)
  DO UPDATE SET
    passage = EXCLUDED.passage,
    respondent = EXCLUDED.respondent,
    attribution_method = EXCLUDED.attribution_method,
    fetched_at = EXCLUDED.fetched_at,
    review_status = EXCLUDED.review_status
  WHERE existing.passage IS DISTINCT FROM EXCLUDED.passage
     OR existing.respondent IS DISTINCT FROM EXCLUDED.respondent
     OR existing.attribution_method IS DISTINCT FROM EXCLUDED.attribution_method
     OR existing.fetched_at IS DISTINCT FROM EXCLUDED.fetched_at
     OR existing.review_status IS DISTINCT FROM EXCLUDED.review_status
  RETURNING public_case_id
`;

export function validateReviewedManifest(manifest: ReviewManifest, currentTarget: { host: string; database: string }) {
  if (manifest.schemaVersion !== 1) throw new Error("Unsupported control-evidence manifest schema");
  if (!manifest.reviewedBy?.trim() || !manifest.reviewedAt || !Number.isFinite(Date.parse(manifest.reviewedAt))) {
    throw new Error("Apply requires a reviewed manifest with reviewer and reviewedAt");
  }
  if (manifest.dbTarget.host !== currentTarget.host || manifest.dbTarget.database !== currentTarget.database) {
    throw new Error("Manifest database target does not match the connected database");
  }
  if (!manifest.rows.length) throw new Error("Manifest contains no evidence rows");
  for (const row of manifest.rows) {
    if (!row.public_case_id || !row.control_code || !row.taxonomy_version || !row.source_url ||
        !row.content_hash || !row.locator || !row.respondent || !row.passage.trim()) {
      throw new Error("Manifest contains an incomplete evidence row");
    }
    if (!(["approved", "rejected", "candidate"] as string[]).includes(row.review_status)) {
      throw new Error("Manifest contains an unsupported review status");
    }
    if (row.review_status === "candidate") throw new Error("Every row must receive an explicit approved or rejected review decision before apply");
    if (row.passage.length > 2000) throw new Error("Manifest passage exceeds the 2,000-character limit");
  }
}

export function validateReviewedManifestForApply(
  manifest: ReviewManifest,
  currentTarget: { host: string; database: string },
  currentTaxonomyVersion: string,
  knownControls: ReadonlySet<string>,
) {
  validateReviewedManifest(manifest, currentTarget);
  for (const row of manifest.rows) {
    if (row.taxonomy_version !== currentTaxonomyVersion) throw new Error("Manifest taxonomy version is stale; regenerate and re-review it");
    if (!knownControls.has(row.control_code)) throw new Error(`Manifest contains an unknown control code: ${row.control_code}`);
  }
}

export function assertSourceHashUnchanged(expected: string, currentBytes: Uint8Array | string) {
  const actual = createHash("sha256").update(currentBytes).digest("hex");
  if (actual !== expected) throw new Error("Official source content hash changed since review; regenerate and re-review manifest");
}

export function assertCaseIdentity(row: { public_case_id: string; source_url: string; firm_individual: string }, manifestRow: Omit<ControlEvidenceCandidate, "review_status"> & { review_status: "candidate" | "approved" | "rejected" }) {
  if (row.public_case_id !== manifestRow.public_case_id || row.source_url !== manifestRow.source_url || row.firm_individual !== manifestRow.respondent) {
    throw new Error("Current case identity/source does not match reviewed manifest");
  }
}
