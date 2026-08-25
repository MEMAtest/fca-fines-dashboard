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

CREATE TABLE IF NOT EXISTS public.afm_malformed_row_backup (
  remediation_id uuid NOT NULL,
  backed_up_at timestamptz NOT NULL DEFAULT now(),
  row_data jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_afm_malformed_row_backup_id
  ON public.afm_malformed_row_backup (remediation_id, backed_up_at DESC);

ALTER TABLE public.scraper_runs
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS running_timeout_minutes integer,
  ADD COLUMN IF NOT EXISTS latest_prepared_date date,
  ADD COLUMN IF NOT EXISTS records_quarantined integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reconciliation jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.coverage_discovery_candidates
  ADD COLUMN IF NOT EXISTS validation_version text,
  ADD COLUMN IF NOT EXISTS source_role text;

-- Existing legacy AFM rows may contain numeric NaN. Add the safety checks as
-- NOT VALID so the migration is non-blocking; run the validation script only
-- after the reversible AFM remediation has completed.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eu_fines_amount_not_nan') THEN
    ALTER TABLE public.eu_fines ADD CONSTRAINT eu_fines_amount_not_nan
      CHECK (amount IS NULL OR amount::text <> 'NaN') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eu_fines_amount_eur_not_nan') THEN
    ALTER TABLE public.eu_fines ADD CONSTRAINT eu_fines_amount_eur_not_nan
      CHECK (amount_eur IS NULL OR amount_eur::text <> 'NaN') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eu_fines_amount_gbp_not_nan') THEN
    ALTER TABLE public.eu_fines ADD CONSTRAINT eu_fines_amount_gbp_not_nan
      CHECK (amount_gbp IS NULL OR amount_gbp::text <> 'NaN') NOT VALID;
  END IF;
END
$$;

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
