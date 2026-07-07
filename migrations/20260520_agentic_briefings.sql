CREATE TABLE IF NOT EXISTS agentic_briefing_cache (
  cache_key TEXT PRIMARY KEY,
  evidence_hash TEXT NOT NULL,
  normalized_filters JSONB NOT NULL,
  response_payload JSONB NOT NULL,
  model TEXT,
  fallback_used BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agentic_request_log (
  id BIGSERIAL PRIMARY KEY,
  client_key TEXT NOT NULL,
  route TEXT NOT NULL,
  status TEXT NOT NULL,
  filter_hash TEXT,
  latency_ms INTEGER,
  fallback_used BOOLEAN,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agentic_request_log_client_created
  ON agentic_request_log(client_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agentic_briefing_cache_expires
  ON agentic_briefing_cache(expires_at);

