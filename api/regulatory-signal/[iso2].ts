import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buildRegulatorySignalEvidence, REGULATORY_SIGNAL_METHODOLOGY_VERSION } from "../../src/data/regulatorySignalExport.js";
import { authoriseDeveloperApiRequest, setDeveloperApiCache } from "../../server/services/developerApiAccess.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const access = await authoriseDeveloperApiRequest(req, res, "/api/regulatory-signal/{iso2}");
  if (!access) return;
  setDeveloperApiCache(res, access);
  const iso2 = String(req.query.iso2 ?? "").trim().toUpperCase();
  const evidence = buildRegulatorySignalEvidence(iso2);
  if (!evidence) return res.status(404).json({ error: "Jurisdiction not found" });
  return res.status(200).json(evidence);
}
