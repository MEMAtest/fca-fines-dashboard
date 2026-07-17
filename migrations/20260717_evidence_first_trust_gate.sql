BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.regulatory_case_registry (
  public_case_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_row_id text NOT NULL UNIQUE,
  current_fingerprint text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.regulatory_case_aliases (
  fingerprint text PRIMARY KEY,
  public_case_id uuid NOT NULL REFERENCES public.regulatory_case_registry(public_case_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.regulatory_case_registry (source_row_id, current_fingerprint)
SELECT id::text, canonical_case_id
FROM public.all_regulatory_fines_canonical
ON CONFLICT (source_row_id) DO UPDATE SET
  current_fingerprint = EXCLUDED.current_fingerprint,
  updated_at = now();

INSERT INTO public.regulatory_case_aliases (fingerprint, public_case_id)
SELECT registry.current_fingerprint, registry.public_case_id
FROM public.regulatory_case_registry AS registry
ON CONFLICT (fingerprint) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.regulatory_source_assessments (
  regulator text NOT NULL,
  evidence_url text NOT NULL,
  source_status text NOT NULL CHECK (source_status IN (
    'verified_detail',
    'verified_publication',
    'official_unverified',
    'listing_only',
    'missing'
  )),
  resolved_url text,
  checked_at timestamptz NOT NULL DEFAULT now(),
  http_status integer,
  official_domain_match boolean,
  content_hash text,
  checker_version text NOT NULL DEFAULT 'source-check-v1',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (regulator, evidence_url)
);

CREATE INDEX IF NOT EXISTS idx_regulatory_source_assessments_checked
  ON public.regulatory_source_assessments(checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_regulatory_source_assessments_status
  ON public.regulatory_source_assessments(source_status);

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
  assessment.http_status AS source_http_status,
  assessment.official_domain_match AS source_official_domain_match,
  assessment.content_hash AS source_content_hash,
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
    GRANT SELECT ON public.all_regulatory_fines_trusted TO fca_app;
    GRANT SELECT, INSERT, UPDATE ON public.regulatory_source_assessments TO fca_app;
    GRANT SELECT ON public.regulatory_case_registry TO fca_app;
    GRANT SELECT ON public.regulatory_case_aliases TO fca_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'monitor_readonly') THEN
    GRANT SELECT ON public.all_regulatory_fines_trusted TO monitor_readonly;
  END IF;
END
$$;

COMMIT;
