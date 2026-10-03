-- Global AML/financial-crime register ("atlas") — Phase 0/1 schema
-- (authorities + legal instruments).
-- Idempotent and additive only. Safe to re-run.
--
-- `register_sources`, `register_sanctions_snapshots` and `register_change_log`
-- are defined canonically in Coder B's 20261006_register_sanctions.sql (their
-- column names — code/title/source_url, regime_code/designation_count/
-- event_date — are what the Phase 2 ingest code actually reads/writes).
-- This migration does NOT redefine them, to avoid two competing shapes for
-- the same table racing on `CREATE TABLE IF NOT EXISTS` depending on
-- migration order. Run 20261006 before or after this one; both are additive
-- and neither touches the other's tables. `register_authorities` and
-- `register_legal_instruments` carry a plain informational `source_id` TEXT
-- column (no FK) rather than referencing register_sources, since this
-- migration may run before that table exists.

BEGIN;

CREATE TABLE IF NOT EXISTS register_authorities (
  id BIGSERIAL PRIMARY KEY,
  iso2 TEXT NOT NULL,
  name TEXT NOT NULL,
  acronym TEXT,
  url TEXT,
  role TEXT NOT NULL CHECK (role IN (
    'aml_supervisor', 'conduct', 'prudential', 'securities', 'insurance', 'pensions',
    'central_bank', 'fiu', 'crime_enforcement', 'prosecutor', 'sanctions_tfs',
    'company_bo_registry', 'data_protection'
  )),
  -- short per-role provenance, e.g. "IOSCO member directory" or "Official
  -- about-us page" for a hand-checked mapped regulator. Never invented.
  role_provenance TEXT,
  egmont_member BOOLEAN NOT NULL DEFAULT false,
  alias_of BIGINT REFERENCES register_authorities(id),
  -- explicit, hand-checked mapping to the existing RegActions regulator id
  -- (src/data/regulatorCoverage.ts `code`). Never fuzzy-matched at runtime.
  regactions_regulator_id TEXT,
  source_url TEXT,
  -- informational only; see header note on why this is not an FK.
  source_id TEXT,
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

-- Additive: a prior deploy of this migration may have created the column
-- without role_provenance, or with 'conduct' missing from the CHECK.
ALTER TABLE register_authorities ADD COLUMN IF NOT EXISTS role_provenance TEXT;
ALTER TABLE register_authorities DROP CONSTRAINT IF EXISTS register_authorities_role_check;
ALTER TABLE register_authorities ADD CONSTRAINT register_authorities_role_check CHECK (role IN (
  'aml_supervisor', 'conduct', 'prudential', 'securities', 'insurance', 'pensions',
  'central_bank', 'fiu', 'crime_enforcement', 'prosecutor', 'sanctions_tfs',
  'company_bo_registry', 'data_protection'
));

CREATE TABLE IF NOT EXISTS register_legal_instruments (
  id BIGSERIAL PRIMARY KEY,
  iso2 TEXT NOT NULL,
  category TEXT,
  title TEXT NOT NULL,
  status TEXT,
  in_force_date DATE, -- stays null unless a source states it explicitly
  source_url TEXT,
  source_id TEXT,
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

-- Phase 3 will extend regulatory_case_registry with action_type/court/case_ref
-- additively; not part of this migration (table may not exist in every env
-- this migration runs against, so it is deliberately left out here).

COMMIT;
