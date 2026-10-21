import { z } from "zod";
import type { SqlClient } from "../db.js";
import { getSqlClient } from "../db.js";
import { BOARD_ARCHETYPES_BY_ID, BOARD_THEME_DEFINITIONS } from "../../src/data/boardIntelligence.js";
import { PUBLIC_REGULATOR_CODES } from "../../src/data/regulatorCoverage.js";
import { PUBLIC_REGULATOR_SHELL_ITEMS } from "../../src/data/regulatorShellNav.js";
import { UK_ENFORCEMENT_REGULATOR_CODES } from "../../src/data/ukEnforcement.js";
import type { BoardFirmProfile } from "../../src/data/boardIntelligence.js";
import type { FineRecord } from "../../src/types.js";
import { buildBoardPack } from "../../src/utils/boardIntelligence.js";
import {
  legacyBoardPackCaseIdsFor,
  resolveBoardPackCaseId,
} from "./boardPackCaseIdAliases.js";

export const BOARD_PACK_EVIDENCE_METHODOLOGY_VERSION = "board-pack-evidence-v1";
const PAGE_SIZE = 2000;
const EVIDENCE_CACHE_TTL_MS = 90_000;
const MAX_EVIDENCE_CACHE_ENTRIES = 3;
const profileSchema = z.object({
  firmName: z.string().trim().min(1).max(160),
  archetypeId: z.enum(["retail-bank", "broker-dealer", "asset-manager", "payments-fintech", "exchange-market-infrastructure", "insurer"]),
  boardFocus: z.enum(["assurance", "remediation", "expansion"]),
  priorityRegulators: z.array(z.string().trim().min(2).max(16)).max(5),
  focusRegions: z.array(z.string().trim().min(2).max(40)).max(12),
  priorityThemeIds: z.array(z.enum(["aml-controls", "governance-accountability", "market-abuse-surveillance", "conduct-customer-outcomes", "disclosures-reporting", "systems-and-controls", "sanctions-screening"])).max(5),
}).strict();

const selectedCaseIdsSchema = z.array(z.string().trim().min(1).max(160)).max(50).optional().default([]);
const publicRegions = [...new Set(PUBLIC_REGULATOR_SHELL_ITEMS.map((item) => item.region))];
const regionSet = new Set<string>(publicRegions);
const regulatorRegion = new Map(PUBLIC_REGULATOR_SHELL_ITEMS.map((item) => [item.code, item.region]));
const publicSearchRegulatorCodes = [...new Set([...PUBLIC_REGULATOR_CODES, ...UK_ENFORCEMENT_REGULATOR_CODES])];
type BoardPackEvidenceRecord = FineRecord & { sourceIdentifierAliases: string[] };
const evidenceCache = new Map<string, { expiresAt: number; promise: Promise<BoardPackEvidenceRecord[]> }>();

export function clearBoardPackEvidenceCacheForTests() {
  evidenceCache.clear();
}

export class BoardPackEvidenceInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BoardPackEvidenceInputError";
  }
}

export function parseBoardPackEvidenceInput(value: unknown) {
  const parsed = z.object({ profile: profileSchema, selectedCaseIds: selectedCaseIdsSchema }).strict().parse(value);
  const profile = parsed.profile as BoardFirmProfile;
  if (!BOARD_ARCHETYPES_BY_ID[profile.archetypeId] || profile.priorityThemeIds.some((id) => !BOARD_THEME_DEFINITIONS[id])) {
    throw new BoardPackEvidenceInputError("Invalid Board Pack profile");
  }
  const invalidRegions = profile.focusRegions.filter((region) => !regionSet.has(region));
  if (invalidRegions.length) throw new BoardPackEvidenceInputError("Profile includes a region outside the public evidence perimeter");
  const registryCodes = new Set(PUBLIC_REGULATOR_CODES);
  if (profile.priorityRegulators.some((code) => !registryCodes.has(code))) {
    throw new BoardPackEvidenceInputError("Profile includes a regulator outside the public evidence perimeter");
  }
  return { profile, selectedCaseIds: parsed.selectedCaseIds };
}

export function parseBoardPackBreachCategories(value: unknown): string[] {
  let parsed = value;
  for (let attempt = 0; attempt < 2 && typeof parsed === "string"; attempt += 1) {
    const raw = parsed;
    try { parsed = JSON.parse(raw); } catch { return raw ? [raw] : []; }
  }
  if (Array.isArray(parsed)) return parsed.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
  return typeof parsed === "string" && parsed ? [parsed] : [];
}

export function normalizeBoardPackDate(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : "";
}

export function mapBoardPackEvidenceRow(row: Record<string, unknown>): BoardPackEvidenceRecord {
  const requiresAmountReview = Boolean(row.requires_amount_review);
  const amountGbp = Number(row.trusted_amount_gbp ?? 0);
  const publicCaseId = String(row.public_case_id ?? row.canonical_case_id ?? row.source_row_id ?? row.id ?? "");
  const sourceIdentifierAliases = [...new Set([
    row.id, row.source_row_id, row.canonical_case_id, row.public_case_id,
    ...legacyBoardPackCaseIdsFor(publicCaseId),
  ].filter((value): value is string => typeof value === "string" && value.length > 0))];
  return {
    id: String(row.source_row_id ?? row.id ?? publicCaseId), canonical_case_id: publicCaseId, fine_reference: publicCaseId,
    sourceIdentifierAliases,
    firm_individual: String(row.firm_individual ?? ""), firm_category: row.firm_category ? String(row.firm_category) : null,
    regulator: String(row.regulator ?? ""), final_notice_url: row.notice_url ? String(row.notice_url) : null,
    source_url: row.source_url ? String(row.source_url) : null, summary: String(row.summary ?? ""),
    breach_type: row.breach_type ? String(row.breach_type) : null,
    breach_categories: parseBoardPackBreachCategories(row.breach_categories),
    amount: requiresAmountReview ? 0 : amountGbp, amount_gbp: requiresAmountReview ? 0 : amountGbp,
    date_issued: normalizeBoardPackDate(row.date_issued), year_issued: Number(row.year_issued ?? 0),
    month_issued: Number(row.month_issued ?? 0), requires_amount_review: requiresAmountReview,
    amount_quality: row.amount_quality ? String(row.amount_quality) : undefined,
    source_link_status: (row.source_link_status as FineRecord["source_link_status"]) ?? "missing",
  };
}

/** Fetches the complete canonical perimeter in bounded keyset pages; no newest-N truncation. */
export async function getBoardPackEvidence(profileInput: unknown, sql: SqlClient = getSqlClient()) {
  const { profile, selectedCaseIds } = parseBoardPackEvidenceInput(profileInput);
  const registryCodes = new Set(PUBLIC_REGULATOR_CODES);
  const startingRegulators = profile.priorityRegulators.length ? profile.priorityRegulators : [...registryCodes];
  const selectedRegulators = startingRegulators.filter((code) => registryCodes.has(code)
    && (!profile.focusRegions.length || profile.focusRegions.includes(regulatorRegion.get(code) ?? "")));
  const regionRegulators = profile.focusRegions.length
    ? PUBLIC_REGULATOR_SHELL_ITEMS.filter((item) => profile.focusRegions.includes(item.region)).map((item) => item.code)
    : null;
  const cacheKey = [...selectedRegulators].sort().join(",");
  let cached = evidenceCache.get(cacheKey);
  if (cached && cached.expiresAt <= Date.now()) {
    evidenceCache.delete(cacheKey);
    cached = undefined;
  }
  if (!cached) {
    const promise = (async () => {
      const records: BoardPackEvidenceRecord[] = [];
      let cursor = "";
      while (selectedRegulators.length) {
        const rows = await sql(
          `SELECT public_case_id, id::text AS source_row_id, canonical_case_id, firm_individual, firm_category, regulator, notice_url, source_url, summary,
                  breach_type, breach_categories, trusted_amount_gbp, amount_quality, requires_amount_review,
                  to_char(date_issued, 'YYYY-MM-DD') AS date_issued, year_issued, month_issued, source_link_status
           FROM public.all_regulatory_fines_trusted
           WHERE regulator = ANY($1::text[])
             AND ($2::text[] IS NULL OR regulator = ANY($2::text[]))
             AND public_case_id > $3
           ORDER BY public_case_id ASC LIMIT $4`,
          [startingRegulators, regionRegulators, cursor, PAGE_SIZE],
        );
        if (!rows.length) break;
        records.push(...rows.map(mapBoardPackEvidenceRow));
        cursor = String(rows[rows.length - 1].public_case_id);
        if (rows.length < PAGE_SIZE) break;
      }
      return records;
    })();
    cached = { expiresAt: Date.now() + EVIDENCE_CACHE_TTL_MS, promise };
    evidenceCache.set(cacheKey, cached);
    while (evidenceCache.size > MAX_EVIDENCE_CACHE_ENTRIES) evidenceCache.delete(evidenceCache.keys().next().value!);
    promise.catch(() => { if (evidenceCache.get(cacheKey)?.promise === promise) evidenceCache.delete(cacheKey); });
  }
  const records = await cached.promise;
  const selectedIdSet = new Set(selectedCaseIds);
  const selectedIdResolutions = selectedCaseIds.map(resolveBoardPackCaseId);
  const selectedRecordsInScope = records.filter((record) => record.sourceIdentifierAliases.some((id) => selectedIdSet.has(id)));
  const inScopeIds = new Set(records.flatMap((record) => record.sourceIdentifierAliases));
  const selectedIdsToHydrate = [...new Set(selectedIdResolutions
    .map((resolution) => resolution.currentId)
    .filter((currentId) => !inScopeIds.has(currentId)))];
  const hydratedRows = selectedIdsToHydrate.length
    ? await sql(
      `SELECT public_case_id, id::text AS source_row_id, canonical_case_id, firm_individual, firm_category, regulator, notice_url, source_url, summary,
              breach_type, breach_categories, trusted_amount_gbp, amount_quality, requires_amount_review,
              to_char(date_issued, 'YYYY-MM-DD') AS date_issued, year_issued, month_issued, source_link_status
       FROM public.all_regulatory_fines_trusted
       WHERE (id::text = ANY($1::text[])
          OR public_case_id = ANY($1::text[])
          OR canonical_case_id = ANY($1::text[]))
         AND regulator = ANY($2::text[])`,
      [selectedIdsToHydrate, publicSearchRegulatorCodes],
    )
    : [];
  const selectedRecordByPublicId = new Map<string, BoardPackEvidenceRecord>();
  for (const record of [...selectedRecordsInScope, ...hydratedRows.map(mapBoardPackEvidenceRow)]) {
    selectedRecordByPublicId.set(record.canonical_case_id ?? record.id ?? "", record);
  }
  const selectedRecords = [...selectedRecordByPublicId.values()];
  const selectedCaseResolutions = selectedIdResolutions.flatMap((resolution) => {
    const matched = selectedRecords.find((record) => record.sourceIdentifierAliases.includes(resolution.requestedId)
      || record.sourceIdentifierAliases.includes(resolution.currentId));
    const canonicalCaseId = matched?.canonical_case_id ?? matched?.id;
    return canonicalCaseId ? [{
      requestedId: resolution.requestedId,
      canonicalCaseId,
      ...(resolution.aliasVersion ? { aliasVersion: resolution.aliasVersion } : {}),
    }] : [];
  });
  const analysisDate = new Date().toISOString();
  const pack = buildBoardPack(records, profile, []);
  if (selectedCaseIds.length) {
    const canonicalSelectedIds = [...new Set(selectedCaseResolutions.map((item) => item.canonicalCaseId))];
    const canonicalizedSelectedRecords = selectedRecords.map((record) => ({
      ...record,
      id: record.canonical_case_id ?? record.id,
    }));
    const selectedPack = buildBoardPack(canonicalizedSelectedRecords, profile, canonicalSelectedIds);
    pack.selectedCases = selectedPack.selectedCases;
  }
  return { pack, totalConsidered: records.length, methodologyVersion: BOARD_PACK_EVIDENCE_METHODOLOGY_VERSION, analysisDate, selectedCaseResolutions };
}
