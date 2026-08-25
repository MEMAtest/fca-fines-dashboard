BEGIN;

-- Full-row evidence for the narrowly scoped FINRA legacy-source remediation.
-- The remediation script is dry-run by default and only writes this table when
-- the official-export case coverage gate passes inside the same transaction as
-- the delete.
CREATE TABLE IF NOT EXISTS public.finra_legacy_row_backup (
  remediation_id uuid NOT NULL,
  backed_up_at timestamptz NOT NULL DEFAULT now(),
  row_data jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_finra_legacy_row_backup_id
  ON public.finra_legacy_row_backup (remediation_id, backed_up_at DESC);

COMMENT ON TABLE public.finra_legacy_row_backup IS
  'Full eu_fines row evidence for reversible FINRA legacy-source remediation.';

COMMIT;
