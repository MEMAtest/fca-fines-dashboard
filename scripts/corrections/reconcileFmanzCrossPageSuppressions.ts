import fs from "node:fs";
import postgres from "postgres";
import { fileURLToPath } from "node:url";
import { requireExpectedDbTarget, resolveConnectionString } from "../lib/dbTarget.js";
import {
  reconcileFmanzPublicCaseIds,
  validateFmanzSuppressionManifest,
  verifyFmanzSuppressionRows,
  type FmanzReviewedSuppression,
  type FmanzStoredRow,
} from "./fmanzCrossPageSuppressionHelpers.js";

export const FMANZ_SUPPRESSION_TARGET = "reviewed-fmanz-cross-page-rows-v1";
const FMANZ_REVIEWED_ROWS = 137;
const FMANZ_REVIEWED_PUBLIC_REPRESENTATIVES = 91;
const FMANZ_REVIEWED_SOURCE_PREVIEW_SHA256 = "c04d39c70fe070fb626dbe2573f0b5e504f15d3368ac7534cef98d79b0a759a9";
const manifestUrl = new URL("../scraper/data/fmanzCrossPageSuppressions.json", import.meta.url);
export const FMANZ_CROSS_PAGE_SUPPRESSION_MANIFEST = JSON.parse(
  fs.readFileSync(fileURLToPath(manifestUrl), "utf8"),
) as FmanzReviewedSuppression[];

async function main() {
  const apply = process.argv.includes("--apply");
  const dryRun = process.argv.includes("--dry-run");
  const unknown = process.argv.slice(2).filter((arg) => arg !== "--apply" && arg !== "--dry-run");
  if (unknown.length || (apply && dryRun)) {
    throw new Error("Usage: reconcileFmanzCrossPageSuppressions.ts [--dry-run | --apply]");
  }
  if (apply && process.env.FMANZ_CROSS_PAGE_SUPPRESSIONS_APPROVED !== "true") {
    throw new Error("Refusing apply without FMANZ_CROSS_PAGE_SUPPRESSIONS_APPROVED=true after primary-source and independent review.");
  }
  if (apply && process.env.FMANZ_CROSS_PAGE_SUPPRESSION_TARGET !== FMANZ_SUPPRESSION_TARGET) {
    throw new Error(`Refusing apply without exact target ${FMANZ_SUPPRESSION_TARGET}.`);
  }
  validateFmanzSuppressionManifest(FMANZ_CROSS_PAGE_SUPPRESSION_MANIFEST);
  const reviewedPublicIds = FMANZ_CROSS_PAGE_SUPPRESSION_MANIFEST
    .flatMap((item) => item.publicCaseId === null ? [] : [item.publicCaseId]);
  if (
    FMANZ_CROSS_PAGE_SUPPRESSION_MANIFEST.length !== FMANZ_REVIEWED_ROWS ||
    reviewedPublicIds.length !== FMANZ_REVIEWED_PUBLIC_REPRESENTATIVES ||
    new Set(reviewedPublicIds).size !== FMANZ_REVIEWED_PUBLIC_REPRESENTATIVES ||
    FMANZ_CROSS_PAGE_SUPPRESSION_MANIFEST.some(
      (item) => item.reviewEvidenceSha256 !== FMANZ_REVIEWED_SOURCE_PREVIEW_SHA256,
    )
  ) {
    throw new Error("FMANZ suppression manifest differs from the independently reviewed 137-row / 91-public-case evidence set.");
  }
  if (!apply && !dryRun) process.argv.push("--dry-run");
  requireExpectedDbTarget("fmanz-cross-page-suppressions");
  const connection = resolveConnectionString();
  if (!connection) throw new Error("Database connection required for FMANZ suppression preflight.");
  const sql = postgres(connection, {
    max: 1,
    ssl: connection.includes("sslmode=") ? { rejectUnauthorized: false } : false,
  });

  try {
    const result = await sql.begin(async (tx) => {
      await tx.unsafe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      if (!apply) await tx.unsafe("SET TRANSACTION READ ONLY");
      await tx.unsafe("SET LOCAL lock_timeout='30s'");
      await tx.unsafe("SET LOCAL statement_timeout='120s'");
      await tx.unsafe("SELECT pg_advisory_xact_lock(72140331)");
      const manifest = FMANZ_CROSS_PAGE_SUPPRESSION_MANIFEST;
      const ids = manifest.map((item) => item.id);
      const storedRows = await tx.unsafe<FmanzStoredRow[]>(
        `SELECT id::text, content_hash, regulator, firm_individual,
                to_char(date_issued, 'YYYY-MM-DD') AS date_issued,
                source_url, final_notice_url, raw_payload
           FROM public.eu_fines WHERE id = ANY($1::uuid[])
           ${apply ? "FOR UPDATE" : ""}`,
        [ids],
      );
      verifyFmanzSuppressionRows(storedRows, manifest);

      const schema = await tx`
        SELECT to_regclass('public.regulatory_case_suppressions') IS NOT NULL AS table_ready,
               pg_get_viewdef('public.all_regulatory_fines_trusted'::regclass, true)
                 LIKE '%regulatory_case_suppressions%' AS trusted_view_guarded
      `;
      if (!schema[0]?.table_ready || !schema[0]?.trusted_view_guarded) {
        throw new Error("FMANZ suppression table/trusted-view guard is not installed; no rows changed.");
      }

      const existing = await tx.unsafe<Array<{
        source_row_id: string;
        regulator: string;
        reason: string;
      }>>(
        `SELECT source_row_id, regulator, reason
           FROM public.regulatory_case_suppressions WHERE source_row_id = ANY($1::text[])`,
        [ids],
      );
      const existingById = new Map(existing.map((row) => [row.source_row_id, row]));
      for (const item of manifest) {
        const prior = existingById.get(item.id);
        if (prior && (prior.regulator.toUpperCase() !== "FMANZ" || prior.reason !== item.reason)) {
          throw new Error(`Existing suppression for ${item.id} differs from the reviewed manifest; refusing to proceed.`);
        }
      }
      if (existing.length !== 0 && existing.length !== manifest.length) {
        throw new Error("Only some FMANZ manifest rows are already suppressed; refusing mixed-state reconciliation.");
      }

      const beforeIds = await tx.unsafe<Array<{ public_case_id: string }>>(
        `SELECT public_case_id FROM public.all_regulatory_fines_trusted
          WHERE regulator = 'FMANZ' ORDER BY public_case_id`,
      );
      const rawBefore = await tx.unsafe<Array<{ count: number }>>(
        `SELECT count(*)::int AS count FROM public.eu_fines WHERE regulator = 'FMANZ'`,
      );
      const expectedRemoved = [...new Set(
        manifest.flatMap((item) => item.publicCaseId === null ? [] : [item.publicCaseId]),
      )];

      if (existing.length === manifest.length) {
        for (const publicCaseId of expectedRemoved) {
          if (beforeIds.some((row) => row.public_case_id === publicCaseId)) {
            throw new Error(`Idempotent FMANZ suppression check found reviewed public case still visible: ${publicCaseId}`);
          }
        }
        return {
          mode: "already-applied-noop",
          storedRows: storedRows.length,
          existingSuppressions: existing.length,
          before: { rawRows: rawBefore[0]?.count ?? null, publicCases: beforeIds.length },
          expectedRemovedPublicCaseIds: expectedRemoved,
          manifest,
        };
      }

      for (const publicCaseId of expectedRemoved) {
        if (!beforeIds.some((row) => row.public_case_id === publicCaseId)) {
          throw new Error(`Reviewed FMANZ public case is no longer present before suppression: ${publicCaseId}`);
        }
      }

      const summary = {
        mode: apply ? "apply" : "dry-run",
        storedRows: storedRows.length,
        existingSuppressions: existing.length,
        before: { rawRows: rawBefore[0]?.count ?? null, publicCases: beforeIds.length },
        expectedRemovedPublicCaseIds: expectedRemoved,
        manifest,
      };
      if (!apply) return summary;

      for (const item of manifest) {
        await tx.unsafe(
          `INSERT INTO public.regulatory_case_suppressions
             (source_row_id, regulator, reason, replacement_source_row_id)
           VALUES ($1, 'FMANZ', $2, NULL) ON CONFLICT (source_row_id) DO NOTHING`,
          [item.id, item.reason],
        );
      }
      const afterIds = await tx.unsafe<Array<{ public_case_id: string }>>(
        `SELECT public_case_id FROM public.all_regulatory_fines_trusted
          WHERE regulator = 'FMANZ' ORDER BY public_case_id`,
      );
      reconcileFmanzPublicCaseIds(
        beforeIds.map((row) => row.public_case_id),
        afterIds.map((row) => row.public_case_id),
        expectedRemoved,
      );
      const rawAfter = await tx.unsafe<Array<{ count: number }>>(
        `SELECT count(*)::int AS count FROM public.eu_fines WHERE regulator = 'FMANZ'`,
      );
      if (rawAfter[0]?.count !== rawBefore[0]?.count) {
        throw new Error("FMANZ raw source-row count changed during suppression; transaction rolled back.");
      }
      const persisted = await tx.unsafe<Array<{ count: number }>>(
        `SELECT count(*)::int AS count FROM public.regulatory_case_suppressions
          WHERE source_row_id = ANY($1::text[]) AND regulator = 'FMANZ'`,
        [ids],
      );
      if (persisted[0]?.count !== ids.length) {
        throw new Error("FMANZ suppression postcondition failed; transaction rolled back.");
      }
      return summary;
    });
    console.log(JSON.stringify({
      ...result,
      target: FMANZ_SUPPRESSION_TARGET,
      evidence: "Only exact, independently reviewed raw rows with listing/detail identity conflicts are eligible; every ambiguous mismatch remains visible for review.",
      rawRows: "preserved; no eu_fines row is updated or deleted",
      postcondition: apply && result.mode === "apply"
        ? "only reviewed public-case IDs were removed; all raw eu_fines rows were preserved"
        : "read-only preflight; no rows changed",
    }, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "FMANZ suppression reconciliation failed.");
    process.exitCode = 1;
  });
}
