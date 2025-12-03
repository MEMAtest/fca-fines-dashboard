-- Schema for FCA fines data in Neon
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS fca_fines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fine_reference TEXT,
  firm_individual TEXT NOT NULL,
  firm_category TEXT,
  regulator TEXT DEFAULT 'FCA',
  final_notice_url TEXT,
  summary TEXT,
  ai_summary TEXT,
  content_hash TEXT UNIQUE,
  breach_type TEXT,
  breach_categories JSONB DEFAULT '[]'::jsonb,
  amount NUMERIC(18,2) NOT NULL,
  currency CHAR(3) DEFAULT 'GBP',
  date_issued DATE NOT NULL,
  year_issued INT NOT NULL,
  month_issued INT NOT NULL CHECK (month_issued BETWEEN 1 AND 12),
  risk_score NUMERIC(5,2),
  tags TEXT[],
  raw_payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fca_fines_date ON fca_fines (date_issued DESC);
CREATE INDEX IF NOT EXISTS idx_fca_fines_year_month ON fca_fines (year_issued, month_issued);
CREATE INDEX IF NOT EXISTS idx_fca_fines_amount ON fca_fines (amount DESC);
CREATE INDEX IF NOT EXISTS idx_fca_fines_breach_categories ON fca_fines USING GIN (breach_categories jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_fca_fines_firm_category ON fca_fines (firm_category);

CREATE OR REPLACE FUNCTION set_fca_fines_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fca_fines_timestamps ON fca_fines;
CREATE TRIGGER trg_fca_fines_timestamps
  BEFORE UPDATE ON fca_fines
  FOR EACH ROW EXECUTE FUNCTION set_fca_fines_timestamps();

-- Trend table consumed by the dashboard widget
CREATE TABLE IF NOT EXISTS fca_fine_trends (
  period_type TEXT NOT NULL CHECK (period_type IN ('month','quarter','year')),
  year INT NOT NULL,
  period_value INT NOT NULL,
  fine_count INT NOT NULL DEFAULT 0,
  total_fines NUMERIC(18,2) NOT NULL DEFAULT 0,
  average_fine NUMERIC(18,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (period_type, year, period_value)
);

CREATE OR REPLACE FUNCTION refresh_fca_fine_trends()
RETURNS VOID AS $$
BEGIN
  DELETE FROM fca_fine_trends;

  INSERT INTO fca_fine_trends (period_type, year, period_value, fine_count, total_fines, average_fine)
  SELECT
    'month' AS period_type,
    year_issued,
    month_issued,
    COUNT(*) AS fine_count,
    SUM(amount) AS total_fines,
    AVG(amount) AS average_fine
  FROM fca_fines
  GROUP BY year_issued, month_issued;

  INSERT INTO fca_fine_trends (period_type, year, period_value, fine_count, total_fines, average_fine)
  SELECT
    'quarter' AS period_type,
    year_issued,
    ((month_issued - 1) / 3) + 1 AS period_value,
    COUNT(*) AS fine_count,
    SUM(amount) AS total_fines,
    AVG(amount) AS average_fine
  FROM fca_fines
  GROUP BY year_issued, ((month_issued - 1) / 3) + 1;

  INSERT INTO fca_fine_trends (period_type, year, period_value, fine_count, total_fines, average_fine)
  SELECT
    'year' AS period_type,
    year_issued,
    1,
    COUNT(*) AS fine_count,
    SUM(amount) AS total_fines,
    AVG(amount) AS average_fine
  FROM fca_fines
  GROUP BY year_issued;
END;
$$ LANGUAGE plpgsql;
