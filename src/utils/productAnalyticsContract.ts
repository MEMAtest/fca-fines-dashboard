export const PRODUCT_FUNNEL_EVENT_VERSION = 1 as const;

export const PRODUCT_FUNNEL_EVENTS = [
  "evidence_opened",
  "official_source_opened",
  "evidence_basket_added",
  "evidence_export_completed",
  "board_pack_started",
  "board_pack_downloaded",
  "board_pack_advisory_opened",
  "board_pack_advisory_requested",
  "monitor_submitted",
  "monitor_verified",
  "briefing_generated",
] as const;

export type ProductFunnelEventName = typeof PRODUCT_FUNNEL_EVENTS[number];
export type ProductFunnelDimensions = Partial<{
  surface: string;
  regulator: string;
  source_status: string;
  archetype: string;
  access: string;
  format: string;
  frequency: string;
  result_status: string;
  source: string;
}>;

export interface ProductFunnelEventInput {
  eventId: string;
  eventName: ProductFunnelEventName;
  eventVersion: typeof PRODUCT_FUNNEL_EVENT_VERSION;
  dimensions: ProductFunnelDimensions;
}

const EVENT_PROPERTY_KEYS: Record<ProductFunnelEventName, ReadonlyArray<keyof ProductFunnelDimensions>> = {
  evidence_opened: ["surface", "regulator", "source_status"],
  official_source_opened: ["surface", "regulator", "source_status"],
  evidence_basket_added: ["surface", "regulator"],
  evidence_export_completed: ["surface", "format"],
  board_pack_started: ["source"],
  board_pack_downloaded: ["archetype", "access"],
  board_pack_advisory_opened: ["archetype"],
  board_pack_advisory_requested: ["archetype", "result_status"],
  monitor_submitted: ["surface", "frequency"],
  monitor_verified: ["frequency"],
  briefing_generated: ["surface", "result_status"],
};

const SOURCE_EVENT_MAP: Partial<Record<string, ProductFunnelEventName>> = {
  evidence_modal_opened: "evidence_opened",
  evidence_official_source_opened: "official_source_opened",
  evidence_basket_added: "evidence_basket_added",
  evidence_export_completed: "evidence_export_completed",
  board_pack_builder_started: "board_pack_started",
  board_pack_pdf_downloaded: "board_pack_downloaded",
  board_pack_advisory_opened: "board_pack_advisory_opened",
  board_pack_lead_saved: "board_pack_advisory_requested",
  monitor_submitted: "monitor_submitted",
  monitor_verified: "monitor_verified",
  briefing_generated: "briefing_generated",
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_VALUE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _.-]*$/;

function cleanValue(key: keyof ProductFunnelDimensions, value: unknown) {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return undefined;
  const text = String(value).trim().slice(0, 48);
  if (!text || !SAFE_VALUE_PATTERN.test(text)) return undefined;
  if (key === "regulator") return text.toUpperCase();
  return text.toLowerCase().replace(/\s+/g, "_");
}

export function buildProductFunnelEvent(
  sourceName: string,
  properties: Record<string, unknown> = {},
  eventId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : "",
): ProductFunnelEventInput | null {
  const eventName = PRODUCT_FUNNEL_EVENTS.includes(sourceName as ProductFunnelEventName)
    ? sourceName as ProductFunnelEventName
    : SOURCE_EVENT_MAP[sourceName];
  if (!eventName || !UUID_PATTERN.test(eventId)) return null;
  const dimensions: ProductFunnelDimensions = {};
  for (const key of EVENT_PROPERTY_KEYS[eventName]) {
    const value = cleanValue(key, properties[key]);
    if (value !== undefined) dimensions[key] = value;
  }
  return { eventId, eventName, eventVersion: PRODUCT_FUNNEL_EVENT_VERSION, dimensions };
}

export function parseProductFunnelEvent(value: unknown): ProductFunnelEventInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!UUID_PATTERN.test(String(input.eventId || ""))) return null;
  if (!PRODUCT_FUNNEL_EVENTS.includes(input.eventName as ProductFunnelEventName)) return null;
  if (input.eventVersion !== PRODUCT_FUNNEL_EVENT_VERSION) return null;
  const rawDimensions = input.dimensions && typeof input.dimensions === "object" && !Array.isArray(input.dimensions)
    ? input.dimensions as Record<string, unknown>
    : {};
  return buildProductFunnelEvent(
    String(input.eventName),
    rawDimensions,
    String(input.eventId),
  );
}
