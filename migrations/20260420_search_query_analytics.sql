-- Search query analytics for natural search phase 2
-- Stores bounded query telemetry without user identifiers.

CREATE TABLE IF NOT EXISTS search_query_analytics (
  id                      BIGSERIAL PRIMARY KEY,
  query_hash              TEXT NOT NULL,
  query_text              TEXT NOT NULL,
  query_normalized        TEXT NOT NULL,
  query_mode              TEXT NOT NULL DEFAULT 'mixed',
  query_length            INT NOT NULL DEFAULT 0,
  meaningful_term_count   INT NOT NULL DEFAULT 0,
  firm_intent_term_count  INT NOT NULL DEFAULT 0,
  short_query             BOOLEAN NOT NULL DEFAULT FALSE,
  strong_firm_candidate   BOOLEAN NOT NULL DEFAULT FALSE,
  regulator_hint_count    INT NOT NULL DEFAULT 0,
  country_hint_count      INT NOT NULL DEFAULT 0,
  category_hint_count     INT NOT NULL DEFAULT 0,
  filters_applied         JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_count            INT NOT NULL DEFAULT 0,
  zero_result             BOOLEAN NOT NULL DEFAULT FALSE,
  low_signal              BOOLEAN NOT NULL DEFAULT FALSE,
  correction_count        INT NOT NULL DEFAULT 0,
  corrected_query         TEXT,
  correction_pairs        JSONB NOT NULL DEFAULT '[]'::jsonb,
  fuzzy_suppressed_by_firm_candidate BOOLEAN NOT NULL DEFAULT FALSE,
  top_firms               JSONB NOT NULL DEFAULT '[]'::jsonb,
  top_regulators          JSONB NOT NULL DEFAULT '[]'::jsonb,
  latency_ms              INT NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_search_query_analytics_created
  ON search_query_analytics(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_search_query_analytics_zero_result
  ON search_query_analytics(zero_result, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_search_query_analytics_low_signal
  ON search_query_analytics(low_signal, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_search_query_analytics_query_hash
  ON search_query_analytics(query_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_search_query_analytics_result_count
  ON search_query_analytics(result_count, created_at DESC);

COMMENT ON TABLE search_query_analytics IS
  'Bounded search telemetry for relevance tuning; intentionally stores no user identifiers.';
