BEGIN;

CREATE TABLE IF NOT EXISTS public.coverage_discovery_quarantine (
  id bigserial PRIMARY KEY,
  regulator text NOT NULL,
  scraper_run_id bigint REFERENCES public.scraper_runs(id),
  source_url text,
  fingerprint text,
  reason_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'reviewed', 'released', 'ignored')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  review_note text
);

CREATE INDEX IF NOT EXISTS idx_coverage_discovery_quarantine_pending
  ON public.coverage_discovery_quarantine (created_at DESC)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_coverage_discovery_quarantine_regulator
  ON public.coverage_discovery_quarantine (regulator, created_at DESC);

ALTER TABLE public.scraper_runs
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS latest_prepared_date date,
  ADD COLUMN IF NOT EXISTS records_quarantined integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reconciliation jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.coverage_discovery_candidates
  ADD COLUMN IF NOT EXISTS validation_version text,
  ADD COLUMN IF NOT EXISTS source_role text;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fca_app') THEN
    GRANT SELECT, INSERT ON public.coverage_discovery_quarantine TO fca_app;
    GRANT USAGE, SELECT ON SEQUENCE public.coverage_discovery_quarantine_id_seq TO fca_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'monitor_readonly') THEN
    GRANT SELECT ON public.coverage_discovery_quarantine TO monitor_readonly;
  END IF;
END
$$;

COMMIT;
