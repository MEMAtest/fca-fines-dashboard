-- BCB case identity.
--
-- The BCB register links every penalty to one dataset URL, which the duplicate
-- rule keys on. Without a case reference, separate penalties for the same
-- person, date and amount (for example a disqualification and a warning in one
-- proceeding, or two proceedings decided the same day) would collapse into one
-- row. Adds the BCB proceeding number (PAS) and penalty type to identity for BCB
-- only; every other regulator's canonical_case_id is unchanged.
-- Rebuilds the canonical materialised view (created WITH DATA) and trusted view.

BEGIN;

DROP VIEW IF EXISTS public.all_regulatory_fines_trusted;
DROP MATERIALIZED VIEW IF EXISTS public.all_regulatory_fines_canonical;

CREATE MATERIALIZED VIEW public.all_regulatory_fines_canonical AS
WITH corrected AS (
  SELECT
    fines.id,
    fines.regulator,
    fines.regulator_full_name,
    fines.country_code,
    fines.country_name,
    fines.firm_individual,
    fines.firm_category,
    CASE WHEN override.regulator IS NOT NULL THEN override.amount_original ELSE fines.amount_original END AS amount_original,
    CASE WHEN override.regulator IS NOT NULL THEN override.currency ELSE fines.currency END AS currency,
    CASE WHEN override.regulator IS NOT NULL THEN override.amount_gbp ELSE fines.amount_gbp END AS amount_gbp,
    CASE WHEN override.regulator IS NOT NULL THEN override.amount_eur ELSE fines.amount_eur END AS amount_eur,
    fines.date_issued,
    fines.year_issued,
    fines.month_issued,
    fines.breach_type,
    fines.breach_categories,
    fines.summary,
    fines.notice_url,
    fines.source_url,
    fines.created_at,
    fines.search_vector,
    public.normalise_regulatory_evidence_url(
      COALESCE(NULLIF(fines.notice_url, ''), NULLIF(fines.source_url, ''), '')
    ) AS normalised_evidence_url,
    override.regulator IS NOT NULL AS has_verified_amount_override,
    override.verification_url AS amount_verification_url,
    override.reason AS amount_override_reason,
    override.quality_status AS override_quality_status,
    -- BCB publishes every penalty under one dataset URL, so the source URL
    -- cannot tell cases apart. The administrative-proceeding number (PAS) and
    -- penalty type take part in identity instead. NULL for every other
    -- regulator, and concat_ws skips NULLs, so existing case ids are unchanged.
    CASE
      WHEN upper(fines.regulator) = 'BCB'
        THEN concat_ws('/', substring(fines.summary FROM '\(PAS\) ([0-9]+)'), lower(trim(COALESCE(fines.breach_type, ''))))
    END AS case_ref
  FROM public.all_regulatory_fines AS fines
  LEFT JOIN public.regulatory_amount_overrides AS override
    ON override.regulator = upper(fines.regulator)
   AND override.evidence_url = public.normalise_regulatory_evidence_url(
     COALESCE(NULLIF(fines.notice_url, ''), NULLIF(fines.source_url, ''), '')
   )
), identified AS (
  SELECT
    corrected.*,
    review.review_status AS amount_review_status,
    review.reason AS amount_review_reason,
    concat_ws(
      '|',
      upper(corrected.regulator),
      regexp_replace(lower(trim(COALESCE(corrected.firm_individual, ''))), '[[:space:]]+', ' ', 'g'),
      corrected.date_issued::text,
      corrected.normalised_evidence_url,
      COALESCE(corrected.amount_original::text, 'undisclosed'),
      upper(COALESCE(corrected.currency, '')),
      regexp_replace(lower(trim(COALESCE(corrected.breach_type, ''))), '[[:space:]]+', ' ', 'g'),
      corrected.case_ref
    ) AS canonical_identity,
    CASE
      WHEN corrected.normalised_evidence_url = '' THEN concat('no-source|', corrected.id::text)
      ELSE concat_ws(
        '|',
        upper(corrected.regulator),
        regexp_replace(lower(trim(COALESCE(corrected.firm_individual, ''))), '[[:space:]]+', ' ', 'g'),
        corrected.date_issued::text,
        corrected.normalised_evidence_url,
        COALESCE(corrected.amount_original::text, 'undisclosed'),
        upper(COALESCE(corrected.currency, '')),
        corrected.case_ref
      )
    END AS source_duplicate_identity
  FROM corrected
  LEFT JOIN public.regulatory_case_amount_reviews AS review
    ON review.source_row_id = corrected.id::text
), ranked AS (
  SELECT
    identified.*,
    row_number() OVER (
      PARTITION BY identified.source_duplicate_identity
      ORDER BY
        (
          (identified.amount_gbp IS NOT NULL)::int * 4
          + (NULLIF(identified.summary, '') IS NOT NULL)::int * 2
          + (NULLIF(identified.breach_type, '') IS NOT NULL)::int
          + (NULLIF(identified.notice_url, '') IS NOT NULL)::int
        ) DESC,
        identified.created_at DESC NULLS LAST,
        identified.id DESC
    ) AS canonical_rank,
    count(*) OVER (PARTITION BY identified.source_duplicate_identity)::integer AS duplicate_count
  FROM identified
)
SELECT
  id,
  regulator,
  regulator_full_name,
  country_code,
  country_name,
  firm_individual,
  firm_category,
  amount_original,
  currency,
  amount_gbp,
  amount_eur,
  date_issued,
  year_issued,
  month_issued,
  breach_type,
  breach_categories,
  summary,
  notice_url,
  source_url,
  created_at,
  search_vector,
  md5(canonical_identity) AS canonical_case_id,
  duplicate_count,
  CASE
    WHEN amount_review_status = 'required' THEN 'aggregate_unallocated'
    WHEN has_verified_amount_override THEN override_quality_status
    WHEN amount_original IS NULL THEN 'not_disclosed'
    ELSE 'reported'
  END AS amount_quality,
  (
    (amount_gbp >= 1000000000 AND NOT has_verified_amount_override)
    OR amount_review_status = 'required'
  ) AS requires_amount_review,
  CASE
    WHEN amount_review_status = 'required' THEN amount_review_reason
    WHEN amount_gbp >= 1000000000 AND NOT has_verified_amount_override
      THEN 'Large amount requires official-source verification before publication.'
    ELSE NULL
  END AS amount_review_reason,
  amount_verification_url,
  amount_override_reason
FROM ranked
WHERE canonical_rank = 1;

CREATE UNIQUE INDEX idx_all_regulatory_fines_canonical_case
  ON public.all_regulatory_fines_canonical(canonical_case_id);
CREATE UNIQUE INDEX idx_all_regulatory_fines_canonical_id
  ON public.all_regulatory_fines_canonical(id);
CREATE INDEX idx_all_regulatory_fines_canonical_regulator
  ON public.all_regulatory_fines_canonical(regulator);
CREATE INDEX idx_all_regulatory_fines_canonical_country
  ON public.all_regulatory_fines_canonical(country_code);
CREATE INDEX idx_all_regulatory_fines_canonical_date
  ON public.all_regulatory_fines_canonical(date_issued DESC);
CREATE INDEX idx_all_regulatory_fines_canonical_year
  ON public.all_regulatory_fines_canonical(year_issued);
CREATE INDEX idx_all_regulatory_fines_canonical_amount_gbp
  ON public.all_regulatory_fines_canonical(amount_gbp DESC NULLS LAST);
CREATE INDEX idx_all_regulatory_fines_canonical_amount_eur
  ON public.all_regulatory_fines_canonical(amount_eur DESC NULLS LAST);
CREATE INDEX idx_all_regulatory_fines_canonical_search_vector
  ON public.all_regulatory_fines_canonical USING GIN(search_vector);
CREATE INDEX idx_all_regulatory_fines_canonical_amount_review
  ON public.all_regulatory_fines_canonical(requires_amount_review)
  WHERE requires_amount_review;

CREATE OR REPLACE FUNCTION public.refresh_all_fines()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW public.all_regulatory_fines;
  REFRESH MATERIALIZED VIEW public.all_regulatory_fines_canonical;
END;
$$ LANGUAGE plpgsql;

CREATE VIEW public.all_regulatory_fines_trusted AS
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


DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fca_app') THEN
    GRANT SELECT ON public.regulatory_case_amount_reviews TO fca_app;
    GRANT SELECT ON public.all_regulatory_fines_canonical TO fca_app;
    GRANT SELECT ON public.all_regulatory_fines_trusted TO fca_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'monitor_readonly') THEN
    GRANT SELECT ON public.regulatory_case_amount_reviews TO monitor_readonly;
    GRANT SELECT ON public.all_regulatory_fines_canonical TO monitor_readonly;
    GRANT SELECT ON public.all_regulatory_fines_trusted TO monitor_readonly;
  END IF;
END
$$;

COMMENT ON TABLE public.regulatory_case_amount_reviews IS
  'Explicit review decisions for aggregate or otherwise unallocated enforcement amounts.';
COMMENT ON MATERIALIZED VIEW public.all_regulatory_fines_canonical IS
  'Application-facing enforcement evidence with duplicate suppression and fail-closed aggregate amount handling.';

COMMIT;
