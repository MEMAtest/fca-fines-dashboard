import type { VercelRequest, VercelResponse } from "@vercel/node";
import { pageCountries } from "../../src/data/countryView.js";
import { computeCountryRiskV2, COUNTRY_RISK_METHODOLOGY_VERSION } from "../../src/data/countryRiskV2.js";
import { computeCountryRiskScore } from "../../src/data/countryRiskScore.js";
import { COUNTRY_RISK_SOURCES } from "../../src/data/countryRiskSources.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const requested = String(req.query.methodology ?? COUNTRY_RISK_METHODOLOGY_VERSION);
  if (requested !== "v2" && requested !== COUNTRY_RISK_METHODOLOGY_VERSION) {
    return res.status(400).json({ error: `Unsupported methodology: ${requested}` });
  }
  const results = pageCountries()
    .map((country) => {
      const result = computeCountryRiskV2(country.iso2);
      const previous = computeCountryRiskScore(country.iso2);
      return {
        country,
        result,
        previous: { methodologyVersion: "1.0.0", score: previous.score, band: previous.band },
        change: result.score === null ? null : Math.round((result.score - previous.score) * 10) / 10,
      };
    })
    .sort((a, b) => (b.result.score ?? -1) - (a.result.score ?? -1) || a.country.name.localeCompare(b.country.name));
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600");
  return res.status(200).json({
    methodologyVersion: COUNTRY_RISK_METHODOLOGY_VERSION,
    count: results.length,
    sources: COUNTRY_RISK_SOURCES,
    results,
  });
}
