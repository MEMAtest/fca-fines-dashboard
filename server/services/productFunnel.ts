import type { SqlClient } from "../db.js";
import { getSqlClient } from "../db.js";
import {
  parseProductFunnelEvent,
  type ProductFunnelEventInput,
} from "../../src/utils/productAnalyticsContract.js";

export interface ProductFunnelSummaryRow extends Record<string, unknown> {
  event_name: string;
  event_count: number;
  unique_events: number;
}

export async function recordProductFunnelEvent(
  rawEvent: ProductFunnelEventInput | unknown,
  sql: SqlClient = getSqlClient(),
) {
  const event = parseProductFunnelEvent(rawEvent);
  if (!event) throw new Error("Invalid product funnel event");
  const result = await sql(
    `INSERT INTO public.product_funnel_events (
       event_id, event_name, event_version, surface, regulator_code,
       source_status, archetype, access_mode, export_format, frequency,
       result_status, source
     ) VALUES (
       $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
     )
     ON CONFLICT (event_id) DO NOTHING
     RETURNING id`,
    [
      event.eventId,
      event.eventName,
      event.eventVersion,
      event.dimensions.surface ?? null,
      event.dimensions.regulator ?? null,
      event.dimensions.source_status ?? null,
      event.dimensions.archetype ?? null,
      event.dimensions.access ?? null,
      event.dimensions.format ?? null,
      event.dimensions.frequency ?? null,
      event.dimensions.result_status ?? null,
      event.dimensions.source ?? null,
    ],
  );
  return { recorded: Boolean(result[0]), eventName: event.eventName };
}

export async function loadProductFunnelSummary(sql: SqlClient = getSqlClient(), days = 30) {
  const boundedDays = Math.max(1, Math.min(365, Math.round(days)));
  const rows = await sql(
    `SELECT event_name, COUNT(*)::int AS event_count, COUNT(DISTINCT event_id)::int AS unique_events
     FROM public.product_funnel_events
     WHERE created_at >= now() - ($1::int * interval '1 day')
     GROUP BY event_name
     ORDER BY event_name`,
    [boundedDays],
  ) as ProductFunnelSummaryRow[];
  return { days: boundedDays, events: rows };
}
