BEGIN;

CREATE TABLE IF NOT EXISTS public.scraper_runs (
  id bigserial PRIMARY KEY,
  regulator text NOT NULL,
  region text NOT NULL,
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  records_prepared integer DEFAULT 0,
  records_inserted integer DEFAULT 0,
  records_updated integer DEFAULT 0,
  errors integer DEFAULT 0,
  error_message text,
  duration_ms integer,
  source text DEFAULT 'github-actions',
  run_url text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.scraper_runs
  ADD COLUMN IF NOT EXISTS contract_version text,
  ADD COLUMN IF NOT EXISTS source_class text,
  ADD COLUMN IF NOT EXISTS feed_cadence text,
  ADD COLUMN IF NOT EXISTS allow_zero_records boolean,
  ADD COLUMN IF NOT EXISTS minimum_prepared_records integer,
  ADD COLUMN IF NOT EXISTS maximum_count_drop_fraction numeric,
  ADD COLUMN IF NOT EXISTS stale_after_days integer,
  ADD COLUMN IF NOT EXISTS quality_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS quarantine_reason text;

ALTER TABLE public.scraper_runs
  DROP CONSTRAINT IF EXISTS scraper_runs_quality_status_check;
ALTER TABLE public.scraper_runs
  ADD CONSTRAINT scraper_runs_quality_status_check
  CHECK (quality_status IN ('unknown', 'passed', 'quarantined'));

CREATE INDEX IF NOT EXISTS idx_scraper_runs_regulator ON public.scraper_runs(regulator);
CREATE INDEX IF NOT EXISTS idx_scraper_runs_started ON public.scraper_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_scraper_runs_status ON public.scraper_runs(status);
CREATE INDEX IF NOT EXISTS idx_scraper_runs_regulator_started ON public.scraper_runs(regulator, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_scraper_runs_quarantine
  ON public.scraper_runs(quality_status, started_at DESC)
  WHERE quality_status = 'quarantined';

CREATE OR REPLACE VIEW public.scraper_contract_health AS
WITH latest AS (
  SELECT runs.*,
    row_number() OVER (PARTITION BY regulator ORDER BY started_at DESC) AS row_number
  FROM public.scraper_runs AS runs
)
SELECT
  regulator,
  region,
  started_at AS last_run_at,
  status AS last_status,
  quality_status,
  contract_version,
  source_class,
  feed_cadence,
  stale_after_days,
  records_prepared,
  error_message,
  quarantine_reason,
  CASE
    WHEN quality_status = 'quarantined' OR status = 'error' THEN 'critical'
    WHEN started_at < now() - make_interval(days => COALESCE(stale_after_days, 180)) THEN 'stale'
    WHEN contract_version IS NULL THEN 'uncontracted'
    ELSE 'healthy'
  END AS operational_status
FROM latest
WHERE row_number = 1;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fca_app') THEN
    GRANT SELECT, INSERT, UPDATE ON public.scraper_runs TO fca_app;
    GRANT USAGE, SELECT ON SEQUENCE public.scraper_runs_id_seq TO fca_app;
    GRANT SELECT ON public.scraper_contract_health TO fca_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'monitor_readonly') THEN
    GRANT SELECT ON public.scraper_runs, public.scraper_contract_health TO monitor_readonly;
  END IF;
END
$$;

COMMIT;
