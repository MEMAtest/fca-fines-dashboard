import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { SqlClient } from "../db.js";
import { getSqlClient } from "../db.js";
import {
  BOARD_ARCHETYPES_BY_ID,
  BOARD_FOCUS_OPTIONS,
  BOARD_THEME_DEFINITIONS,
} from "../../src/data/boardIntelligence.js";
import type { FineRecord } from "../../src/types.js";
import type {
  BoardPackDraftPayloadV1,
  BoardPackSharedSnapshotV1,
} from "../../src/types/boardPackPersistence.js";
import { buildBoardPack } from "../../src/utils/boardIntelligence.js";

const profileSchema = z.object({
  firmName: z.string().trim().min(1).max(160),
  archetypeId: z.enum([
    "retail-bank",
    "broker-dealer",
    "asset-manager",
    "payments-fintech",
    "exchange-market-infrastructure",
    "insurer",
  ]),
  boardFocus: z.enum(["assurance", "remediation", "expansion"]),
  priorityRegulators: z.array(z.string().trim().min(2).max(16)).max(5),
  focusRegions: z.array(z.string().trim().min(2).max(40)).max(5),
  priorityThemeIds: z.array(z.enum([
    "aml-controls",
    "governance-accountability",
    "market-abuse-surveillance",
    "conduct-customer-outcomes",
    "disclosures-reporting",
    "systems-and-controls",
    "sanctions-screening",
  ])).max(5),
}).superRefine((value, context) => {
  if (!BOARD_ARCHETYPES_BY_ID[value.archetypeId]) {
    context.addIssue({ code: "custom", message: "Unknown board archetype" });
  }
  if (!BOARD_FOCUS_OPTIONS.some((item) => item.id === value.boardFocus)) {
    context.addIssue({ code: "custom", message: "Unknown board focus" });
  }
  if (value.priorityThemeIds.some((id) => !BOARD_THEME_DEFINITIONS[id])) {
    context.addIssue({ code: "custom", message: "Unknown board theme" });
  }
});

export const boardPackDraftPayloadV1Schema = z.object({
  schemaVersion: z.literal(1),
  label: z.string().trim().min(1).max(120),
  currency: z.enum(["GBP", "EUR", "USD"]),
  firmProfile: profileSchema,
  presentationSettings: z.object({
    viewMode: z.enum(["board", "working"]),
    brandingMode: z.enum(["mema", "client-ready"]),
    clientLabel: z.string().trim().max(120),
    confidentialityLabel: z.string().trim().max(120),
    analystNote: z.string().trim().max(2_000),
    templateId: z.enum(["committee-core", "remediation-intensive", "expansion-entry"]).nullable(),
  }),
  analystNote: z.string().trim().max(2_000),
  evidenceLocators: z.array(z.object({
    caseId: z.string().uuid(),
    regulator: z.string().trim().min(2).max(16),
  })).max(50),
  assuranceMode: z.boolean(),
  controlStatuses: z.record(
    z.string().trim().min(1).max(160),
    z.enum(["unassessed", "not-tested", "needs-work", "evidence-partial", "evidenced"]),
  ).refine((value) => Object.keys(value).length <= 100, "Too many control statuses"),
}).strict();

function hashToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function randomToken() {
  return randomBytes(32).toString("base64url");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function parseBoardPackDraftPayload(value: unknown): BoardPackDraftPayloadV1 {
  const parsed = boardPackDraftPayloadV1Schema.parse(value);
  if (Buffer.byteLength(JSON.stringify(parsed), "utf8") > 64 * 1024) {
    throw new Error("Board Pack draft exceeds the 64 KB limit");
  }
  return parsed;
}

export function boardPackPersistenceEnabled() {
  return process.env.BOARD_PACK_PERSISTENCE_ENABLED === "true";
}

const persistenceTableReadiness = new WeakMap<SqlClient, Promise<void>>();

export async function ensureBoardPackPersistenceTables(
  sql: SqlClient = getSqlClient(),
) {
  let readiness = persistenceTableReadiness.get(sql);
  if (!readiness) {
    readiness = (async () => {
      await sql("CREATE EXTENSION IF NOT EXISTS pgcrypto");
      await sql(`
        CREATE TABLE IF NOT EXISTS public.board_pack_drafts (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          owner_token_hash text NOT NULL,
          revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
          payload jsonb NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days')
        )
      `);
      await sql(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_board_pack_drafts_owner
          ON public.board_pack_drafts(id, owner_token_hash)
      `);
      await sql(`
        CREATE INDEX IF NOT EXISTS idx_board_pack_drafts_expiry
          ON public.board_pack_drafts(expires_at)
      `);
      await sql(`
        CREATE TABLE IF NOT EXISTS public.board_pack_shares (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          pack_id uuid NOT NULL REFERENCES public.board_pack_drafts(id) ON DELETE CASCADE,
          share_token_hash text NOT NULL UNIQUE,
          source_revision integer NOT NULL CHECK (source_revision > 0),
          snapshot jsonb NOT NULL,
          snapshot_hash text NOT NULL,
          application_commit text NOT NULL,
          generated_at timestamptz NOT NULL DEFAULT now(),
          expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
          revoked_at timestamptz
        )
      `);
      await sql(`
        CREATE INDEX IF NOT EXISTS idx_board_pack_shares_pack
          ON public.board_pack_shares(pack_id, generated_at DESC)
      `);
      await sql(`
        CREATE INDEX IF NOT EXISTS idx_board_pack_shares_expiry
          ON public.board_pack_shares(expires_at)
      `);
      await sql(`
        CREATE TABLE IF NOT EXISTS public.board_pack_request_limits (
          scope_hash text NOT NULL,
          window_start timestamptz NOT NULL,
          request_count integer NOT NULL DEFAULT 1,
          PRIMARY KEY (scope_hash, window_start)
        )
      `);
      await sql(`
        CREATE INDEX IF NOT EXISTS idx_board_pack_request_limits_window
          ON public.board_pack_request_limits(window_start)
      `);
    })().catch((error) => {
      persistenceTableReadiness.delete(sql);
      throw error;
    });
    persistenceTableReadiness.set(sql, readiness);
  }
  await readiness;
}

interface BoardPackDraftCreateResult {
  id: string;
  revision: number;
  created_at: string;
  updated_at: string;
  expires_at: string;
  payload: BoardPackDraftPayloadV1;
  ownerToken: string;
}

interface BoardPackShareCreateResult {
  id: string;
  source_revision: number;
  snapshot_hash: string;
  application_commit: string;
  generated_at: string;
  expires_at: string;
  shareToken: string;
}

export function parseOwnerBearer(header: string | string[] | undefined) {
  const value = Array.isArray(header) ? header[0] : header;
  const match = value?.match(/^Bearer ([A-Za-z0-9_-]{43})$/);
  if (!match) throw Object.assign(new Error("A valid owner bearer token is required"), { statusCode: 401 });
  return match[1];
}

export async function enforceBoardPackRateLimit(
  scope: string,
  sql: SqlClient = getSqlClient(),
  maximum = 30,
) {
  await ensureBoardPackPersistenceTables(sql);
  const scopeHash = hashToken(scope.slice(0, 1_000));
  const rows = await sql(
    `INSERT INTO public.board_pack_request_limits (scope_hash, window_start, request_count)
     VALUES ($1, date_trunc('minute', now()), 1)
     ON CONFLICT (scope_hash, window_start)
     DO UPDATE SET request_count = board_pack_request_limits.request_count + 1
     RETURNING request_count`,
    [scopeHash],
  );
  if (Number(rows[0]?.request_count) > maximum) {
    throw Object.assign(new Error("Too many Board Pack requests; try again shortly"), {
      statusCode: 429,
    });
  }
}

export async function createBoardPackDraft(
  rawPayload: unknown,
  sql: SqlClient = getSqlClient(),
): Promise<BoardPackDraftCreateResult> {
  const payload = parseBoardPackDraftPayload(rawPayload);
  const ownerToken = randomToken();
  const rows = await sql(
    `INSERT INTO public.board_pack_drafts (owner_token_hash, payload)
     VALUES ($1, $2::jsonb)
     RETURNING id::text, revision, created_at::text, updated_at::text, expires_at::text`,
    [hashToken(ownerToken), JSON.stringify(payload)],
  );
  const row = rows[0];
  if (!row) throw new Error("Board Pack draft could not be created");
  return {
    id: String(row.id),
    revision: Number(row.revision),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    expires_at: String(row.expires_at),
    payload,
    ownerToken,
  };
}

export async function getBoardPackDraft(
  packId: string,
  ownerToken: string,
  sql: SqlClient = getSqlClient(),
) {
  const rows = await sql(
    `SELECT id::text, revision, payload, created_at::text, updated_at::text, expires_at::text
     FROM public.board_pack_drafts
     WHERE id = $1::uuid AND owner_token_hash = $2 AND expires_at > now()`,
    [packId, hashToken(ownerToken)],
  );
  if (!rows[0]) throw Object.assign(new Error("Board Pack draft not found"), { statusCode: 404 });
  return rows[0];
}

export async function updateBoardPackDraft(
  packId: string,
  ownerToken: string,
  expectedRevision: number,
  rawPayload: unknown,
  sql: SqlClient = getSqlClient(),
) {
  const payload = parseBoardPackDraftPayload(rawPayload);
  const rows = await sql(
    `UPDATE public.board_pack_drafts
     SET payload = $1::jsonb, revision = revision + 1,
         updated_at = now(), expires_at = now() + interval '90 days'
     WHERE id = $2::uuid AND owner_token_hash = $3
       AND revision = $4 AND expires_at > now()
     RETURNING id::text, revision, payload, updated_at::text, expires_at::text`,
    [JSON.stringify(payload), packId, hashToken(ownerToken), expectedRevision],
  );
  if (rows[0]) return rows[0];
  const current = await getBoardPackDraft(packId, ownerToken, sql);
  throw Object.assign(new Error("Board Pack draft revision conflict"), {
    statusCode: 409,
    currentRevision: current.revision,
  });
}

export async function deleteBoardPackDraft(
  packId: string,
  ownerToken: string,
  sql: SqlClient = getSqlClient(),
) {
  const rows = await sql(
    `DELETE FROM public.board_pack_drafts
     WHERE id = $1::uuid AND owner_token_hash = $2 RETURNING id`,
    [packId, hashToken(ownerToken)],
  );
  if (!rows[0]) throw Object.assign(new Error("Board Pack draft not found"), { statusCode: 404 });
}

function mapEvidenceRow(row: Record<string, unknown>): FineRecord {
  return {
    fine_reference: String(row.public_case_id),
    canonical_case_id: String(row.public_case_id),
    firm_individual: String(row.firm_individual ?? ""),
    firm_category: row.firm_category ? String(row.firm_category) : null,
    regulator: String(row.regulator ?? ""),
    final_notice_url: row.notice_url ? String(row.notice_url) : null,
    source_url: row.source_url ? String(row.source_url) : null,
    summary: String(row.summary ?? ""),
    breach_type: row.breach_type ? String(row.breach_type) : null,
    breach_categories: Array.isArray(row.breach_categories)
      ? row.breach_categories.map(String)
      : [],
    amount: Number(row.trusted_amount_gbp ?? 0),
    date_issued: String(row.date_issued ?? "").slice(0, 10),
    year_issued: Number(row.year_issued ?? 0),
    month_issued: Number(row.month_issued ?? 0),
    requires_amount_review: Boolean(row.requires_amount_review),
  };
}

export async function createBoardPackShare(
  packId: string,
  ownerToken: string,
  sql: SqlClient = getSqlClient(),
): Promise<BoardPackShareCreateResult> {
  const draft = await getBoardPackDraft(packId, ownerToken, sql);
  const payload = parseBoardPackDraftPayload(draft.payload);
  const ids = payload.evidenceLocators.map((item) => item.caseId);
  const evidence = ids.length
    ? await sql(
        `SELECT public_case_id, firm_individual, firm_category, regulator,
                notice_url, source_url, summary, breach_type, breach_categories,
                trusted_amount_gbp, date_issued, year_issued, month_issued,
                requires_amount_review
         FROM public.all_regulatory_fines_trusted
         WHERE public_case_id = ANY($1::text[])`,
        [ids],
      )
    : [];
  const byId = new Map(evidence.map((row) => [String(row.public_case_id), mapEvidenceRow(row)]));
  const records = payload.evidenceLocators
    .map((locator) => byId.get(locator.caseId))
    .filter((item): item is FineRecord => Boolean(item));
  const generatedAt = new Date().toISOString();
  const applicationCommit =
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.GIT_COMMIT_SHA?.trim() ||
    "local";
  const snapshot: BoardPackSharedSnapshotV1 = {
    schemaVersion: 1,
    payload,
    result: buildBoardPack(records, payload.firmProfile, ids),
    generatedAt,
    applicationCommit,
    sourceRevision: Number(draft.revision),
  };
  const snapshotHash = createHash("sha256").update(stableJson(snapshot)).digest("hex");
  const shareToken = randomToken();
  const rows = await sql(
    `INSERT INTO public.board_pack_shares (
       pack_id, share_token_hash, source_revision, snapshot,
       snapshot_hash, application_commit, generated_at
     ) VALUES ($1::uuid, $2, $3, $4::jsonb, $5, $6, $7::timestamptz)
     RETURNING id::text, source_revision, snapshot_hash, application_commit,
               generated_at::text, expires_at::text`,
    [
      packId,
      hashToken(shareToken),
      Number(draft.revision),
      JSON.stringify(snapshot),
      snapshotHash,
      applicationCommit,
      generatedAt,
    ],
  );
  const row = rows[0];
  if (!row) throw new Error("Board Pack share could not be created");
  return {
    id: String(row.id),
    source_revision: Number(row.source_revision),
    snapshot_hash: String(row.snapshot_hash),
    application_commit: String(row.application_commit),
    generated_at: String(row.generated_at),
    expires_at: String(row.expires_at),
    shareToken,
  };
}

export async function revokeBoardPackShare(
  packId: string,
  shareId: string,
  ownerToken: string,
  sql: SqlClient = getSqlClient(),
) {
  const rows = await sql(
    `UPDATE public.board_pack_shares AS share
     SET revoked_at = now()
     FROM public.board_pack_drafts AS draft
     WHERE share.id = $1::uuid AND share.pack_id = $2::uuid
       AND draft.id = share.pack_id AND draft.owner_token_hash = $3
       AND share.revoked_at IS NULL
     RETURNING share.id`,
    [shareId, packId, hashToken(ownerToken)],
  );
  if (!rows[0]) throw Object.assign(new Error("Board Pack share not found"), { statusCode: 404 });
}

export async function getBoardPackShare(
  shareToken: string,
  sql: SqlClient = getSqlClient(),
) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(shareToken)) {
    throw Object.assign(new Error("Board Pack share not found"), { statusCode: 404 });
  }
  const rows = await sql(
    `SELECT id::text, source_revision, snapshot, snapshot_hash,
            application_commit, generated_at::text, expires_at::text
     FROM public.board_pack_shares
     WHERE share_token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
    [hashToken(shareToken)],
  );
  if (!rows[0]) throw Object.assign(new Error("Board Pack share not found"), { statusCode: 404 });
  return rows[0];
}
