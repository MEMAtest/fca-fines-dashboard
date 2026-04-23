CREATE TABLE IF NOT EXISTS uk_enforcement_actions (
  id TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL UNIQUE,
  regulator TEXT NOT NULL,
  regulator_full_name TEXT NOT NULL,
  source_domain TEXT NOT NULL,
  country_code TEXT NOT NULL DEFAULT 'GB',
  country_name TEXT NOT NULL DEFAULT 'United Kingdom',
  firm_individual TEXT NOT NULL,
  firm_category TEXT,
  amount_original NUMERIC(18,2),
  currency TEXT NOT NULL DEFAULT 'GBP',
  amount_gbp NUMERIC(18,2),
  amount_eur NUMERIC(18,2),
  date_issued DATE NOT NULL,
  year_issued INTEGER NOT NULL,
  month_issued INTEGER NOT NULL,
  breach_type TEXT,
  breach_categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary TEXT,
  notice_url TEXT,
  source_url TEXT,
  source_window_note TEXT,
  aliases TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_uk_enforcement_regulator
  ON uk_enforcement_actions (regulator);

CREATE INDEX IF NOT EXISTS idx_uk_enforcement_domain
  ON uk_enforcement_actions (source_domain);

CREATE INDEX IF NOT EXISTS idx_uk_enforcement_date
  ON uk_enforcement_actions (date_issued DESC);

CREATE INDEX IF NOT EXISTS idx_uk_enforcement_year
  ON uk_enforcement_actions (year_issued);

CREATE INDEX IF NOT EXISTS idx_uk_enforcement_amount_gbp
  ON uk_enforcement_actions (amount_gbp DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_uk_enforcement_aliases
  ON uk_enforcement_actions USING gin (aliases);

CREATE OR REPLACE FUNCTION set_uk_enforcement_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_uk_enforcement_updated_at
  ON uk_enforcement_actions;

CREATE TRIGGER trg_uk_enforcement_updated_at
  BEFORE UPDATE ON uk_enforcement_actions
  FOR EACH ROW
  EXECUTE FUNCTION set_uk_enforcement_updated_at();
