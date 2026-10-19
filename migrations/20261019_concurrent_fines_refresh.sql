-- Keep public reads available while scraper runs refresh the unified fine
-- corpus. PostgreSQL permits CONCURRENTLY only for populated materialized
-- views with at least one valid, full, non-expression unique index.
BEGIN;

DO $$
DECLARE
  view_name text;
  view_oid oid;
BEGIN
  FOREACH view_name IN ARRAY ARRAY[
    'public.all_regulatory_fines',
    'public.all_regulatory_fines_canonical'
  ] LOOP
    view_oid := to_regclass(view_name);
    IF view_oid IS NULL OR NOT EXISTS (
      SELECT 1
      FROM pg_class AS matview
      WHERE matview.oid = view_oid
        AND matview.relkind = 'm'
        AND matview.relispopulated
    ) THEN
      RAISE EXCEPTION 'Cannot enable concurrent refresh: % is missing, not a materialized view, or unpopulated', view_name;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_index AS index_info
      WHERE index_info.indrelid = view_oid
        AND index_info.indisunique
        AND index_info.indisvalid
        AND index_info.indisready
        AND index_info.indpred IS NULL
        AND index_info.indexprs IS NULL
    ) THEN
      RAISE EXCEPTION 'Cannot enable concurrent refresh: % lacks a valid full unique index on named columns', view_name;
    END IF;
  END LOOP;
END;
$$;

-- Both refreshes intentionally remain in this single function statement. The
-- source and canonical snapshots therefore commit or roll back together, while
-- PostgreSQL's CONCURRENTLY mode permits readers during each refresh.
CREATE OR REPLACE FUNCTION public.refresh_all_fines()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.all_regulatory_fines;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.all_regulatory_fines_canonical;
END;
$$;

COMMENT ON FUNCTION public.refresh_all_fines() IS
  'Refreshes the source and canonical enforcement materialized views concurrently in one transaction; requires full unique indexes on both views.';

COMMIT;

-- Rollback backup: restore the previous blocking refresh implementation with:
-- CREATE OR REPLACE FUNCTION public.refresh_all_fines()
-- RETURNS void AS $$
-- BEGIN
--   REFRESH MATERIALIZED VIEW public.all_regulatory_fines;
--   REFRESH MATERIALIZED VIEW public.all_regulatory_fines_canonical;
-- END;
-- $$ LANGUAGE plpgsql;
