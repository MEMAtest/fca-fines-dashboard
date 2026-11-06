-- all_regulatory_fines_canonical honoured regulatory_case_suppressions for FMANZ only, so a
-- reviewed suppression of any other regulator's row still reached rankings, hub top-fines and
-- topic pages that read the canonical view (only _trusted applied it). This rebuilds the
-- canonical materialised view from its CURRENT definition with the FMANZ-only guard widened to
-- all regulators, recreates its indexes, the dependent _trusted view and grants. Deleting a
-- suppression row restores the source row. Runs in one transaction.
BEGIN;

DO $$
DECLARE
  canon_def text;
  trusted_def text;
  new_def text;
  idx record;
  idx_defs text[] := ARRAY[]::text[];
BEGIN
  SELECT pg_get_viewdef('public.all_regulatory_fines_canonical'::regclass) INTO canon_def;
  SELECT pg_get_viewdef('public.all_regulatory_fines_trusted'::regclass) INTO trusted_def;

  new_def := regexp_replace(
    canon_def,
    '\(NOT \(\(upper\(identified\.regulator\) = ''FMANZ''::text\) AND \(EXISTS \( SELECT 1\s+FROM regulatory_case_suppressions suppression\s+WHERE \(\(suppression\.source_row_id = identified\.id\) AND \(upper\(suppression\.regulator\) = ''FMANZ''::text\)\)\)\)\)\)',
    '(NOT (EXISTS ( SELECT 1 FROM regulatory_case_suppressions suppression WHERE (suppression.source_row_id = identified.id))))'
  );
  IF new_def = canon_def THEN
    IF canon_def LIKE '%suppression.source_row_id = identified.id))))%' AND canon_def NOT LIKE '%FMANZ''::text))))))%' THEN
      RAISE NOTICE 'canonical view already honours all suppressions; nothing to do';
      RETURN;
    END IF;
    RAISE EXCEPTION 'could not locate the FMANZ-only suppression guard in the canonical view definition';
  END IF;

  FOR idx IN SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'all_regulatory_fines_canonical' LOOP
    idx_defs := idx_defs || idx.indexdef;
  END LOOP;

  DROP VIEW public.all_regulatory_fines_trusted;
  DROP MATERIALIZED VIEW public.all_regulatory_fines_canonical;
  EXECUTE 'CREATE MATERIALIZED VIEW public.all_regulatory_fines_canonical AS ' || regexp_replace(new_def, ';\s*$', '') || ' WITH DATA';
  FOREACH canon_def IN ARRAY idx_defs LOOP
    EXECUTE canon_def;
  END LOOP;
  EXECUTE 'CREATE VIEW public.all_regulatory_fines_trusted AS ' || regexp_replace(trusted_def, ';\s*$', '');

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fca_app') THEN
    GRANT SELECT ON public.all_regulatory_fines_canonical TO fca_app;
    GRANT SELECT ON public.all_regulatory_fines_trusted TO fca_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'monitor_readonly') THEN
    GRANT SELECT ON public.all_regulatory_fines_canonical TO monitor_readonly;
    GRANT SELECT ON public.all_regulatory_fines_trusted TO monitor_readonly;
  END IF;
END $$;

COMMIT;
