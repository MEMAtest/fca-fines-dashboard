-- Phase 2: sanctions & FATF history for the global register ("atlas").
-- Additive and idempotent. Uses IF NOT EXISTS so it is safe regardless of
-- whether Coder A's 20261005_global_register.sql (which defines the same two
-- tables as part of the atlas directory migration) has run yet. Do not edit
-- that migration from here; these definitions MUST stay identical to it.

CREATE TABLE IF NOT EXISTS register_sources (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  source_url TEXT NOT NULL,
  licence TEXT NOT NULL,
  licence_terms_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS register_sanctions_snapshots (
  id SERIAL PRIMARY KEY,
  regime_code TEXT NOT NULL,             -- 'un' | 'ofac' | 'uk' | 'eu'
  iso2 TEXT NOT NULL,
  snapshot_date DATE NOT NULL,
  designation_count INTEGER NOT NULL,
  programmes TEXT[] NOT NULL DEFAULT '{}',
  list_publication_date DATE,
  file_sha256 TEXT NOT NULL,
  source_id INTEGER REFERENCES register_sources(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (regime_code, iso2, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_register_sanctions_snapshots_iso2
  ON register_sanctions_snapshots (iso2, snapshot_date DESC);

CREATE TABLE IF NOT EXISTS register_change_log (
  id SERIAL PRIMARY KEY,
  iso2 TEXT NOT NULL,
  category TEXT NOT NULL,                -- 'sanctions' | 'fatf' | 'authority' | 'law'
  event_date DATE NOT NULL,
  summary TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_id INTEGER REFERENCES register_sources(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_register_change_log_iso2
  ON register_change_log (iso2, event_date DESC);

-- Append-only: block UPDATE and DELETE per the plan ("register_change_log —
-- append-only (a trigger blocks UPDATE and DELETE)").
CREATE OR REPLACE FUNCTION register_change_log_block_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'register_change_log is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS register_change_log_no_update ON register_change_log;
CREATE TRIGGER register_change_log_no_update
  BEFORE UPDATE ON register_change_log
  FOR EACH ROW EXECUTE FUNCTION register_change_log_block_mutation();

DROP TRIGGER IF EXISTS register_change_log_no_delete ON register_change_log;
CREATE TRIGGER register_change_log_no_delete
  BEFORE DELETE ON register_change_log
  FOR EACH ROW EXECUTE FUNCTION register_change_log_block_mutation();

INSERT INTO register_sources (code, title, source_url, licence, licence_terms_url)
VALUES
  ('un-consolidated', 'UN Consolidated Sanctions List', 'https://main.un.org/securitycouncil/en/content/un-sc-consolidated-list', 'Public UN documentation; free use with attribution', 'https://www.un.org/en/about-us/terms-of-use'),
  ('ofac-sdn', 'OFAC Specially Designated Nationals List', 'https://ofac.treasury.gov/sanctions-list-service', 'US Government work; public domain', 'https://www.usa.gov/government-works'),
  ('uk-sanctions-list', 'UK Sanctions List (FCDO)', 'https://www.gov.uk/government/publications/the-uk-sanctions-list', 'Open Government Licence v3.0', 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/'),
  ('eu-financial-sanctions', 'EU Financial Sanctions Dataset', 'https://data.europa.eu/data/datasets/consolidated-list-of-persons-groups-and-entities-subject-to-eu-financial-sanctions?locale=en', 'EU Open Data reuse policy (free reuse with attribution)', 'https://data.europa.eu/en/legal-notice'),
  ('fatf-plenary', 'FATF plenary outcome statements', 'https://www.fatf-gafi.org/en/publications.html', 'Public FATF publications; cited, not redistributed in bulk', 'https://www.fatf-gafi.org/en/the-fatf/legal-information.html')
ON CONFLICT (code) DO NOTHING;
