import { track } from "@vercel/analytics";
import { buildProductFunnelEvent } from "./productAnalyticsContract.js";

type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

export function trackEvent(name: string, properties: AnalyticsProperties = {}) {
  const blockedKeys = /(?:email|name|firm|organisation|organization|query|summary|url|token|message)/i;
  const safeProperties = Object.fromEntries(
    Object.entries(properties).reduce<Array<[string, string | number | boolean]>>((entries, [key, value]) => {
      if (blockedKeys.test(key) || value === undefined || value === null) return entries;
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed || trimmed.length > 80 || trimmed.includes("@") || /^https?:/i.test(trimmed)) return entries;
        entries.push([key, trimmed]);
        return entries;
      }
      if (typeof value === "number" || typeof value === "boolean") entries.push([key, value]);
      return entries;
    }, []),
  ) as AnalyticsProperties;
  try {
    track(name, safeProperties);
  } catch {
    // Analytics should never block user actions or local development.
  }

  const productEvent = buildProductFunnelEvent(name, properties);
  if (!productEvent || typeof fetch !== "function") return;
  void fetch("/api/product-events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(productEvent),
    keepalive: true,
  }).catch(() => {
    // Product measurement must never block a user journey.
  });
}
