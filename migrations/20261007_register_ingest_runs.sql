-- Phase 2 follow-up: a run-log for staleness budgets. Decoupled from
-- register_sanctions_snapshots / register_change_log (which record DATA, not
-- "we checked and nothing changed"), so a quiet period never reads as stale.
-- Additive, idempotent.

CREATE TABLE IF NOT EXISTS register_ingest_runs (
  id SERIAL PRIMARY KEY,
  lane TEXT NOT NULL,            -- 'sanctions' | 'fatf'
  status TEXT NOT NULL,          -- 'success' | 'error'
  detail TEXT,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_register_ingest_runs_lane
  ON register_ingest_runs (lane, completed_at DESC);
