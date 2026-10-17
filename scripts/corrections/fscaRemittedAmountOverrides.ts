/**
 * Reconcile the two explicitly remitted FSCA penalties against stored rows.
 * Default mode is read-only; `--apply` also requires an explicit confirmation
 * variable and the standard expected-production-database guard.
 */
import "dotenv/config";
import postgres from "postgres";
import { resolveConnectionString } from "../../server/db.js";
import { requireExpectedDbTarget } from "../lib/dbTarget.js";
import { UNIFIED_VIEW_REFRESH_LOCK } from "../scraper/lib/refreshViews.js";

const CORRECTIONS = [
  {
    respondent: "Steinhoff International Holdings NV",
    dateIssued: "2019-09-11",
    evidenceUrl: "https://www.fsca.co.za/_api/cr3ad_shareddocumentses(9fffd433-78de-f011-8407-7ced8d771a24)/cr3ad_document/$value",
    grossAmount: 1_500_000_000,
    operativeAmount: 53_000_000,
    amountGbp: 2_279_000,
    amountEur: 2_703_000,
    sourceQuote: "Administrative Penalty: R1.5 billion remitted to R53 million",
  },
  {
    respondent: "Tongaat Hulett Limited",
    dateIssued: "2020-08-23",
    evidenceUrl: "https://www.fsca.co.za/_api/cr3ad_shareddocumentses(c18e0909-78de-f011-8407-7ced8d771a24)/cr3ad_document/$value",
    grossAmount: 118_340_000,
    operativeAmount: 20_000_000,
    amountGbp: 860_000,
    amountEur: 1_020_000,
    sourceQuote: "the penalty and interest is remitted to R20 million (inclusive of investigation costs)",
  },
] as const;

const connectionString = resolveConnectionString();
if (!connectionString) throw new Error("A supported database connection string is required for this read-only reconciliation.");

const sql = postgres(connectionString, {
  max: 1,
  ssl: connectionString.includes("sslmode=") ? { rejectUnauthorized: false } : undefined,
});

async function loadMatches(client: typeof sql, correction: (typeof CORRECTIONS)[number]) {
  return client`
    SELECT
      source_row.id::text AS id,
      source_row.content_hash,
      source_row.regulator,
      source_row.firm_individual,
      source_row.date_issued::text AS date_issued,
      source_row.amount AS amount_original,
      source_row.currency,
      source_row.amount_gbp,
      source_row.amount_eur,
      source_row.final_notice_url,
      source_row.summary,
      canonical.canonical_case_id,
      md5(concat_ws(
        '|',
        upper(source_row.regulator),
        regexp_replace(lower(trim(COALESCE(source_row.firm_individual, ''))), '[[:space:]]+', ' ', 'g'),
        source_row.date_issued::text,
        public.normalise_regulatory_evidence_url(COALESCE(NULLIF(source_row.final_notice_url, ''), NULLIF(source_row.source_url, ''), '')),
        ${correction.operativeAmount}::numeric(20, 2)::text,
        upper('ZAR'),
        regexp_replace(lower(trim(COALESCE(source_row.breach_type, ''))), '[[:space:]]+', ' ', 'g')
      )) AS predicted_new_canonical_case_id,
      trusted.public_case_id,
      registry.public_case_id AS registry_public_case_id,
      fingerprint_alias.public_case_id AS fingerprint_alias_public_case_id,
      override.amount_original AS existing_override_amount,
      override.amount_gbp AS existing_override_gbp,
      override.amount_eur AS existing_override_eur
    FROM public.eu_fines AS source_row
    LEFT JOIN public.all_regulatory_fines_canonical AS canonical
      ON canonical.id = source_row.id::text
    LEFT JOIN public.all_regulatory_fines_trusted AS trusted
      ON trusted.id = source_row.id::text
    LEFT JOIN public.regulatory_case_registry AS registry
      ON registry.source_row_id = source_row.id::text
    LEFT JOIN public.regulatory_case_aliases AS fingerprint_alias
      ON fingerprint_alias.fingerprint = canonical.canonical_case_id
    LEFT JOIN public.regulatory_amount_overrides AS override
      ON override.regulator = upper(source_row.regulator)
     AND override.evidence_url = public.normalise_regulatory_evidence_url(source_row.final_notice_url)
    WHERE upper(source_row.regulator) = 'FSCA'
      AND public.normalise_regulatory_evidence_url(source_row.final_notice_url)
        = public.normalise_regulatory_evidence_url(${correction.evidenceUrl})
    ORDER BY source_row.created_at DESC, source_row.id
  `;
}

async function main() {
  const apply = process.argv.includes("--apply");
  if (apply) {
    if (process.env.FSCA_REMITTED_OVERRIDES_APPLY !== "YES") {
      throw new Error("Refusing to apply without FSCA_REMITTED_OVERRIDES_APPLY=YES after independent review.");
    }
    requireExpectedDbTarget("FSCA remitted amount overrides");
    const [legacyColumn] = await sql`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'regulatory_case_registry'
          AND column_name = 'legacy_public_case_id'
      ) AS available
    `;
    if (!legacyColumn?.available) {
      throw new Error("Apply requires migrations/20261017_registry_legacy_public_case_id.sql to be reviewed and installed first.");
    }
  }

  const matches = [] as Array<{ correction: (typeof CORRECTIONS)[number]; row: Record<string, unknown> }>;
  for (const correction of CORRECTIONS) {
    const rows = await loadMatches(sql, correction);
    const row = rows[0];
    const sourceMatch = rows.length === 1
      && row.firm_individual === correction.respondent
      && String(row.date_issued).slice(0, 10) === correction.dateIssued
      && String(row.summary ?? "").includes(correction.sourceQuote);
    const existingEffectiveAmount = row?.existing_override_amount == null
      ? Number(row?.amount_original)
      : Number(row.existing_override_amount);
    const safe = sourceMatch && (existingEffectiveAmount === correction.grossAmount
      || existingEffectiveAmount === correction.operativeAmount);
    const needsOverride = safe && existingEffectiveAmount !== correction.operativeAmount;

    console.log(JSON.stringify({
      respondent: correction.respondent,
      evidenceUrl: correction.evidenceUrl,
      sourceQuote: correction.sourceQuote,
      matchedRows: rows.length,
      safeExactMatch: safe,
      status: safe ? (needsOverride ? "needs_override" : "already_correct") : "review_required",
      publicCaseIdAfterPreservation: safe ? row.public_case_id : null,
      stored: row ? {
        id: row.id,
        contentHash: row.content_hash,
        canonicalCaseId: row.canonical_case_id,
        predictedNewCanonicalCaseId: row.predicted_new_canonical_case_id,
        publicCaseId: row.public_case_id,
        registryPublicCaseId: row.registry_public_case_id,
        fingerprintAliasPublicCaseId: row.fingerprint_alias_public_case_id,
        amountOriginal: row.amount_original,
        currency: row.currency,
        amountGbp: row.amount_gbp,
        amountEur: row.amount_eur,
        summary: row.summary,
        existingOverride: row.existing_override_amount == null ? null : {
          amountOriginal: row.existing_override_amount,
          amountGbp: row.existing_override_gbp,
          amountEur: row.existing_override_eur,
        },
      } : null,
      corrected: {
        amountOriginal: correction.operativeAmount,
        currency: "ZAR",
        amountGbp: correction.amountGbp,
        amountEur: correction.amountEur,
      },
    }, null, 2));

    if (!safe) throw new Error(`Expected one exact source-quote match with either the original or operative amount for ${correction.respondent}; no override was applied.`);
    const existing = row.existing_override_amount == null ? null : {
      amountOriginal: Number(row.existing_override_amount),
      amountGbp: Number(row.existing_override_gbp),
      amountEur: Number(row.existing_override_eur),
    };
    if (existing && (existing.amountOriginal !== correction.operativeAmount
      || existing.amountGbp !== correction.amountGbp
      || existing.amountEur !== correction.amountEur)) {
      throw new Error(`An existing amount override differs for ${correction.respondent}; review manually before continuing.`);
    }
    if (needsOverride) matches.push({ correction, row });
  }

  if (!apply) {
    console.log(`Read-only mode. ${matches.length} override(s) would be needed; raw enforcement rows were not changed.`);
    return;
  }

  const verifiedChanges: Array<Record<string, unknown>> = [];
  await sql.begin(async (tx) => {
    const txSql = tx as unknown as typeof sql;
    await txSql`SELECT pg_advisory_xact_lock(${UNIFIED_VIEW_REFRESH_LOCK})`;

    const preserveIds = new Map<string, string>();
    for (const { correction, row } of matches) {
      const rowId = String(row.id);
      const oldPublicCaseId = String(row.public_case_id);
      const oldFingerprint = String(row.canonical_case_id);
      const registryRows = await txSql`
        SELECT public_case_id::text AS public_case_id,
               current_fingerprint,
               legacy_public_case_id
        FROM public.regulatory_case_registry
        WHERE source_row_id = ${rowId}
        FOR UPDATE
      `;
      if (registryRows.length > 1) {
        throw new Error(`Multiple registry rows exist for source row ${rowId}.`);
      }

      let registryId = registryRows[0]?.public_case_id as string | undefined;
      if (registryRows[0]) {
        const savedLegacyId = registryRows[0].legacy_public_case_id as string | null;
        if (savedLegacyId && savedLegacyId !== oldPublicCaseId) {
          throw new Error(`Stored legacy public ID differs for source row ${rowId}; refusing to replace it.`);
        }
        await txSql`
          UPDATE public.regulatory_case_registry
          SET legacy_public_case_id = COALESCE(legacy_public_case_id, ${oldPublicCaseId}),
              updated_at = now()
          WHERE source_row_id = ${rowId}
        `;
      } else {
        registryId = row.fingerprint_alias_public_case_id as string | undefined;
        if (!registryId) {
          const registeredFingerprint = await txSql`
            SELECT public_case_id::text AS public_case_id
            FROM public.regulatory_case_registry
            WHERE current_fingerprint = ${oldFingerprint}
            FOR UPDATE
          `;
          if (registeredFingerprint.length) {
            throw new Error(`Old canonical fingerprint ${oldFingerprint} is already registered to another source row.`);
          }
          const inserted = await txSql`
            INSERT INTO public.regulatory_case_registry (
              source_row_id, current_fingerprint, legacy_public_case_id
            ) VALUES (${rowId}, ${oldFingerprint}, ${oldPublicCaseId})
            RETURNING public_case_id::text AS public_case_id
          `;
          registryId = String(inserted[0]?.public_case_id ?? "");
        }
      }
      if (!registryId) throw new Error(`Could not resolve an internal registry ID for ${correction.respondent}.`);

      await txSql`
        INSERT INTO public.regulatory_case_aliases (fingerprint, public_case_id)
        VALUES (${oldFingerprint}, ${registryId}::uuid)
        ON CONFLICT (fingerprint) DO NOTHING
      `;
      const oldAlias = await txSql`
        SELECT public_case_id::text AS public_case_id
        FROM public.regulatory_case_aliases
        WHERE fingerprint = ${oldFingerprint}
      `;
      if (oldAlias[0]?.public_case_id !== registryId) {
        throw new Error(`Old fingerprint ${oldFingerprint} has a conflicting alias.`);
      }
      preserveIds.set(String(row.id), registryId);

      await txSql`
        INSERT INTO public.regulatory_amount_overrides (
          regulator, evidence_url, amount_original, currency, amount_gbp,
          amount_eur, verification_url, reason, quality_status, verified_at
        ) VALUES (
          'FSCA',
          public.normalise_regulatory_evidence_url(${correction.evidenceUrl}),
          ${correction.operativeAmount}, 'ZAR', ${correction.amountGbp},
          ${correction.amountEur}, ${correction.evidenceUrl},
          ${`Official FSCA outcome for ${correction.respondent} states: “${correction.sourceQuote}”. The override records the remitted payable amount; the original gross amount and source text remain on raw row ${rowId}.`},
          'verified_override', now()
        )
        ON CONFLICT (regulator, evidence_url) DO NOTHING
      `;
    }
    await txSql`REFRESH MATERIALIZED VIEW public.all_regulatory_fines_canonical`;

    for (const { correction, row } of matches) {
      const rowId = String(row.id);
      const registryId = preserveIds.get(String(row.id));
      const newCanonical = await txSql`
        SELECT canonical_case_id
        FROM public.all_regulatory_fines_canonical
        WHERE id = ${rowId}
      `;
      const newFingerprint = String(newCanonical[0]?.canonical_case_id ?? "");
      if (!newFingerprint) throw new Error(`Canonical row disappeared for ${correction.respondent} after refresh.`);

      await txSql`
        UPDATE public.regulatory_case_registry
        SET current_fingerprint = ${newFingerprint}, updated_at = now()
        WHERE source_row_id = ${rowId}
      `;
      await txSql`
        INSERT INTO public.regulatory_case_aliases (fingerprint, public_case_id)
        VALUES (${newFingerprint}, ${registryId}::uuid)
        ON CONFLICT (fingerprint) DO NOTHING
      `;
      const newAlias = await txSql`
        SELECT public_case_id::text AS public_case_id
        FROM public.regulatory_case_aliases
        WHERE fingerprint = ${newFingerprint}
      `;
      const previousAlias = await txSql`
        SELECT public_case_id::text AS public_case_id
        FROM public.regulatory_case_aliases
        WHERE fingerprint = ${String(row.canonical_case_id)}
      `;
      if (newAlias[0]?.public_case_id !== registryId) {
        throw new Error(`New fingerprint ${newFingerprint} has a conflicting alias.`);
      }
      const publicRow = await txSql`
        SELECT public_case_id, amount_original, trusted_amount_gbp, trusted_amount_eur
        FROM public.all_regulatory_fines_trusted
        WHERE id = ${rowId}
      `;
      if (publicRow[0]?.public_case_id !== String(row.public_case_id)
        || Number(publicRow[0]?.amount_original) !== correction.operativeAmount
        || Number(publicRow[0]?.trusted_amount_gbp) !== correction.amountGbp
        || Number(publicRow[0]?.trusted_amount_eur) !== correction.amountEur) {
        throw new Error(`Post-refresh identity or amount verification failed for ${correction.respondent}.`);
      }
      verifiedChanges.push({
        id: rowId,
        previousCanonicalCaseId: row.canonical_case_id,
        newCanonicalCaseId: newFingerprint,
        preservedPublicCaseId: publicRow[0].public_case_id,
        amountOriginal: publicRow[0].amount_original,
        amountGbp: publicRow[0].trusted_amount_gbp,
        amountEur: publicRow[0].trusted_amount_eur,
        previousAliasRetained: previousAlias[0]?.public_case_id === registryId,
        newAlias: newAlias[0]?.public_case_id,
      });
    }
  });

  console.log(JSON.stringify({ verifiedChanges }, null, 2));
  console.log(`Applied ${matches.length} reviewed FSCA amount override(s). The source eu_fines rows were retained unchanged.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => sql.end());
