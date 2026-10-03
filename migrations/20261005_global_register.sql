-- Global AML/financial-crime register ("atlas") — Phase 0 schema.
-- Idempotent and additive only. Safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS register_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  licence TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('confirmed', 'withheld_pending_review')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS register_authorities (
  id BIGSERIAL PRIMARY KEY,
  iso2 TEXT NOT NULL,
  name TEXT NOT NULL,
  acronym TEXT,
  url TEXT,
  role TEXT NOT NULL CHECK (role IN (
    'aml_supervisor', 'prudential', 'securities', 'insurance', 'pensions',
    'central_bank', 'fiu', 'crime_enforcement', 'prosecutor', 'sanctions_tfs',
    'company_bo_registry', 'data_protection'
  )),
  egmont_member BOOLEAN NOT NULL DEFAULT false,
  alias_of BIGINT REFERENCES register_authorities(id),
  -- explicit, hand-checked mapping to the existing RegActions regulator id
  -- (src/data/regulatorCoverage.ts `code`). Never fuzzy-matched at runtime.
  regactions_regulator_id TEXT,
  source_url TEXT,
  source_id TEXT REFERENCES register_sources(id),
  licence TEXT,
  grade TEXT NOT NULL CHECK (grade IN ('A', 'B', 'C')),
  publish_state TEXT NOT NULL DEFAULT 'draft' CHECK (publish_state IN ('draft', 'review', 'published', 'retired')),
  last_verified_at TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  content_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_register_authorities_iso2 ON register_authorities (iso2);
CREATE INDEX IF NOT EXISTS idx_register_authorities_role ON register_authorities (role);
CREATE INDEX IF NOT EXISTS idx_register_authorities_publish_state ON register_authorities (publish_state);
CREATE INDEX IF NOT EXISTS idx_register_authorities_regulator_id ON register_authorities (regactions_regulator_id);

CREATE TABLE IF NOT EXISTS register_legal_instruments (
  id BIGSERIAL PRIMARY KEY,
  iso2 TEXT NOT NULL,
  category TEXT,
  title TEXT NOT NULL,
  status TEXT,
  in_force_date DATE, -- stays null unless a source states it explicitly
  source_url TEXT,
  source_id TEXT REFERENCES register_sources(id),
  licence TEXT,
  grade TEXT NOT NULL CHECK (grade IN ('A', 'B', 'C')),
  publish_state TEXT NOT NULL DEFAULT 'draft' CHECK (publish_state IN ('draft', 'review', 'published', 'retired')),
  last_verified_at TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  content_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_register_legal_instruments_iso2 ON register_legal_instruments (iso2);
CREATE INDEX IF NOT EXISTS idx_register_legal_instruments_publish_state ON register_legal_instruments (publish_state);

-- Phase 2 (Coder B) owns the write path into this table; defined here so the
-- schema ships once and additively.
CREATE TABLE IF NOT EXISTS register_sanctions_snapshots (
  id BIGSERIAL PRIMARY KEY,
  iso2 TEXT NOT NULL,
  regime TEXT NOT NULL, -- OFAC | UK | EU | UN
  snapshot_date DATE NOT NULL,
  entry_count INTEGER,
  programmes TEXT[],
  list_published_at TIMESTAMPTZ,
  file_sha256 TEXT,
  source_url TEXT,
  source_id TEXT REFERENCES register_sources(id),
  grade TEXT NOT NULL DEFAULT 'A' CHECK (grade IN ('A', 'B', 'C')),
  publish_state TEXT NOT NULL DEFAULT 'published' CHECK (publish_state IN ('draft', 'review', 'published', 'retired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (iso2, regime, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_register_sanctions_snapshots_iso2 ON register_sanctions_snapshots (iso2);

CREATE TABLE IF NOT EXISTS register_change_log (
  id BIGSERIAL PRIMARY KEY,
  iso2 TEXT,
  entity_type TEXT NOT NULL, -- authority | legal_instrument | sanctions_snapshot | fatf
  entity_id TEXT,
  change_type TEXT NOT NULL, -- added | removed | renamed | status_changed | relisted
  summary TEXT NOT NULL,
  source_url TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_register_change_log_iso2 ON register_change_log (iso2);
CREATE INDEX IF NOT EXISTS idx_register_change_log_occurred_at ON register_change_log (occurred_at DESC);

-- Append-only: block UPDATE and DELETE on the change log.
CREATE OR REPLACE FUNCTION register_change_log_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'register_change_log is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_register_change_log_block_update ON register_change_log;
CREATE TRIGGER trg_register_change_log_block_update
  BEFORE UPDATE ON register_change_log
  FOR EACH ROW EXECUTE FUNCTION register_change_log_block_mutation();

DROP TRIGGER IF EXISTS trg_register_change_log_block_delete ON register_change_log;
CREATE TRIGGER trg_register_change_log_block_delete
  BEFORE DELETE ON register_change_log
  FOR EACH ROW EXECUTE FUNCTION register_change_log_block_mutation();

-- Phase 3 will extend regulatory_case_registry with action_type/court/case_ref
-- additively; not part of this migration (table may not exist in every env
-- this migration runs against, so it is deliberately left out here).

COMMIT;
