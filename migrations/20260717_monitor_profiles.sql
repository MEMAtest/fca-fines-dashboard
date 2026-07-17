BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.monitor_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  label text NOT NULL,
  scope jsonb NOT NULL,
  scope_hash text NOT NULL,
  frequency text NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'paused', 'unsubscribed')),
  verification_token uuid NOT NULL DEFAULT gen_random_uuid(),
  verification_expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  management_token uuid NOT NULL DEFAULT gen_random_uuid(),
  last_run_at timestamptz,
  last_result_count integer NOT NULL DEFAULT 0,
  new_item_count integer NOT NULL DEFAULT 0,
  last_notified_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email, scope_hash)
);

ALTER TABLE public.monitor_profiles ADD COLUMN IF NOT EXISTS last_notified_at timestamptz;
ALTER TABLE public.monitor_profiles ADD COLUMN IF NOT EXISTS last_error text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_monitor_profiles_verification_token
  ON public.monitor_profiles(verification_token);
CREATE UNIQUE INDEX IF NOT EXISTS idx_monitor_profiles_management_token
  ON public.monitor_profiles(management_token);
CREATE INDEX IF NOT EXISTS idx_monitor_profiles_due
  ON public.monitor_profiles(status, frequency, last_run_at);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fca_app') THEN
    GRANT SELECT, INSERT, UPDATE ON public.monitor_profiles TO fca_app;
  END IF;
END
$$;

COMMIT;
