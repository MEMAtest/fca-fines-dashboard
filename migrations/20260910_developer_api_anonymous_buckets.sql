-- Reserved storage for a future durable public-site browsing throttle.
--
-- The public website and registered developer API are now separate route
-- families. Browser headers are caller-controlled and therefore never unlock
-- an endpoint in the published developer reference. Those endpoints require a
-- registered key and use developer_api_rate_buckets above.
--
-- Public webpage data is deliberately not represented as authenticated or
-- per-client metered. This table remains available if a durable public-site
-- abuse throttle is introduced later; it is not an authentication control and
-- is not currently used by the registered API access service.
--
-- Separate from developer_api_rate_buckets because that table's primary key is
-- an api_key_id foreign key, and anonymous traffic has no key to reference.
CREATE TABLE IF NOT EXISTS developer_api_anonymous_buckets (
  network_fingerprint CHAR(64) NOT NULL,
  window_kind TEXT NOT NULL CHECK (window_kind IN ('minute', 'day')),
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (network_fingerprint, window_kind, window_start)
);

CREATE INDEX IF NOT EXISTS developer_api_anonymous_buckets_window_idx
  ON developer_api_anonymous_buckets (window_start DESC);
