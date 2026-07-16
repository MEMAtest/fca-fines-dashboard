import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getCountryByIso2 } from "../../src/data/countries.js";
import { computeCountryRiskV2, COUNTRY_RISK_METHODOLOGY_VERSION } from "../../src/data/countryRiskV2.js";
import { getCpi, CPI_LICENCE, CPI_SOURCE, CPI_YEAR } from "../../src/data/cpiData.js";
import { computeCountryRiskScore } from "../../src/data/countryRiskScore.js";
import { COUNTRY_RISK_SOURCES } from "../../src/data/countryRiskSources.js";
import { getSanctionsRegimeCandidates } from "../../src/data/sanctionsRegimeCandidates.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const iso2 = String(req.query.iso2 ?? "").toUpperCase();
  const methodology = String(req.query.methodology ?? "v2");
  if (methodology !== "v2" && methodology !== COUNTRY_RISK_METHODOLOGY_VERSION) {
    return res.status(400).json({ error: `Unsupported methodology: ${methodology}` });
  }
  const country = getCountryByIso2(iso2);
  if (!country) return res.status(404).json({ error: "Country not found" });
  const result = computeCountryRiskV2(iso2);
  const previous = computeCountryRiskScore(iso2);
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600");
  return res.status(200).json({
    country,
    result,
    previous: { methodologyVersion: "1.0.0", score: previous.score, band: previous.band },
    change: result.score === null ? null : {
      points: Math.round((result.score - previous.score) * 10) / 10,
      explanation: result.floors.length
        ? `v2 applies ${result.floors.map((floor) => floor.reason).join(", ")} floor rules.`
        : "v2 separates AML/CFT, governance and sanctions pillars and renormalises only available evidence.",
    },
    context: {
      transparencyInternationalCpi: getCpi(iso2) ?? null,
      cpiYear: CPI_YEAR,
      cpiSource: CPI_SOURCE,
      cpiLicence: CPI_LICENCE,
      scored: false,
    },
    methodologyVersion: COUNTRY_RISK_METHODOLOGY_VERSION,
    sources: COUNTRY_RISK_SOURCES,
    sanctionsEvidenceCandidates: getSanctionsRegimeCandidates(iso2),
  });
}
