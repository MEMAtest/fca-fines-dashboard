-- Country-risk v2 provenance, review and reproducible score history.

CREATE TABLE IF NOT EXISTS country_risk_source_runs (
  id BIGSERIAL PRIMARY KEY,
  source_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'review_required')),
  source_url TEXT NOT NULL,
  retrieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_at TEXT,
  sha256 TEXT,
  parser_version TEXT NOT NULL,
  record_count INTEGER NOT NULL DEFAULT 0 CHECK (record_count >= 0),
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS country_risk_source_runs_source_retrieved_idx
  ON country_risk_source_runs (source_id, retrieved_at DESC);

CREATE TABLE IF NOT EXISTS country_risk_raw_snapshots (
  id BIGSERIAL PRIMARY KEY,
  source_run_id BIGINT NOT NULL REFERENCES country_risk_source_runs(id) ON DELETE RESTRICT,
  sha256 TEXT NOT NULL,
  byte_length BIGINT NOT NULL CHECK (byte_length > 0),
  media_type TEXT NOT NULL,
  storage_uri TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_run_id, sha256)
);

CREATE TABLE IF NOT EXISTS country_risk_indicator_values (
  id BIGSERIAL PRIMARY KEY,
  source_run_id BIGINT NOT NULL REFERENCES country_risk_source_runs(id) ON DELETE RESTRICT,
  iso2 CHAR(2) NOT NULL,
  indicator_key TEXT NOT NULL,
  value_numeric NUMERIC,
  value_text TEXT,
  effective_at TEXT,
  evidence_url TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (source_run_id, iso2, indicator_key)
);

CREATE INDEX IF NOT EXISTS country_risk_indicator_iso_key_idx
  ON country_risk_indicator_values (iso2, indicator_key);

CREATE TABLE IF NOT EXISTS country_risk_methodologies (
  version TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('draft', 'parallel', 'live', 'retired')),
  definition JSONB NOT NULL,
  validation_report_url TEXT,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS country_risk_score_runs (
  id BIGSERIAL PRIMARY KEY,
  methodology_version TEXT NOT NULL REFERENCES country_risk_methodologies(version),
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'review_required')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  input_source_runs JSONB NOT NULL DEFAULT '{}'::jsonb,
  code_commit TEXT,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS country_risk_scores (
  score_run_id BIGINT NOT NULL REFERENCES country_risk_score_runs(id) ON DELETE RESTRICT,
  iso2 CHAR(2) NOT NULL,
  score NUMERIC(3,1),
  band TEXT CHECK (band IS NULL OR band IN ('low', 'moderate', 'high', 'very-high')),
  publication_status TEXT NOT NULL CHECK (publication_status IN ('complete', 'provisional', 'insufficient-data')),
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  pillars JSONB NOT NULL,
  floors JSONB NOT NULL DEFAULT '[]'::jsonb,
  limiting_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  arithmetic TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (score_run_id, iso2)
);

CREATE TABLE IF NOT EXISTS country_risk_reviews (
  id BIGSERIAL PRIMARY KEY,
  source_run_id BIGINT REFERENCES country_risk_source_runs(id) ON DELETE RESTRICT,
  iso2 CHAR(2),
  change_type TEXT NOT NULL,
  proposed_value JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS country_risk_score_evidence (
  score_run_id BIGINT NOT NULL,
  iso2 CHAR(2) NOT NULL,
  indicator_value_id BIGINT NOT NULL REFERENCES country_risk_indicator_values(id) ON DELETE RESTRICT,
  pillar TEXT NOT NULL CHECK (pillar IN ('aml', 'governance', 'sanctions')),
  contribution NUMERIC,
  PRIMARY KEY (score_run_id, iso2, indicator_value_id),
  FOREIGN KEY (score_run_id, iso2) REFERENCES country_risk_scores(score_run_id, iso2) ON DELETE RESTRICT
);
