BEGIN;

-- Issue #20 adds workspace interaction events to the existing privacy-safe
-- funnel. The dimensions are categorical or bounded counts only: no query,
-- firm, email, message, or URL fields are accepted by the event contract.
ALTER TABLE public.product_funnel_events
  ADD COLUMN IF NOT EXISTS view_name text,
  ADD COLUMN IF NOT EXISTS filter_dimension text,
  ADD COLUMN IF NOT EXISTS filter_action text,
  ADD COLUMN IF NOT EXISTS filter_count integer,
  ADD COLUMN IF NOT EXISTS selection_dimension text,
  ADD COLUMN IF NOT EXISTS selection_action text,
  ADD COLUMN IF NOT EXISTS selection_count integer,
  ADD COLUMN IF NOT EXISTS comparator text,
  ADD COLUMN IF NOT EXISTS year_value integer;

ALTER TABLE public.product_funnel_events
  DROP CONSTRAINT IF EXISTS product_funnel_events_event_name_check;

ALTER TABLE public.product_funnel_events
  ADD CONSTRAINT product_funnel_events_event_name_check CHECK (event_name IN (
    'evidence_opened',
    'evidence_drawer_opened',
    'official_source_opened',
    'evidence_basket_added',
    'evidence_export_completed',
    'fines_workspace_opened',
    'regulator_workspace_opened',
    'workspace_filter_changed',
    'comparison_mode_entered',
    'comparison_selection_changed',
    'comparison_data_opened',
    'comparison_link_copied',
    'regulator_comparator_changed',
    'regulator_year_changed',
    'board_pack_started',
    'board_pack_downloaded',
    'board_pack_advisory_opened',
    'board_pack_advisory_requested',
    'monitor_submitted',
    'monitor_verified',
    'briefing_generated'
  ));

ALTER TABLE public.product_funnel_events
  ADD CONSTRAINT product_funnel_events_filter_count_check CHECK (filter_count IS NULL OR filter_count BETWEEN 0 AND 10000),
  ADD CONSTRAINT product_funnel_events_selection_count_check CHECK (selection_count IS NULL OR selection_count BETWEEN 0 AND 10000),
  ADD CONSTRAINT product_funnel_events_year_value_check CHECK (year_value IS NULL OR year_value BETWEEN 1900 AND 2200);

COMMIT;
