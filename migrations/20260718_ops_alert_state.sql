BEGIN;

CREATE TABLE IF NOT EXISTS public.ops_alert_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  last_status text NOT NULL DEFAULT 'healthy' CHECK (last_status IN ('healthy', 'warning', 'critical')),
  last_fingerprint text,
  last_alerted_at timestamptz,
  last_checked_at timestamptz,
  last_recovered_at timestamptz,
  last_delivery_status text NOT NULL DEFAULT 'none' CHECK (last_delivery_status IN ('none', 'sent', 'failed', 'skipped')),
  last_message_id text,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.ops_alert_state (singleton) VALUES (true)
ON CONFLICT (singleton) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fca_app') THEN
    GRANT SELECT, INSERT, UPDATE ON public.ops_alert_state TO fca_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'monitor_readonly') THEN
    GRANT SELECT ON public.ops_alert_state TO monitor_readonly;
  END IF;
END
$$;

COMMIT;
