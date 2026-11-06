-- Per-client limiter for the website data lane (/api/site/*). Idempotent.
CREATE TABLE IF NOT EXISTS site_api_rate_buckets (
  fingerprint CHAR(64) NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (fingerprint, window_start)
);
CREATE INDEX IF NOT EXISTS site_api_rate_buckets_window_idx ON site_api_rate_buckets (window_start);

-- Malformed keys are no longer logged. Purge fragments of unknown tokens that earlier
-- versions stored as key_prefix (only prefixes of real, issued keys are kept).
UPDATE developer_api_usage_events
   SET key_prefix = NULL
 WHERE api_key_id IS NULL
   AND key_prefix IS NOT NULL;
