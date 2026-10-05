CREATE TABLE IF NOT EXISTS developer_api_applications (
  id BIGSERIAL PRIMARY KEY,
  organisation_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  intended_use TEXT NOT NULL,
  expected_daily_requests INTEGER,
  requested_term_months INTEGER NOT NULL DEFAULT 6,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'declined', 'withdrawn')),
  terms_accepted BOOLEAN NOT NULL DEFAULT FALSE,
  network_fingerprint CHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  review_note TEXT
);

CREATE INDEX IF NOT EXISTS developer_api_applications_status_created_idx
  ON developer_api_applications (status, created_at DESC);

CREATE TABLE IF NOT EXISTS developer_api_clients (
  id BIGSERIAL PRIMARY KEY,
  organisation_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'closed')),
  application_id BIGINT UNIQUE REFERENCES developer_api_applications(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS developer_api_keys (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES developer_api_clients(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash CHAR(64) NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked', 'expired')),
  minute_limit INTEGER NOT NULL DEFAULT 60 CHECK (minute_limit > 0),
  daily_limit INTEGER NOT NULL DEFAULT 10000 CHECK (daily_limit > 0),
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS developer_api_keys_client_status_idx
  ON developer_api_keys (client_id, status);

CREATE TABLE IF NOT EXISTS developer_api_rate_buckets (
  api_key_id BIGINT NOT NULL REFERENCES developer_api_keys(id) ON DELETE CASCADE,
  window_kind TEXT NOT NULL CHECK (window_kind IN ('minute', 'day')),
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (api_key_id, window_kind, window_start)
);

CREATE INDEX IF NOT EXISTS developer_api_rate_buckets_window_idx
  ON developer_api_rate_buckets (window_start DESC);

CREATE TABLE IF NOT EXISTS developer_api_usage_events (
  id BIGSERIAL PRIMARY KEY,
  api_key_id BIGINT REFERENCES developer_api_keys(id) ON DELETE SET NULL,
  client_id BIGINT REFERENCES developer_api_clients(id) ON DELETE SET NULL,
  key_prefix TEXT,
  request_path TEXT NOT NULL,
  request_method TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('allowed', 'rate_limited', 'invalid_key', 'expired_key', 'suspended_client')),
  network_fingerprint CHAR(64),
  user_agent TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS developer_api_usage_events_client_time_idx
  ON developer_api_usage_events (client_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS developer_api_usage_events_key_time_idx
  ON developer_api_usage_events (api_key_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS developer_api_usage_events_path_time_idx
  ON developer_api_usage_events (request_path, occurred_at DESC);
