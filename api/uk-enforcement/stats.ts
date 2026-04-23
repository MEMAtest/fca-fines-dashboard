import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getUKEnforcementStats } from "../../server/services/ukEnforcement.js";

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
    const result = await getUKEnforcementStats(
      req.query as Record<string, string>,
    );
    return res.status(200).json(result);
  } catch (error) {
    console.error("UK enforcement stats error:", error);
    return res.status(500).json({
      success: false,
      error: "UK enforcement stats failed",
    });
  }
}

