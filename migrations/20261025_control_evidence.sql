BEGIN;

CREATE TABLE IF NOT EXISTS public.enforcement_control_evidence (
  public_case_id text NOT NULL,
  control_code text NOT NULL,
  taxonomy_version text NOT NULL,
  source_url text NOT NULL,
  content_hash text NOT NULL,
  passage text NOT NULL,
  locator text NOT NULL,
  respondent text NOT NULL,
  attribution_method text NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  review_status text NOT NULL DEFAULT 'candidate',
  CONSTRAINT enforcement_control_evidence_passage_length
    CHECK (char_length(passage) BETWEEN 1 AND 2000),
  CONSTRAINT enforcement_control_evidence_review_status
    CHECK (review_status IN ('candidate', 'approved', 'rejected')),
  CONSTRAINT enforcement_control_evidence_stable_unique
    UNIQUE (public_case_id, control_code, source_url, content_hash, locator)
);

CREATE INDEX IF NOT EXISTS enforcement_control_evidence_approved_lookup_idx
  ON public.enforcement_control_evidence (public_case_id, control_code)
  WHERE review_status = 'approved';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fca_app') THEN
    GRANT SELECT, INSERT ON public.enforcement_control_evidence TO fca_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'monitor_readonly') THEN
    GRANT SELECT ON public.enforcement_control_evidence TO monitor_readonly;
  END IF;
END
$$;

COMMIT;
