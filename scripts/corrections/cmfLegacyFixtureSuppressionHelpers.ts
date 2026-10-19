export const CMF_LEGACY_FIXTURE_TARGET = "legacy-cmf-test-data-v1";
export const CMF_LEGACY_FIXTURE_SOURCE_URL = "https://www.cmfchile.cl/portal/principal/613/w3-propertyvalue-26178.html";

export interface CmfLegacyFixture {
  id: string;
  firmIndividual: string;
  dateIssued: string;
  amount: number;
  currency: "CLP";
  reason: string;
}

export interface CmfStoredFixtureRow {
  id: string;
  regulator: string;
  firm_individual: string;
  date_issued: string;
  amount: string | number | null;
  currency: string;
  final_notice_url: string | null;
  source_url: string | null;
}

const EXPECTED_IDS = [
  "1b3d1067-c71c-4f00-9aa0-176f78d4324e",
  "1d52d808-3c07-4559-bcc0-86a5eb4936b2",
  "bcd84901-1ebf-4d30-a41e-7812e574a119",
];

export function validateCmfLegacyFixtureManifest(items: CmfLegacyFixture[]): void {
  const ids = items.map((item) => item.id);
  if (items.length !== EXPECTED_IDS.length || new Set(ids).size !== EXPECTED_IDS.length
    || EXPECTED_IDS.some((id) => !ids.includes(id))) {
    throw new Error("CMF legacy-fixture manifest must contain exactly the three reviewed stored row IDs.");
  }
  for (const item of items) {
    if (!/^[0-9a-f-]{36}$/i.test(item.id) || !/^\d{4}-\d{2}-\d{2}$/.test(item.dateIssued)
      || !item.firmIndividual.trim() || !Number.isSafeInteger(item.amount) || item.amount <= 0
      || item.currency !== "CLP" || !item.reason.trim()) {
      throw new Error(`Malformed CMF legacy-fixture suppression entry: ${item.id}`);
    }
  }
}

export function assertCmfLegacyFixtureApplyApproval(approved: string | undefined, target: string | undefined): void {
  if (approved !== "true") {
    throw new Error("Refusing suppression apply without CMF_LEGACY_FIXTURE_SUPPRESSIONS_APPROVED=true after independent review.");
  }
  if (target !== CMF_LEGACY_FIXTURE_TARGET) {
    throw new Error(`Refusing suppression apply without exact target ${CMF_LEGACY_FIXTURE_TARGET}.`);
  }
}

export function verifyCmfLegacyFixtureRows(rows: CmfStoredFixtureRow[], items: CmfLegacyFixture[]): void {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const missing = items.filter((item) => !byId.has(item.id)).map((item) => item.id);
  if (rows.length !== items.length || missing.length) {
    throw new Error(`CMF fixture preflight expected exactly ${items.length} stored rows; found ${rows.length}, missing ${missing.join(", ") || "none"}.`);
  }
  for (const item of items) {
    const row = byId.get(item.id)!;
    if (row.regulator.toUpperCase() !== "CMF"
      || row.firm_individual !== item.firmIndividual
      || row.date_issued !== item.dateIssued
      || Number(row.amount) !== item.amount
      || row.currency !== item.currency
      || row.source_url !== CMF_LEGACY_FIXTURE_SOURCE_URL
      || row.final_notice_url !== null) {
      throw new Error(`CMF fixture preflight identity mismatch for ${item.id}; expected exact CMF identity/date/CLP amount/generic test URL and NULL final notice.`);
    }
  }
}
