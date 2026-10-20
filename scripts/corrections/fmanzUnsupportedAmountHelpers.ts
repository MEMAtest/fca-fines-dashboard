import { createHash } from "node:crypto";

export interface FmanzAmountCorrection {
  firm: string;
  publicCaseId: string;
  canonicalCaseId: string;
  evidenceUrl: string;
  officialSourceUrl: string;
  preview: { contentHash: string; dateIssued: string; amount: null; currency: "NZD" };
  sourceRows: Array<{ id: string; contentHash: string }>;
  expectedOverride: {
    amountOriginal: string;
    currency: string;
    amountGbp: string;
    amountEur: string;
    verificationUrl: string;
    reason: string;
    qualityStatus: string;
    verifiedAt: string;
    createdAt: string;
    updatedAt: string;
  };
}

export interface FmanzAmountRepairManifest {
  schemaVersion: number;
  sourcePreview: { path: string; sha256: string; recordCount: number; recordIdHash: string };
  baseline: {
    path: string;
    sha256: string;
    rawFmanzRows: number;
    publicFmanzIds: number;
    publicIdsSha256: string;
    overrideCount: number;
    nonTargetOverrideCount: number;
    nonTargetOverridesSha256: string;
  };
  corrections: FmanzAmountCorrection[];
}

export interface FmanzRepairSourceRow {
  id: string;
  content_hash: string;
  regulator: string;
  firm_individual: string;
  date_issued: string;
  source_url: string;
  final_notice_url: string | null;
  currency: string;
  amount: string | null;
  amount_gbp: string | null;
  entry_title: string | null;
  entry_date: string | null;
  entry_detail_url: string | null;
  detail_title: string | null;
  detail_date: string | null;
}

export interface FmanzRepairOverrideRow {
  regulator: string;
  evidence_url: string;
  amount_original: string | null;
  currency: string;
  amount_gbp: string | null;
  amount_eur: string | null;
  verification_url: string;
  reason: string;
  quality_status: string;
  verified_at: string;
  created_at: string;
  updated_at: string;
}

export interface FmanzRepairPublicRow {
  public_case_id: string;
  canonical_case_id: string;
  firm_individual: string;
  date_issued: string;
  notice_url: string | null;
  source_url: string | null;
  amount_original: string | null;
  amount_gbp: string | null;
  amount_eur: string | null;
  currency: string;
  amount_quality: string;
}

const normalizeIdentity = (value: string | null | undefined) =>
  (value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();

const normalizeUrl = (value: string | null | undefined) =>
  (value ?? "").trim().replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();

export function validateFmanzAmountRepairManifest(manifest: FmanzAmountRepairManifest) {
  if (
    manifest.schemaVersion !== 1 || manifest.corrections.length !== 3
    || manifest.sourcePreview.recordCount !== 98
    || !/^[a-f0-9]{64}$/.test(manifest.sourcePreview.sha256)
    || !/^[a-f0-9]{64}$/.test(manifest.sourcePreview.recordIdHash)
    || !/^[a-f0-9]{64}$/.test(manifest.baseline.sha256)
    || !/^[a-f0-9]{64}$/.test(manifest.baseline.publicIdsSha256)
    || !/^[a-f0-9]{64}$/.test(manifest.baseline.nonTargetOverridesSha256)
    || manifest.baseline.rawFmanzRows !== 408
    || manifest.baseline.publicFmanzIds !== 96
    || manifest.baseline.overrideCount !== 134
    || manifest.baseline.nonTargetOverrideCount !== 131
  ) {
    throw new Error("FMANZ unsupported-amount repair manifest does not match its pinned source and baseline evidence.");
  }
  const evidenceUrls = new Set<string>();
  const publicIds = new Set<string>();
  const rowIds = new Set<string>();
  for (const item of manifest.corrections) {
    if (
      item.preview.amount !== null || item.preview.currency !== "NZD"
      || normalizeUrl(item.evidenceUrl) !== normalizeUrl(item.officialSourceUrl)
      || normalizeUrl(item.expectedOverride.verificationUrl) !== normalizeUrl(item.evidenceUrl)
      || item.expectedOverride.qualityStatus !== "derived_explicit"
      || !item.preview.contentHash || !item.firm || !item.publicCaseId
      || !item.sourceRows.some((row) => row.contentHash === item.preview.contentHash)
    ) {
      throw new Error(`Invalid FMANZ unsupported-amount correction manifest item for ${item.firm || "unknown firm"}.`);
    }
    const evidenceKey = normalizeUrl(item.evidenceUrl);
    if (evidenceUrls.has(evidenceKey) || publicIds.has(item.publicCaseId)) {
      throw new Error("FMANZ correction manifest contains duplicate evidence URLs or public IDs.");
    }
    evidenceUrls.add(evidenceKey);
    publicIds.add(item.publicCaseId);
    for (const row of item.sourceRows) {
      if (rowIds.has(row.id) || !/^[a-f0-9]{64}$/.test(row.contentHash)) {
        throw new Error(`FMANZ correction manifest contains duplicate or malformed raw source row ${row.id}.`);
      }
      rowIds.add(row.id);
    }
  }
}

export function verifyFmanzRepairSourceRows(
  storedRows: FmanzRepairSourceRow[],
  manifest: FmanzAmountRepairManifest,
) {
  const expected = manifest.corrections.flatMap((item) => item.sourceRows.map((row) => ({
    ...row,
    correction: item,
  })));
  const byId = new Map(storedRows.map((row) => [row.id, row]));
  if (storedRows.length !== expected.length || byId.size !== expected.length) {
    throw new Error(`Expected ${expected.length} exact identity-verified FMANZ raw rows; found ${storedRows.length}.`);
  }
  for (const entry of expected) {
    const row = byId.get(entry.id);
    if (!row) throw new Error(`Reviewed FMANZ source row is missing: ${entry.id}.`);
    const correct = row.content_hash === entry.contentHash
      && row.regulator.toUpperCase() === "FMANZ"
      && normalizeIdentity(row.firm_individual) === normalizeIdentity(entry.correction.firm)
      && row.date_issued === entry.correction.preview.dateIssued
      && normalizeUrl(row.source_url) === normalizeUrl(entry.correction.officialSourceUrl)
      && normalizeUrl(row.final_notice_url) === normalizeUrl(entry.correction.officialSourceUrl)
      && row.currency === "NZD"
      && row.amount === null
      && row.amount_gbp === null
      && normalizeIdentity(row.entry_title) === normalizeIdentity(entry.correction.firm)
      && row.entry_date === entry.correction.preview.dateIssued
      && normalizeUrl(row.entry_detail_url) === normalizeUrl(entry.correction.officialSourceUrl)
      && normalizeIdentity(row.detail_title) === normalizeIdentity(entry.correction.firm)
      && row.detail_date === entry.correction.preview.dateIssued;
    if (!correct) {
      throw new Error(`Stored FMANZ source row ${entry.id} no longer matches the reviewed identity, date, URL, currency, or null amount.`);
    }
  }
}

function amountTuple(row: FmanzRepairOverrideRow) {
  return [row.regulator, row.evidence_url, row.amount_original, row.currency, row.amount_gbp,
    row.amount_eur, row.verification_url, row.reason, row.quality_status, row.verified_at,
    row.created_at, row.updated_at];
}

export function verifyFmanzRepairOverrides(
  storedRows: FmanzRepairOverrideRow[],
  manifest: FmanzAmountRepairManifest,
) {
  const byUrl = new Map(storedRows.map((row) => [row.evidence_url, row]));
  if (byUrl.size !== storedRows.length || storedRows.length !== manifest.corrections.length) {
    throw new Error("Expected exactly three unique FMANZ amount overrides for the reviewed correction set.");
  }
  let alreadyApplied = 0;
  for (const item of manifest.corrections) {
    const row = byUrl.get(item.evidenceUrl);
    if (!row || row.regulator !== "FMANZ") throw new Error(`Reviewed FMANZ amount override is missing: ${item.evidenceUrl}.`);
    const expected = item.expectedOverride;
    const oldMatches = JSON.stringify(amountTuple(row)) === JSON.stringify([
      "FMANZ", item.evidenceUrl, expected.amountOriginal, expected.currency, expected.amountGbp,
      expected.amountEur, expected.verificationUrl, expected.reason, expected.qualityStatus, expected.verifiedAt,
      expected.createdAt, expected.updatedAt,
    ]);
    const repaired = row.amount_original === null && row.amount_gbp === null && row.amount_eur === null
      && row.currency === "NZD" && row.verification_url === expected.verificationUrl
      && row.quality_status === "not_disclosed"
      && row.reason === expectedRepairReason(item, manifest.sourcePreview.sha256);
    if (row.quality_status === "verified_override") {
      throw new Error(`Manual verified override is protected from repair: ${item.evidenceUrl}.`);
    }
    if (!oldMatches && !repaired) {
      throw new Error(`FMANZ amount override ${item.evidenceUrl} differs from both the exact reviewed old state and the exact repaired state.`);
    }
    if (repaired) alreadyApplied += 1;
  }
  if (alreadyApplied !== 0 && alreadyApplied !== manifest.corrections.length) {
    throw new Error("FMANZ unsupported-amount override repair is partially applied; refusing mixed-state reconciliation.");
  }
  return alreadyApplied === manifest.corrections.length;
}

export function verifyFmanzRepairPublicRows(
  storedRows: FmanzRepairPublicRow[],
  manifest: FmanzAmountRepairManifest,
) {
  if (storedRows.length !== manifest.corrections.length) {
    throw new Error(`Expected ${manifest.corrections.length} exact FMANZ public target rows; found ${storedRows.length}.`);
  }
  const byPublicId = new Map(storedRows.map((row) => [row.public_case_id, row]));
  if (byPublicId.size !== manifest.corrections.length) throw new Error("FMANZ public target rows contain duplicate IDs.");
  for (const item of manifest.corrections) {
    const row = byPublicId.get(item.publicCaseId);
    if (!row) throw new Error(`Reviewed FMANZ public case is missing: ${item.publicCaseId}.`);
    const commonMatches = normalizeIdentity(row.firm_individual) === normalizeIdentity(item.firm)
      && row.date_issued === item.preview.dateIssued
      && normalizeUrl(row.notice_url) === normalizeUrl(item.officialSourceUrl)
      && normalizeUrl(row.source_url) === normalizeUrl(item.officialSourceUrl)
      && row.currency === "NZD";
    const beforeMatches = commonMatches
      && row.canonical_case_id === item.canonicalCaseId
      && row.amount_original === item.expectedOverride.amountOriginal
      && row.amount_gbp === item.expectedOverride.amountGbp
      && row.amount_eur === item.expectedOverride.amountEur
      && row.amount_quality === "derived_explicit";
    const afterMatches = commonMatches
      && row.amount_original === null
      && row.amount_gbp === null
      && row.amount_eur === null
      && row.amount_quality === "not_disclosed";
    if (!beforeMatches && !afterMatches) {
      throw new Error(`FMANZ public case ${item.publicCaseId} differs from both the reviewed bad-value state and the corrected undisclosed state.`);
    }
  }
  const correctedCount = storedRows.filter((row) => row.amount_original === null && row.amount_gbp === null).length;
  if (correctedCount !== 0 && correctedCount !== storedRows.length) {
    throw new Error("FMANZ public amount repair is partially applied; refusing mixed-state reconciliation.");
  }
  return correctedCount === storedRows.length;
}

export function expectedRepairReason(item: FmanzAmountCorrection, previewSha256: string) {
  return `Corrected from derived_explicit after the identity-verified official FMA preview (${previewSha256}) showed no disclosed monetary sanction. Prior amount attribution was unsupported. Official source: ${item.officialSourceUrl}`;
}

export function sha256SortedStrings(values: string[]) {
  return createHash("sha256").update([...values].sort().join("\n")).digest("hex");
}

export function filterFmanzNonTargetOverrides(rows: ReadonlyArray<Record<string, unknown>>) {
  return rows.filter((row) => String(row.regulator).toUpperCase() === "FMANZ");
}

export function sha256JsonRows(rows: unknown[]) {
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

export function normalizeDbTimestampToReviewedPrecision(value: unknown) {
  if (typeof value !== "string") throw new Error("Expected a database timestamp string for FMANZ baseline comparison.");
  const match = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)\.(\d{3})(\d{3})Z$/.exec(value);
  if (!match) throw new Error(`Unexpected database timestamp format in FMANZ baseline comparison: ${value}.`);
  // The stored baseline came through JS Date.toISOString(), which only preserves
  // milliseconds. Compare the live value at that same evidence precision; the
  // separate before/after snapshots retain the complete six-digit timestamps.
  return `${match[1]}.${match[2]}Z`;
}

export function requireFmanzRepairDbPins(env: NodeJS.ProcessEnv = process.env) {
  if (!env.REGACTIONS_EXPECTED_DB_HOST?.trim() || !env.REGACTIONS_EXPECTED_DB_NAME?.trim()) {
    throw new Error("FMANZ amount repair requires both non-empty REGACTIONS_EXPECTED_DB_HOST and REGACTIONS_EXPECTED_DB_NAME pins.");
  }
}

export function assertSameSnapshot<T>(label: string, before: T, after: T) {
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error(`${label} changed during FMANZ amount repair; transaction must roll back.`);
  }
}
