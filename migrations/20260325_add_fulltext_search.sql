-- Migration: Add full-text search capability to regulatory fines
-- Date: 2026-03-25
-- Purpose: Enable natural language search across enforcement actions

-- Add tsvector column for full-text search
ALTER TABLE fca_fines
ADD COLUMN IF NOT EXISTS search_vector tsvector;

ALTER TABLE eu_fines
ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Create GIN indexes for fast full-text search
CREATE INDEX IF NOT EXISTS idx_fca_fines_search
ON fca_fines USING GIN(search_vector);

CREATE INDEX IF NOT EXISTS idx_eu_fines_search
ON eu_fines USING GIN(search_vector);

-- Create function to update search_vector
CREATE OR REPLACE FUNCTION update_fca_fines_search_vector()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.firm_individual, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.breach_type, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.summary, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.firm_category, '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_eu_fines_search_vector()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.firm_individual, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.breach_type, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.summary, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.firm_category, '')), 'D') ||
    setweight(to_tsvector('english', COALESCE(NEW.regulator_full_name, '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers to auto-update search_vector on INSERT or UPDATE
DROP TRIGGER IF EXISTS fca_fines_search_update ON fca_fines;
CREATE TRIGGER fca_fines_search_update
BEFORE INSERT OR UPDATE ON fca_fines
FOR EACH ROW
EXECUTE FUNCTION update_fca_fines_search_vector();

DROP TRIGGER IF EXISTS eu_fines_search_update ON eu_fines;
CREATE TRIGGER eu_fines_search_update
BEFORE INSERT OR UPDATE ON eu_fines
FOR EACH ROW
EXECUTE FUNCTION update_eu_fines_search_vector();

-- Populate search_vector for existing records
UPDATE fca_fines SET search_vector =
  setweight(to_tsvector('english', COALESCE(firm_individual, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(breach_type, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(summary, '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(firm_category, '')), 'D')
WHERE search_vector IS NULL;

UPDATE eu_fines SET search_vector =
  setweight(to_tsvector('english', COALESCE(firm_individual, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(breach_type, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(summary, '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(firm_category, '')), 'D') ||
  setweight(to_tsvector('english', COALESCE(regulator_full_name, '')), 'D')
WHERE search_vector IS NULL;

-- Refresh materialized view to include search_vector
REFRESH MATERIALIZED VIEW all_regulatory_fines;

-- Verify search works
-- Test query: SELECT * FROM all_regulatory_fines WHERE search_vector @@ plainto_tsquery('english', 'transaction monitoring') LIMIT 5;

COMMENT ON COLUMN fca_fines.search_vector IS 'Full-text search vector for natural language queries';
COMMENT ON COLUMN eu_fines.search_vector IS 'Full-text search vector for natural language queries';
