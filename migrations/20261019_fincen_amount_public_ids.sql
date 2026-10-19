-- Preserve every currently visible FinCEN case URL before PDF-backed amounts
-- change the amount-bearing canonical fingerprint. The trusted view introduced
-- by 20261017_registry_legacy_public_case_id.sql gives this text ID precedence.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'regulatory_case_registry'
      AND column_name = 'legacy_public_case_id'
  ) THEN
    RAISE EXCEPTION 'Apply 20261017_registry_legacy_public_case_id.sql before preserving FinCEN IDs';
  END IF;
END $$;

INSERT INTO public.regulatory_case_registry (
  source_row_id,
  current_fingerprint,
  legacy_public_case_id
)
SELECT
  canonical.id::text,
  canonical.canonical_case_id,
  trusted.public_case_id
FROM public.all_regulatory_fines_canonical AS canonical
JOIN public.all_regulatory_fines_trusted AS trusted
  ON trusted.id = canonical.id
WHERE upper(canonical.regulator) = 'FINCEN'
ON CONFLICT (source_row_id) DO UPDATE SET
  legacy_public_case_id = COALESCE(
    public.regulatory_case_registry.legacy_public_case_id,
    EXCLUDED.legacy_public_case_id
  ),
  updated_at = now();

COMMIT;
