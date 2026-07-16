-- Review workflow for v2 geographic-sanctions classifications.
--
-- This is separate from designation lists: the presence of a national on a
-- designation list does not make their country subject to a geographic regime.
-- Candidate rows are not eligible for scoring until a named reviewer approves
-- the legal scope, country nexus and final tier.

CREATE TABLE IF NOT EXISTS country_risk_sanctions_regimes (
  id BIGSERIAL PRIMARY KEY,
  source_run_id BIGINT REFERENCES country_risk_source_runs(id) ON DELETE RESTRICT,
  iso2 CHAR(2) NOT NULL,
  imposer TEXT NOT NULL CHECK (imposer IN ('OFAC', 'UK', 'EU', 'UN')),
  regime_name TEXT NOT NULL,
  relationship TEXT NOT NULL CHECK (relationship IN ('direct-country-exposure', 'situation-related')),
  proposed_tier TEXT NOT NULL CHECK (proposed_tier IN ('targeted', 'sectoral', 'comprehensive')),
  final_tier TEXT CHECK (final_tier IS NULL OR final_tier IN ('targeted', 'sectoral', 'comprehensive')),
  catalogue_url TEXT NOT NULL,
  measure_evidence_url TEXT NOT NULL,
  effective_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (iso2, imposer, regime_name),
  CHECK (
    status <> 'approved'
    OR (
      final_tier IS NOT NULL
      AND reviewed_by IS NOT NULL
      AND reviewed_at IS NOT NULL
      AND review_note IS NOT NULL
    )
  ),
  CHECK (
    status <> 'rejected'
    OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND review_note IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS country_risk_sanctions_regimes_iso_status_idx
  ON country_risk_sanctions_regimes (iso2, status);
