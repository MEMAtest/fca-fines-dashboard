import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSqlClient } from "../../server/db.js";

const sql = getSqlClient();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = String(req.query.token || req.body?.token || "");
  if (!UUID_PATTERN.test(token)) return res.status(400).json({ error: "A valid management token is required" });
  if (req.method === "GET") {
    const [monitor] = await sql`SELECT id, label, scope, frequency, status, last_run_at, last_result_count, new_item_count, created_at FROM public.monitor_profiles WHERE management_token = ${token}::uuid`;
    return monitor ? res.status(200).json({ monitor }) : res.status(404).json({ error: "Monitor not found" });
  }
  if (req.method === "PATCH") {
    const status = req.body?.status === "paused" ? "paused" : req.body?.status === "active" ? "active" : null;
    const frequency = ["daily", "weekly", "monthly"].includes(req.body?.frequency) ? req.body.frequency : null;
    if (!status && !frequency) return res.status(400).json({ error: "No valid update supplied" });
    const [monitor] = await sql`UPDATE public.monitor_profiles SET status = COALESCE(${status}, status), frequency = COALESCE(${frequency}, frequency), updated_at = now() WHERE management_token = ${token}::uuid RETURNING id, label, scope, frequency, status, last_run_at, last_result_count, new_item_count`;
    return monitor ? res.status(200).json({ monitor }) : res.status(404).json({ error: "Monitor not found" });
  }
  if (req.method === "DELETE") {
    const [monitor] = await sql`UPDATE public.monitor_profiles SET status = 'unsubscribed', updated_at = now() WHERE management_token = ${token}::uuid RETURNING id`;
    return monitor ? res.status(200).json({ success: true }) : res.status(404).json({ error: "Monitor not found" });
  }
  return res.status(405).json({ error: "Method not allowed" });
}
