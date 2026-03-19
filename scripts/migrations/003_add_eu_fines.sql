-- Migration: Add EU Fines Tables
-- Description: Support for multi-regulator enforcement data (ESMA, BaFin, AMF, CNMV, etc.)
-- Date: 2026-03-19

-- ============================================================================
-- Table: EU Fines
-- Multi-regulator enforcement actions from European regulators
-- ============================================================================
CREATE TABLE IF NOT EXISTS eu_fines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Deduplication
  content_hash TEXT UNIQUE NOT NULL,

  -- Regulator info
  regulator TEXT NOT NULL,                      -- 'ESMA', 'BaFin', 'AMF', 'CNMV', 'AFM', 'DNB', 'CONSOB'
  regulator_full_name TEXT NOT NULL,
  country_code TEXT NOT NULL,                   -- 'DE', 'FR', 'ES', 'NL', 'IT', 'EU'
  country_name TEXT NOT NULL,

  -- Fine details
  firm_individual TEXT NOT NULL,
  firm_category TEXT,

  -- Amounts (store in local currency + normalized)
  amount NUMERIC(18,2),
  currency TEXT DEFAULT 'EUR',
  amount_eur NUMERIC(18,2),                     -- Normalized to EUR
  amount_gbp NUMERIC(18,2),                     -- Normalized to GBP for comparison

  -- Date info
  date_issued DATE,
  year_issued INTEGER,
  month_issued INTEGER,

  -- Breach info
  breach_type TEXT,
  breach_categories JSONB,                      -- Array of breach types
  summary TEXT,

  -- Links
  final_notice_url TEXT,
  source_url TEXT NOT NULL,                     -- Original regulator page

  -- Metadata
  raw_payload JSONB,                            -- Original scraped data
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_eu_fines_regulator ON eu_fines(regulator);
CREATE INDEX IF NOT EXISTS idx_eu_fines_country ON eu_fines(country_code);
CREATE INDEX IF NOT EXISTS idx_eu_fines_date ON eu_fines(date_issued DESC);
CREATE INDEX IF NOT EXISTS idx_eu_fines_amount_eur ON eu_fines(amount_eur DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_eu_fines_amount_gbp ON eu_fines(amount_gbp DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_eu_fines_year ON eu_fines(year_issued);
CREATE INDEX IF NOT EXISTS idx_eu_fines_firm ON eu_fines(firm_individual);
CREATE INDEX IF NOT EXISTS idx_eu_fines_created ON eu_fines(created_at DESC);

-- ============================================================================
-- Materialized View: Unified Regulatory Fines
-- Combines FCA + EU fines for unified search and analytics
-- ============================================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS all_regulatory_fines AS
  -- FCA Fines (UK)
  SELECT
    id,
    'FCA' as regulator,
    'Financial Conduct Authority' as regulator_full_name,
    'UK' as country_code,
    'United Kingdom' as country_name,
    firm_individual,
    firm_category,
    amount as amount_original,
    'GBP' as currency,
    amount as amount_gbp,
    ROUND(amount * 1.18, 2) as amount_eur,      -- GBP to EUR approximate conversion
    date_issued,
    EXTRACT(YEAR FROM date_issued)::integer as year_issued,
    EXTRACT(MONTH FROM date_issued)::integer as month_issued,
    breach_type,
    breach_categories,
    summary,
    final_notice_url as notice_url,
    final_notice_url as source_url,
    created_at
  FROM fca_fines
  WHERE date_issued IS NOT NULL

  UNION ALL

  -- EU Fines
  SELECT
    id,
    regulator,
    regulator_full_name,
    country_code,
    country_name,
    firm_individual,
    firm_category,
    amount as amount_original,
    currency,
    amount_gbp,
    amount_eur,
    date_issued,
    year_issued,
    month_issued,
    breach_type,
    breach_categories,
    summary,
    final_notice_url as notice_url,
    source_url,
    created_at
  FROM eu_fines
  WHERE date_issued IS NOT NULL;

-- Indexes on materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_all_fines_id ON all_regulatory_fines(id);
CREATE INDEX IF NOT EXISTS idx_all_fines_regulator ON all_regulatory_fines(regulator);
CREATE INDEX IF NOT EXISTS idx_all_fines_country ON all_regulatory_fines(country_code);
CREATE INDEX IF NOT EXISTS idx_all_fines_date ON all_regulatory_fines(date_issued DESC);
CREATE INDEX IF NOT EXISTS idx_all_fines_amount_eur ON all_regulatory_fines(amount_eur DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_all_fines_year ON all_regulatory_fines(year_issued);

-- ============================================================================
-- Function: Refresh Materialized View
-- Called after EU scraper runs to update unified view
-- ============================================================================
CREATE OR REPLACE FUNCTION refresh_all_fines()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY all_regulatory_fines;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Trigger: Update timestamp on EU fines
-- ============================================================================
DROP TRIGGER IF EXISTS update_eu_fines_updated_at ON eu_fines;
CREATE TRIGGER update_eu_fines_updated_at
  BEFORE UPDATE ON eu_fines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Helper Functions for Data Quality
-- ============================================================================

-- Function: Normalize regulator name
CREATE OR REPLACE FUNCTION normalize_regulator(regulator_code TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN CASE regulator_code
    WHEN 'ESMA' THEN 'European Securities and Markets Authority'
    WHEN 'BaFin' THEN 'Federal Financial Supervisory Authority'
    WHEN 'AMF' THEN 'Autorité des marchés financiers'
    WHEN 'CNMV' THEN 'Comisión Nacional del Mercado de Valores'
    WHEN 'AFM' THEN 'Netherlands Authority for the Financial Markets'
    WHEN 'DNB' THEN 'De Nederlandsche Bank'
    WHEN 'CONSOB' THEN 'Commissione Nazionale per le Società e la Borsa'
    WHEN 'FCA' THEN 'Financial Conduct Authority'
    ELSE regulator_code
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function: Convert amount to EUR
CREATE OR REPLACE FUNCTION convert_to_eur(amount NUMERIC, currency TEXT)
RETURNS NUMERIC AS $$
DECLARE
  rate NUMERIC;
BEGIN
  IF amount IS NULL THEN
    RETURN NULL;
  END IF;

  -- Simple conversion rates (would be better from live API in production)
  rate := CASE currency
    WHEN 'EUR' THEN 1.0
    WHEN 'GBP' THEN 1.18        -- £1 ≈ €1.18
    WHEN 'USD' THEN 0.92        -- $1 ≈ €0.92
    WHEN 'CHF' THEN 1.05        -- CHF 1 ≈ €1.05
    ELSE 1.0
  END;

  RETURN ROUND(amount * rate, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function: Convert amount to GBP
CREATE OR REPLACE FUNCTION convert_to_gbp(amount NUMERIC, currency TEXT)
RETURNS NUMERIC AS $$
DECLARE
  rate NUMERIC;
BEGIN
  IF amount IS NULL THEN
    RETURN NULL;
  END IF;

  -- Simple conversion rates
  rate := CASE currency
    WHEN 'GBP' THEN 1.0
    WHEN 'EUR' THEN 0.85        -- €1 ≈ £0.85
    WHEN 'USD' THEN 0.78        -- $1 ≈ £0.78
    WHEN 'CHF' THEN 0.89        -- CHF 1 ≈ £0.89
    ELSE 1.0
  END;

  RETURN ROUND(amount * rate, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- Initial Data Validation
-- ============================================================================
-- Run this after migration to validate existing data

DO $$
BEGIN
  -- Check for duplicate content hashes (should be impossible with UNIQUE constraint)
  PERFORM content_hash, COUNT(*)
  FROM eu_fines
  GROUP BY content_hash
  HAVING COUNT(*) > 1;

  IF FOUND THEN
    RAISE WARNING 'Duplicate content hashes found in eu_fines table';
  END IF;
END;
$$;

-- ============================================================================
-- Grant Permissions
-- ============================================================================
-- Grant read access to monitoring user
GRANT SELECT ON eu_fines TO monitor_readonly;
GRANT SELECT ON all_regulatory_fines TO monitor_readonly;

COMMENT ON TABLE eu_fines IS 'European regulatory fines from ESMA, BaFin, AMF, CNMV, AFM, DNB, CONSOB';
COMMENT ON MATERIALIZED VIEW all_regulatory_fines IS 'Unified view of FCA + EU regulatory fines';
COMMENT ON FUNCTION refresh_all_fines() IS 'Refresh materialized view after scraper runs';
COMMENT ON FUNCTION convert_to_eur(NUMERIC, TEXT) IS 'Convert fine amount to EUR';
COMMENT ON FUNCTION convert_to_gbp(NUMERIC, TEXT) IS 'Convert fine amount to GBP';
