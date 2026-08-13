BEGIN;

CREATE TABLE IF NOT EXISTS public.email_digest_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient text NOT NULL,
  audience text NOT NULL CHECK (audience IN ('internal', 'customer')),
  cadence text NOT NULL CHECK (cadence IN ('daily', 'weekly', 'monthly', 'combined')),
  category text NOT NULL,
  fingerprint text NOT NULL,
  subject text NOT NULL,
  text_body text NOT NULL,
  html_body text,
  attachment_name text,
  attachment_content_type text,
  attachment_base64 text,
  eligible_local_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'suppressed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recipient, cadence, category, fingerprint, eligible_local_date)
);

ALTER TABLE public.email_digest_outbox
  ADD COLUMN IF NOT EXISTS attachment_name text,
  ADD COLUMN IF NOT EXISTS attachment_content_type text,
  ADD COLUMN IF NOT EXISTS attachment_base64 text;

ALTER TABLE public.ops_alert_state DROP CONSTRAINT IF EXISTS ops_alert_state_last_delivery_status_check;
ALTER TABLE public.ops_alert_state ADD CONSTRAINT ops_alert_state_last_delivery_status_check
  CHECK (last_delivery_status IN ('none', 'queued', 'sent', 'failed', 'skipped'));

ALTER TABLE public.monitor_profiles DROP CONSTRAINT IF EXISTS monitor_profiles_last_delivery_status_check;
ALTER TABLE public.monitor_profiles ADD CONSTRAINT monitor_profiles_last_delivery_status_check
  CHECK (last_delivery_status IN ('none','verification_sent','verification_failed','verified','baseline_set','notification_queued','notification_sent','notification_failed','smoke_sent','smoke_failed'));
ALTER TABLE public.monitor_delivery_log DROP CONSTRAINT IF EXISTS monitor_delivery_log_delivery_status_check;
ALTER TABLE public.monitor_delivery_log ADD CONSTRAINT monitor_delivery_log_delivery_status_check
  CHECK (delivery_status IN ('queued','sent','failed','skipped'));

CREATE INDEX IF NOT EXISTS email_digest_outbox_due_idx
  ON public.email_digest_outbox (status, cadence, eligible_local_date, recipient);

CREATE TABLE IF NOT EXISTS public.email_digest_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient text NOT NULL,
  cadence text NOT NULL CHECK (cadence IN ('daily', 'weekly', 'monthly', 'combined')),
  local_date date NOT NULL,
  message_id text,
  item_count integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recipient, local_date)
);

ALTER TABLE public.email_digest_deliveries DROP CONSTRAINT IF EXISTS email_digest_deliveries_cadence_check;
ALTER TABLE public.email_digest_deliveries ADD CONSTRAINT email_digest_deliveries_cadence_check
  CHECK (cadence IN ('daily', 'weekly', 'monthly', 'combined'));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fca_app') THEN
    GRANT SELECT, INSERT, UPDATE ON public.email_digest_outbox TO fca_app;
    GRANT SELECT, INSERT ON public.email_digest_deliveries TO fca_app;
  END IF;
END
$$;

COMMIT;
