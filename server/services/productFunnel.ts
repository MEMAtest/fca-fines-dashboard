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

export interface ProductFunnelReportRow {
  event_name: string;
  surface: string | null;
  regulator_code: string | null;
  event_count: number;
}

export interface ProductFunnelStageReport {
  surface: string;
  regulator: string;
  visit: number;
  comparison_or_drilldown: number;
  evidence_open: number;
  official_source_open: number;
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
       result_status, source, view_name, filter_dimension, filter_action,
       filter_count, selection_dimension, selection_action, selection_count,
       comparator, year_value
     ) VALUES (
       $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
       $13, $14, $15, $16, $17, $18, $19, $20, $21
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
      event.dimensions.view ?? null,
      event.dimensions.filter_dimension ?? null,
      event.dimensions.filter_action ?? null,
      event.dimensions.filter_count ?? null,
      event.dimensions.selection_dimension ?? null,
      event.dimensions.selection_action ?? null,
      event.dimensions.selection_count ?? null,
      event.dimensions.comparator ?? null,
      event.dimensions.year ?? null,
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

/**
 * Build the issue #20 funnel without retaining or returning raw event data.
 * A report row is scoped only by workspace surface and regulator code, then
 * reduced to the four product stages needed for a 7-day journey view.
 */
export function buildProductFunnelReport(
  rows: ProductFunnelReportRow[],
  days = 7,
): { days: number; stages: ProductFunnelStageReport[] } {
  const boundedDays = Math.max(1, Math.min(365, Math.round(days)));
  const grouped = new Map<string, ProductFunnelStageReport>();
  for (const row of rows) {
    const surface = row.surface || "unknown";
    const regulator = row.regulator_code || "ALL";
    const key = `${surface}\u0000${regulator}`;
    const current = grouped.get(key) ?? {
      surface,
      regulator,
      visit: 0,
      comparison_or_drilldown: 0,
      evidence_open: 0,
      official_source_open: 0,
    };
    const count = Number(row.event_count) || 0;
    if (row.event_name === "fines_workspace_opened" || row.event_name === "regulator_workspace_opened") {
      current.visit += count;
    } else if (
      row.event_name === "comparison_mode_entered" ||
      row.event_name === "comparison_selection_changed" ||
      row.event_name === "comparison_data_opened" ||
      row.event_name === "evidence_drawer_opened"
    ) {
      current.comparison_or_drilldown += count;
    } else if (row.event_name === "evidence_opened") {
      current.evidence_open += count;
    } else if (row.event_name === "official_source_opened") {
      current.official_source_open += count;
    }
    grouped.set(key, current);
  }
  return {
    days: boundedDays,
    stages: [...grouped.values()].sort((left, right) =>
      `${left.surface}:${left.regulator}`.localeCompare(`${right.surface}:${right.regulator}`),
    ),
  };
}

export async function loadProductFunnelReport(sql: SqlClient = getSqlClient(), days = 7) {
  const boundedDays = Math.max(1, Math.min(365, Math.round(days)));
  const rows = await sql(
    `SELECT event_name, surface, regulator_code, COUNT(*)::int AS event_count
     FROM public.product_funnel_events
     WHERE created_at >= now() - ($1::int * interval '1 day')
     GROUP BY event_name, surface, regulator_code
     ORDER BY surface, regulator_code, event_name`,
    [boundedDays],
  ) as unknown as ProductFunnelReportRow[];
  return buildProductFunnelReport(rows, boundedDays);
}
