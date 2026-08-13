BEGIN;

CREATE TABLE IF NOT EXISTS public.coverage_discovery_candidates (
  fingerprint text PRIMARY KEY,
  regulator text NOT NULL,
  source_url text NOT NULL,
  source_content_hash text NOT NULL,
  entity text NOT NULL,
  issued_date date NOT NULL,
  amount numeric,
  currency text,
  summary text NOT NULL,
  scraper_run_id bigint REFERENCES public.scraper_runs(id),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coverage_discovery_candidates_status_check
    CHECK (status IN ('pending', 'matched', 'imported', 'ignored'))
);

CREATE INDEX IF NOT EXISTS idx_coverage_discovery_pending_first_seen
  ON public.coverage_discovery_candidates (first_seen_at DESC)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_coverage_discovery_regulator_source
  ON public.coverage_discovery_candidates (regulator, source_url);
CREATE INDEX IF NOT EXISTS idx_coverage_discovery_scraper_run
  ON public.coverage_discovery_candidates (scraper_run_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fca_app') THEN
    GRANT SELECT, INSERT, UPDATE ON public.coverage_discovery_candidates TO fca_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'monitor_readonly') THEN
    GRANT SELECT ON public.coverage_discovery_candidates TO monitor_readonly;
  END IF;
END
$$;

COMMIT;
