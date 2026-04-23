-- Search query mode analytics for short-brand firm lookup tuning.

ALTER TABLE search_query_analytics
  ADD COLUMN IF NOT EXISTS query_mode TEXT NOT NULL DEFAULT 'mixed',
  ADD COLUMN IF NOT EXISTS short_query BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS strong_firm_candidate BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fuzzy_suppressed_by_firm_candidate BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_search_query_analytics_query_mode
  ON search_query_analytics(query_mode, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_search_query_analytics_short_query
  ON search_query_analytics(short_query, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_search_query_analytics_strong_firm
  ON search_query_analytics(strong_firm_candidate, created_at DESC);
