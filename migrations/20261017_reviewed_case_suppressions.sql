-- Preserve original source rows while excluding reviewed fixtures and superseded
-- rows from public aggregates. Deleting a suppression restores the source row.
BEGIN;
CREATE TABLE IF NOT EXISTS public.regulatory_case_suppressions (
  source_row_id text PRIMARY KEY,
  regulator text NOT NULL,
  reason text NOT NULL,
  replacement_source_row_id text,
  reviewed_at timestamptz NOT NULL DEFAULT now()
);
DO $$
DECLARE definition text;
BEGIN
  SELECT pg_get_viewdef('public.all_regulatory_fines_trusted'::regclass, true) INTO definition;
  IF definition NOT LIKE '%regulatory_case_suppressions%' THEN
    EXECUTE 'CREATE OR REPLACE VIEW public.all_regulatory_fines_trusted AS '
      || regexp_replace(definition, ';[[:space:]]*$', '')
      || ' WHERE NOT EXISTS (SELECT 1 FROM public.regulatory_case_suppressions suppression WHERE suppression.source_row_id = canonical.id::text)';
  END IF;
END $$;
COMMIT;
