BEGIN;

ALTER TABLE public.monitor_profiles
  ADD COLUMN IF NOT EXISTS verification_message_id text,
  ADD COLUMN IF NOT EXISTS verification_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS baseline_established_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_notification_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_notification_message_id text,
  ADD COLUMN IF NOT EXISTS notification_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_delivery_status text NOT NULL DEFAULT 'none';

ALTER TABLE public.monitor_profiles
  DROP CONSTRAINT IF EXISTS monitor_profiles_last_delivery_status_check;

ALTER TABLE public.monitor_profiles
  ADD CONSTRAINT monitor_profiles_last_delivery_status_check
  CHECK (last_delivery_status IN (
    'none',
    'verification_sent',
    'verification_failed',
    'verified',
    'baseline_set',
    'notification_sent',
    'notification_failed',
    'smoke_sent',
    'smoke_failed'
  ));

CREATE TABLE IF NOT EXISTS public.monitor_delivery_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monitor_id uuid NOT NULL REFERENCES public.monitor_profiles(id) ON DELETE CASCADE,
  delivery_kind text NOT NULL CHECK (delivery_kind IN ('verification', 'notification', 'smoke')),
  delivery_status text NOT NULL CHECK (delivery_status IN ('sent', 'failed', 'skipped')),
  provider text NOT NULL DEFAULT 'ses',
  message_id text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_monitor_delivery_log_monitor
  ON public.monitor_delivery_log(monitor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_monitor_delivery_log_failures
  ON public.monitor_delivery_log(delivery_status, created_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fca_app') THEN
    GRANT SELECT, INSERT ON public.monitor_delivery_log TO fca_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'monitor_readonly') THEN
    GRANT SELECT ON public.monitor_delivery_log TO monitor_readonly;
  END IF;
END
$$;

COMMIT;
