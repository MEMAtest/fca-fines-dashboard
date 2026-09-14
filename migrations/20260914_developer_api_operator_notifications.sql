CREATE TABLE IF NOT EXISTS developer_api_operator_notifications (
  id BIGSERIAL PRIMARY KEY,
  notification_kind TEXT NOT NULL
    CHECK (notification_kind IN (
      'first_use', 'rate_limited', 'suspended_client', 'expired_key',
      'invalid_key_spike', 'weekly_digest'
    )),
  dedupe_key TEXT NOT NULL,
  api_key_id BIGINT REFERENCES developer_api_keys(id) ON DELETE SET NULL,
  client_id BIGINT REFERENCES developer_api_clients(id) ON DELETE SET NULL,
  delivery_status TEXT NOT NULL DEFAULT 'processing'
    CHECK (delivery_status IN ('processing', 'sent', 'failed')),
  subject TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  provider_message_id TEXT,
  error_message TEXT,
  UNIQUE (notification_kind, dedupe_key)
);

CREATE INDEX IF NOT EXISTS developer_api_operator_notifications_time_idx
  ON developer_api_operator_notifications (attempted_at DESC);

CREATE INDEX IF NOT EXISTS developer_api_operator_notifications_status_idx
  ON developer_api_operator_notifications (delivery_status, attempted_at DESC);
