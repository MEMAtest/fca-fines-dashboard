-- Include UK enforcement actions in the unified enforcement view.
-- This keeps FCA fines in fca_fines, broader UK enforcement in
-- uk_enforcement_actions, and exposes both through all_regulatory_fines.

DROP MATERIALIZED VIEW IF EXISTS all_regulatory_fines;

CREATE MATERIALIZED VIEW all_regulatory_fines AS
  SELECT
    id::text AS id,
    'FCA'::text AS regulator,
    'Financial Conduct Authority'::text AS regulator_full_name,
    'GB'::text AS country_code,
    'United Kingdom'::text AS country_name,
    firm_individual,
    firm_category,
    amount AS amount_original,
    'GBP'::text AS currency,
    amount AS amount_gbp,
    ROUND(amount * 1.18, 2) AS amount_eur,
    date_issued,
    EXTRACT(YEAR FROM date_issued)::integer AS year_issued,
    EXTRACT(MONTH FROM date_issued)::integer AS month_issued,
    breach_type,
    breach_categories,
    summary,
    final_notice_url AS notice_url,
    final_notice_url AS source_url,
    created_at,
    COALESCE(
      search_vector,
      setweight(to_tsvector('english', COALESCE(firm_individual, '')), 'A') ||
      setweight(to_tsvector('english', COALESCE(breach_type, '')), 'B') ||
      setweight(to_tsvector('english', COALESCE(summary, '')), 'C') ||
      setweight(to_tsvector('english', COALESCE(firm_category, '')), 'D')
    ) AS search_vector
  FROM fca_fines
  WHERE date_issued IS NOT NULL

  UNION ALL

  SELECT
    id::text AS id,
    regulator,
    regulator_full_name,
    country_code,
    country_name,
    firm_individual,
    firm_category,
    amount AS amount_original,
    currency,
    amount_gbp,
    amount_eur,
    date_issued,
    year_issued,
    month_issued,
    breach_type,
    breach_categories,
    summary,
    final_notice_url AS notice_url,
    source_url,
    created_at,
    COALESCE(
      search_vector,
      setweight(to_tsvector('english', COALESCE(firm_individual, '')), 'A') ||
      setweight(to_tsvector('english', COALESCE(breach_type, '')), 'B') ||
      setweight(to_tsvector('english', COALESCE(summary, '')), 'C') ||
      setweight(to_tsvector('english', COALESCE(firm_category, '')), 'D') ||
      setweight(to_tsvector('english', COALESCE(regulator_full_name, '')), 'D')
    ) AS search_vector
  FROM eu_fines
  WHERE date_issued IS NOT NULL

  UNION ALL

  SELECT
    id::text AS id,
    regulator,
    regulator_full_name,
    country_code,
    country_name,
    firm_individual,
    firm_category,
    amount_original,
    currency,
    amount_gbp,
    amount_eur,
    date_issued,
    year_issued,
    month_issued,
    breach_type,
    breach_categories,
    summary,
    notice_url,
    source_url,
    created_at,
    to_tsvector(
      'english',
      concat_ws(
        ' ',
        firm_individual,
        regulator,
        regulator_full_name,
        country_name,
        breach_type,
        breach_categories::text,
        summary,
        array_to_string(aliases, ' ')
      )
    ) AS search_vector
  FROM uk_enforcement_actions
  WHERE date_issued IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_all_fines_id
  ON all_regulatory_fines(id);
CREATE INDEX IF NOT EXISTS idx_all_fines_regulator
  ON all_regulatory_fines(regulator);
CREATE INDEX IF NOT EXISTS idx_all_fines_country
  ON all_regulatory_fines(country_code);
CREATE INDEX IF NOT EXISTS idx_all_fines_date
  ON all_regulatory_fines(date_issued DESC);
CREATE INDEX IF NOT EXISTS idx_all_fines_amount_eur
  ON all_regulatory_fines(amount_eur DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_all_fines_amount_gbp
  ON all_regulatory_fines(amount_gbp DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_all_fines_year
  ON all_regulatory_fines(year_issued);
CREATE INDEX IF NOT EXISTS idx_all_fines_search_vector
  ON all_regulatory_fines USING GIN(search_vector);

CREATE OR REPLACE FUNCTION refresh_all_fines()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW all_regulatory_fines;
END;
$$ LANGUAGE plpgsql;

GRANT SELECT ON all_regulatory_fines TO fca_app;
GRANT SELECT ON all_regulatory_fines TO monitor_readonly;

COMMENT ON MATERIALIZED VIEW all_regulatory_fines IS
  'Unified view of FCA fines, global regulator fines, and UK broader enforcement actions';
COMMENT ON FUNCTION refresh_all_fines() IS
  'Refresh materialized view after scraper runs';
