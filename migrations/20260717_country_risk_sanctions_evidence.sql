-- Deterministic legal-measure evidence and explicit four-imposer coverage for
-- country-risk sanctions v2. Existing pending rows remain pending; no default
-- values in this migration are eligible for score promotion.

CREATE UNIQUE INDEX IF NOT EXISTS country_risk_source_runs_report_sha_idx
  ON country_risk_source_runs (source_id, ((metadata->>'reportSha256')))
  WHERE metadata ? 'reportSha256';

ALTER TABLE country_risk_sanctions_regimes
  ADD COLUMN IF NOT EXISTS legal_status TEXT,
  ADD COLUMN IF NOT EXISTS coverage_state TEXT,
  ADD COLUMN IF NOT EXISTS legal_instrument_id TEXT,
  ADD COLUMN IF NOT EXISTS legal_instrument_url TEXT,
  ADD COLUMN IF NOT EXISTS official_guidance_url TEXT,
  ADD COLUMN IF NOT EXISTS legal_effective_from DATE,
  ADD COLUMN IF NOT EXISTS legal_effective_to DATE,
  ADD COLUMN IF NOT EXISTS source_last_updated DATE,
  ADD COLUMN IF NOT EXISTS evidence_locator TEXT,
  ADD COLUMN IF NOT EXISTS measures JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS broad_trade_prohibition BOOLEAN,
  ADD COLUMN IF NOT EXISTS broad_financial_prohibition BOOLEAN,
  ADD COLUMN IF NOT EXISTS material_non_designation_restriction BOOLEAN,
  ADD COLUMN IF NOT EXISTS prepared_by TEXT,
  ADD COLUMN IF NOT EXISTS prepared_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'country_risk_sanctions_legal_status_check'
  ) THEN
    ALTER TABLE country_risk_sanctions_regimes
      ADD CONSTRAINT country_risk_sanctions_legal_status_check
      CHECK (legal_status IS NULL OR legal_status IN ('active', 'suspended', 'terminated', 'unknown'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'country_risk_sanctions_coverage_state_check'
  ) THEN
    ALTER TABLE country_risk_sanctions_regimes
      ADD CONSTRAINT country_risk_sanctions_coverage_state_check
      CHECK (
        coverage_state IS NULL
        OR coverage_state IN (
          'active-direct', 'active-situation-related', 'thematic-only',
          'inactive', 'no-direct-regime', 'unknown'
        )
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'country_risk_sanctions_measures_array_check'
  ) THEN
    ALTER TABLE country_risk_sanctions_regimes
      ADD CONSTRAINT country_risk_sanctions_measures_array_check
      CHECK (jsonb_typeof(measures) = 'array');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'country_risk_sanctions_reviewed_evidence_check'
  ) THEN
    ALTER TABLE country_risk_sanctions_regimes
      ADD CONSTRAINT country_risk_sanctions_reviewed_evidence_check
      CHECK (
        status = 'pending'
        OR (
          legal_status IS NOT NULL
          AND coverage_state IS NOT NULL AND coverage_state <> 'unknown'
          AND legal_instrument_id IS NOT NULL AND BTRIM(legal_instrument_id) <> ''
          AND legal_instrument_url ~ '^https://'
          AND legal_effective_from IS NOT NULL
          AND evidence_locator IS NOT NULL AND BTRIM(evidence_locator) <> ''
          AND broad_trade_prohibition IS NOT NULL
          AND broad_financial_prohibition IS NOT NULL
          AND material_non_designation_restriction IS NOT NULL
          AND prepared_by IS NOT NULL AND BTRIM(prepared_by) <> ''
          AND prepared_at IS NOT NULL
          AND prepared_by <> reviewed_by
          AND (status <> 'approved' OR (legal_status = 'active' AND coverage_state = 'active-direct'))
          AND (status <> 'rejected' OR coverage_state <> 'active-direct')
        )
      ) NOT VALID;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS country_risk_sanctions_catalogue_reviews (
  id BIGSERIAL PRIMARY KEY,
  imposer TEXT NOT NULL CHECK (imposer IN ('OFAC', 'UK', 'EU', 'UN')),
  source_id TEXT NOT NULL,
  catalogue_url TEXT NOT NULL,
  source_fingerprint TEXT NOT NULL,
  census_sha256 TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  reviewed_by TEXT,
  reviewer_organisation TEXT,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (imposer, source_fingerprint),
  CHECK (
    status = 'pending'
    OR (
      reviewed_by IS NOT NULL AND BTRIM(reviewed_by) <> ''
      AND reviewer_organisation IS NOT NULL AND BTRIM(reviewer_organisation) <> ''
      AND reviewed_at IS NOT NULL
      AND review_note IS NOT NULL AND BTRIM(review_note) <> ''
    )
  )
);

CREATE TABLE IF NOT EXISTS country_risk_sanctions_catalogue_item_reviews (
  census_sha256 TEXT NOT NULL,
  imposer TEXT NOT NULL CHECK (imposer IN ('OFAC', 'UK', 'EU', 'UN')),
  item_key TEXT NOT NULL,
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  disposition TEXT NOT NULL CHECK (
    disposition IN (
      'candidate-mapped', 'excluded-thematic', 'excluded-regional',
      'excluded-umbrella', 'excluded-duplicate', 'excluded-inactive', 'excluded-other'
    )
  ),
  candidate_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
  reviewed_by TEXT NOT NULL,
  reviewed_at TIMESTAMPTZ NOT NULL,
  review_note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (census_sha256, imposer, item_key),
  CHECK (url ~ '^https://'),
  CHECK (jsonb_typeof(candidate_keys) = 'array'),
  CHECK (BTRIM(reviewed_by) <> '' AND BTRIM(review_note) <> ''),
  CHECK (
    (disposition = 'candidate-mapped' AND jsonb_array_length(candidate_keys) > 0)
    OR (disposition <> 'candidate-mapped' AND jsonb_array_length(candidate_keys) = 0)
  )
);

CREATE TABLE IF NOT EXISTS country_risk_sanctions_snapshots (
  version TEXT PRIMARY KEY,
  effective_at TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL,
  sha256 TEXT NOT NULL UNIQUE,
  source_report_sha256 TEXT NOT NULL,
  candidate_count INTEGER NOT NULL CHECK (candidate_count >= 0),
  approved_count INTEGER NOT NULL CHECK (approved_count >= 0),
  rejected_count INTEGER NOT NULL CHECK (rejected_count >= 0),
  coverage_cell_count INTEGER NOT NULL CHECK (coverage_cell_count >= 0),
  metadata JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS country_risk_sanctions_coverage_cells (
  snapshot_version TEXT NOT NULL REFERENCES country_risk_sanctions_snapshots(version) ON DELETE RESTRICT,
  iso2 CHAR(2) NOT NULL,
  imposer TEXT NOT NULL CHECK (imposer IN ('OFAC', 'UK', 'EU', 'UN')),
  coverage_state TEXT NOT NULL CHECK (
    coverage_state IN (
      'active-direct', 'active-situation-related', 'thematic-only',
      'inactive', 'no-direct-regime', 'unknown'
    )
  ),
  regime_count INTEGER NOT NULL CHECK (regime_count >= 0),
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (snapshot_version, iso2, imposer)
);

CREATE INDEX IF NOT EXISTS country_risk_sanctions_coverage_iso_idx
  ON country_risk_sanctions_coverage_cells (iso2, snapshot_version);
