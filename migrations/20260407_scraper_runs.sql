-- Scraper run metrics table for monitoring and alerting
-- Tracks each scraper execution with timing, record counts, and status

CREATE TABLE IF NOT EXISTS scraper_runs (
  id            SERIAL PRIMARY KEY,
  regulator     TEXT NOT NULL,
  region        TEXT NOT NULL,
  started_at    TIMESTAMPTZ NOT NULL,
  finished_at   TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'running',  -- running | success | error | dry-run
  records_prepared INT DEFAULT 0,
  records_inserted INT DEFAULT 0,
  records_updated  INT DEFAULT 0,
  errors        INT DEFAULT 0,
  error_message TEXT,
  duration_ms   INT,
  source        TEXT DEFAULT 'github-actions',
  run_url       TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scraper_runs_regulator ON scraper_runs(regulator);
CREATE INDEX IF NOT EXISTS idx_scraper_runs_started ON scraper_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_scraper_runs_status ON scraper_runs(status);
CREATE INDEX IF NOT EXISTS idx_scraper_runs_regulator_started ON scraper_runs(regulator, started_at DESC);
