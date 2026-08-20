import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buildRegulatorySignalEvidence, REGULATORY_SIGNAL_METHODOLOGY_VERSION } from "../../src/data/regulatorySignalExport.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const iso2 = String(req.query.iso2 ?? "").trim().toUpperCase();
  const evidence = buildRegulatorySignalEvidence(iso2);
  if (!evidence) return res.status(404).json({ error: "Jurisdiction not found" });
  return res.status(200).json(evidence);
}
