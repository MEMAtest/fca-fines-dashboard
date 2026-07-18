BEGIN;

ALTER TABLE public.regulatory_source_assessments
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS consecutive_failures integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_failure_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_successful_content_hash text,
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'clear',
  ADD COLUMN IF NOT EXISTS review_reason text;

ALTER TABLE public.regulatory_source_assessments
  DROP CONSTRAINT IF EXISTS regulatory_source_assessments_review_status_check;

ALTER TABLE public.regulatory_source_assessments
  ADD CONSTRAINT regulatory_source_assessments_review_status_check
  CHECK (review_status IN ('clear', 'needs_review', 'dismissed'));

UPDATE public.regulatory_source_assessments
SET
  last_verified_at = CASE
    WHEN source_status IN ('verified_detail', 'verified_publication')
      THEN COALESCE(last_verified_at, checked_at)
    ELSE last_verified_at
  END,
  last_successful_content_hash = CASE
    WHEN source_status IN ('verified_detail', 'verified_publication')
      THEN COALESCE(last_successful_content_hash, content_hash)
    ELSE last_successful_content_hash
  END,
  next_check_at = COALESCE(
    next_check_at,
    checked_at + CASE
      WHEN source_status IN ('verified_detail', 'verified_publication') THEN interval '30 days'
      WHEN source_status = 'official_unverified' THEN interval '1 day'
      ELSE interval '90 days'
    END
  ),
  review_status = CASE
    WHEN source_status IN ('listing_only', 'missing') THEN 'needs_review'
    WHEN source_status = 'official_unverified' AND checked_at < now() - interval '3 days' THEN 'needs_review'
    ELSE review_status
  END,
  review_reason = CASE
    WHEN source_status = 'listing_only' THEN COALESCE(review_reason, 'Only a regulator listing page is available')
    WHEN source_status = 'missing' THEN COALESCE(review_reason, 'No usable official evidence URL is available')
    ELSE review_reason
  END;

CREATE TABLE IF NOT EXISTS public.regulatory_source_assessment_history (
  id bigserial PRIMARY KEY,
  regulator text NOT NULL,
  evidence_url text NOT NULL,
  checked_at timestamptz NOT NULL,
  source_status text NOT NULL CHECK (source_status IN (
    'verified_detail',
    'verified_publication',
    'official_unverified',
    'listing_only',
    'missing'
  )),
  outcome text NOT NULL CHECK (outcome IN (
    'success',
    'transient_failure',
    'permanent_failure',
    'not_checkable'
  )),
  resolved_url text,
  http_status integer,
  official_domain_match boolean NOT NULL,
  content_hash text,
  content_changed boolean NOT NULL DEFAULT false,
  checker_version text NOT NULL,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_source_assessment_history_evidence
  ON public.regulatory_source_assessment_history(regulator, evidence_url, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_assessment_history_outcome
  ON public.regulatory_source_assessment_history(outcome, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_assessments_due
  ON public.regulatory_source_assessments(next_check_at, regulator);
CREATE INDEX IF NOT EXISTS idx_source_assessments_review
  ON public.regulatory_source_assessments(review_status, checked_at DESC);

CREATE OR REPLACE VIEW public.regulatory_source_review_queue AS
SELECT
  regulator,
  evidence_url,
  source_status,
  resolved_url,
  checked_at,
  last_verified_at,
  next_check_at,
  consecutive_failures,
  first_failure_at,
  review_reason,
  http_status,
  error_message
FROM public.regulatory_source_assessments
WHERE review_status = 'needs_review'
ORDER BY consecutive_failures DESC, checked_at ASC;

CREATE OR REPLACE VIEW public.all_regulatory_fines_trusted AS
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
  assessment.last_verified_at AS source_last_verified_at,
  assessment.next_check_at AS source_next_check_at,
  assessment.consecutive_failures AS source_consecutive_failures,
  assessment.review_status AS source_review_status,
  assessment.review_reason AS source_review_reason,
  assessment.http_status AS source_http_status,
  assessment.official_domain_match AS source_official_domain_match,
  assessment.content_hash AS source_content_hash,
  assessment.last_successful_content_hash AS source_last_successful_content_hash,
  assessment.resolved_url AS source_resolved_url
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
    GRANT SELECT, INSERT ON public.regulatory_source_assessment_history TO fca_app;
    GRANT USAGE, SELECT ON SEQUENCE public.regulatory_source_assessment_history_id_seq TO fca_app;
    GRANT SELECT ON public.regulatory_source_review_queue TO fca_app;
    GRANT SELECT ON public.all_regulatory_fines_trusted TO fca_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'monitor_readonly') THEN
    GRANT SELECT ON public.regulatory_source_assessment_history TO monitor_readonly;
    GRANT SELECT ON public.regulatory_source_review_queue TO monitor_readonly;
    GRANT SELECT ON public.all_regulatory_fines_trusted TO monitor_readonly;
  END IF;
END
$$;

COMMIT;
