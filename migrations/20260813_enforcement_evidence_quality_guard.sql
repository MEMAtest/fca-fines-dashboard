-- Evidence-quality guard for enforcement records.
--
-- A regulator publication can name several respondents while disclosing one
-- aggregate sanction. That total must never be copied to each participant and
-- included in public aggregates. This migration also collapses repeat imports
-- where the same regulator, entity, date, amount and source recur. Differing
-- generated summaries do not turn one official action into two cases.

BEGIN;

CREATE TABLE IF NOT EXISTS public.regulatory_case_amount_reviews (
  source_row_id text PRIMARY KEY,
  review_status text NOT NULL CHECK (review_status IN ('required', 'approved')),
  reason text NOT NULL,
  evidence_url text NOT NULL,
  reviewed_by text,
  reviewed_at timestamptz,
  detected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_regulatory_case_amount_reviews_status
  ON public.regulatory_case_amount_reviews(review_status, detected_at DESC);

-- These official ASIC publications state one publication-level total for
-- multiple companies. Quarantine those copied totals without inventing or
-- dividing participant allocations.
INSERT INTO public.regulatory_case_amount_reviews (
  source_row_id, review_status, reason, evidence_url, detected_at, updated_at
)
SELECT
  fines.id::text,
  'required',
  CASE
    WHEN public.normalise_regulatory_evidence_url(COALESCE(NULLIF(fines.notice_url, ''), NULLIF(fines.source_url, ''), ''))
      LIKE '%25-298mr-asic-issues-over-2-2-million-in-infringement-notices-to-12-large-proprietary-companies%'
      THEN 'The official ASIC publication reports an aggregate AUD 2.2 million across 12 companies; no participant allocation is evidenced.'
    ELSE 'The official ASIC publication reports an aggregate AUD 594,000 across multiple Mecca companies; no participant allocation is evidenced.'
  END,
  public.normalise_regulatory_evidence_url(COALESCE(NULLIF(fines.notice_url, ''), NULLIF(fines.source_url, ''), '')),
  now(),
  now()
FROM public.all_regulatory_fines AS fines
WHERE upper(fines.regulator) = 'ASIC'
  AND (
    public.normalise_regulatory_evidence_url(COALESCE(NULLIF(fines.notice_url, ''), NULLIF(fines.source_url, ''), ''))
      LIKE '%25-298mr-asic-issues-over-2-2-million-in-infringement-notices-to-12-large-proprietary-companies%'
    OR public.normalise_regulatory_evidence_url(COALESCE(NULLIF(fines.notice_url, ''), NULLIF(fines.source_url, ''), ''))
      LIKE '%26-057mr-mecca-companies-pay-594-000-in-infringement-notices%'
  )
ON CONFLICT (source_row_id) DO UPDATE SET
  reason = EXCLUDED.reason,
  evidence_url = EXCLUDED.evidence_url,
  updated_at = now()
WHERE regulatory_case_amount_reviews.review_status = 'required';

-- The trusted view is recreated after the canonical materialised view below.
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
    override.quality_status AS override_quality_status
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
      regexp_replace(lower(trim(COALESCE(corrected.breach_type, ''))), '[[:space:]]+', ' ', 'g')
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
        upper(COALESCE(corrected.currency, ''))
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
  COALESCE(registry.public_case_id::text, canonical.canonical_case_id) AS public_case_id,
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
LEFT JOIN public.regulatory_case_registry AS registry
  ON registry.source_row_id = canonical.id::text
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
