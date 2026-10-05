import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buildPublicBenchmarkReport } from "../../scripts/country-risk/report-public-benchmark.js";
import { authoriseDeveloperApiRequest, setDeveloperApiCache } from "../../server/services/developerApiAccess.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const access = await authoriseDeveloperApiRequest(req, res, "/api/country-risk/benchmark");
  if (!access) return;
  setDeveloperApiCache(res, access);

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
