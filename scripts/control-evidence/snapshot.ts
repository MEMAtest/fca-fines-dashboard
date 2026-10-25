import fs from "node:fs/promises";
import path from "node:path";
import type { ControlEvidenceCandidate, ControlEvidenceCase } from "../../server/services/controlEvidence.js";
import { attributeRespondentPassages, buildControlEvidenceCandidates } from "../../server/services/controlEvidence.js";
import { matchControlEvidence } from "../../src/data/controlTaxonomy.js";
import { extractOfficialSource, MAX_SOURCE_BYTES, type FetchResponse } from "./source.js";

export type RetainedSourceMetadata = {
  schemaVersion: 1;
  sourceUrl: string;
  finalUrl: string;
  fetchedAt: string;
  contentType: string;
  contentHash: string;
  byteLength: number;
};
export const MAX_SNAPSHOT_METADATA_BYTES = 64 * 1024;

type ReviewedRow = Omit<ControlEvidenceCandidate, "review_status"> & { review_status: "candidate" | "approved" | "rejected" };

export async function retainExactSource(response: FetchResponse, sourceUrl: string, filePath: string, fetchedAt = new Date().toISOString()) {
  if (response.bytes.byteLength > MAX_SOURCE_BYTES) throw new Error("Retained source exceeds 8 MiB cap");
  const absolutePath = path.resolve(filePath);
  const metadataPath = `${absolutePath}.metadata.json`;
  const extracted = await extractOfficialSource(response);
  const metadata: RetainedSourceMetadata = {
    schemaVersion: 1,
    sourceUrl,
    finalUrl: response.finalUrl,
    fetchedAt,
    contentType: response.contentType,
    contentHash: extracted.contentHash,
    byteLength: response.bytes.byteLength,
  };
  await fs.writeFile(absolutePath, response.bytes, { flag: "wx", mode: 0o600 });
  try {
    await fs.writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  } catch (error) {
    await fs.unlink(absolutePath).catch(() => undefined);
    throw error;
  }
  return { path: absolutePath, metadataPath, metadata };
}

export async function readRetainedSource(snapshot: NonNullable<import("./review.js").ReviewManifest["sourceSnapshot"]>) {
  const absolutePath = path.resolve(snapshot.path);
  const metadataPath = path.resolve(snapshot.metadataPath);
  const [stat, metadataStat] = await Promise.all([fs.stat(absolutePath), fs.stat(metadataPath)]);
  if (!stat.isFile() || stat.size < 1 || stat.size > MAX_SOURCE_BYTES) throw new Error("Retained source is missing or exceeds 8 MiB cap");
  if (!metadataStat.isFile() || metadataStat.size < 1 || metadataStat.size > MAX_SNAPSHOT_METADATA_BYTES) {
    throw new Error("Retained source metadata is missing or exceeds 64 KiB cap");
  }
  const [bytes, metadataText] = await Promise.all([fs.readFile(absolutePath), fs.readFile(metadataPath, "utf8")]);
  const metadata = JSON.parse(metadataText) as RetainedSourceMetadata;
  if (bytes.byteLength !== stat.size || metadata.schemaVersion !== 1 || metadata.byteLength !== bytes.byteLength) {
    throw new Error("Retained source metadata does not match the bounded source file");
  }
  return { bytes: new Uint8Array(bytes), metadata };
}

function contentTypeEssence(contentType: string) {
  return contentType.split(";", 1)[0].trim().toLowerCase();
}

function sameSupportedSourceUrl(left: string, right: string) {
  const a = new URL(left);
  const b = new URL(right);
  return a.origin === b.origin && a.pathname === b.pathname && a.search === b.search;
}

function candidateProjection(candidate: Pick<ControlEvidenceCandidate, "public_case_id" | "control_code" | "source_url" | "passage" | "locator" | "respondent" | "attribution_method">) {
  return [candidate.public_case_id, candidate.control_code, candidate.source_url, candidate.passage,
    candidate.locator, candidate.respondent, candidate.attribution_method].join("\u0000");
}

/**
 * Validate the opt-in dynamic-page replay. The saved raw bytes remain the
 * provenance hash; a live fetch is used only as a freshness/support check.
 */
export async function validateReviewedSnapshotReplay(args: {
  allowReviewedSnapshot: boolean;
  sourceUrl: string;
  caseRecord: ControlEvidenceCase;
  taxonomyVersion: string;
  rows: ReviewedRow[];
  snapshot: NonNullable<import("./review.js").ReviewManifest["sourceSnapshot"]>;
  liveResponse: FetchResponse;
}) {
  if (!args.allowReviewedSnapshot) throw new Error("Snapshot replay requires explicit --allow-reviewed-snapshot");
  const { bytes, metadata } = await readRetainedSource(args.snapshot);
  const snapshotResponse: FetchResponse = { bytes, finalUrl: metadata.finalUrl, contentType: metadata.contentType };
  const saved = await extractOfficialSource(snapshotResponse);
  if (saved.contentHash !== metadata.contentHash || saved.contentHash !== args.snapshot.contentHash ||
      metadata.sourceUrl !== args.sourceUrl || metadata.sourceUrl !== args.snapshot.sourceUrl ||
      metadata.finalUrl !== args.snapshot.finalUrl || metadata.contentType !== args.snapshot.contentType ||
      metadata.fetchedAt !== args.snapshot.fetchedAt || metadata.byteLength !== args.snapshot.byteLength) {
    throw new Error("Retained source hash or metadata does not match reviewed manifest");
  }
  const live = await extractOfficialSource(args.liveResponse);
  if (!sameSupportedSourceUrl(metadata.sourceUrl, args.sourceUrl) ||
      !sameSupportedSourceUrl(metadata.finalUrl, args.liveResponse.finalUrl) ||
      contentTypeEssence(metadata.contentType) !== contentTypeEssence(args.liveResponse.contentType)) {
    throw new Error("Live official source URL or content type differs from reviewed snapshot");
  }

  const expectedHashes = new Set(args.rows.map((row) => row.content_hash));
  if (expectedHashes.size !== 1 || !expectedHashes.has(saved.contentHash)) {
    throw new Error("Reviewed rows do not share the retained source hash");
  }
  if (args.rows.some((row) => row.fetched_at !== metadata.fetchedAt)) {
    throw new Error("Reviewed row fetch time differs from retained source metadata");
  }
  const candidatesFor = (passages: Awaited<ReturnType<typeof extractOfficialSource>>["passages"], hash: string) => {
    const attributed = attributeRespondentPassages(passages, args.caseRecord.respondent);
    const matches = attributed.flatMap((passage) => matchControlEvidence({
      firmIndividual: args.caseRecord.respondent,
      summary: passage.text,
      breachType: null,
      breachCategories: null,
    }).map((match) => ({ ...match, passage: passage.text })));
    return buildControlEvidenceCandidates({
      caseRecord: args.caseRecord,
      sourceHash: hash,
      passages: attributed,
      matches,
      taxonomyVersion: args.taxonomyVersion,
      fetchedAt: metadata.fetchedAt,
    });
  };
  const savedCandidates = candidatesFor(saved.passages, saved.contentHash);
  const liveCandidates = candidatesFor(live.passages, live.contentHash);
  for (const row of args.rows) {
    const savedCandidate = savedCandidates.find((candidate) => candidateProjection(candidate) === candidateProjection(row));
    if (!savedCandidate) throw new Error("Reviewed evidence is not exactly reproducible from the retained official source");
    const liveCandidate = liveCandidates.find((candidate) => candidateProjection(candidate) === candidateProjection(row));
    if (!liveCandidate) throw new Error("Live official source no longer exactly supports the reviewed passage, respondent, attribution, and control");
  }
  return { originalHash: saved.contentHash, liveHash: live.contentHash, snapshotUsed: args.rows.length, fetchedAt: metadata.fetchedAt };
}
