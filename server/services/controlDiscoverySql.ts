import { CONTROL_TAXONOMY_VERSION } from "../../src/data/controlTaxonomy.js";
import { CONTROL_DISCOVERY_REGULATOR_CODES } from "../../src/data/controlDiscoveryScope.js";
import { currentApprovedControlEvidenceIdentityPredicate } from "./controlEvidenceSql.js";
import { buildControlCaseIdContinuityValuesSql } from "./controlCaseIdContinuity.js";

export interface ControlCandidateSqlOptions {
  /** PostgreSQL bind parameter numbers, one-based. */
  controlCodesParameter?: number;
  taxonomyVersionParameter?: number;
  regulatorCodesParameter?: number;
  alias?: "c" | "f" | "case_row";
}

/**
 * Bounded current-case candidate source shared by control search, hubs and
 * article sampling. Candidate public IDs are read from indexed evidence first;
 * those public IDs are resolved to canonical source row IDs through the
 * registry/alias indexes before the trusted view is joined. Exact fingerprints
 * and current official-source identity are validated afterward.
 */
export function buildControlCandidateCaseSourceSql(options: ControlCandidateSqlOptions = {}): string {
  const codes = options.controlCodesParameter ?? 1;
  const taxonomy = options.taxonomyVersionParameter ?? 2;
  const regulators = options.regulatorCodesParameter ?? 3;
  const alias = options.alias ?? "c";
  if (![codes, taxonomy, regulators].every((value) => Number.isInteger(value) && value > 0)) {
    throw new Error("Control discovery SQL parameters must be positive PostgreSQL bind indexes");
  }

  return `(
    WITH control_case_continuity(
      public_case_id, old_source_row_id, target_source_row_id,
      firm_individual, date_issued, amount_original, currency, source_url, notice_url
    ) AS (
      VALUES ${buildControlCaseIdContinuityValuesSql()}
    ),
    candidate_public_ids AS MATERIALIZED (
      SELECT summary_candidate.public_case_id
      FROM public.enforcement_control_summary_matches summary_candidate
      WHERE summary_candidate.control_code = ANY($${codes}::text[])
        AND summary_candidate.taxonomy_version = $${taxonomy}
        AND jsonb_typeof(summary_candidate.matched_passages) = 'array'
        AND jsonb_array_length(summary_candidate.matched_passages) > 0
      UNION
      SELECT passage_candidate.public_case_id
      FROM public.enforcement_control_evidence passage_candidate
      WHERE passage_candidate.control_code = ANY($${codes}::text[])
        AND passage_candidate.taxonomy_version = $${taxonomy}
        AND passage_candidate.review_status = 'approved'
        AND NULLIF(passage_candidate.source_url, '') IS NOT NULL
        AND NULLIF(passage_candidate.content_hash, '') IS NOT NULL
        AND NULLIF(trim(passage_candidate.passage), '') IS NOT NULL
    ),
    candidate_source_rows AS MATERIALIZED (
      -- Resolve each public ID to possible canonical source rows before
      -- touching the wide trusted view. A predicate on the view's computed
      -- public_case_id cannot be pushed through its joins/COALESCE expression
      -- and caused a full canonical-view scan for a handful of candidates.
      SELECT canonical_id.id::text AS source_row_id
      FROM candidate_public_ids candidate_id
      INNER JOIN public.all_regulatory_fines_canonical canonical_id
        ON canonical_id.canonical_case_id = candidate_id.public_case_id
      UNION
      SELECT registry_source.source_row_id
      FROM candidate_public_ids candidate_id
      INNER JOIN public.regulatory_case_registry registry_source
        ON registry_source.public_case_id::text = candidate_id.public_case_id
      UNION
      SELECT registry_legacy.source_row_id
      FROM candidate_public_ids candidate_id
      INNER JOIN public.regulatory_case_registry registry_legacy
        ON registry_legacy.legacy_public_case_id = candidate_id.public_case_id
      WHERE registry_legacy.legacy_public_case_id IS NOT NULL
      UNION
      SELECT canonical_alias.id::text AS source_row_id
      FROM candidate_public_ids candidate_id
      INNER JOIN public.regulatory_case_aliases fingerprint_alias
        ON fingerprint_alias.public_case_id::text = candidate_id.public_case_id
      INNER JOIN public.all_regulatory_fines_canonical canonical_alias
        ON canonical_alias.canonical_case_id = fingerprint_alias.fingerprint
      UNION
      SELECT verified_continuity.id::text AS source_row_id
      FROM candidate_public_ids candidate_id
      INNER JOIN control_case_continuity continuity
        ON continuity.public_case_id = candidate_id.public_case_id
      INNER JOIN public.all_regulatory_fines_canonical verified_continuity
        ON verified_continuity.id::text = continuity.target_source_row_id
       AND UPPER(verified_continuity.regulator) = 'FMANZ'
       AND verified_continuity.firm_individual = continuity.firm_individual
       AND verified_continuity.date_issued = continuity.date_issued
       AND verified_continuity.amount_original IS NOT DISTINCT FROM continuity.amount_original
       AND UPPER(verified_continuity.currency) = UPPER(continuity.currency)
       AND verified_continuity.source_url = continuity.source_url
       AND verified_continuity.notice_url = continuity.notice_url
    ),
    canonical_candidates AS MATERIALIZED (
      SELECT DISTINCT ON (candidate_case.public_case_id) candidate_case.*
      FROM public.all_regulatory_fines_trusted candidate_case
      INNER JOIN candidate_source_rows candidate_source
        ON candidate_source.source_row_id = candidate_case.id::text
      WHERE UPPER(candidate_case.regulator) = ANY($${regulators}::text[])
      ORDER BY candidate_case.public_case_id,
               candidate_case.created_at DESC NULLS LAST,
               candidate_case.id::text DESC
    )
    SELECT canonical_case.*
    FROM canonical_candidates canonical_case
    WHERE EXISTS (
      SELECT 1 FROM public.enforcement_control_summary_index_state_versions index_state
      WHERE index_state.scope_key = 'public'
        AND index_state.taxonomy_version = $${taxonomy}
        AND index_state.complete = TRUE
    )
    AND (
      EXISTS (
        SELECT 1
        FROM public.enforcement_control_summary_matches summary_match
        WHERE summary_match.public_case_id = canonical_case.public_case_id
          AND summary_match.control_code = ANY($${codes}::text[])
          AND summary_match.taxonomy_version = $${taxonomy}
          AND jsonb_typeof(summary_match.matched_passages) = 'array'
          AND jsonb_array_length(summary_match.matched_passages) > 0
          AND summary_match.source_field_fingerprints = jsonb_build_object(
            'firm_individual', canonical_case.firm_individual,
            'summary', canonical_case.summary,
            'breach_type', canonical_case.breach_type,
            'breach_categories', canonical_case.breach_categories
          )
      ) OR EXISTS (
        SELECT 1
        FROM public.enforcement_control_evidence approved_evidence
        WHERE ${currentApprovedControlEvidenceIdentityPredicate("canonical_case", "approved_evidence")}
          AND approved_evidence.control_code = ANY($${codes}::text[])
          AND approved_evidence.taxonomy_version = $${taxonomy}
          AND approved_evidence.review_status = 'approved'
      )
    )
  ) AS ${alias}`;
}

export function controlDiscoveryBindValues(controlCodes: readonly string[]) {
  return [
    [...new Set(controlCodes)],
    CONTROL_TAXONOMY_VERSION,
    CONTROL_DISCOVERY_REGULATOR_CODES,
  ] as const;
}
