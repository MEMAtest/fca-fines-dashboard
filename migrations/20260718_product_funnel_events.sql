BEGIN;

CREATE TABLE IF NOT EXISTS public.product_funnel_events (
  id bigserial PRIMARY KEY,
  event_id uuid NOT NULL UNIQUE,
  event_name text NOT NULL CHECK (event_name IN (
    'evidence_opened',
    'official_source_opened',
    'evidence_basket_added',
    'evidence_export_completed',
    'board_pack_started',
    'board_pack_downloaded',
    'board_pack_advisory_opened',
    'board_pack_advisory_requested',
    'monitor_submitted',
    'monitor_verified',
    'briefing_generated'
  )),
  event_version smallint NOT NULL DEFAULT 1,
  surface text,
  regulator_code text,
  source_status text,
  archetype text,
  access_mode text,
  export_format text,
  frequency text,
  result_status text,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(COALESCE(surface, '')) <= 48),
  CHECK (length(COALESCE(regulator_code, '')) <= 48),
  CHECK (length(COALESCE(source_status, '')) <= 48),
  CHECK (length(COALESCE(archetype, '')) <= 48),
  CHECK (length(COALESCE(access_mode, '')) <= 48),
  CHECK (length(COALESCE(export_format, '')) <= 48),
  CHECK (length(COALESCE(frequency, '')) <= 48),
  CHECK (length(COALESCE(result_status, '')) <= 48),
  CHECK (length(COALESCE(source, '')) <= 48)
);

CREATE INDEX IF NOT EXISTS idx_product_funnel_events_created
  ON public.product_funnel_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_funnel_events_name_created
  ON public.product_funnel_events(event_name, created_at DESC);

CREATE OR REPLACE VIEW public.product_funnel_daily AS
SELECT
  date_trunc('day', created_at) AS event_day,
  event_name,
  surface,
  COUNT(*)::int AS event_count
FROM public.product_funnel_events
GROUP BY date_trunc('day', created_at), event_name, surface;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fca_app') THEN
    GRANT SELECT, INSERT ON public.product_funnel_events TO fca_app;
    GRANT USAGE, SELECT ON SEQUENCE public.product_funnel_events_id_seq TO fca_app;
    GRANT SELECT ON public.product_funnel_daily TO fca_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'monitor_readonly') THEN
    GRANT SELECT ON public.product_funnel_events, public.product_funnel_daily TO monitor_readonly;
  END IF;
END
$$;

COMMIT;
