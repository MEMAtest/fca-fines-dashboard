import type { VercelRequest, VercelResponse } from "@vercel/node";
import { parseProductFunnelEvent } from "../src/utils/productAnalyticsContract.js";
import { recordProductFunnelEvent } from "../server/services/productFunnel.js";

export function isTrustedProductEventRequest(headers: VercelRequest["headers"]) {
  if (headers["sec-fetch-site"] === "cross-site") return false;
  const origin = typeof headers.origin === "string" ? headers.origin : "";
  if (!origin) return true;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL?.trim() || "https://regactions.com";
  try {
    return new URL(origin).origin === new URL(baseUrl).origin;
  } catch {
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!isTrustedProductEventRequest(req.headers)) return res.status(403).json({ error: "Cross-site events are not accepted" });
  const contentLength = Number(req.headers["content-length"] || 0);
  if (contentLength > 4_096) return res.status(413).json({ error: "Event payload is too large" });
  const event = parseProductFunnelEvent(req.body);
  if (!event) return res.status(400).json({ error: "Invalid product event" });
  try {
    const result = await recordProductFunnelEvent(event);
    return res.status(result.recorded ? 201 : 200).json(result);
  } catch (error) {
    console.error("Product event recording failed", error instanceof Error ? error.message : error);
    return res.status(503).json({ error: "Product event recording is unavailable" });
  }
}
