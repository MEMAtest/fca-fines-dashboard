import { createHash } from "node:crypto";
import fs from "node:fs";

export interface FmanzCignaAmountManifest {
  schemaVersion: number;
  status: string;
  target: string;
  pins: Record<string, { path: string; sha256: string; [key: string]: unknown }> & {
    historicalBaseline: { path: string; sha256: string };
    baseline: {
      path: string; sha256: string; rawRows: number; rawRowsSha256: string;
      publicRows: number; publicRowsSha256: string; publicIdsSha256: string;
      overrideRows: number; nonTargetOverridesSha256: string;
    };
    candidate: { path: string; sha256: string; beforeGlobalPublicRows: number };
    officialSourcePreview: { path: string; sha256: string; recordCount: number };
    qualityContractV3: { path: string; sha256: string };
    capturedReviewSnapshot: { path: string; sha256: string };
  };
  source: { releaseUrl: string; judgmentUrl: string; reason: string };
  targetRow: {
    rawId: string; contentHash: string; publicCaseId: string; canonicalCaseId: string;
    firm: string; date: string; rawAmount: string; currency: string;
    sourceUrl: string; noticeUrl: string;
  };
  expectedOverride: CignaOverrideValues;
  expectedOldOverride: CignaOverrideValues & { verifiedAt: string; createdAt: string; updatedAt: string };
}

export interface CignaOverrideValues {
  regulator: string;
  evidenceUrl: string;
  amountOriginal: string;
  currency: string;
  amountGbp: string;
  amountEur: string;
  verificationUrl: string;
  reason: string;
  qualityStatus: string;
}

export interface CignaOverrideRow {
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

export function targetCignaOverrideSelect(manifest: FmanzCignaAmountManifest) {
  return {
    query: `SELECT regulator, evidence_url, amount_original::text AS amount_original, currency,
            amount_gbp::text AS amount_gbp, amount_eur::text AS amount_eur,
            verification_url, reason, quality_status,
            to_char(verified_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS verified_at,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,
            to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at
       FROM public.regulatory_amount_overrides
      WHERE regulator = 'FMANZ' AND evidence_url = $1`,
    values: [manifest.expectedOldOverride.evidenceUrl],
  };
}

export const fmanzOverrideBaselineSelect = `SELECT regulator, evidence_url, amount_original::text AS amount_original, currency,
            amount_gbp::text AS amount_gbp, amount_eur::text AS amount_eur,
            verification_url, reason, quality_status,
            to_char(verified_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS verified_at,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
            to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at
       FROM public.regulatory_amount_overrides WHERE regulator = 'FMANZ' ORDER BY regulator, evidence_url`;

const hashPattern = /^[a-f0-9]{64}$/;

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => [
      key, stableValue((value as Record<string, unknown>)[key]),
    ]));
  }
  return value;
}

export function sha256StableJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex");
}

export function exactDecimalEqual(actual: unknown, expected: string) {
  if (typeof actual !== "string" && typeof actual !== "number") return false;
  const canonical = (value: string) => {
    const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(value);
    if (!match) return null;
    const integer = match[2]!.replace(/^0+(?=\d)/, "");
    const fraction = (match[3] ?? "").replace(/0+$/, "");
    const sign = match[1] === "-" && (integer !== "0" || fraction.length > 0) ? "-" : "";
    return `${sign}${integer}${fraction ? `.${fraction}` : ""}`;
  };
  const normalizedActual = canonical(String(actual));
  const normalizedExpected = canonical(expected);
  return normalizedActual !== null && normalizedActual === normalizedExpected;
}

export function normalizeDbTimestampToReviewedPrecision(value: string) {
  const match = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)\.(\d{3})(\d{3})Z$/.exec(value);
  if (!match) throw new Error(`Unexpected timestamp format in Cigna repair guard: ${value}.`);
  return `${match[1]}.${match[2]}Z`;
}

export function validateFmanzCignaAmountManifest(manifest: FmanzCignaAmountManifest) {
  const allHashes = [
    manifest.pins.baseline.sha256, manifest.pins.baseline.rawRowsSha256,
    manifest.pins.baseline.publicRowsSha256, manifest.pins.baseline.publicIdsSha256,
    manifest.pins.baseline.nonTargetOverridesSha256, manifest.pins.historicalBaseline.sha256,
    manifest.pins.candidate.sha256,
    manifest.pins.officialSourcePreview.sha256, manifest.pins.qualityContractV3.sha256,
    manifest.pins.capturedReviewSnapshot.sha256,
  ];
  const target = manifest.targetRow;
  const old = manifest.expectedOldOverride;
  const corrected = manifest.expectedOverride;
  if (
    manifest.schemaVersion !== 1
    || manifest.status !== "proposed_exact_correction_requires_explicit_approval"
    || manifest.target !== "reviewed-fmanz-cigna-amount-correction-v1"
    || allHashes.some((hash) => !hashPattern.test(hash))
    || manifest.pins.baseline.rawRows !== 408
    || manifest.pins.baseline.publicRows !== 96
    || manifest.pins.baseline.overrideRows !== 134
    || manifest.pins.candidate.beforeGlobalPublicRows !== 90266
    || manifest.pins.officialSourcePreview.recordCount !== 98
    || target.rawId !== "d4593310-f434-418f-b199-f5815f681b07"
    || target.contentHash !== "83119e425d5c689f8e5c75a893fbf36b2eb77951ca1f56052c981aa9fa4e399b"
    || target.publicCaseId !== "92c206e8-b763-4db5-b7ec-7505a53a9061"
    || target.date !== "2023-01-17" || target.currency !== "NZD"
    || target.firm !== "Cigna Life Insurance New Zealand Limited"
    || manifest.source.releaseUrl !== "https://www.fma.govt.nz/news/all-releases/media-releases/cigna-to-pay-3-5-million-penalty/"
    || manifest.source.judgmentUrl !== "https://www.fma.govt.nz/assets/Enforcement/Judgements/FMA-v-Cigna-Life-Insurance-New-Zealand-Ltd.pdf"
    || !manifest.source.reason.includes("3,575,000.00")
    || target.canonicalCaseId !== "80c28c343b5f2329a6d1c9dd456792bd"
    || target.rawAmount !== "3500000.00"
    || target.sourceUrl !== "https://www.fma.govt.nz/about-us/enforcement/cases/cigna-life-insurance-new-zealand-limited/"
    || target.noticeUrl !== target.sourceUrl
    || old.amountOriginal !== target.rawAmount || old.currency !== target.currency
    || old.regulator !== "FMANZ"
    || old.evidenceUrl !== "https://www.fma.govt.nz/about-us/enforcement/cases/cigna-life-insurance-new-zealand-limited"
    || old.amountGbp !== "1645000.00" || old.amountEur !== "1925000.00"
    || old.verificationUrl !== target.sourceUrl
    || old.reason !== "Derived from explicit fine or penalty language in the stored official regulator publication using the regulator-specific sanction parser."
    || old.verifiedAt !== "2026-10-10T23:05:33.485Z"
    || old.createdAt !== "2026-07-15T07:40:18.132Z"
    || old.updatedAt !== "2026-10-10T23:05:33.661Z"
    || corrected.amountOriginal !== "3575000.00" || corrected.currency !== "NZD"
    || Math.round(Number(corrected.amountOriginal) * 47) / 100 !== Number(corrected.amountGbp)
    || Math.round(Number(corrected.amountOriginal) * 55) / 100 !== Number(corrected.amountEur)
    || corrected.evidenceUrl !== old.evidenceUrl
    || corrected.verificationUrl !== manifest.source.releaseUrl
    || corrected.qualityStatus !== "verified_override"
    || corrected.reason !== manifest.source.reason
    || old.qualityStatus !== "derived_explicit"
  ) {
    throw new Error("Cigna exact correction manifest differs from the pinned source, baseline, identity, or reviewed amount.");
  }
  for (const pin of Object.values(manifest.pins)) {
    if (!pin.path.startsWith("/Users/") || !hashPattern.test(pin.sha256)) {
      throw new Error("Cigna correction manifest contains an invalid absolute artifact pin.");
    }
  }
  return true;
}

export function verifyPinnedFmanzCignaArtifacts(
  manifest: FmanzCignaAmountManifest,
  readArtifact: (path: string) => Buffer = (path) => fs.readFileSync(path),
) {
  for (const [role, pin] of Object.entries(manifest.pins)) {
    let content: Buffer;
    try {
      content = readArtifact(pin.path);
    } catch {
      throw new Error(`Pinned Cigna ${role} evidence is unavailable; refusing to continue.`);
    }
    if (createHash("sha256").update(content).digest("hex") !== pin.sha256) {
      throw new Error(`Pinned Cigna ${role} evidence hash changed; refusing to continue.`);
    }
  }
  const readJson = (path: string) => JSON.parse(readArtifact(path).toString("utf8"));
  const baseline = readJson(manifest.pins.baseline.path);
  const candidate = readJson(manifest.pins.candidate.path);
  const preview = readJson(manifest.pins.officialSourcePreview.path);
  const contract = readJson(manifest.pins.qualityContractV3.path);
  const review = readJson(manifest.pins.capturedReviewSnapshot.path);
  const target = manifest.targetRow;
  const old = manifest.expectedOldOverride;
  const reviewOverride = review.overrides?.find((row: Record<string, unknown>) =>
    row.regulator === "FMANZ" && row.evidence_url === old.evidenceUrl,
  );
  const rawTarget = baseline.rawRows?.find((row: Record<string, unknown>) => row.id === target.rawId);
  const publicTarget = baseline.publicRows?.find((row: Record<string, unknown>) => row.public_case_id === target.publicCaseId);
  const baselineOverride = baseline.overrides?.find((row: Record<string, unknown>) =>
    row.regulator === "FMANZ" && String(row.evidence_url).replace(/\/+$/, "") === old.evidenceUrl.replace(/\/+$/, ""),
  );
  if (
    !Array.isArray(baseline.rawRows) || sha256StableJson(baseline.rawRows) !== manifest.pins.baseline.rawRowsSha256
    || baseline.rawRows.length !== manifest.pins.baseline.rawRows
    || !Array.isArray(baseline.publicRows) || sha256StableJson(baseline.publicRows) !== manifest.pins.baseline.publicRowsSha256
    || baseline.publicRows.length !== manifest.pins.baseline.publicRows
    || !Array.isArray(baseline.overrides) || baseline.overrides.length !== manifest.pins.baseline.overrideRows
    || !Array.isArray(candidate.added) || candidate.beforeGlobal !== manifest.pins.candidate.beforeGlobalPublicRows
    || !Array.isArray(preview.records) || preview.records.length !== manifest.pins.officialSourcePreview.recordCount
    || contract.inputHashes?.baseline408 !== manifest.pins.historicalBaseline.sha256
    || contract.inputHashes?.officialSourcePreview !== manifest.pins.officialSourcePreview.sha256
    || contract.cignaEvidenceCorrection?.guardedCorrection?.rawId !== target.rawId
    || contract.cignaEvidenceCorrection?.guardedCorrection?.publicCaseId !== target.publicCaseId
    || contract.cignaEvidenceCorrection?.correctedEvidence?.officialEventReleaseUrl !== manifest.source.releaseUrl
    || contract.cignaEvidenceCorrection?.guardedCorrection?.proposedAmount !== manifest.expectedOverride.amountOriginal
    || !rawTarget || rawTarget.content_hash !== target.contentHash
    || !publicTarget || publicTarget.id !== target.rawId || publicTarget.amount_original !== old.amountOriginal
    || !baselineOverride || baselineOverride.amount_original !== old.amountOriginal
    || baselineOverride.currency !== old.currency || baselineOverride.amount_gbp !== old.amountGbp
    || baselineOverride.amount_eur !== old.amountEur || baselineOverride.verification_url !== old.verificationUrl
    || baselineOverride.reason !== old.reason || baselineOverride.quality_status !== old.qualityStatus
    || baselineOverride.verified_at !== old.verifiedAt || baselineOverride.created_at !== old.createdAt
    || baselineOverride.updated_at !== old.updatedAt
    || !reviewOverride
    || reviewOverride.amount_original !== old.amountOriginal || reviewOverride.currency !== old.currency
    || reviewOverride.amount_gbp !== old.amountGbp || reviewOverride.amount_eur !== old.amountEur
    || reviewOverride.verification_url !== old.verificationUrl || reviewOverride.reason !== old.reason
    || reviewOverride.quality_status !== old.qualityStatus || reviewOverride.verified_at !== old.verifiedAt
    || reviewOverride.created_at !== old.createdAt || reviewOverride.updated_at !== old.updatedAt
  ) {
    throw new Error("Pinned Cigna baseline, source preview, contract, or captured exact old override does not match the reviewed manifest.");
  }
  return true;
}

function oldOverrideTuple(row: CignaOverrideRow, manifest: FmanzCignaAmountManifest) {
  const expected = manifest.expectedOldOverride;
  return [
    row.regulator, row.evidence_url, row.amount_original, row.currency, row.amount_gbp,
    row.amount_eur, row.verification_url, row.reason, row.quality_status,
    normalizeDbTimestampToReviewedPrecision(row.verified_at),
    normalizeDbTimestampToReviewedPrecision(row.created_at),
    normalizeDbTimestampToReviewedPrecision(row.updated_at),
  ].join("\u001f") === [
    expected.regulator, expected.evidenceUrl, expected.amountOriginal, expected.currency,
    expected.amountGbp, expected.amountEur, expected.verificationUrl, expected.reason,
    expected.qualityStatus, expected.verifiedAt, expected.createdAt, expected.updatedAt,
  ].join("\u001f");
}

function newOverrideTuple(row: CignaOverrideRow, manifest: FmanzCignaAmountManifest) {
  const expected = manifest.expectedOverride;
  const old = manifest.expectedOldOverride;
  const semanticValuesMatch = [
    row.regulator, row.evidence_url, row.amount_original, row.currency, row.amount_gbp,
    row.amount_eur, row.verification_url, row.reason, row.quality_status,
  ].join("\u001f") === [
    expected.regulator, expected.evidenceUrl, expected.amountOriginal, expected.currency,
    expected.amountGbp, expected.amountEur, expected.verificationUrl, expected.reason,
    expected.qualityStatus,
  ].join("\u001f");
  if (!semanticValuesMatch) return false;
  const createdMatches = normalizeDbTimestampToReviewedPrecision(row.created_at) === old.createdAt;
  const verifiedAt = Date.parse(row.verified_at);
  const updatedAt = Date.parse(row.updated_at);
  return createdMatches && row.verified_at === row.updated_at
    && Number.isFinite(verifiedAt) && verifiedAt === updatedAt
    && updatedAt >= Date.parse(old.updatedAt);
}

export function verifyCignaOverrideState(rows: CignaOverrideRow[], manifest: FmanzCignaAmountManifest) {
  if (rows.length !== 1) throw new Error(`Expected one unique Cigna override row; found ${rows.length}.`);
  if (oldOverrideTuple(rows[0]!, manifest)) return "old" as const;
  if (newOverrideTuple(rows[0]!, manifest)) return "new" as const;
  throw new Error("Cigna override differs from both the exact reviewed old state and the exact corrected state; refusing manual or partial state.");
}

export function verifyCignaTargetRawRow(row: Record<string, unknown> | undefined, manifest: FmanzCignaAmountManifest) {
  const target = manifest.targetRow;
  if (!row || String(row.id) !== target.rawId || row.content_hash !== target.contentHash
    || row.regulator !== "FMANZ" || row.firm_individual !== target.firm
    || String(row.date_issued).slice(0, 10) !== target.date || row.source_url !== target.sourceUrl
    || row.final_notice_url !== target.noticeUrl || row.amount !== target.rawAmount
    || row.currency !== target.currency) {
    throw new Error("Cigna source row differs from its exact reviewed raw ID, hash, party, date, notice, or amount.");
  }
}

export function snapshotKeyedProjection(rows: Array<{
  regulator: string; source_row_id: string; public_case_id: string; row_hash: string; row?: Record<string, unknown>;
}>) {
  const byKey = new Map<string, string>();
  const records = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const key = JSON.stringify([row.regulator, row.source_row_id, row.public_case_id]);
    if (byKey.has(key)) throw new Error(`Duplicate identity in keyed public projection snapshot: ${key}.`);
    byKey.set(key, row.row_hash);
    if (row.row) records.set(key, row.row);
  }
  return { byKey, records, count: rows.length };
}

export function assertCignaProjectionPreserved(
  before: ReturnType<typeof snapshotKeyedProjection>,
  after: ReturnType<typeof snapshotKeyedProjection>,
  manifest: FmanzCignaAmountManifest,
) {
  if (before.count !== manifest.pins.candidate.beforeGlobalPublicRows || after.count !== before.count) {
    throw new Error("Global trusted projection row count changed or differs from its reviewed baseline.");
  }
  if (before.byKey.size !== after.byKey.size) throw new Error("Global public projection key count changed during Cigna amount correction.");
  const expectedKey = JSON.stringify(["FMANZ", manifest.targetRow.rawId, manifest.targetRow.publicCaseId]);
  for (const [key, beforeHash] of before.byKey) {
    const afterHash = after.byKey.get(key);
    if (afterHash === undefined) throw new Error(`Public projection identity disappeared during Cigna repair: ${key}.`);
    if (key !== expectedKey && beforeHash !== afterHash) {
      throw new Error(`Non-target public projection row changed during Cigna repair: ${key}.`);
    }
  }
  const oldRow = before.records.get(expectedKey);
  const newRow = after.records.get(expectedKey);
  if (!oldRow || !newRow) throw new Error("Expected exact Cigna trusted public row was not captured before and after refresh.");
  const allowed = new Set([
    "amount_original", "amount_gbp", "amount_eur", "amount_quality",
    "amount_verification_url", "amount_override_reason", "trusted_amount_gbp", "trusted_amount_eur",
  ]);
  const fields = new Set([...Object.keys(oldRow), ...Object.keys(newRow)]);
  for (const field of fields) {
    if (JSON.stringify(stableValue(oldRow[field])) !== JSON.stringify(stableValue(newRow[field])) && !allowed.has(field)) {
      throw new Error(`Cigna public projection changed an unexpected field: ${field}.`);
    }
  }
  const expected = manifest.expectedOverride;
  for (const [field, value] of Object.entries({
    id: manifest.targetRow.rawId,
    regulator: "FMANZ",
    public_case_id: manifest.targetRow.publicCaseId,
    firm_individual: manifest.targetRow.firm,
    amount_original: expected.amountOriginal,
    amount_gbp: expected.amountGbp,
    amount_eur: expected.amountEur,
    trusted_amount_gbp: expected.amountGbp,
    trusted_amount_eur: expected.amountEur,
    currency: expected.currency,
    amount_quality: expected.qualityStatus,
    amount_verification_url: expected.verificationUrl,
    amount_override_reason: expected.reason,
  })) {
    const actual = newRow[field];
    const numericField = field === "amount_original" || field === "amount_gbp" || field === "amount_eur";
    const trustedNumericField = field === "trusted_amount_gbp" || field === "trusted_amount_eur";
    if (actual === undefined || actual === null || (numericField || trustedNumericField ? !exactDecimalEqual(actual, value) : String(actual) !== value)) {
      throw new Error(`Cigna refreshed trusted projection has an unexpected ${field} postcondition.`);
    }
  }
}

export async function updateCignaOverrideAndRefresh(
  tx: { unsafe: <T extends any[] = any[]>(query: string, values?: any[]) => PromiseLike<T> },
  manifest: FmanzCignaAmountManifest,
) {
  const old = manifest.expectedOldOverride;
  const corrected = manifest.expectedOverride;
  const updated = await tx.unsafe(
    `UPDATE public.regulatory_amount_overrides
        SET amount_original = $1::numeric,
            currency = $2,
            amount_gbp = $3::numeric,
            amount_eur = $4::numeric,
            verification_url = $5,
            reason = $6,
            quality_status = $7,
            verified_at = transaction_timestamp(),
            updated_at = transaction_timestamp()
      WHERE regulator = $8 AND evidence_url = $9
        AND amount_original = $10::numeric AND currency = $11
        AND amount_gbp = $12::numeric AND amount_eur = $13::numeric
        AND verification_url = $14 AND reason = $15 AND quality_status = $16
        AND date_trunc('milliseconds', verified_at) = $17::timestamptz
        AND date_trunc('milliseconds', created_at) = $18::timestamptz
        AND date_trunc('milliseconds', updated_at) = $19::timestamptz
      RETURNING evidence_url`,
    [
      corrected.amountOriginal, corrected.currency, corrected.amountGbp,
      corrected.amountEur, corrected.verificationUrl, corrected.reason,
      corrected.qualityStatus, old.regulator, old.evidenceUrl, old.amountOriginal,
      old.currency, old.amountGbp, old.amountEur, old.verificationUrl, old.reason,
      old.qualityStatus, old.verifiedAt, old.createdAt, old.updatedAt,
    ],
  );
  if (updated.length !== 1) throw new Error("Guarded Cigna amount override update did not affect exactly one reviewed row.");
  await tx.unsafe("SELECT public.refresh_all_fines()");
}
