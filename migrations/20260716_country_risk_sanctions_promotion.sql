-- Additional reviewer provenance required before a sanctions classification
-- can be promoted into the immutable v2 scoring snapshot.

ALTER TABLE country_risk_sanctions_regimes
  ADD COLUMN IF NOT EXISTS reviewer_organisation TEXT,
  ADD COLUMN IF NOT EXISTS decision_evidence_url TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'country_risk_sanctions_decision_provenance_check'
  ) THEN
    ALTER TABLE country_risk_sanctions_regimes
      ADD CONSTRAINT country_risk_sanctions_decision_provenance_check
      CHECK (
        status = 'pending'
        OR (
          reviewed_by IS NOT NULL
          AND BTRIM(reviewed_by) <> ''
          AND reviewer_organisation IS NOT NULL
          AND BTRIM(reviewer_organisation) <> ''
          AND reviewed_at IS NOT NULL
          AND review_note IS NOT NULL
          AND BTRIM(review_note) <> ''
          AND decision_evidence_url IS NOT NULL
          AND decision_evidence_url ~ '^https://'
        )
      );
  END IF;
END $$;
