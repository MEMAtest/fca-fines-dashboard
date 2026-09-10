-- Metering for the website's own unauthenticated API traffic.
--
-- The first-party lane was decided solely by request headers, and one of them,
-- Sec-Fetch-Site, is set by the caller. Any client could therefore skip
-- registration, rate limiting and usage accounting entirely:
--
--   curl https://regactions.com/api/country-risk/list                        -> 401
--   curl -H "Sec-Fetch-Site: same-origin" https://regactions.com/api/...     -> 200
--
-- No header check can fix that, because every header a browser sends a script
-- can send too. What can be fixed is the consequence: the website lane is now a
-- metered anonymous tier rather than an unlimited exemption, counted per
-- pseudonymised network the same way a registered key is counted per key. A
-- caller impersonating the site gets the browsing allowance, not the run of the
-- API, and registration becomes what it should always have been: higher limits
-- and attribution.
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
