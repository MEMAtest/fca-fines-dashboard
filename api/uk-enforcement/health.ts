import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getUKEnforcementHealth } from "../../server/services/ukEnforcementHealth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const result = await getUKEnforcementHealth();
    return res.status(200).json(result);
  } catch (error) {
    console.error("UK enforcement health error:", error);
    return res.status(500).json({
      success: false,
      error: "UK enforcement health failed",
    });
  }
}
