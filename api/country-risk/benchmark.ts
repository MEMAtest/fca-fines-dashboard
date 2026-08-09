import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buildPublicBenchmarkReport } from "../../scripts/country-risk/report-public-benchmark.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  return res.status(200).json({
    methodology: "public-band-directional-comparison",
    limitations: [
      "Know Your Country numeric scores are not public and have not been inferred.",
      "Public bands are directional evidence, not calibration targets.",
      "The coverage-count difference requires jurisdiction-by-jurisdiction reconciliation.",
    ],
    report: buildPublicBenchmarkReport(),
  });
}
