-- Preserve immutable public case IDs when stronger canonical deduplication
-- selects a different raw source row for an already-registered fingerprint.

BEGIN;

INSERT INTO public.regulatory_case_registry (source_row_id, current_fingerprint)
SELECT canonical.id::text, canonical.canonical_case_id
FROM public.all_regulatory_fines_canonical AS canonical
LEFT JOIN public.regulatory_case_registry AS source_registry
  ON source_registry.source_row_id = canonical.id::text
LEFT JOIN public.regulatory_case_registry AS fingerprint_registry
  ON fingerprint_registry.current_fingerprint = canonical.canonical_case_id
WHERE source_registry.public_case_id IS NULL
  AND fingerprint_registry.public_case_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.regulatory_case_aliases (fingerprint, public_case_id)
SELECT registry.current_fingerprint, registry.public_case_id
FROM public.regulatory_case_registry AS registry
ON CONFLICT (fingerprint) DO NOTHING;

CREATE OR REPLACE VIEW public.all_regulatory_fines_trusted AS
SELECT
  canonical.*,
  COALESCE(
    source_registry.public_case_id::text,
    fingerprint_alias.public_case_id::text,
    canonical.canonical_case_id
  ) AS public_case_id,
  CASE WHEN canonical.requires_amount_review THEN NULL ELSE canonical.amount_gbp END AS trusted_amount_gbp,
  CASE WHEN canonical.requires_amount_review THEN NULL ELSE canonical.amount_eur END AS trusted_amount_eur,
  CASE
    WHEN assessment.source_status IS NOT NULL THEN assessment.source_status
    WHEN NULLIF(canonical.notice_url, '') IS NOT NULL THEN 'official_unverified'
    WHEN NULLIF(canonical.source_url, '') IS NOT NULL THEN 'listing_only'
    ELSE 'missing'
  END AS source_link_status,
  assessment.checked_at AS source_checked_at,
  assessment.http_status AS source_http_status,
  assessment.official_domain_match AS source_official_domain_match,
  assessment.content_hash AS source_content_hash,
  assessment.resolved_url AS source_resolved_url,
  assessment.last_verified_at AS source_last_verified_at,
  assessment.next_check_at AS source_next_check_at,
  assessment.consecutive_failures AS source_consecutive_failures,
  assessment.review_status AS source_review_status,
  assessment.review_reason AS source_review_reason,
  assessment.last_successful_content_hash AS source_last_successful_content_hash
FROM public.all_regulatory_fines_canonical AS canonical
LEFT JOIN public.regulatory_case_registry AS source_registry
  ON source_registry.source_row_id = canonical.id::text
LEFT JOIN public.regulatory_case_aliases AS fingerprint_alias
  ON fingerprint_alias.fingerprint = canonical.canonical_case_id
LEFT JOIN public.regulatory_source_assessments AS assessment
  ON assessment.regulator = upper(canonical.regulator)
 AND assessment.evidence_url = public.normalise_regulatory_evidence_url(
   COALESCE(NULLIF(canonical.notice_url, ''), NULLIF(canonical.source_url, ''), '')
 );

COMMIT;
