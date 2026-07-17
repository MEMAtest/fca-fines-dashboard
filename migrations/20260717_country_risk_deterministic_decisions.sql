-- The deterministic evidence pipeline can establish current catalogue status
-- without inventing an original legal commencement date. The observation date,
-- source retrieval timestamp, legal instrument and source hash remain mandatory;
-- legal_effective_from is retained when the official source supplies it.

ALTER TABLE country_risk_sanctions_regimes
  DROP CONSTRAINT IF EXISTS country_risk_sanctions_reviewed_evidence_check;

ALTER TABLE country_risk_sanctions_regimes
  ADD CONSTRAINT country_risk_sanctions_reviewed_evidence_check
  CHECK (
    status = 'pending'
    OR (
      legal_status IS NOT NULL
      AND coverage_state IS NOT NULL AND coverage_state <> 'unknown'
      AND legal_instrument_id IS NOT NULL AND BTRIM(legal_instrument_id) <> ''
      AND legal_instrument_url ~ '^https://'
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

-- Content-addressed score runs make retries idempotent while retaining an
-- immutable history for subsequent change explanations.
ALTER TABLE country_risk_score_runs
  ADD COLUMN IF NOT EXISTS run_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS country_risk_score_runs_run_hash_uidx
  ON country_risk_score_runs (run_hash)
  WHERE run_hash IS NOT NULL;
