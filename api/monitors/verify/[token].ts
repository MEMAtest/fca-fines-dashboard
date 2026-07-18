import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "node:crypto";
import { getSqlClient } from "../../../server/db.js";
import { recordProductFunnelEvent } from "../../../server/services/productFunnel.js";
import { buildProductFunnelEvent } from "../../../src/utils/productAnalyticsContract.js";

const sql = getSqlClient();
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL?.trim() || "https://regactions.com";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const token = String(req.query.token || "");
  if (!UUID_PATTERN.test(token)) return res.redirect(`${BASE_URL}/monitor?status=invalid`);
  const [monitor] = await sql`
    UPDATE public.monitor_profiles
    SET status = 'active', last_delivery_status = 'verified', updated_at = now()
    WHERE verification_token = ${token}::uuid
      AND verification_expires_at > now()
      AND status = 'pending'
    RETURNING management_token, frequency
  `.catch(() => []);
  if (!monitor) return res.redirect(`${BASE_URL}/monitor?status=invalid`);
  const funnelEvent = buildProductFunnelEvent("monitor_verified", {
    frequency: monitor.frequency,
  }, randomUUID());
  if (funnelEvent) void recordProductFunnelEvent(funnelEvent, sql).catch(() => undefined);
  return res.redirect(`${BASE_URL}/monitor?token=${monitor.management_token}&status=verified`);
}
