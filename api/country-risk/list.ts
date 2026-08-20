import type { VercelRequest, VercelResponse } from "@vercel/node";
import { pageCountries } from "../../src/data/countryView.js";
import { computeCountryRiskV2, COUNTRY_RISK_METHODOLOGY_VERSION } from "../../src/data/countryRiskV2.js";
import { computeCountryRiskV3 } from "../../src/data/countryRiskV3.js";
import { resolveCountryRiskMethodology, CURRENT_COUNTRY_RISK_METHODOLOGY_VERSION } from "../../src/data/countryRiskMethodology.js";
import { computeCountryRiskScore } from "../../src/data/countryRiskScore.js";
import { countryRiskSourcesForMethodology } from "../../src/data/countryRiskSources.js";
import { assessCountryRiskReadiness } from "../../src/data/countryRiskReadiness.js";
import { buildCountryRiskPublicSurface } from "../../src/data/countryRiskSurface.js";
import { getCountryRiskOperationalHealth } from "../../server/services/countryRiskOperationalHealth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const requested = req.query.methodology == null ? null : String(req.query.methodology);
  let methodology: "v2" | "v3";
  try {
    methodology = resolveCountryRiskMethodology(requested);
  } catch {
    return res.status(400).json({ error: `Unsupported methodology: ${requested}` });
  }
  const asOf = new Date();
  const sources = countryRiskSourcesForMethodology(methodology, asOf);
  const results = pageCountries()
    .map((country) => {
      const result = methodology === "v3"
        ? computeCountryRiskV3(country.iso2, { asOf })
        : computeCountryRiskV2(country.iso2, { asOf });
      const previous = methodology === "v3" ? computeCountryRiskV2(country.iso2, { asOf }) : computeCountryRiskScore(country.iso2);
      const previousScore = "hasGovernance" in previous
        ? (previous.hasGovernance ? previous.score : null)
        : previous.score;
      return {
        country,
        result,
        surface: buildCountryRiskPublicSurface(country.iso2, asOf),
        previous: {
          methodologyVersion: methodology === "v3" ? COUNTRY_RISK_METHODOLOGY_VERSION : "1.0.0",
          score: previousScore,
          band: "hasGovernance" in previous
            ? (previous.hasGovernance ? previous.band : null)
            : previous.band,
          status: "hasGovernance" in previous
            ? (previous.hasGovernance ? "rated" : "insufficient-data")
            : previous.status,
        },
        change: result.score === null || previousScore === null
          ? null
          : Math.round((result.score - previousScore) * 10) / 10,
      };
    })
    .sort((a, b) => (b.result.score ?? -1) - (a.result.score ?? -1) || a.country.name.localeCompare(b.country.name));
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600");
  const readiness = assessCountryRiskReadiness(results.map(({ result }) => result), sources);
  const { sourceHealth } = await getCountryRiskOperationalHealth(asOf, sources);
  return res.status(200).json({
    methodologyVersion: methodology === "v3" ? CURRENT_COUNTRY_RISK_METHODOLOGY_VERSION : COUNTRY_RISK_METHODOLOGY_VERSION,
    calculatedAt: asOf.toISOString(),
    count: results.length,
    // `snapshotReady` describes the approved model inputs. `sourcesCurrent`
    // describes whether the operational source checks remain current. Only
    // their conjunction is safe to present as default-ready.
    readyForDefault: readiness.readyForDefault && sourceHealth.readyForScoring,
    snapshotReady: readiness.readyForDefault,
    sourcesCurrent: sourceHealth.readyForScoring,
    readinessReasons: [...readiness.reasons, ...sourceHealth.issues.map((issue) => issue.message)],
    coverage: readiness.coverage,
    sources,
    results,
  });
}
