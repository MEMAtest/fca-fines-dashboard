import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  getFcaFineCaseById,
  isValidFcaFineCaseId,
} from "../../server/services/fcaFineCases.js";

export function parseFcaFineCaseId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const caseId = value.trim().toLowerCase();
  return isValidFcaFineCaseId(caseId) ? caseId : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Allow", "GET, OPTIONS");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const caseId = parseFcaFineCaseId(req.query.caseId);
  if (!caseId) {
    return res.status(400).json({ success: false, error: "Invalid FCA fine case ID" });
  }

  try {
    const record = await getFcaFineCaseById(caseId);
    if (!record) {
      return res.status(404).json({ success: false, error: "FCA fine case not found" });
    }

    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).json({ success: true, data: record });
  } catch (error) {
    console.error("FCA fine case endpoint error", {
      caseId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return res.status(500).json({ success: false, error: "Failed to fetch FCA fine case" });
  }
}
