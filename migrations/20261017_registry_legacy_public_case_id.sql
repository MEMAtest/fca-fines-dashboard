-- Preserve externally visible fallback case IDs when a verified amount
-- override changes an amount-bearing canonical fingerprint. Keep the trusted
-- view's current projection and predicates (including reviewed suppressions)
-- by editing its live definition instead of replacing it with a stale copy.

BEGIN;

ALTER TABLE public.regulatory_case_registry
  ADD COLUMN IF NOT EXISTS legacy_public_case_id text;

COMMENT ON COLUMN public.regulatory_case_registry.legacy_public_case_id IS
  'Previously visible canonical case ID retained when source corrections change the amount-bearing canonical fingerprint.';

DO $$
DECLARE
  definition text;
  rewritten text;
  legacy_expression text := 'COALESCE(source_registry.legacy_public_case_id, source_registry.public_case_id::text, fingerprint_alias.public_case_id::text, canonical.canonical_case_id)';
BEGIN
  SELECT pg_get_viewdef('public.all_regulatory_fines_trusted'::regclass, true)
    INTO definition;

  -- Match the current public-ID expression while allowing pg_get_viewdef to
  -- choose its own whitespace. Fail closed if the expected expression moved
  -- or changed; do not install a partial/stale trusted view.
  rewritten := regexp_replace(
    definition,
    'COALESCE\(source_registry\.public_case_id::text,[[:space:]]*fingerprint_alias\.public_case_id::text,[[:space:]]*canonical\.canonical_case_id\)',
    legacy_expression,
    'g'
  );
  IF rewritten = definition THEN
    RAISE EXCEPTION 'Could not safely locate public_case_id expression in all_regulatory_fines_trusted';
  END IF;

  -- #352 added this predicate to keep reviewed/superseded cases out of public
  -- aggregates. Retain it if already present; otherwise apply the same gate.
  IF rewritten NOT LIKE '%regulatory_case_suppressions%' THEN
    rewritten := rewritten || E'\nWHERE NOT EXISTS (SELECT 1 FROM public.regulatory_case_suppressions suppression WHERE suppression.source_row_id = canonical.id::text)';
  END IF;

  EXECUTE 'CREATE OR REPLACE VIEW public.all_regulatory_fines_trusted AS ' || rewritten;
END $$;

COMMIT;
