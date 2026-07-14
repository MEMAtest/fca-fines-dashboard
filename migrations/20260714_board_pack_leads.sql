CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS board_pack_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key uuid NOT NULL UNIQUE,
  name text NOT NULL,
  work_email text NOT NULL,
  organisation text NOT NULL,
  consent_given boolean NOT NULL DEFAULT false,
  consent_at timestamptz NOT NULL,
  marketing_consent boolean NOT NULL DEFAULT false,
  profile jsonb NOT NULL,
  generated_at timestamptz NOT NULL,
  ip_address text,
  user_agent text,
  notification_status text NOT NULL DEFAULT 'pending'
    CHECK (notification_status IN ('pending', 'sent')),
  notification_attempts integer NOT NULL DEFAULT 0,
  notification_error text,
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS board_pack_leads_email_created_idx
  ON board_pack_leads (lower(work_email), created_at DESC);

CREATE INDEX IF NOT EXISTS board_pack_leads_notification_idx
  ON board_pack_leads (notification_status, created_at);
