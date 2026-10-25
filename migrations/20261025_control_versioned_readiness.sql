BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Keep the legacy singleton intact for rollback/read compatibility. A separate
-- row per taxonomy version lets v4 remain ready while v5 is being classified.
CREATE TABLE IF NOT EXISTS public.enforcement_control_summary_index_state_versions (
  scope_key text NOT NULL DEFAULT 'public' CHECK (scope_key = 'public'),
  taxonomy_version text NOT NULL,
  scan_as_of timestamptz NOT NULL,
  public_case_count bigint NOT NULL CHECK (public_case_count >= 0),
  public_max_case_id text,
  classified_through_public_id text,
  complete boolean NOT NULL DEFAULT false,
  indexed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope_key, taxonomy_version)
);

-- Copy the existing exact readiness claim once so the current taxonomy remains
-- usable by APIs that switch to version-scoped readiness after this migration.
-- The legacy row remains unchanged for rollback.
INSERT INTO public.enforcement_control_summary_index_state_versions (
  scope_key, taxonomy_version, scan_as_of, public_case_count,
  public_max_case_id, classified_through_public_id, complete, indexed_at
)
SELECT scope_key, taxonomy_version, scan_as_of, public_case_count,
       public_max_case_id, classified_through_public_id, complete, indexed_at
  FROM public.enforcement_control_summary_index_state
 WHERE true
ON CONFLICT (scope_key, taxonomy_version) DO NOTHING;

-- Permit independently reviewed evidence for the same source passage under
-- multiple taxonomy versions. Existing v4 rows stay unchanged; no v5 rows are
-- approved or copied by this schema migration.
-- Deploy the taxonomy-versioned review operator first: older apply jobs using
-- the unversioned conflict target will fail closed after this constraint swap.
ALTER TABLE public.enforcement_control_evidence
  DROP CONSTRAINT IF EXISTS enforcement_control_evidence_stable_unique;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'enforcement_control_evidence_versioned_unique'
       AND conrelid = 'public.enforcement_control_evidence'::regclass
  ) THEN
    ALTER TABLE public.enforcement_control_evidence
      ADD CONSTRAINT enforcement_control_evidence_versioned_unique
      UNIQUE (public_case_id, control_code, taxonomy_version, source_url, content_hash, locator);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS enforcement_control_evidence_versioned_approved_lookup_idx
  ON public.enforcement_control_evidence (public_case_id, control_code, taxonomy_version)
  WHERE review_status = 'approved';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fca_app') THEN
    GRANT SELECT, INSERT, UPDATE ON public.enforcement_control_summary_index_state_versions TO fca_app;
    GRANT UPDATE (passage, respondent, attribution_method, fetched_at, review_status)
      ON public.enforcement_control_evidence TO fca_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'monitor_readonly') THEN
    GRANT SELECT ON public.enforcement_control_summary_index_state_versions TO monitor_readonly;
  END IF;
END
$$;

COMMIT;
