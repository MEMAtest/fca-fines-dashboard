-- Supports the shared "first row per regulator" lookup used by the monitor and
-- alert freshness rule (server/services/freshRows.ts). Idempotent. Must run
-- after any migration that rebuilds all_regulatory_fines_canonical.
CREATE INDEX IF NOT EXISTS idx_all_regulatory_fines_canonical_regulator_created
  ON public.all_regulatory_fines_canonical(regulator, created_at);
