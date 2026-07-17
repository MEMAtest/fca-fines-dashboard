import type { VercelRequest, VercelResponse } from "@vercel/node";
import { pageCountries } from "../../src/data/countryView.js";
import { computeCountryRiskV2, COUNTRY_RISK_METHODOLOGY_VERSION } from "../../src/data/countryRiskV2.js";
import { computeCountryRiskScore } from "../../src/data/countryRiskScore.js";
import { countryRiskSourcesAsOf } from "../../src/data/countryRiskSources.js";
import { assessCountryRiskReadiness } from "../../src/data/countryRiskReadiness.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const requested = String(req.query.methodology ?? COUNTRY_RISK_METHODOLOGY_VERSION);
  if (requested !== "v2" && requested !== COUNTRY_RISK_METHODOLOGY_VERSION) {
    return res.status(400).json({ error: `Unsupported methodology: ${requested}` });
  }
  const asOf = new Date();
  const sources = countryRiskSourcesAsOf(asOf);
  const results = pageCountries()
    .map((country) => {
      const result = computeCountryRiskV2(country.iso2, { asOf });
      const previous = computeCountryRiskScore(country.iso2);
      const previousScore = previous.hasGovernance ? previous.score : null;
      return {
        country,
        result,
        previous: {
          methodologyVersion: "1.0.0",
          score: previousScore,
          band: previous.hasGovernance ? previous.band : null,
          status: previous.hasGovernance ? "rated" : "insufficient-data",
        },
        change: result.score === null || previousScore === null
          ? null
          : Math.round((result.score - previousScore) * 10) / 10,
      };
    })
    .sort((a, b) => (b.result.score ?? -1) - (a.result.score ?? -1) || a.country.name.localeCompare(b.country.name));
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600");
  const readiness = assessCountryRiskReadiness(results.map(({ result }) => result), sources);
  return res.status(200).json({
    methodologyVersion: COUNTRY_RISK_METHODOLOGY_VERSION,
    calculatedAt: asOf.toISOString(),
    count: results.length,
    readyForDefault: readiness.readyForDefault,
    readinessReasons: readiness.reasons,
    coverage: readiness.coverage,
    sources,
    results,
  });
}
