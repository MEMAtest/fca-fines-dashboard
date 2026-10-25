BEGIN;

-- Deterministic classification of the current stored case fields. These rows
-- are not official-source evidence and carry no review/approval state.
CREATE TABLE IF NOT EXISTS public.enforcement_control_summary_matches (
  public_case_id text NOT NULL,
  control_code text NOT NULL,
  taxonomy_version text NOT NULL,
  match_terms text[] NOT NULL DEFAULT '{}',
  matched_passages jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_field_fingerprints jsonb NOT NULL,
  classification_basis text NOT NULL DEFAULT 'stored_summary'
    CHECK (classification_basis = 'stored_summary'),
  classified_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (public_case_id, control_code, taxonomy_version),
  CONSTRAINT enforcement_control_summary_matches_passages_array
    CHECK (jsonb_typeof(matched_passages) = 'array'),
  CONSTRAINT enforcement_control_summary_matches_fingerprint_object
    CHECK (jsonb_typeof(source_field_fingerprints) = 'object')
);

CREATE INDEX IF NOT EXISTS enforcement_control_summary_matches_lookup_idx
  ON public.enforcement_control_summary_matches (control_code, taxonomy_version, public_case_id);

-- Atomic readiness/coverage marker. A complete row is committed only after a
-- repeatable-read full reconciliation against the public regulator scope.
CREATE TABLE IF NOT EXISTS public.enforcement_control_summary_index_state (
  scope_key text PRIMARY KEY DEFAULT 'public' CHECK (scope_key = 'public'),
  taxonomy_version text NOT NULL,
  scan_as_of timestamptz NOT NULL,
  public_case_count bigint NOT NULL CHECK (public_case_count >= 0),
  public_max_case_id text,
  classified_through_public_id text,
  complete boolean NOT NULL DEFAULT false,
  indexed_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fca_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.enforcement_control_summary_matches TO fca_app;
    GRANT SELECT, INSERT, UPDATE ON public.enforcement_control_summary_index_state TO fca_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'monitor_readonly') THEN
    GRANT SELECT ON public.enforcement_control_summary_matches TO monitor_readonly;
    GRANT SELECT ON public.enforcement_control_summary_index_state TO monitor_readonly;
  END IF;
END
$$;

COMMIT;
