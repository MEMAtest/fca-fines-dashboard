import type { VercelRequest, VercelResponse } from "@vercel/node";
import { BoardPackEvidenceInputError, getBoardPackEvidence } from "../../server/services/boardPackEvidence.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const result = await getBoardPackEvidence({
      profile: req.body?.profile,
      selectedCaseIds: req.body?.selectedCaseIds,
    });
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof BoardPackEvidenceInputError || (error instanceof Error && "issues" in error)) {
      return res.status(400).json({ error: error.message });
    }
    console.error("Board Pack evidence error:", error instanceof Error ? error.message : error);
    return res.status(500).json({ error: "Failed to retrieve Board Pack evidence" });
  }
}
